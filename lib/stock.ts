import { MovementType, type Prisma as PrismaNS } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/** The client inside an interactive `$transaction` callback. */
export type TransactionClient = PrismaNS.TransactionClient;

/**
 * Both defaults are too tight for this link. `maxWait` (2s) is how long a call
 * waits for its turn to start a transaction: several staff acting at once each
 * need their own connection to Neon, and a fresh TLS handshake from Nairobi is
 * ~275ms before Neon has even woken up — five concurrent movements hit P2028
 * "Unable to start a transaction in the given time" on the default. `timeout`
 * (5s) is the budget once started, which includes waiting on any row lock held
 * by whoever is touching the same product.
 *
 * Shared with sale settlement, which takes more locks than a single movement.
 */
export const TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 15_000,
} as const;

export type StockProduct = { name: string; unit: string; quantity: number };

export type StockMovementOutcome =
  | { ok: true; product: StockProduct }
  | { ok: false; reason: "missing" }
  | { ok: false; reason: "insufficient"; product: StockProduct };

/**
 * The only writer of `Product.quantity` besides product creation.
 *
 * The movement row and the quantity change are one transaction: a movement
 * without its quantity change (or the reverse) makes the ledger a lie, and the
 * ledger is the deliverable.
 *
 * Concurrency: two staff logging OUT on the same product at the same moment
 * must not drive the count negative. Under Postgres' default READ COMMITTED, a
 * plain SELECT inside the transaction does not prevent that — both reads would
 * see the same stock and both writes would apply. `SELECT ... FOR UPDATE` takes
 * a row lock, so the second transaction blocks until the first commits and then
 * reads the count the first one left behind.
 *
 * Auth lives in the calling Server Action: this function trusts `staffId`.
 */
export async function applyStockMovement(input: {
  productId: string;
  type: MovementType;
  quantity: number;
  staffId: string;
  note: string | null;
}): Promise<StockMovementOutcome> {
  return prisma.$transaction(
    (tx) => applyStockMovementWithin(tx, input),
    TRANSACTION_OPTIONS,
  );
}

/**
 * The same movement, inside a transaction the caller already opened.
 *
 * Sale settlement needs several movements and a status change to commit or fail
 * as one unit, so it cannot call the wrapper above — a nested `$transaction`
 * would be a separate transaction, and a crash midway would leave stock
 * decremented for a sale still marked PENDING.
 *
 * This is deliberately the *only* body: `Product.quantity` has exactly two
 * writers, product creation and this function, or the movement rows stop adding
 * up to the count.
 */
export async function applyStockMovementWithin(
  tx: TransactionClient,
  {
    productId,
    type,
    quantity,
    staffId,
    note,
  }: {
    productId: string;
    type: MovementType;
    quantity: number;
    staffId: string;
    note: string | null;
  },
): Promise<StockMovementOutcome> {
  const delta = type === MovementType.IN ? quantity : -quantity;

  const [locked] = await tx.$queryRaw<
    { name: string; unit: string; quantity: number }[]
  >`SELECT name, unit, quantity FROM "Product" WHERE id = ${productId} FOR UPDATE`;

  if (!locked) return { ok: false as const, reason: "missing" as const };

  if (locked.quantity + delta < 0) {
    return {
      ok: false as const,
      reason: "insufficient" as const,
      product: locked,
    };
  }

  await tx.stockMovement.create({
    data: { productId, type, quantity, staffId, note },
  });

  // `increment` rather than writing a value computed earlier, so the number
  // written is derived from the row this transaction holds locked.
  const product = await tx.product.update({
    where: { id: productId },
    data: { quantity: { increment: delta } },
    select: { name: true, unit: true, quantity: true },
  });

  return { ok: true as const, product };
}

export type LowStockProduct = {
  id: string;
  name: string;
  shade: string | null;
  unit: string;
  quantity: number;
  lowStockThreshold: number;
};

// The same predicate as isLowStock() in lib/products.ts, expressed for the
// database: a column-to-column comparison, which Prisma does with a field
// reference. If one of the two changes, change both — the nav badge and the row
// highlighting must never disagree about what "low" means.
const LOW_STOCK_WHERE = {
  quantity: { lte: prisma.product.fields.lowStockThreshold },
};

const LOW_STOCK_FIELDS = {
  id: true,
  name: true,
  shade: true,
  unit: true,
  quantity: true,
  lowStockThreshold: true,
} as const;

/** How far under its threshold a product is. Negative is worse; 0 is exactly at. */
export function stockShortfall(product: {
  quantity: number;
  lowStockThreshold: number;
}): number {
  return product.quantity - product.lowStockThreshold;
}

/**
 * Every product at or below its low-stock threshold, worst shortfall first.
 *
 * The ordering key is `quantity - lowStockThreshold`, which no index can sort
 * by, so it is applied after the fetch — the result set is only ever the items
 * that need restocking. The database orders by name first and `sort` is stable,
 * so products with the same shortfall stay alphabetical.
 */
export async function getLowStockProducts(
  limit?: number,
): Promise<LowStockProduct[]> {
  const products = await prisma.product.findMany({
    where: LOW_STOCK_WHERE,
    select: LOW_STOCK_FIELDS,
    orderBy: { name: "asc" },
  });

  products.sort((a, b) => stockShortfall(a) - stockShortfall(b));

  return limit === undefined ? products : products.slice(0, limit);
}

/** Just the number, for the nav badge on every signed-in page. */
export async function countLowStockProducts(): Promise<number> {
  return prisma.product.count({ where: LOW_STOCK_WHERE });
}
