"use server";

import { z } from "zod";

import { Role, SaleStatus } from "@/generated/prisma/client";
import { requireRole } from "@/lib/auth";
import { invalid, failed, kenyanPhone } from "@/lib/form-fields";
import { toMinorUnits } from "@/lib/money";
import { newSaleReference, requestMobileMoneyCharge, verifyCharge } from "@/lib/paystack";
import { createPendingSale, getSaleStatus, settleSale } from "@/lib/sales";
import type { CheckoutState } from "@/app/(app)/sell/checkout-state";

// Only async functions may be exported from this file — the state shape lives in
// checkout-state.ts, and the transaction itself in lib/sales.ts so it can be
// exercised against the database without a session.

/**
 * Paystack requires an email per charge. The shop takes phone numbers, not
 * addresses, so one is derived from the number: syntactically valid, stable per
 * customer, and obviously not a mailbox anyone should write to.
 */
function customerEmail(phone: string): string {
  return `${phone.replace("+", "")}@mpesa.pos.invalid`;
}

const cartLine = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
});

const checkoutSchema = z.object({
  customerPhone: kenyanPhone("Customer phone"),
  items: z
    .string()
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "The cart could not be read." });
        return z.NEVER;
      }
    })
    .pipe(z.array(cartLine).min(1, "Add at least one product to the cart.")),
});

/**
 * Build the sale, then ask Paystack to push the M-Pesa prompt.
 *
 * The sale row is written **before** the charge goes out, so a reference exists
 * no matter how the charge request ends. The alternative — charge first, record
 * after — loses the sale entirely if the process dies between the two, while the
 * customer has already paid.
 *
 * A successful return means the prompt was sent, never that money moved. Only
 * the webhook settles a sale.
 */
export async function startCheckout(
  _prevState: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const user = await requireRole(Role.STAFF);

  const parsed = checkoutSchema.safeParse({
    customerPhone: formData.get("customerPhone") ?? "",
    items: formData.get("items") ?? "[]",
  });

  if (!parsed.success) return { ...invalid(parsed.error), reference: null };

  const { customerPhone, items } = parsed.data;
  const reference = newSaleReference();

  const sale = await createPendingSale({
    staffId: user.id,
    customerPhone,
    reference,
    items,
  });

  if (!sale.ok) {
    const message =
      sale.reason === "insufficient"
        ? `Only ${sale.product.quantity} ${sale.product.unit} of ${sale.product.name} left.`
        : sale.reason === "missing"
          ? "A product in the cart no longer exists. Clear it and start again."
          : "Add at least one product to the cart.";

    return { ...failed(message), reference: null };
  }

  const charge = await requestMobileMoneyCharge({
    reference,
    amountMinor: toMinorUnits(sale.sale.totalAmount),
    phone: customerPhone,
    email: customerEmail(customerPhone),
  });

  if (!charge.ok) {
    // The sale row stays PENDING rather than being deleted: the charge may still
    // have reached Paystack even though the reply did not reach us, and deleting
    // it would orphan a payment we could no longer match to a reference.
    return {
      status: "error",
      message: charge.message,
      fieldErrors: {},
      reference,
    };
  }

  return {
    status: "success",
    message: "Prompt sent. Ask the customer to enter their M-Pesa PIN.",
    fieldErrors: {},
    reference,
  };
}

export type SaleProgress = {
  status: "PENDING" | "SUCCESS" | "FAILED" | "UNKNOWN";
  totalAmount: string | null;
};

/**
 * Where a sale has got to, for the screen waiting on the customer.
 *
 * Reads our own row first. If it is still PENDING past the point where a prompt
 * should have been answered, it asks Paystack directly and settles from that —
 * the webhook is the primary path, but ngrok changing hostname mid-session (or
 * any dropped delivery) would otherwise leave a paid sale PENDING forever.
 */
export async function checkSaleProgress(
  reference: string,
  reconcile = false,
): Promise<SaleProgress> {
  await requireRole(Role.STAFF);

  const sale = await getSaleStatus(reference);
  if (!sale) return { status: "UNKNOWN", totalAmount: null };

  if (sale.status !== SaleStatus.PENDING || !reconcile) {
    return { status: sale.status, totalAmount: sale.totalAmount };
  }

  const verified = await verifyCharge(reference);
  if (!verified.ok || verified.status === "pending") {
    return { status: "PENDING", totalAmount: sale.totalAmount };
  }

  // settleSale() is the same idempotent path the webhook uses, so a webhook that
  // arrives later finds the sale already final and changes nothing.
  await settleSale({
    reference,
    paid: verified.status === "success",
    phone: verified.phone,
  });

  const settled = await getSaleStatus(reference);

  return {
    status: settled?.status ?? "PENDING",
    totalAmount: settled?.totalAmount ?? sale.totalAmount,
  };
}
