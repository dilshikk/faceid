import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel.d.ts";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findAllowed(
  ctx: QueryCtx,
  email: string,
): Promise<Doc<"allowedEmails"> | null> {
  return await ctx.db
    .query("allowedEmails")
    .withIndex("by_email", (q) => q.eq("email", normalizeEmail(email)))
    .unique();
}

// Every protected backend function goes through this check, so the list of
// allowed e-mails is enforced on the server and not only in the UI.
export async function requireAllowed(
  ctx: QueryCtx | MutationCtx,
  adminOnly = false,
): Promise<Doc<"allowedEmails">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Войдите в аккаунт",
    });
  }
  const email = identity.email;
  const entry = email ? await findAllowed(ctx, email) : null;
  if (!entry || (adminOnly && !entry.isAdmin)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Нет доступа к панели",
    });
  }
  return entry;
}
