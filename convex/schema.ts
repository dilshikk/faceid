import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  }).index("by_token", ["tokenIdentifier"]),

  // A bot = one external PostgreSQL database the admin wants to monitor.
  bots: defineTable({
    ownerToken: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    // Never returned to the client, only used by backend actions.
    connectionString: v.string(),
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
