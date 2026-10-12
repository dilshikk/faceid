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
    // Result of the last health check.
    status: v.optional(v.union(v.literal("online"), v.literal("offline"))),
    lastCheckedAt: v.optional(v.string()),
    lastLatencyMs: v.optional(v.number()),
    lastError: v.optional(v.string()),
  }).index("by_owner", ["ownerToken"]),
});
