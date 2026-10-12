import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

// Bounded: the panel is meant for tens of bots, not thousands.
export const listBotIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const bots = await ctx.db.query("bots").take(100);
    return bots.map((b) => b._id);
  },
});

export const getBot = internalQuery({
  args: { botId: v.id("bots") },
  handler: async (ctx, args) => {
    return await ctx.db.get("bots", args.botId);
  },
});

export const getAgentForBot = internalQuery({
  args: { botId: v.id("bots") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_bot", (q) => q.eq("botId", args.botId))
      .first();
  },
});

export const saveCheck = internalMutation({
  args: {
    botId: v.id("bots"),
    checkedAt: v.string(),
    dbOk: v.boolean(),
    dbLatencyMs: v.optional(v.number()),
    dbError: v.optional(v.string()),
    lastActivityAt: v.optional(v.string()),
    // Telegram fields are absent when the bot has no token.
    telegramOk: v.optional(v.boolean()),
    telegramUsername: v.optional(v.string()),
    telegramLatencyMs: v.optional(v.number()),
    telegramError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const bot = await ctx.db.get("bots", args.botId);
    if (!bot) return null;
    // Passing undefined clears the old value, which is what we want for errors.
    await ctx.db.patch("bots", args.botId, {
      status: args.dbOk ? "online" : "offline",
      lastCheckedAt: args.checkedAt,
      lastLatencyMs: args.dbLatencyMs,
      lastError: args.dbError,
      lastActivityAt: args.lastActivityAt ?? bot.lastActivityAt,
      telegramOk: args.telegramOk,
      telegramUsername: args.telegramUsername ?? bot.telegramUsername,
      telegramLatencyMs: args.telegramLatencyMs,
      telegramError: args.telegramError,
      telegramOkAt: args.telegramOk ? args.checkedAt : bot.telegramOkAt,
    });
    return null;
  },
});

export const setAlertState = internalMutation({
  args: { botId: v.id("bots"), alertState: v.string() },
  handler: async (ctx, args) => {
    const bot = await ctx.db.get("bots", args.botId);
    if (!bot) return null;
    await ctx.db.patch("bots", args.botId, {
      alertState: args.alertState || undefined,
    });
    return null;
  },
});
