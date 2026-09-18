// Money vocabulary, shared by the product form, the product list and checkout.
// Client-safe: no `server-only` imports.
//
// Money is DECIMAL(12,2) in the database and a **string** everywhere above it.
// Two reasons it never becomes a number on the way through:
//
//  1. Prisma's `Decimal` is a class instance, so it cannot cross the server →
//     client boundary. A Server Component must pass `price.toFixed(2)`, not the
//     Decimal itself, or React throws "Only plain objects can be passed to
//     Client Components".
//  2. Prisma accepts a string for a Decimal column. Routing input through
//     `Number()` would put every price through a float — the exact thing
//     DECIMAL(12,2) is here to prevent.

/** DECIMAL(12,2) leaves ten digits ahead of the point: 9,999,999,999.99. */
export const MAX_MONEY_INTEGER_DIGITS = 10;

const KES = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format a money string for display: "1200.5" → "KSh 1,200.50".
 *
 * `Number()` here is display-only and safe at this scale — the largest value the
 * column can hold is ~1e10, far inside the range floats represent exactly. It is
 * never the value that gets stored.
 */
export function formatKes(amount: string): string {
  return KES.format(Number(amount));
}

/**
 * "1200.5" → 120050. Paystack takes amounts in the currency's smallest unit,
 * and the shilling's is the cent.
 *
 * String surgery rather than `Number(amount) * 100`: that turns 19.99 into
 * 1998.9999999999998, and truncating it bills the customer a cent short. Totals
 * are summed in these integers for the same reason, then converted back once.
 */
export function toMinorUnits(amount: string): number {
  const [whole, fraction = ""] = amount.trim().split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
}

/** 120050 → "1200.50", ready for a Decimal column or formatKes(). */
export function fromMinorUnits(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);

  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
