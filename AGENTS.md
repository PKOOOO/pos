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
- **ORM:** Prisma
- **Database:** PostgreSQL via Neon
- **Auth:** Clerk (role-based: OWNER / STAFF via public metadata)
- **Hosting:** Vercel
- **Styling:** Tailwind CSS + shadcn/ui
- **Offline:** next-pwa + Dexie.js (IndexedDB) for offline-first stock logging
- **Payments:** Paystack (Kenya M-Pesa `mobile_money` channel → STK push)
- **Package manager:** pnpm

## Data Model

- `User` — id, clerkId, name, role (OWNER/STAFF)
- `Product` — id, name, category, shade (nullable), unit, quantity, lowStockThreshold
- `StockMovement` — id, productId, type (IN/OUT), quantity, staffId, note, createdAt
- `Sale` — id, staffId, customerPhone, totalAmount, paystackReference, status (PENDING/SUCCESS/FAILED)
- `SaleItem` — id, saleId, productId, quantity, unitPrice

Products can have shade/variant as a field on the same row (not separate variant
tables) — keep this simple unless the client asks for combinatorial variants later.

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

## Build Order

1. Prisma schema + Neon setup
2. Clerk auth + role-based access
3. Product management (CRUD)
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