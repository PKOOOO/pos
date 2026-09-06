import Link from "next/link";
import { PackageIcon, PlusIcon, SearchXIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Prisma, Role } from "@/generated/prisma/client";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { isLowStock, isProductCategory } from "@/lib/products";
import { ProductFilters } from "@/app/(app)/products/product-filters";

type ProductRow = {
  id: string;
  name: string;
  category: string;
  shade: string | null;
  unit: string;
  quantity: number;
  lowStockThreshold: number;
};

// A search param can legitimately arrive repeated (`?q=a&q=b`); take the first.
function firstValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function StockBadge({ product }: { product: ProductRow }) {
  if (product.quantity === 0) {
    return <Badge variant="destructive">Out of stock</Badge>;
  }

  if (isLowStock(product)) {
    return <Badge variant="destructive">Low stock</Badge>;
  }

  return <Badge variant="outline">In stock</Badge>;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The page guard. The proxy is optimistic only, and every action re-checks.
  await requireRole(Role.STAFF);

  const params = await searchParams;
  const query = firstValue(params.q).trim();
  const rawCategory = firstValue(params.category);
  // Anything that isn't one of our categories is treated as no filter rather
  // than as a query that silently returns nothing.
  const category = isProductCategory(rawCategory) ? rawCategory : null;

  // `category` is an equality match, so it uses the @@index([category]); the
  // list is ordered by name, which uses @@index([name]). The name search is a
  // case-insensitive `contains`, which scans — fine at a single shop's catalogue
  // size, and the alternative (a trigram index) isn't worth the migration yet.
  const where: Prisma.ProductWhereInput = {
    ...(query ? { name: { contains: query, mode: "insensitive" } } : {}),
    ...(category ? { category } : {}),
  };

  const [products, totalCount] = await Promise.all([
    prisma.product.findMany({ where, orderBy: { name: "asc" } }),
    prisma.product.count(),
  ]);

  const filtered = Boolean(query || category);
  const lowStockCount = products.filter(isLowStock).length;

  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            {totalCount === 0
              ? "Nothing in the catalogue yet"
              : `${products.length} of ${totalCount} shown${
                  lowStockCount > 0 ? ` · ${lowStockCount} low on stock` : ""
                }`}
          </p>
        </div>

        <Link
          href="/products/new"
          className={buttonVariants({ className: "h-11 px-4 text-base" })}
        >
          <PlusIcon />
          Add product
        </Link>
      </header>

      {totalCount > 0 && <ProductFilters query={query} category={category} />}

      {products.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {filtered ? <SearchXIcon /> : <PackageIcon />}
            </EmptyMedia>
            <EmptyTitle>
              {filtered ? "No matching products" : "No products yet"}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Nothing matches that search and category. Try a different spelling, or clear the filters."
                : "Add the products you keep on the shelf. Stock logging and checkout build on this list."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {filtered ? (
              <Link
                href="/products"
                className={buttonVariants({
                  variant: "outline",
                  className: "h-11 px-4 text-base",
                })}
              >
                Clear filters
              </Link>
            ) : (
              <Link
                href="/products/new"
                className={buttonVariants({ className: "h-11 px-4 text-base" })}
              >
                <PlusIcon />
                Add your first product
              </Link>
            )}
          </EmptyContent>
        </Empty>
      ) : (
        <>
          {/* Phone: one tappable card per product, the whole card opening the
              edit form. */}
          <ul className="flex flex-col gap-3 md:hidden">
            {products.map((product) => {
              const low = isLowStock(product);

              return (
                <li key={product.id}>
                  <Link
                    href={`/products/${product.id}/edit`}
                    className={cn(
                      "flex items-center gap-4 rounded-xl border p-4 active:bg-muted",
                      low && "border-destructive/40 bg-destructive/5",
                    )}
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="truncate text-base font-medium">
                        {product.name}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {[product.shade, product.category]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <div>
                        <StockBadge product={product} />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-2xl leading-none font-semibold tabular-nums">
                        {product.quantity}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {product.unit}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Laptop: the owner scans the whole catalogue at once. */}
          <div className="hidden overflow-x-auto rounded-xl border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Shade</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead className="w-0 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => {
                  const low = isLowStock(product);

                  return (
                    <TableRow
                      key={product.id}
                      className={cn(low && "bg-destructive/5")}
                    >
                      <TableCell className="font-medium">
                        {product.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {product.shade ?? "—"}
                      </TableCell>
                      <TableCell>{product.category}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {product.quantity}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {product.unit}
                      </TableCell>
                      <TableCell>
                        <StockBadge product={product} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/products/${product.id}/edit`}
                          className={buttonVariants({
                            variant: "outline",
                            size: "sm",
                          })}
                        >
                          Edit
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </main>
  );
}
