import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  }).index("by_token", ["tokenIdentifier"]),

  // E-mails (lowercase) that may open the panel. Admins also manage the list.
  allowedEmails: defineTable({
    email: v.string(),
    isAdmin: v.boolean(),
    addedBy: v.optional(v.string()),
  }).index("by_email", ["email"]),

  // A bot = one external PostgreSQL database the admin wants to monitor.
  bots: defineTable({
    ownerToken: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    // Never returned to the client, only used by backend actions.
    connectionString: v.string(),
    // Parts of the connection, kept so the form can show them again (no password).
    dbHost: v.optional(v.string()),
    dbPort: v.optional(v.number()),
    dbName: v.optional(v.string()),
    dbUser: v.optional(v.string()),
    // Bot API token. Only used on the backend, never sent to the browser.
    botToken: v.optional(v.string()),
    ssl: v.boolean(),
    // Tables inside the bot's database that map to each section of the panel.
    usersTable: v.optional(v.string()),
    logsTable: v.optional(v.string()),
    errorsTable: v.optional(v.string()),
    // Column in the users table that holds the Telegram chat id (for broadcasts).
    chatIdColumn: v.optional(v.string()),
    // Result of the last health check.
    status: v.optional(v.union(v.literal("online"), v.literal("offline"))),
    lastCheckedAt: v.optional(v.string()),
    lastLatencyMs: v.optional(v.number()),
    lastError: v.optional(v.string()),
    // Telegram API check (getMe with the bot token).
    telegramOk: v.optional(v.boolean()),
    telegramUsername: v.optional(v.string()),
    telegramLatencyMs: v.optional(v.number()),
    telegramOkAt: v.optional(v.string()),
    telegramError: v.optional(v.string()),
    // Newest timestamp found in the logs (or users) table.
    lastActivityAt: v.optional(v.string()),
    // Alerts go to this Telegram chat id, sent through the bot itself.
    alertChatId: v.optional(v.string()),
    // Signature of the problems already reported, so alerts are not repeated.
    alertState: v.optional(v.string()),
  }).index("by_owner", ["ownerToken"]),

  // VPS agent: a small script on the server posts its metrics here.
  // Kept apart from bots because it is rewritten every minute.
  agents: defineTable({
    botId: v.id("bots"),
    key: v.string(),
    receivedAt: v.optional(v.string()),
    cpu: v.optional(v.number()),
    ramPercent: v.optional(v.number()),
    ramUsedMb: v.optional(v.number()),
    ramTotalMb: v.optional(v.number()),
    load1: v.optional(v.number()),
    uptimeSec: v.optional(v.number()),
    service: v.optional(v.string()),
    serviceState: v.optional(v.string()),
  })
    .index("by_bot", ["botId"])
    .index("by_key", ["key"]),
});
