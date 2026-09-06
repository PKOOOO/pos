import net from "node:net";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Neon's hostname resolves to BOTH IPv6 and IPv4. On a network with no IPv6
// route (this one, and likely the shop's), Node's "Happy Eyeballs" fallback is
// supposed to move on to IPv4 — but it aborts each attempt after 250ms by
// default, and the TCP handshake to us-east-2 measures ~275ms from Kenya. Every
// attempt was therefore cancelled just before it completed, and the pool failed
// with `AggregateError [ETIMEDOUT]` carrying an *empty* message, which reads
// like a dead database rather than a cancelled connect.
//
// Raising the per-attempt budget lets the IPv4 fallback finish. It costs
// nothing in the healthy case: the IPv6 attempt still fails immediately with
// ENETUNREACH, so this only widens the window for the attempt that can succeed.
//
// Node issue: https://github.com/nodejs/node/issues/54359
// Only the Node app needs this — `prisma migrate` connects via Prisma's Rust
// schema engine, which does its own DNS and never hits this code path.
net.setDefaultAutoSelectFamilyAttemptTimeout(5_000);

// Runtime queries go through Neon's *pooled* endpoint (DATABASE_URL). Migrations
// use the unpooled DIRECT_URL instead — see prisma7.config.ts.
function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["error"],
  });
}

// Next.js dev server hot-reloads modules on every edit; without this the process
// would accumulate a new connection pool per reload and exhaust Neon's limit.
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
