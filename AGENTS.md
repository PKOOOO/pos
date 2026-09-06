<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# CLAUDE.md


Project context for Claude Code. Read this before making changes.

## Project

Web-based inventory management system for a salon cosmetics shop. Client-facing
project, 2-week delivery timeline, fixed price agreed upfront.

Core users: shop owner (full access) and staff (stock logging, sales checkout).

## Tech Stack

- **Framework:** Next.js (App Router)
- **ORM:** Prisma **7.10.0 (pinned)** + `@prisma/adapter-pg`
- **Database:** PostgreSQL via Neon
- **Auth:** Clerk (role-based: OWNER / STAFF via public metadata)
- **Hosting:** Vercel
- **Styling:** Tailwind CSS + shadcn/ui
- **Offline:** next-pwa + Dexie.js (IndexedDB) for offline-first stock logging
- **Payments:** Paystack (Kenya M-Pesa `mobile_money` channel → STK push)
- **Package manager:** pnpm

## Current State

Step 1 is done — Prisma + Neon are set up and migrated. Existing files:

- `prisma/schema.prisma` — all five models, `Role` / `MovementType` /
  `SaleStatus` enums, relations, indexes on every FK plus products by
  category/name, movement history newest-first per product, and sales by status
- `prisma7.config.ts` — Prisma 7 config; connection URLs live here, not in schema
- `lib/prisma.ts` — client singleton, guarded against dev hot-reload connection leaks
- `prisma/migrations/` — applied, `migrate status` clean, no drift

Step 2 is done — Clerk auth + role-based access:

- `proxy.ts` — Next 16 renamed the `middleware` convention to `proxy`; runs
  `clerkMiddleware()` as an optimistic signed-out redirect only. Its matcher
  excludes `/api/webhooks/*` (Clerk signs those with Svix and sends no session
  cookie, so a gate there 401s every delivery and Clerk retries forever)
- `lib/auth.ts` — `getCurrentUser()` (React `cache()`d, upserts our `User` by
  `clerkId` on every authenticated request — the guaranteed sync path) and
  `requireRole()` (redirects for pages, returns 401/403 with
  `{ context: "route" }` for route handlers)
- `app/api/webhooks/clerk/route.ts` — `verifyWebhook()`, upsert on
  `user.created` / `user.updated`, deliberate no-op on `user.deleted`
- `app/sign-in`, `app/sign-up`, `app/dashboard` — minimal signed-in shell

Auth conventions worth keeping:

- **Roles are never written from Clerk.** `syncUser()` sets `role` on create
  only; the first OWNER is promoted by hand in the DB, and an update would
  demote them on their next request.
- **The proxy is not the authorization boundary.** Server Functions dispatch as
  POSTs to their own route, so a matcher change can silently drop coverage —
  every page and route handler re-checks with `getCurrentUser()`/`requireRole()`.
- `createRouteMatcher` is deprecated in Clerk 7 and `<SignedIn>` / `<SignedOut>`
  / `<Protect>` were removed in Core 3 — use `<Show when="signed-in">` instead.

Next up: product management (CRUD).

## Prisma 7 Constraints — read before touching the DB layer

- **Do not bump Prisma.** `pnpm add prisma` resolves to an 8.0 release candidate
  on the `latest` dist-tag. 7.10.0 is pinned deliberately for a fixed-price
  deliverable.
- **No `url` in `schema.prisma`.** Prisma 7 requires a driver adapter; queries go
  through `@prisma/adapter-pg`.
- **Two connection strings.** App runtime uses the pooled `DATABASE_URL`;
  migrations use the unpooled `DIRECT_URL` (DDL and advisory locks don't survive
  PgBouncer).
- **`P1001` on first connect is usually a Neon cold start.** Retry before
  diagnosing networking.
- **`AggregateError [ETIMEDOUT]` with an empty message is NOT a dead database.**
  Neon resolves to both IPv6 and IPv4; on a network with no IPv6 route Node's
  Happy Eyeballs falls back to IPv4 but cancels each attempt after 250ms, and
  the handshake to `us-east-2` measures ~275ms from Kenya — so it failed every
  time, deterministically. `lib/prisma.ts` raises the budget with
  `net.setDefaultAutoSelectFamilyAttemptTimeout(5_000)`; do not remove it.
  Only the Node app is affected — `prisma migrate` uses Prisma's Rust schema
  engine and connects fine, which is why migrations looked healthy while every
  app query timed out. See https://github.com/nodejs/node/issues/54359
- **The DB is in `us-east-2`, ~275ms from Nairobi.** Every query pays that
  round-trip. If the app feels slow on the shop floor, region is the first
  thing to look at, not the query — `eu-central-1` would roughly halve it.
- **Use `prisma migrate`, not `db push`.** Migration history is the source of
  truth for this deliverable.

## Data Model

- `User` — id, clerkId, name, role (OWNER/STAFF)
- `Product` — id, name, category, shade (nullable), unit, quantity, lowStockThreshold
- `StockMovement` — id, productId, type (IN/OUT), quantity, staffId, note, createdAt
- `Sale` — id, staffId, customerPhone, totalAmount, paystackReference, status (PENDING/SUCCESS/FAILED)
- `SaleItem` — id, saleId, productId, quantity, unitPrice

Products can have shade/variant as a field on the same row (not separate variant
tables) — keep this simple unless the client asks for combinatorial variants later.

Schema conventions already established:

- Money is `Decimal(12,2)` — never float
- `onDelete: Restrict` on `Product` and `User` so stock/sales history can't be orphaned
- `SaleItem` cascades with its parent `Sale`

## In Scope

- Product management (add/edit/list, search & filter by category)
- Stock in/out logging with staff attribution
- Low-stock alerts
- Basic movement history/reports (owner only)
- Offline-first operation (spotty shop internet) — cache + sync on reconnect
- Checkout flow: staff builds a cart, enters customer phone, triggers Paystack
  STK push, confirms via webhook, auto-decrements stock on success

## Out of Scope (unless separately agreed)

- Barcode scanning
- Accounting/invoicing
- Multi-branch/location support
- Anything beyond one round of post-delivery revisions

## Conventions

- Server-side only for Paystack secret key and any charge/webhook logic — never
  expose it client-side
- Verify Paystack webhook signatures (`x-paystack-signature`) before trusting
  a payment status update
- Payment confirmation is async — never assume the initial charge API response
  means success; wait for the webhook or poll charge status
- Idempotent webhook handling — a duplicate webhook must not double-decrement stock
- Keep staff-facing flows to as few taps/screens as possible (they'll use this
  daily, on the shop floor)
- Prefer server actions / API routes over client-side data fetching for
  anything touching stock or payment state
- Commit after each working feature, not at the end of a whole prompt session
- Verify against the real database rather than assuming — round-trip tests on
  Decimal handling, enum mapping, unique constraints, and FK restricts are worth
  the few minutes they cost

## Build Order

1. ~~Prisma schema + Neon setup~~ ✅
2. ~~Clerk auth + role-based access~~ ✅
3. Product management (CRUD) ← next
4. Stock movement logging
5. Low-stock alerts
6. Checkout + Paystack STK push + webhook
7. PWA + offline sync (Dexie.js)
8. Deploy to Vercel

## Notes

- Client paid 50,000 KES upfront for the original scope; Paystack/checkout was
  a separately agreed addition — keep it tracked as distinct from the base scope
  in case of future scope questions.
- Target device: shop staff will mostly use this on a phone at the counter, not
  a desktop — design mobile-first.