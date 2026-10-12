"use node";

import { Client } from "pg";
import { ConvexError, v } from "convex/values";
import { action, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel.d.ts";
import {
  quoteColumn,
  quoteTable,
  splitTable,
  type Cell,
} from "./shared";

const PAGE_SIZE = 25;
const CONNECT_TIMEOUT_MS = 8000;
const STATEMENT_TIMEOUT_MS = 10000;

type TableInfo = { name: string; columns: string[] };
type Page = { columns: string[]; rows: Cell[][]; total: number };
type CheckResult = {
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
};

// Postgres values come back as Dates, objects, buffers, etc. Convex can only
// return plain JSON values, so everything is flattened to a simple cell.
function toCell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (Buffer.isBuffer(value)) return `<binary ${value.length} bytes>`;
  return JSON.stringify(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Неизвестная ошибка";
}

async function connect(bot: Doc<"bots">): Promise<Client> {
  const client = new Client({
    connectionString: bot.connectionString,
    ssl: bot.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    statement_timeout: STATEMENT_TIMEOUT_MS,
  });
  // Without a listener an idle-connection error would crash the action.
  client.on("error", () => {});
  await client.connect();
  return client;
}

async function loadBot(
  ctx: ActionCtx,
  botId: Doc<"bots">["_id"],
): Promise<Doc<"bots">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Войдите в аккаунт",
    });
  }
  const bot = await ctx.runQuery(internal.bots.bots.getForOwner, {
    botId,
    ownerToken: identity.tokenIdentifier,
  });
  if (!bot) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Бот не найден" });
  }
  return bot;
}

export const checkConnection = action({
  args: { botId: v.id("bots") },
  handler: async (ctx, args): Promise<CheckResult> => {
    const bot = await loadBot(ctx, args.botId);
    const started = Date.now();
    let client: Client | null = null;
    try {
      client = await connect(bot);
      await client.query("SELECT 1");
      const latencyMs = Date.now() - started;
      await ctx.runMutation(internal.bots.bots.setStatus, {
        botId: bot._id,
        status: "online",
        latencyMs,
        checkedAt: new Date().toISOString(),
      });
      return { ok: true, latencyMs, error: null };
    } catch (error) {
      const message = errorMessage(error);
      await ctx.runMutation(internal.bots.bots.setStatus, {
        botId: bot._id,
        status: "offline",
        error: message,
        checkedAt: new Date().toISOString(),
      });
      return { ok: false, latencyMs: null, error: message };
    } finally {
      await client?.end().catch(() => {});
    }
  },
});

// Lists the tables of the bot's database so the admin can map them
// to "users", "logs" and "errors" without typing names by hand.
export const discoverTables = action({
  args: { botId: v.id("bots") },
  handler: async (ctx, args): Promise<TableInfo[]> => {
    const bot = await loadBot(ctx, args.botId);
    let client: Client | null = null;
    try {
      client = await connect(bot);
      const result = await client.query<{
        table_schema: string;
        table_name: string;
        column_name: string;
      }>(
        `SELECT c.table_schema, c.table_name, c.column_name
           FROM information_schema.columns c
           JOIN information_schema.tables t
             ON t.table_schema = c.table_schema AND t.table_name = c.table_name
          WHERE t.table_type = 'BASE TABLE'
            AND c.table_schema NOT IN ('pg_catalog', 'information_schema')
          ORDER BY c.table_schema, c.table_name, c.ordinal_position
          LIMIT 5000`,
      );
      const tables = new Map<string, string[]>();
      for (const row of result.rows) {
        const name =
          row.table_schema === "public"
            ? row.table_name
            : `${row.table_schema}.${row.table_name}`;
        tables.set(name, [...(tables.get(name) ?? []), row.column_name]);
      }
      return [...tables.entries()].map(([name, columns]) => ({
        name,
        columns,
      }));
    } catch (error) {
      throw new ConvexError({
        code: "EXTERNAL_SERVICE_ERROR",
        message: errorMessage(error),
      });
    } finally {
      await client?.end().catch(() => {});
    }
  },
});

// Reads one page of rows from a mapped table. Newest rows come first when
// the table has a recognizable date or id column.
export const browse = action({
  args: {
    botId: v.id("bots"),
    kind: v.union(
      v.literal("users"),
      v.literal("logs"),
      v.literal("errors"),
    ),
    page: v.number(),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Page> => {
    const bot = await loadBot(ctx, args.botId);
    const tableName = bot[`${args.kind}Table`];
    if (!tableName) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Таблица не выбрана в настройках бота",
      });
    }
    const page = Math.max(0, Math.floor(args.page));
    let client: Client | null = null;
    try {
      client = await connect(bot);
      const table = quoteTable(tableName);
      const { schema, table: bare } = splitTable(tableName);

      const meta = await client.query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type FROM information_schema.columns
          WHERE table_name = $1 AND table_schema = COALESCE($2, current_schema())
          ORDER BY ordinal_position`,
        [bare, schema],
      );
      const columns = meta.rows.map((c) => c.column_name);
      if (columns.length === 0) {
        throw new Error(`Таблица «${tableName}» не найдена`);
      }

      const params: unknown[] = [];
      let where = "";
      const term = args.search?.trim();
      if (term) {
        params.push(`%${term}%`);
        where =
          "WHERE " +
          columns.map((c) => `${quoteColumn(c)}::text ILIKE $1`).join(" OR ");
      }

      const sortColumn =
        columns.find((c) => /^(created_at|timestamp|time|date|ts)$/i.test(c)) ??
        columns.find((c) => /^id$/i.test(c));
      const orderBy = sortColumn
        ? `ORDER BY ${quoteColumn(sortColumn)} DESC`
        : "";

      const count = await client.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM ${table} ${where}`,
        params,
      );
      const data = await client.query(
        `SELECT * FROM ${table} ${where} ${orderBy} LIMIT ${PAGE_SIZE} OFFSET ${page * PAGE_SIZE}`,
        params,
      );
      return {
        columns,
        rows: data.rows.map((row: Record<string, unknown>) =>
          columns.map((c) => toCell(row[c])),
        ),
        total: Number(count.rows[0]?.n ?? 0),
      };
    } catch (error) {
      throw new ConvexError({
        code: "EXTERNAL_SERVICE_ERROR",
        message: errorMessage(error),
      });
    } finally {
      await client?.end().catch(() => {});
    }
  },
});

// Row counts for the dashboard cards, one cheap query per mapped table.
export const stats = action({
  args: { botId: v.id("bots") },
  handler: async (
    ctx,
    args,
  ): Promise<{ users: number | null; logs: number | null; errors: number | null }> => {
    const bot = await loadBot(ctx, args.botId);
    let client: Client | null = null;
    const countOf = async (
      c: Client,
      name: string | undefined,
    ): Promise<number | null> => {
      if (!name) return null;
      try {
        const r = await c.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM ${quoteTable(name)}`,
        );
        return Number(r.rows[0]?.n ?? 0);
      } catch {
        return null;
      }
    };
    try {
      client = await connect(bot);
      return {
        users: await countOf(client, bot.usersTable),
        logs: await countOf(client, bot.logsTable),
        errors: await countOf(client, bot.errorsTable),
      };
    } catch (error) {
      throw new ConvexError({
        code: "EXTERNAL_SERVICE_ERROR",
        message: errorMessage(error),
      });
    } finally {
      await client?.end().catch(() => {});
    }
  },
});
