import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Role } from "@/generated/prisma/client";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { productSearchWhere } from "@/lib/products";
import { firstSearchParam } from "@/lib/search-params";
import { MovementList } from "@/app/(app)/stock/movement-list";
import { StockForm } from "@/app/(app)/stock/stock-form";

// The picker is a list, not a paginated view: enough to scroll on a phone, and
// the search box narrows it beyond that.
const PICKER_LIMIT = 30;
const RECENT_LIMIT = 12;

const PICKER_FIELDS = {
  id: true,
  name: true,
  shade: true,
  unit: true,
  quantity: true,
} as const;

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(Role.STAFF);

  const params = await searchParams;
  const query = firstSearchParam(params.q).trim();
  // `?product=<id>` lets other screens hand this one a product already picked.
  const requestedProductId = firstSearchParam(params.product);

  const [products, movements, requestedProduct] = await Promise.all([
    prisma.product.findMany({
      where: productSearchWhere({ query }),
      orderBy: { name: "asc" },
      take: PICKER_LIMIT + 1,
      select: PICKER_FIELDS,
    }),
    // Newest-first across the shop, which is what @@index([createdAt]) is for.
    prisma.stockMovement.findMany({
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        type: true,
        quantity: true,
        note: true,
        createdAt: true,
        product: { select: { name: true, shade: true, unit: true } },
        staff: { select: { name: true } },
      },
    }),
    requestedProductId
      ? prisma.product.findUnique({
          where: { id: requestedProductId },
          select: PICKER_FIELDS,
        })
      : null,
  ]);

  const moreResults = products.length > PICKER_LIMIT;

  return (
    <main className="flex flex-1 flex-col gap-6 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock</h1>
          <p className="text-sm text-muted-foreground">
            Log what came in and what went out.
          </p>
        </div>
        <Link
          href="/products"
          className={buttonVariants({
            variant: "outline",
            className: "h-11 px-4 text-base",
          })}
        >
          Products
        </Link>
      </header>

      <StockForm
        products={products.slice(0, PICKER_LIMIT)}
        query={query}
        initialProduct={requestedProduct}
        moreResults={moreResults}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Recent movements
        </h2>
        <MovementList
          movements={movements}
          emptyMessage="Nothing logged yet. The first movement you log shows up here."
        />
      </section>
    </main>
  );
}
