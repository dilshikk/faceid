import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Doc } from "../_generated/dataModel.d.ts";
import { isValidTableName } from "./shared";

async function requireOwner(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Войдите в аккаунт",
    });
  }
  return identity.tokenIdentifier;
}

function hostOf(connectionString: string): string {
  try {
    return new URL(connectionString).host;
  } catch {
    return "—";
  }
}

// The connection string contains the password, so it is stripped before
// anything is sent to the browser.
function toPublic(bot: Doc<"bots">) {
  const { connectionString, ...rest } = bot;
  return { ...rest, host: hostOf(connectionString) };
}

function assertConnectionString(value: string) {
  if (!/^postgres(ql)?:\/\//i.test(value.trim())) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "Адрес должен начинаться с postgresql://",
    });
  }
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
    const ownerToken = await requireOwner(ctx);
    const bots = await ctx.db
      .query("bots")
      .withIndex("by_owner", (q) => q.eq("ownerToken", ownerToken))
      .take(100);
    return bots.map(toPublic);
  },
});

export const get = query({
  args: { botId: v.string() },
  handler: async (ctx, args) => {
    const ownerToken = await requireOwner(ctx);
    const id = ctx.db.normalizeId("bots", args.botId);
    if (!id) return null;
    const bot = await ctx.db.get("bots", id);
    if (!bot || bot.ownerToken !== ownerToken) return null;
    return toPublic(bot);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    connectionString: v.string(),
    ssl: v.boolean(),
  },
  handler: async (ctx, args) => {
    const ownerToken = await requireOwner(ctx);
    const connectionString = args.connectionString.trim();
    assertConnectionString(connectionString);
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
      ssl: args.ssl,
    });
  },
});

export const update = mutation({
  args: {
    botId: v.id("bots"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    // Empty or missing = keep the current connection string.
    connectionString: v.optional(v.string()),
    ssl: v.optional(v.boolean()),
    usersTable: v.optional(v.union(v.string(), v.null())),
    logsTable: v.optional(v.union(v.string(), v.null())),
    errorsTable: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const ownerToken = await requireOwner(ctx);
    const bot = await ctx.db.get("bots", args.botId);
    if (!bot || bot.ownerToken !== ownerToken) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Бот не найден" });
    }
    assertTable(args.usersTable);
    assertTable(args.logsTable);
    assertTable(args.errorsTable);
    const connectionString = args.connectionString?.trim();
    if (connectionString) assertConnectionString(connectionString);

    // In patch, an undefined field is REMOVED, so only set what was provided.
    // For table mappings, null clears the value and undefined leaves it alone.
    const patch: Partial<Doc<"bots">> = {};
    const name = args.name?.trim();
    if (name) patch.name = name;
    if (args.description !== undefined) {
      patch.description = args.description.trim() || undefined;
    }
    if (connectionString) patch.connectionString = connectionString;
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
    const ownerToken = await requireOwner(ctx);
    const bot = await ctx.db.get("bots", args.botId);
    if (!bot || bot.ownerToken !== ownerToken) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Бот не найден" });
    }
    await ctx.db.delete("bots", args.botId);
    return null;
  },
});

export const getForOwner = internalQuery({
  args: { botId: v.id("bots"), ownerToken: v.string() },
  handler: async (ctx, args) => {
    const bot = await ctx.db.get("bots", args.botId);
    if (!bot || bot.ownerToken !== args.ownerToken) return null;
    return bot;
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
