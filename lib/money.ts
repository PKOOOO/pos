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
