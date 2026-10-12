import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import type { Doc } from "../_generated/dataModel.d.ts";
import { findAllowed, requireAllowed } from "../access/helpers";
import { isValidTableName } from "./shared";

function hostOf(connectionString: string): string {
  try {
    return new URL(connectionString).host;
  } catch {
    return "—";
  }
}

function savedPassword(connectionString: string): string {
  try {
    return decodeURIComponent(new URL(connectionString).password);
  } catch {
    return "";
  }
}

function buildConnectionString(c: {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}): string {
  const host = c.host.trim();
  if (!host || /[\s/@?#]/.test(host)) {
    throw new ConvexError({ code: "BAD_REQUEST", message: "Некорректный хост" });
  }
  if (!Number.isInteger(c.port) || c.port < 1 || c.port > 65535) {
    throw new ConvexError({ code: "BAD_REQUEST", message: "Порт должен быть от 1 до 65535" });
  }
  if (!c.database.trim() || !c.user.trim()) {
    throw new ConvexError({ code: "BAD_REQUEST", message: "Укажите базу данных и логин" });
  }
  const user = encodeURIComponent(c.user.trim());
  const password = encodeURIComponent(c.password);
  return `postgresql://${user}:${password}@${host}:${c.port}/${encodeURIComponent(c.database.trim())}`;
}

// The connection string and token contain secrets, so they are stripped
// before anything is sent to the browser.
function toPublic(bot: Doc<"bots">) {
  const { connectionString, botToken, ...rest } = bot;
  return {
    ...rest,
    host: bot.dbHost ?? hostOf(connectionString),
    hasToken: Boolean(botToken),
  };
}

function assertTable(name: string | null | undefined) {
  if (name && !isValidTableName(name)) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: `Некорректное имя таблицы: ${name}`,
    });
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAllowed(ctx);
    const bots = await ctx.db.query("bots").take(100);
    return bots.map(toPublic);
  },
});

export const get = query({
  args: { botId: v.string() },
  handler: async (ctx, args) => {
    await requireAllowed(ctx);
    const id = ctx.db.normalizeId("bots", args.botId);
    if (!id) return null;
    const bot = await ctx.db.get("bots", id);
    if (!bot) return null;
    return toPublic(bot);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    botToken: v.string(),
    dbHost: v.string(),
    dbPort: v.number(),
    dbName: v.string(),
    dbUser: v.string(),
    dbPassword: v.string(),
    ssl: v.boolean(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAllowed(ctx, true);
    const ownerToken = admin.email;
    const connectionString = buildConnectionString({
      host: args.dbHost,
      port: args.dbPort,
      database: args.dbName,
      user: args.dbUser,
      password: args.dbPassword,
    });
    const name = args.name.trim();
    if (!name) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Укажите название бота",
      });
    }
    return await ctx.db.insert("bots", {
      ownerToken,
      name,
      description: args.description?.trim() || undefined,
      connectionString,
      dbHost: args.dbHost.trim(),
      dbPort: args.dbPort,
      dbName: args.dbName.trim(),
      dbUser: args.dbUser.trim(),
      botToken: args.botToken.trim() || undefined,
      ssl: args.ssl,
    });
  },
});

export const update = mutation({
  args: {
    botId: v.id("bots"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    botToken: v.optional(v.string()),
    // Connection parts. Empty password = keep the saved one.
    dbHost: v.optional(v.string()),
    dbPort: v.optional(v.number()),
    dbName: v.optional(v.string()),
    dbUser: v.optional(v.string()),
    dbPassword: v.optional(v.string()),
    ssl: v.optional(v.boolean()),
    usersTable: v.optional(v.union(v.string(), v.null())),
    logsTable: v.optional(v.union(v.string(), v.null())),
    errorsTable: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await requireAllowed(ctx, true);
    const bot = await ctx.db.get("bots", args.botId);
    if (!bot) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Бот не найден" });
    }
    assertTable(args.usersTable);
    assertTable(args.logsTable);
    assertTable(args.errorsTable);
    const connectionChanged =
      args.dbHost !== undefined ||
      args.dbPort !== undefined ||
      args.dbName !== undefined ||
      args.dbUser !== undefined ||
      Boolean(args.dbPassword);
    const patch: Partial<Doc<"bots">> = {};
    if (connectionChanged) {
      const host = args.dbHost?.trim() || bot.dbHost;
      const port = args.dbPort ?? bot.dbPort;
      const database = args.dbName?.trim() || bot.dbName;
      const user = args.dbUser?.trim() || bot.dbUser;
      // The saved password lives only inside the old connection string.
      const password = args.dbPassword || savedPassword(bot.connectionString);
      if (!host || !port || !database || !user) {
        throw new ConvexError({ code: "BAD_REQUEST", message: "Заполните все поля подключения" });
      }
      patch.connectionString = buildConnectionString({ host, port, database, user, password });
      patch.dbHost = host;
      patch.dbPort = port;
      patch.dbName = database;
      patch.dbUser = user;
    }
    if (args.botToken?.trim()) patch.botToken = args.botToken.trim();
    const name = args.name?.trim();
    if (name) patch.name = name;
    if (args.description !== undefined) {
      patch.description = args.description.trim() || undefined;
    }
    if (args.ssl !== undefined) patch.ssl = args.ssl;
    if (args.usersTable !== undefined) {
      patch.usersTable = args.usersTable ?? undefined;
    }
    if (args.logsTable !== undefined) {
      patch.logsTable = args.logsTable ?? undefined;
    }
    if (args.errorsTable !== undefined) {
      patch.errorsTable = args.errorsTable ?? undefined;
    }
    await ctx.db.patch("bots", args.botId, patch);
    return null;
  },
});

export const remove = mutation({
  args: { botId: v.id("bots") },
  handler: async (ctx, args) => {
    await requireAllowed(ctx, true);
    const bot = await ctx.db.get("bots", args.botId);
    if (!bot) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Бот не найден" });
    }
    await ctx.db.delete("bots", args.botId);
    return null;
  },
});

export const getForUser = internalQuery({
  args: { botId: v.id("bots"), email: v.string() },
  handler: async (ctx, args) => {
    if (!(await findAllowed(ctx, args.email))) return null;
    return await ctx.db.get("bots", args.botId);
  },
});

export const setStatus = internalMutation({
  args: {
    botId: v.id("bots"),
    status: v.union(v.literal("online"), v.literal("offline")),
    latencyMs: v.optional(v.number()),
    error: v.optional(v.string()),
    checkedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const bot = await ctx.db.get("bots", args.botId);
    if (!bot) return null;
    await ctx.db.patch("bots", args.botId, {
      status: args.status,
      lastCheckedAt: args.checkedAt,
      lastLatencyMs: args.latencyMs,
      lastError: args.error,
    });
    return null;
  },
});
