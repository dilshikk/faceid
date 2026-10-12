import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel.d.ts";
import { requireAllowed } from "../access/helpers";

function newKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function findAgent(
  ctx: MutationCtx,
  botId: Id<"bots">,
): Promise<Doc<"agents"> | null> {
  return await ctx.db
    .query("agents")
    .withIndex("by_bot", (q) => q.eq("botId", botId))
    .first();
}

// Live metrics for the UI. The secret key is never returned here.
export const get = query({
  args: { botId: v.id("bots") },
  handler: async (ctx, args) => {
    await requireAllowed(ctx);
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_bot", (q) => q.eq("botId", args.botId))
      .first();
    if (!agent) return null;
    const { key, ...metrics } = agent;
    void key;
    return metrics;
  },
});

// Admin opens the setup dialog: create the key on first use, then reuse it.
export const getKey = mutation({
  args: { botId: v.id("bots") },
  handler: async (ctx, args) => {
    await requireAllowed(ctx, true);
    const bot = await ctx.db.get("bots", args.botId);
    if (!bot) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Бот не найден" });
    }
    const existing = await findAgent(ctx, args.botId);
    if (existing) return existing.key;
    const key = newKey();
    await ctx.db.insert("agents", { botId: args.botId, key });
    return key;
  },
});

export const rotateKey = mutation({
  args: { botId: v.id("bots") },
  handler: async (ctx, args) => {
    await requireAllowed(ctx, true);
    const key = newKey();
    const existing = await findAgent(ctx, args.botId);
    if (existing) await ctx.db.patch("agents", existing._id, { key });
    else await ctx.db.insert("agents", { botId: args.botId, key });
    return key;
  },
});

export const ingest = internalMutation({
  args: {
    key: v.string(),
    cpu: v.number(),
    ramUsedMb: v.number(),
    ramTotalMb: v.number(),
    load1: v.number(),
    uptimeSec: v.number(),
    service: v.optional(v.string()),
    serviceState: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (!agent) return false;
    const { key, ...metrics } = args;
    void key;
    await ctx.db.patch("agents", agent._id, {
      ...metrics,
      ramPercent:
        args.ramTotalMb > 0
          ? Math.round((args.ramUsedMb / args.ramTotalMb) * 100)
          : undefined,
      receivedAt: new Date().toISOString(),
    });
    return true;
  },
});
