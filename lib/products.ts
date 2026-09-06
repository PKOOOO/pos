// Shared product vocabulary. Imported by both Server Components and Client
// Components, so this file must stay free of `server-only` imports.

// Category is a constrained string rather than a table: free text gets typo'd
// into three spellings of the same thing. Adding a category means editing this
// list — deliberate, since the list drives both the form and the list filter.
export const PRODUCT_CATEGORIES = [
  "Hair Care",
  "Skin Care",
  "Nail Care",
  "Makeup",
  "Tools & Accessories",
  "Consumables",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_UNITS = [
  "piece",
  "bottle",
  "tube",
  "ml",
  "g",
  "pack",
] as const;

export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export function isProductCategory(value: string): value is ProductCategory {
  return (PRODUCT_CATEGORIES as readonly string[]).includes(value);
}

/**
 * A product is "low" once it reaches its threshold, not after it drops below —
 * the threshold is the point at which the owner wants to reorder. A product with
 * a threshold of 0 therefore only flags when it hits 0, which is what "no
 * threshold set" should mean.
 */
export function isLowStock(product: {
  quantity: number;
  lowStockThreshold: number;
}): boolean {
  return product.quantity <= product.lowStockThreshold;
}

/**
 * The `where` shape behind both the product list and the stock screen's picker,
 * so the two searches always agree.
 *
 * `category` is an equality match and uses @@index([category]). The name search
 * is a case-insensitive `contains`, which scans — fine at one shop's catalogue
 * size, and a trigram index isn't worth the migration yet.
 */
export function productSearchWhere({
  query,
  category,
}: {
  query?: string;
  category?: string | null;
}) {
  return {
    ...(query
      ? { name: { contains: query, mode: "insensitive" as const } }
      : {}),
    ...(category ? { category } : {}),
  };
}
