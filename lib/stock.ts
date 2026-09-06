import { MovementType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

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
export async function applyStockMovement({
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
}): Promise<StockMovementOutcome> {
  const delta = type === MovementType.IN ? quantity : -quantity;

  return prisma.$transaction(
    async (tx) => {
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
    },
    // Both defaults are too tight here. `maxWait` (2s) is how long a call waits
    // for its turn to start a transaction: several staff logging at once each
    // need their own connection to Neon, and a fresh TLS handshake from Nairobi
    // is ~275ms before Neon has even woken up — five concurrent movements hit
    // P2028 "Unable to start a transaction in the given time" on the default.
    // `timeout` (5s) is the budget once started, which now includes waiting on
    // the row lock held by whoever is logging the same product.
    { maxWait: 10_000, timeout: 15_000 },
  );
}
