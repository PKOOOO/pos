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

- **Framework:** Next.js 16 (App Router, Turbopack)
- **ORM:** Prisma **7.10.0 (pinned)** + `@prisma/adapter-pg`
- **Database:** PostgreSQL via Neon
- **Auth:** Clerk (Core 3) — role-based: OWNER / STAFF
- **Hosting:** Vercel
- **Styling:** Tailwind CSS v4 + shadcn/ui — the **`base-nova` style, built on
  Base UI (`@base-ui/react`), not Radix**. Component APIs differ from the
  shadcn docs: polymorphism is a `render` prop rather than `asChild`, `Select`
  takes `items` / `onValueChange(value, details)`, and `AlertDialogAction` is a
  plain button that does not close the dialog. Read the file in
  `components/ui/` before assuming a prop exists.
- **Validation:** zod 4 — `{ error: "..." }`, not `{ message: "..." }`
- **Toasts:** sonner, mounted once in `app/layout.tsx`
- **Icons:** lucide-react
- **Offline:** next-pwa + Dexie.js (IndexedDB) for offline-first stock logging
- **Payments:** Paystack (Kenya M-Pesa `mobile_money` channel → STK push)
- **Package manager:** pnpm

## Current State

Steps 1–6 done.

**Prisma + Neon** — migrated, no drift.
- `prisma/schema.prisma` — five models, `Role` / `MovementType` / `SaleStatus`
  enums, relations, indexes on every FK plus products by category/name,
  movement history newest-first per product, sales by status
- `prisma7.config.ts` — connection URLs live here, not in schema
- `lib/prisma.ts` — client singleton, hot-reload guarded, plus the
  `setDefaultAutoSelectFamilyAttemptTimeout` fix (see DB Constraints)

**Clerk auth** — verified against a live database.
- `proxy.ts` — optimistic signed-out redirect only
- `lib/auth.ts` — `getCurrentUser()` (upsert-by-clerkId), `requireRole()`
- `app/api/webhooks/clerk/route.ts` — `verifyWebhook`, idempotent, replay-safe

**Product management** — verified against a live database.
- `lib/products.ts` — `PRODUCT_CATEGORIES`, `PRODUCT_UNITS`, `isLowStock()`;
  client-safe, shared by the form, the filters, and the list
- `app/(app)/products/actions.ts` — `createProduct` / `updateProduct` (STAFF)
  and `deleteProduct` (OWNER, strict), each calling `requireRole()` first; zod
  validation; the update schema has no `quantity` field at all
- `app/(app)/products/form-state.ts` — the action state shape lives here, NOT
  in `actions.ts`: a `"use server"` module may only export async functions
- `app/(app)/products/page.tsx` — list, search + category filter in URL params,
  table on desktop / tappable cards on phones, low-stock rows flagged
- `app/(app)/products/new` and `.../[id]/edit` — dedicated form routes (fewer
  taps on a phone than a dialog), sonner toasts on the result

**App shell** — `app/(app)/` route group; the group adds no path segment, so
every URL under it is unchanged.
- `app/(app)/layout.tsx` — sidebar on desktop, fixed bottom tab bar on phones,
  header with the user's name, role badge, and Clerk's `<UserButton>`
- `app/(app)/app-nav.tsx` — one nav list feeding both bars. Icons are component
  references, which can't cross the server → client boundary, so the layout
  passes `isOwner` and the client filters `ownerOnly` items
- `lib/clerk-appearance.ts` — shared `appearance` for `<SignIn>`, `<SignUp>`,
  `<UserButton>`. Clerk parses colours itself, so these are hex duplicates of
  the `globals.css` tokens — change one, change the other
- `/stock`, `/sell`, `/reports` are placeholders so the nav can't 404

**Stock movement logging** — verified against a live database, concurrency
included.
- `lib/stock.ts` — `applyStockMovement()`, the only writer of
  `Product.quantity` besides product creation. Movement row + count change in
  one `$transaction`, opened with `SELECT ... FOR UPDATE` (see Database
  Constraints)
- `app/(app)/stock/actions.ts` — auth, zod, and the messages; the transaction
  itself is in `lib/stock.ts` so it can be exercised without a session
- `app/(app)/stock/page.tsx` — picker (shares `productSearchWhere` with the
  product list), IN/OUT toggle, quantity stepper, before → after preview
- `app/(app)/stock/movement-list.tsx` — the ledger, rendered newest-first on
  /stock and per-product on the product edit page
- `lib/action-state.ts`, `lib/form-fields.ts` — the action state shape and the
  zod field parsers, shared by products and stock so both accept the same input
- `lib/time.ts` — timestamps are formatted in `Africa/Nairobi`, not the host's
  zone, and on the server so hydration can't disagree

**Low-stock alerts** — in-app only; email/SMS is out of scope.
- `lib/stock.ts` — `getLowStockProducts()` / `countLowStockProducts()`. The
  `quantity <= lowStockThreshold` comparison is column-to-column, done in SQL
  through a Prisma field reference; the worst-shortfall ordering can't be
  indexed, so it is applied after the fetch over an already-small set
- `/dashboard` — count badge, worst five, each row linking to
  `/stock?product=<id>` so restocking is one tap from the alert
- The app shell renders the count as a badge on the Products nav item, so any
  action that can move it revalidates `("/", "layout")` rather than a page
- `/products` — low stock sorted to the top by default; the sort is stable, so
  search and category filter are unaffected

Next up: checkout + Paystack STK push.

## Next.js 16 / Clerk Core 3 Constraints

- **`proxy.ts`, not `middleware.ts`.** Next 16 renamed the convention;
  `middleware.ts` still runs but warns on build. Proxy is Node-runtime only,
  which suits Clerk fine.
- **No `createRouteMatcher`.** Deprecated in Clerk 7 — path matching can diverge
  from how Next actually routes requests (Server Functions dispatch as POSTs to
  their declaring route), leaving protected resources reachable.
- **`<SignedIn>`, `<SignedOut>`, `<Protect>` were removed in Clerk Core 3** —
  they throw at runtime. Use `<Show when="signed-in">`.
- **Auth is enforced per-route via `requireRole()` / `getCurrentUser()`, not by
  the proxy matcher.** Every new page and route handler must call one
  explicitly — a forgotten call fails open silently.
- **Webhook routes must be excluded from proxy protection** or Clerk returns 401.
  Verify at runtime (unsigned POST should hit the handler and 400), not by
  reading the regex.
- **`redirectToSignIn()` reads `NEXT_PUBLIC_CLERK_SIGN_IN_URL` /
  `SIGN_UP_URL` from env vars only**, not from props.
- **`syncUser()` sets `role` on create only, never on update.** If `role` moves
  into the update clause, a manually promoted OWNER silently reverts to STAFF
  on their next request.
- **`requireRole(Role.STAFF)` accepts an OWNER** — deliberate; the owner has
  full access. Owner-only actions use `requireRole(Role.OWNER)`, which is strict.
- **A `"use server"` module may only export async functions.** Export a const
  from one and the client bundle gets an action reference in its place, so the
  value arrives with none of its fields — `useActionState` started with a state
  that had no `fieldErrors` and the form crashed on first render. Shared shapes
  and constants live in `lib/action-state.ts`; the build does not catch this.
- **Anything rendered by `app/(app)/layout.tsx` needs
  `revalidatePath("/", "layout")`, not a page path.** Layouts are preserved
  across client navigation, so a page-level revalidate leaves the low-stock
  badge stale on every other screen. Every route here is request-rendered, so
  the wider invalidation throws away no cached work. It still only refreshes
  *this* user's tree — a badge goes stale if another staff member logs a
  movement, until the next navigation.
- **Client Components import Prisma enums from `@/generated/prisma/enums`, never
  `@/generated/prisma/client`.** The client entry pulls in `node:module`, and
  Turbopack fails the build with "the chunking context does not support external
  modules (request: node:module)" — which names the page, not the import. The
  `enums` file is standalone and generated for exactly this.

## Database Constraints — read before touching the DB layer

- **Do not bump Prisma.** `pnpm add prisma` resolves to an 8.0 release candidate
  on the `latest` dist-tag. 7.10.0 is pinned deliberately.
- **No `url` in `schema.prisma`.** Prisma 7 requires a driver adapter; queries
  go through `@prisma/adapter-pg`.
- **Two connection strings.** App runtime uses the pooled `DATABASE_URL`;
  migrations use the unpooled `DIRECT_URL` (DDL and advisory locks don't survive
  PgBouncer).
- **Do not remove `net.setDefaultAutoSelectFamilyAttemptTimeout(5_000)` from
  `lib/prisma.ts`.** Neon publishes AAAA and A records. With no IPv6 route, the
  v6 attempt fails instantly and Node falls back to IPv4 — but Happy Eyeballs
  cancels each attempt at 250ms, and the handshake takes ~275ms. Every query
  times out, deterministically. `pg` has no per-connection escape hatch, so the
  process default is the only lever. `--dns-result-order=ipv4first` does NOT
  fix this — the v4 attempt still gets the 250ms cap. Tracked at
  nodejs/node#54359.
- **`ETIMEDOUT` with an empty message is the above, not a dead host.** Unwrap
  the `AggregateError` to see the real per-address errors.
- **`P1001` on first connect can be a Neon cold start** — retry once. It is a
  different failure from `ETIMEDOUT`; don't conflate them.
- **A clean `prisma migrate status` does NOT prove the app can reach the
  database.** Migrations use Prisma's Rust schema engine with its own DNS and
  never touch Node's socket path. Migrations can succeed while every app query
  times out.
- **Use `prisma migrate`, not `db push`.** Migration history is the source of
  truth for this deliverable.
- **Prisma 7 compares two columns with a field reference** —
  `{ quantity: { lte: prisma.product.fields.lowStockThreshold } }`. No raw SQL
  needed for that. Ordering by an *expression* over two columns still isn't
  supported, which is why the low-stock shortfall sort happens after the fetch.
- **Two definitions of "low" must stay in step**: `isLowStock()` in
  `lib/products.ts` (rendering) and `LOW_STOCK_WHERE` in `lib/stock.ts` (the
  SQL field-reference predicate). The nav badge and the row highlighting come
  from different ones.
- **`Product.quantity` has exactly two writers**: product creation, and
  `applyStockMovement()` in `lib/stock.ts`. Anything else breaks the audit
  trail — the movement rows must always add up to the count.
- **A stock check must hold the row.** Under READ COMMITTED a plain SELECT in a
  transaction does not stop two concurrent OUTs from both passing the same
  "enough stock?" test and driving the count negative. `SELECT ... FOR UPDATE`
  is what makes the check binding. Verified with five concurrent OUTs against a
  stock of five: exactly two commit.
- **Raise `maxWait` on interactive transactions, not just `timeout`.** The 2s
  default is how long a call waits for its turn to start; five concurrent
  movements on this Neon link fail with `P2028 Unable to start a transaction in
  the given time`. `lib/stock.ts` uses `{ maxWait: 10_000, timeout: 15_000 }`.

## Open Decisions

**Low-stock ordering.** The dashboard orders by shortfall
(`quantity - lowStockThreshold`), worst first, as specified. That ranks a
product sitting at 0 with a threshold of 0 (shortfall 0) *below* one at 2 of 5
(shortfall -3), even though the first is actually out of stock. Ask the client
which reads better on the shop floor; it is one line in `getLowStockProducts()`.

**Neon region.** The project is in `us-east-2`; the ~275ms handshake is the
floor on every query from Nairobi. `eu-central-1` would roughly halve it. Moving
is cheap while the database is nearly empty and expensive after go-live. Not yet
actioned — this is a client-facing call on a paid deliverable.

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
- `onDelete: Restrict` on `Product` and `User` so stock/sales history can't be
  orphaned. Handle `P2003` with a readable message rather than letting it throw.
- `SaleItem` cascades with its parent `Sale`
- `user.deleted` webhooks must NOT hard-delete the `User` row — Restrict blocks it
- **`Product.quantity` is only settable on create.** Every subsequent change
  goes through `StockMovement`, or the audit trail is worthless.
- Category is a constrained string (fixed Select options), not a `Category`
  table — free text gets typo'd into three spellings of the same thing.

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
- Custom-built auth UI — use Clerk's components with the `appearance` prop
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
- Hiding a nav item is not security — guard the route too
- Commit after each working feature, not at the end of a whole prompt session
- Verify against the real database rather than assuming. Round-trip tests on
  Decimal handling, enum mapping, unique constraints, FK restricts, and webhook
  replay have each caught real issues on this project.
- Prefer runtime proof over reading config. The webhook exclusion was verified
  with a 404-vs-307 pair, not by inspecting a regex.
- Concurrency claims need a concurrent test. "Two staff at once can't oversell"
  was proved by firing five simultaneous OUTs at one product, not by reading the
  transaction. That test is also what surfaced the `maxWait` default.
- Form plumbing is shared, not copied: `lib/form-fields.ts` (zod field parsers),
  `lib/action-state.ts` (the state every form action returns),
  `productSearchWhere()` in `lib/products.ts`, and `hooks/use-url-search.ts`.
  Products and stock must accept and reject the same input.
- Timestamps render through `lib/time.ts` in `Africa/Nairobi`, server-side. The
  host is UTC, so formatting raw would show a 4pm movement as 1pm; formatting in
  the browser instead would mismatch during hydration.
- Colour tokens in `app/globals.css` were chosen by measuring contrast, not by
  eye, and each carries the hex it was computed from. `lib/clerk-appearance.ts`
  repeats those hexes because Clerk parses colours itself and can't take
  `var(--primary)` — change one, change the other.

### Verifying against the database

Scripts can't just be run with `node`: the generated Prisma client uses
extensionless imports and the app uses `@/` paths. Bundle first, run from the
repo root so `node_modules` resolves:

    ./node_modules/.bin/esbuild ./check.ts --bundle --platform=node \
      --format=esm --packages=external --tsconfig=tsconfig.json \
      --outfile=./check.mjs
    node --env-file=.env ./check.mjs

Import the real module under test (`lib/stock.ts`), not a copy of its logic.
Mark test rows with a fixed prefix, delete them in a `finally`, and check for
leftovers afterwards — a run that dies mid-transaction leaves its rows behind,
and this database has the client's real data in it.

## Build Order

1. ~~Prisma schema + Neon setup~~ ✅
2. ~~Clerk auth + role-based access~~ ✅
3. ~~App shell + navigation~~ ✅
4. ~~Product management (CRUD)~~ ✅
5. ~~Stock movement logging~~ ✅
6. ~~Low-stock alerts~~ ✅
7. Checkout + Paystack STK push + webhook ← next
8. PWA + offline sync (Dexie.js)
9. Deploy to Vercel

## Notes

- Client paid 50,000 KES upfront for the original scope; Paystack/checkout was
  a separately agreed addition — keep it tracked as distinct from the base scope
  in case of future scope questions.
- Target device: shop staff will mostly use this on a phone at the counter, not
  a desktop — design mobile-first. Prioritise contrast and tap-target size:
  this gets used under shop lighting, on cheap screens, by someone in a hurry.
- The only `User` row in the database is `hardhaven`, role **STAFF**. Nothing
  in the app grants OWNER — `syncUser()` sets the role on create only, on
  purpose — so Reports and product deletion are unreachable until that row is
  promoted by hand in the database. Worth doing before demoing to the client.
- `hooks/use-mobile.ts` (shadcn-generated) trips
  `react-hooks/set-state-in-effect`. Pre-existing and left alone since the file
  regenerates; `pnpm lint` is otherwise clean, so that one error is the baseline.
- ngrok's free domain changes on every restart, so the Clerk webhook endpoint
  needs re-pointing each dev session. `allowedDevOrigins` in `next.config.ts`
  needs the current ngrok host too.