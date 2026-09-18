import "server-only";

import { MovementType, SaleStatus } from "@/generated/prisma/client";
import { fromMinorUnits, toMinorUnits } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { applyStockMovementWithin, TRANSACTION_OPTIONS } from "@/lib/stock";

// The transactional core of checkout, kept out of the Server Action for the same
// reason lib/stock.ts is: it can then be exercised against the real database
// without a Clerk session, which is the only way to prove the webhook is
// actually idempotent.

export type CartLine = { productId: string; quantity: number };

export type PendingSale = {
  id: string;
  reference: string;
  /** Decimal as a string — see lib/money.ts. */
  totalAmount: string;
};

export type CreateSaleOutcome =
  | { ok: true; sale: PendingSale }
  | { ok: false; reason: "empty" }
  | { ok: false; reason: "missing" }
  | {
      ok: false;
      reason: "insufficient";
      product: { name: string; quantity: number; unit: string };
    };

/**
 * Record a PENDING sale and its lines, priced from the database.
 *
 * Prices are **re-read server-side and never taken from the cart**. The client
 * sends product ids and quantities only; anything it claimed about price is
 * ignored, or a tampered request could buy a 3,000 KES product for 1 KES.
 *
 * `SaleItem.unitPrice` is a copy, not a reference, so re-pricing a product later
 * never rewrites what a past sale charged.
 *
 * The stock check here is **advisory**. Nothing is decremented until the webhook
 * confirms payment, so it cannot be binding — it exists to stop staff starting a
 * charge for something visibly out of stock, not to reserve anything.
 */
export async function createPendingSale({
  staffId,
  customerPhone,
  reference,
  items,
}: {
  staffId: string;
  customerPhone: string | null;
  reference: string;
  items: CartLine[];
}): Promise<CreateSaleOutcome> {
  if (items.length === 0) return { ok: false, reason: "empty" };

  const products = await prisma.product.findMany({
    where: { id: { in: items.map((item) => item.productId) } },
    select: {
      id: true,
      name: true,
      unit: true,
      quantity: true,
      sellingPrice: true,
    },
  });

  const byId = new Map(products.map((product) => [product.id, product]));
  if (byId.size !== items.length) return { ok: false, reason: "missing" };

  let totalMinor = 0;

  for (const item of items) {
    const product = byId.get(item.productId);
    if (!product) return { ok: false, reason: "missing" };

    if (product.quantity < item.quantity) {
      return { ok: false, reason: "insufficient", product };
    }

    // Summed as integer cents, converted back once at the end — see
    // toMinorUnits() for why this never goes through a float.
    totalMinor += toMinorUnits(product.sellingPrice.toFixed(2)) * item.quantity;
  }

  const sale = await prisma.sale.create({
    data: {
      staffId,
      customerPhone,
      paystackReference: reference,
      status: SaleStatus.PENDING,
      totalAmount: fromMinorUnits(totalMinor),
      items: {
        create: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: byId.get(item.productId)!.sellingPrice.toFixed(2),
        })),
      },
    },
    select: { id: true },
  });

  return {
    ok: true,
    sale: {
      id: sale.id,
      reference,
      totalAmount: fromMinorUnits(totalMinor),
    },
  };
}

export type SettleOutcome =
  | { ok: true; outcome: "settled"; shortfalls: string[] }
  | { ok: true; outcome: "already" }
  | { ok: true; outcome: "failed" }
  | { ok: false; reason: "unknown" };

/**
 * Move a sale to its final state, decrementing stock on success.
 *
 * Idempotent by construction, which is the whole point: Paystack retries any
 * non-2xx and will happily deliver the same `charge.success` twice. The Sale row
 * is locked `FOR UPDATE` and its status is the guard — a second delivery finds
 * SUCCESS already set and returns "already" without touching stock. Doing this
 * by checking-then-writing without the lock would let two concurrent deliveries
 * both pass the check and decrement twice.
 *
 * The status change and every movement commit as one transaction, so a crash
 * midway cannot leave stock decremented against a sale still marked PENDING.
 *
 * Stock goes out through `applyStockMovementWithin`, never a direct update, so
 * the ledger still adds up to the count.
 */
export async function settleSale({
  reference,
  paid,
  phone,
}: {
  reference: string;
  paid: boolean;
  phone?: string | null;
}): Promise<SettleOutcome> {
  return prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<
      { id: string; status: SaleStatus; staffId: string }[]
    >`SELECT id, status, "staffId" FROM "Sale" WHERE "paystackReference" = ${reference} FOR UPDATE`;

    if (!locked) return { ok: false as const, reason: "unknown" as const };

    // Already final. A replayed webhook lands here and does nothing.
    if (locked.status !== SaleStatus.PENDING) {
      return { ok: true as const, outcome: "already" as const };
    }

    if (!paid) {
      await tx.sale.update({
        where: { id: locked.id },
        data: {
          status: SaleStatus.FAILED,
          ...(phone ? { customerPhone: phone } : {}),
        },
      });

      return { ok: true as const, outcome: "failed" as const };
    }

    const items = await tx.saleItem.findMany({
      where: { saleId: locked.id },
      select: { productId: true, quantity: true },
    });

    // The money has already moved and the goods have left the counter, so the
    // sale is SUCCESS regardless of what stock says. If a count cannot absorb
    // the decrement we record the shortfall and leave that product alone rather
    // than driving it negative — the caller logs it for the owner to correct.
    const shortfalls: string[] = [];

    for (const item of items) {
      const movement = await applyStockMovementWithin(tx, {
        productId: item.productId,
        type: MovementType.OUT,
        quantity: item.quantity,
        staffId: locked.staffId,
        // Same note format as the rows recovered from the lost implementation,
        // so the ledger reads consistently across both.
        note: `Sale ${reference}`,
      });

      if (!movement.ok) {
        shortfalls.push(
          movement.reason === "missing"
            ? `product ${item.productId} no longer exists`
            : `${movement.product.name}: needed ${item.quantity}, had ${movement.product.quantity}`,
        );
      }
    }

    await tx.sale.update({
      where: { id: locked.id },
      data: {
        status: SaleStatus.SUCCESS,
        ...(phone ? { customerPhone: phone } : {}),
      },
    });

    return { ok: true as const, outcome: "settled" as const, shortfalls };
  }, TRANSACTION_OPTIONS);
}

/** Status for the screen that is waiting on the customer to approve the prompt. */
export async function getSaleStatus(
  reference: string,
): Promise<{ status: SaleStatus; totalAmount: string } | null> {
  const sale = await prisma.sale.findUnique({
    where: { paystackReference: reference },
    select: { status: true, totalAmount: true },
  });

  return sale
    ? { status: sale.status, totalAmount: sale.totalAmount.toFixed(2) }
    : null;
}
