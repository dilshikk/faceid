"use node";

import type { Client } from "pg";
import { ConvexError, v } from "convex/values";
import {
  action,
  internalAction,
  type ActionCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel.d.ts";
import { quoteColumn, quoteTable, splitTable } from "../bots/shared";
import { connect, errorMessage } from "../bots/postgres";

const AGENT_STALE_MS = 10 * 60 * 1000;
const RAM_ALERT_PERCENT = 90;

type DbResult = {
  ok: boolean;
  latencyMs?: number;
  error?: string;
  lastActivityAt?: string;
};
type TelegramResult = {
  ok: boolean;
  username?: string;
  latencyMs: number;
  error?: string;
};

async function checkTelegram(token: string): Promise<TelegramResult> {
  const started = Date.now();
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(8000),
    });
    const body: {
      ok?: boolean;
      description?: string;
      result?: { username?: string };
    } = await res.json().catch(() => ({}));
    const latencyMs = Date.now() - started;
    if (res.ok && body.ok) {
      return { ok: true, username: body.result?.username, latencyMs };
    }
    return {
      ok: false,
      latencyMs,
      error: body.description ?? `Код ответа ${res.status}`,
    };
  } catch {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: "Telegram не отвечает",
    };
  }
}

// Newest timestamp in the logs table (or users table if there are no logs).
async function latestActivity(
  client: Client,
  bot: Doc<"bots">,
): Promise<string | undefined> {
  const name = bot.logsTable ?? bot.usersTable;
  if (!name) return undefined;
  try {
    const { schema, table } = splitTable(name);
    const cols = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = COALESCE($2, current_schema())
          AND data_type LIKE 'timestamp%'
        ORDER BY ordinal_position`,
      [table, schema],
    );
    const names = cols.rows.map((r) => r.column_name);
    const column =
      names.find((c) =>
        /^(created_at|timestamp|time|date|ts|updated_at)$/i.test(c),
      ) ?? names[0];
    if (!column) return undefined;
    const result = await client.query<{ t: Date | null }>(
      `SELECT MAX(${quoteColumn(column)}) AS t FROM ${quoteTable(name)}`,
    );
    const t = result.rows[0]?.t;
    return t instanceof Date && !Number.isNaN(t.getTime())
      ? t.toISOString()
      : undefined;
  } catch {
    return undefined;
  }
}

async function checkDatabase(bot: Doc<"bots">): Promise<DbResult> {
  const started = Date.now();
  let client: Client | null = null;
  try {
    client = await connect(bot);
    await client.query("SELECT 1");
    const latencyMs = Date.now() - started;
    return { ok: true, latencyMs, lastActivityAt: await latestActivity(client, bot) };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  } finally {
    await client?.end().catch(() => {});
  }
}

function findProblems(
  db: DbResult,
  telegram: TelegramResult | null,
  agent: Doc<"agents"> | null,
): string[] {
  const problems: string[] = [];
  if (!db.ok) problems.push("нет связи с базой данных");
  if (telegram && !telegram.ok) problems.push("Telegram не принимает токен бота");
  if (agent?.receivedAt) {
    const age = Date.now() - new Date(agent.receivedAt).getTime();
    if (age > AGENT_STALE_MS) {
      problems.push("сервер (VPS) не присылает данные больше 10 минут");
    } else {
      if (agent.serviceState && agent.serviceState !== "active") {
        problems.push(`служба ${agent.service ?? ""} не работает`.replace("  ", " "));
      }
      if ((agent.ramPercent ?? 0) >= RAM_ALERT_PERCENT) {
        problems.push("на сервере почти закончилась память");
      }
    }
  }
  return problems;
}

async function sendAlert(
  token: string,
  chatId: string,
  text: string,
): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Notify only when the set of problems changes, so a long outage sends
// one message and the recovery sends one more.
async function notify(
  ctx: ActionCtx,
  bot: Doc<"bots">,
  problems: string[],
): Promise<void> {
  if (!bot.alertChatId || !bot.botToken) return;
  const signature = [...problems].sort().join("|");
  const previous = bot.alertState ?? "";
  if (signature === previous) return;
  const text = problems.length
    ? `Бот «${bot.name}»: проблемы\n${problems.map((p) => `- ${p}`).join("\n")}`
    : `Бот «${bot.name}»: всё снова в порядке`;
  const sent = await sendAlert(bot.botToken, bot.alertChatId, text);
  // If Telegram is unreachable, keep the old state and retry on the next check.
  if (sent) {
    await ctx.runMutation(internal.monitor.state.setAlertState, {
      botId: bot._id,
      alertState: signature,
    });
  }
}

async function runForBot(ctx: ActionCtx, bot: Doc<"bots">): Promise<void> {
  const [db, telegram] = await Promise.all([
    checkDatabase(bot),
    bot.botToken ? checkTelegram(bot.botToken) : Promise.resolve(null),
  ]);
  await ctx.runMutation(internal.monitor.state.saveCheck, {
    botId: bot._id,
    checkedAt: new Date().toISOString(),
    dbOk: db.ok,
    dbLatencyMs: db.latencyMs,
    dbError: db.error,
    lastActivityAt: db.lastActivityAt,
    telegramOk: telegram?.ok,
    telegramUsername: telegram?.username,
    telegramLatencyMs: telegram?.latencyMs,
    telegramError: telegram?.error,
  });
  const agent = await ctx.runQuery(internal.monitor.state.getAgentForBot, {
    botId: bot._id,
  });
  await notify(ctx, bot, findProblems(db, telegram, agent));
}

// Button "Check now".
export const checkNow = action({
  args: { botId: v.id("bots") },
  handler: async (ctx, args): Promise<null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Войдите в аккаунт" });
    }
    const bot = await ctx.runQuery(internal.bots.bots.getForUser, {
      botId: args.botId,
      email: identity.email,
    });
    if (!bot) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Бот не найден" });
    }
    await runForBot(ctx, bot);
    return null;
  },
});

// Runs from the cron every 5 minutes.
export const checkAll = internalAction({
  args: {},
  handler: async (ctx): Promise<null> => {
    const ids = await ctx.runQuery(internal.monitor.state.listBotIds, {});
    for (const botId of ids) {
      const bot = await ctx.runQuery(internal.monitor.state.getBot, { botId });
      if (!bot) continue;
      try {
        await runForBot(ctx, bot);
      } catch {
        // One broken bot must not stop the checks of the others.
      }
    }
    return null;
  },
});
