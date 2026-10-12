"use node";

import { ConvexError, v } from "convex/values";
import { action, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel.d.ts";
import { quoteColumn, quoteTable } from "./shared";
import { connect, errorMessage } from "./postgres";

const MAX_RECIPIENTS = 5000;
const BATCH_SIZE = 20; // Telegram allows about 30 messages per second
const MAX_TEXT = 4096;

type Recipients = { ids: string[]; truncated: boolean };
type Result = { sent: number; blocked: number; failed: number; total: number; truncated: boolean };

async function loadAdminBot(
  ctx: ActionCtx,
  botId: Doc<"bots">["_id"],
): Promise<Doc<"bots">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.email) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Войдите в аккаунт" });
  }
  const bot = await ctx.runQuery(internal.bots.bots.getForAdmin, {
    botId,
    email: identity.email,
  });
  if (!bot) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Рассылку может запускать только администратор" });
  }
  return bot;
}

async function readRecipients(bot: Doc<"bots">): Promise<Recipients> {
  if (!bot.usersTable || !bot.chatIdColumn) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "Выберите таблицу пользователей и колонку с Telegram ID",
    });
  }
  const client = await connect(bot);
  try {
    const col = quoteColumn(bot.chatIdColumn);
    const result = await client.query<{ id: string }>(
      `SELECT DISTINCT ${col}::text AS id FROM ${quoteTable(bot.usersTable)}
        WHERE ${col} IS NOT NULL LIMIT ${MAX_RECIPIENTS + 1}`,
    );
    const ids = result.rows.map((r) => r.id).filter((id) => /^-?\d+$/.test(id));
    return { ids: ids.slice(0, MAX_RECIPIENTS), truncated: ids.length > MAX_RECIPIENTS };
  } catch (error) {
    throw new ConvexError({ code: "EXTERNAL_SERVICE_ERROR", message: errorMessage(error) });
  } finally {
    await client.end().catch(() => {});
  }
}

type Outcome = "sent" | "blocked" | "failed";

async function sendOne(token: string, chatId: string, text: string, retry = true): Promise<Outcome> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (res.ok) return "sent";
    if (res.status === 429 && retry) {
      const body: { parameters?: { retry_after?: number } } = await res.json().catch(() => ({}));
      const wait = Math.min(body.parameters?.retry_after ?? 1, 10);
      await new Promise((r) => setTimeout(r, wait * 1000));
      return await sendOne(token, chatId, text, false);
    }
    // 403: user blocked the bot, 400: chat not found
    return res.status === 403 || res.status === 400 ? "blocked" : "failed";
  } catch {
    return "failed";
  }
}

export const countRecipients = action({
  args: { botId: v.id("bots") },
  handler: async (ctx, args): Promise<{ count: number; truncated: boolean }> => {
    const bot = await loadAdminBot(ctx, args.botId);
    const { ids, truncated } = await readRecipients(bot);
    return { count: ids.length, truncated };
  },
});

export const send = action({
  args: { botId: v.id("bots"), text: v.string() },
  handler: async (ctx, args): Promise<Result> => {
    const bot = await loadAdminBot(ctx, args.botId);
    const text = args.text.trim();
    if (!text || text.length > MAX_TEXT) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: `Текст должен быть от 1 до ${MAX_TEXT} символов`,
      });
    }
    if (!bot.botToken) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "У бота не задан токен" });
    }
    const { ids, truncated } = await readRecipients(bot);
    const counts: Record<Outcome, number> = { sent: 0, blocked: 0, failed: 0 };
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      const outcomes = await Promise.all(batch.map((id) => sendOne(bot.botToken!, id, text)));
      for (const o of outcomes) counts[o] += 1;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return { ...counts, total: ids.length, truncated };
  },
});
