import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { isValidPaystackSignature } from "@/lib/paystack";
import { settleSale } from "@/lib/sales";

// Excluded from proxy protection by the `api/webhooks` prefix in proxy.ts.
// Paystack sends no session cookie, so the optimistic gate would bounce every
// delivery before the signature check ran — and Paystack retries any non-2xx,
// so that failure would repeat indefinitely.
//
// Authenticity comes from the signature alone. This endpoint is public, and a
// forged "charge.success" would mark a sale paid and decrement real stock, so
// nothing in the body is trusted until isValidPaystackSignature() passes.

// The nav badge and dashboard low-stock counts are rendered by the app shell, so
// a settled sale has to revalidate the layout rather than a single page.
const APP_TREE = "/";

type PaystackEvent = {
  event?: string;
  data?: {
    reference?: string;
    authorization?: { mobile_money_number?: string };
  };
};

export async function POST(request: NextRequest) {
  // The raw text, not request.json(): the signature is over the exact bytes
  // Paystack sent, and parsing then re-serialising would not reproduce them.
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!isValidPaystackSignature(rawBody, signature)) {
    console.error("[paystack-webhook] signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: PaystackEvent;
  try {
    event = JSON.parse(rawBody) as PaystackEvent;
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  const reference = event.data?.reference;
  if (!reference) {
    // Signed, so it is genuinely from Paystack — just not about a sale we can
    // identify. Ack it; retrying would not produce a reference.
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const paid = event.event === "charge.success";
  const failed =
    event.event === "charge.failed" || event.event === "charge.abandoned";

  if (!paid && !failed) {
    // Some other signed event type. Ack so Paystack stops retrying it.
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    const result = await settleSale({
      reference,
      paid,
      phone: event.data?.authorization?.mobile_money_number ?? null,
    });

    if (!result.ok) {
      // A reference we have never issued. Not our sale, and retrying cannot
      // change that, so ack rather than inviting redelivery forever.
      console.warn(`[paystack-webhook] unknown reference ${reference}`);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    if (result.outcome === "settled") {
      if (result.shortfalls.length > 0) {
        // Paid for, but the shelf count could not absorb it. The sale stands —
        // the money moved — and this needs a human to reconcile.
        console.error(
          `[paystack-webhook] ${reference} settled with stock shortfalls:`,
          result.shortfalls,
        );
      }

      revalidatePath(APP_TREE, "layout");
    }

    if (result.outcome === "failed") revalidatePath(APP_TREE, "layout");

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    // 500 on purpose: the signature was valid, so this is our side failing — a
    // Neon cold start, say. Paystack's retry is exactly what we want, and
    // settleSale() is idempotent, so replaying it is safe.
    console.error(`[paystack-webhook] failed to settle ${reference}:`, error);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
