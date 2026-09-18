import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

// Everything in this file is server-only. The secret key must never reach the
// client: it authenticates charges and it is also the webhook signing key, so
// leaking it would let anyone forge a "payment succeeded" callback.

const PAYSTACK_BASE = "https://api.paystack.co";

/** Kenya's M-Pesa provider slug in Paystack's `mobile_money` channel. */
const MPESA_PROVIDER = "mpesa";

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;

  // Thrown, not defaulted: a checkout that silently no-ops is worse than one
  // that refuses to start.
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");

  return key;
}

/**
 * Our own idempotency key for a sale, and the handle the webhook arrives with.
 *
 * Matches the format already in the database from the lost implementation
 * (`sale_` + 32 hex), so old rows and new ones read the same way.
 */
export function newSaleReference(): string {
  return `sale_${randomUUID().replace(/-/g, "")}`;
}

/**
 * Verify the `x-paystack-signature` header against the **raw** request body.
 *
 * HMAC-SHA512 keyed with the secret key. It must run on the exact bytes Paystack
 * signed, so the route reads `await request.text()` and parses afterwards —
 * `await request.json()` would re-serialise and change the signature.
 *
 * Compared in constant time: a plain `===` leaks, through timing, how much of a
 * forged signature was correct, which is enough to build one byte by byte.
 */
export function isValidPaystackSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  if (!signature) return false;

  const expected = createHmac("sha512", secretKey())
    .update(rawBody, "utf8")
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");

  // timingSafeEqual throws on a length mismatch, which would itself be a signal.
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export type ChargeRequest = {
  reference: string;
  /** Smallest currency unit — cents. See toMinorUnits() in lib/money.ts. */
  amountMinor: number;
  phone: string;
  email: string;
};

export type ChargeOutcome =
  | { ok: true; status: string }
  | { ok: false; message: string };

/**
 * Ask Paystack to push an M-Pesa STK prompt to the customer's phone.
 *
 * A successful response means **the prompt was sent**, not that money moved.
 * Paystack replies `pay_offline` while the customer is still deciding. The only
 * thing that settles a sale is the `charge.success` webhook (or an explicit
 * verify), which is why this returns a status string and never a "paid" boolean.
 */
export async function requestMobileMoneyCharge({
  reference,
  amountMinor,
  phone,
  email,
}: ChargeRequest): Promise<ChargeOutcome> {
  let response: Response;

  try {
    response = await fetch(`${PAYSTACK_BASE}/charge`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: amountMinor,
        currency: "KES",
        reference,
        mobile_money: { phone, provider: MPESA_PROVIDER },
      }),
      // Shop internet is unreliable; a hung request would leave staff staring
      // at a spinner with no way to know whether the prompt went out.
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    console.error("[paystack] charge request failed to send", error);
    return {
      ok: false,
      message: "Couldn't reach Paystack. Check the connection and try again.",
    };
  }

  const body = (await response.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: { status?: string };
  } | null;

  if (!response.ok || !body?.status) {
    console.error("[paystack] charge rejected", response.status, body?.message);
    return {
      ok: false,
      message: body?.message ?? "Paystack refused the charge.",
    };
  }

  return { ok: true, status: body.data?.status ?? "pending" };
}

export type VerifiedCharge =
  | { ok: true; status: "success" | "failed" | "pending"; phone: string | null }
  | { ok: false };

/**
 * Ask Paystack what actually happened to a reference.
 *
 * The webhook is the primary path. This is the fallback for when it never
 * arrives — a dropped delivery, or ngrok changing hostname mid-session — so a
 * sale cannot sit PENDING forever with the customer's money already taken.
 */
export async function verifyCharge(
  reference: string,
): Promise<VerifiedCharge> {
  try {
    const response = await fetch(
      `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${secretKey()}` },
        signal: AbortSignal.timeout(15_000),
      },
    );

    const body = (await response.json()) as {
      status?: boolean;
      data?: { status?: string; authorization?: { mobile_money_number?: string } };
    };

    if (!response.ok || !body?.status) return { ok: false };

    const status = body.data?.status;

    return {
      ok: true,
      status:
        status === "success"
          ? "success"
          : status === "failed" || status === "abandoned"
            ? "failed"
            : "pending",
      phone: body.data?.authorization?.mobile_money_number ?? null,
    };
  } catch (error) {
    console.error("[paystack] verify failed", error);
    return { ok: false };
  }
}
