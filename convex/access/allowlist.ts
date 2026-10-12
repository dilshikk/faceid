import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { findAllowed, normalizeEmail, requireAllowed } from "./helpers";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const status = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const email = identity?.email ? normalizeEmail(identity.email) : null;
    const entry = email ? await findAllowed(ctx, email) : null;
    if (entry) {
      return { state: "allowed" as const, email, isAdmin: entry.isAdmin };
    }
    // An empty list means nobody has set the panel up yet.
    const any = await ctx.db.query("allowedEmails").first();
    return { state: any ? ("denied" as const) : ("unclaimed" as const), email, isAdmin: false };
  },
});

// The very first person to sign in becomes the admin, only while the list is empty.
export const claim = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Войдите в аккаунт" });
    }
    const any = await ctx.db.query("allowedEmails").first();
    if (any) {
      throw new ConvexError({ code: "CONFLICT", message: "Администратор уже назначен" });
    }
    await ctx.db.insert("allowedEmails", {
      email: normalizeEmail(identity.email),
      isAdmin: true,
    });
    return null;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAllowed(ctx, true);
    return await ctx.db.query("allowedEmails").take(200);
  },
});

export const add = mutation({
  args: { email: v.string(), isAdmin: v.boolean() },
  handler: async (ctx, args) => {
    const admin = await requireAllowed(ctx, true);
    const email = normalizeEmail(args.email);
    if (!EMAIL_PATTERN.test(email)) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Некорректный e-mail" });
    }
    if (await findAllowed(ctx, email)) {
      throw new ConvexError({ code: "CONFLICT", message: "Этот e-mail уже в списке" });
    }
    await ctx.db.insert("allowedEmails", {
      email,
      isAdmin: args.isAdmin,
      addedBy: admin.email,
    });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("allowedEmails") },
  handler: async (ctx, args) => {
    const admin = await requireAllowed(ctx, true);
    const target = await ctx.db.get("allowedEmails", args.id);
    if (!target) return null;
    if (target._id === admin._id) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Нельзя удалить самого себя" });
    }
    await ctx.db.delete("allowedEmails", args.id);
    return null;
  },
});
