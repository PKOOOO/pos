import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

import { Prisma, Role, type User } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const SIGN_IN_PATH = "/sign-in";
const DASHBOARD_PATH = "/dashboard";

// `User.name` is non-nullable, and Clerk accounts can legitimately have no name
// set (phone-only sign-up, for instance), so fall back down a chain.
const FALLBACK_NAME = "Unnamed staff";

export function resolveName(parts: {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  email?: string | null;
}): string {
  const full =
    parts.fullName?.trim() ||
    [parts.firstName, parts.lastName].filter(Boolean).join(" ").trim();

  return (
    full || parts.username?.trim() || parts.email?.trim() || FALLBACK_NAME
  );
}

/**
 * Create-or-update our `User` row for a Clerk id. Shared by `getCurrentUser()`
 * and the Clerk webhook so both write the row exactly the same way.
 *
 * `role` is set on create only, never on update: the first OWNER is promoted by
 * hand in the database, and re-sending the STAFF default on every request would
 * demote them again.
 *
 * Prisma compiles this to a single `INSERT ... ON CONFLICT (clerkId) DO UPDATE`,
 * so a request and a concurrent `user.created` webhook cannot both insert. The
 * P2002 branch covers the case where that optimization does not kick in.
 */
export async function syncUser(clerkId: string, name: string): Promise<User> {
  try {
    return await prisma.user.upsert({
      where: { clerkId },
      create: { clerkId, name, role: Role.STAFF },
      update: { name },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return prisma.user.update({ where: { clerkId }, data: { name } });
    }
    throw error;
  }
}

/**
 * Returns OUR `User` row for the signed-in Clerk session, creating it on first
 * sight. This runs on every authenticated request and is the guaranteed sync
 * path; the webhook is eventual and secondary.
 *
 * `cache()` scopes the upsert to one round-trip per request no matter how many
 * layouts, pages, and components ask for the user.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const { userId } = await auth();
  if (!userId) return null;

  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  return syncUser(
    clerkUser.id,
    resolveName({
      fullName: clerkUser.fullName,
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      username: clerkUser.username,
      email: clerkUser.primaryEmailAddress?.emailAddress,
    }),
  );
});

// The owner has full access, so an OWNER satisfies a STAFF requirement too.
function satisfiesRole(actual: Role, required: Role): boolean {
  return actual === required || actual === Role.OWNER;
}

export type RouteRoleGuard =
  | { ok: true; user: User }
  | { ok: false; response: NextResponse };

/**
 * Guard a page or route handler on a role.
 *
 * Default (`context: "page"`) suits Server Components and Server Functions: it
 * redirects and never returns on failure. `context: "route"` suits Route
 * Handlers, where a redirect is useless to a fetch caller — it returns a 401/403
 * `NextResponse` for the caller to return directly:
 *
 *   const guard = await requireRole(Role.OWNER, { context: "route" });
 *   if (!guard.ok) return guard.response;
 */
export async function requireRole(role: Role): Promise<User>;
export async function requireRole(
  role: Role,
  opts: { context: "page" },
): Promise<User>;
export async function requireRole(
  role: Role,
  opts: { context: "route" },
): Promise<RouteRoleGuard>;
export async function requireRole(
  role: Role,
  opts: { context?: "page" | "route" } = {},
): Promise<User | RouteRoleGuard> {
  const context = opts.context ?? "page";
  const user = await getCurrentUser();

  if (!user) {
    if (context === "route") {
      return {
        ok: false,
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }
    redirect(SIGN_IN_PATH);
  }

  if (!satisfiesRole(user.role, role)) {
    if (context === "route") {
      return {
        ok: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
    redirect(DASHBOARD_PATH);
  }

  return context === "route" ? { ok: true, user } : user;
}
