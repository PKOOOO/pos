import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownUpIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Role } from "@/generated/prisma/client";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DeleteProductButton } from "@/app/(app)/products/delete-product-button";
import { ProductForm } from "@/app/(app)/products/product-form";
import { MovementList } from "@/app/(app)/stock/movement-list";

const HISTORY_LIMIT = 20;

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole(Role.STAFF);
  const { id } = await params;

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) notFound();

  // Newest-first for one product, which is exactly what
  // @@index([productId, createdAt]) exists for.
  const movements = await prisma.stockMovement.findMany({
    where: { productId: product.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    select: {
      id: true,
      type: true,
      quantity: true,
      note: true,
      createdAt: true,
      product: { select: { name: true, shade: true, unit: true } },
      staff: { select: { name: true } },
    },
  });

  return (
    <main className="flex flex-1 flex-col gap-6 p-4">
      <header className="flex flex-col gap-1">
        <Link
          href="/products"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Products
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {product.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {[product.shade, product.category].filter(Boolean).join(" · ")}
        </p>
      </header>

      <ProductForm
        product={{
          id: product.id,
          name: product.name,
          category: product.category,
          shade: product.shade,
          unit: product.unit,
          // Decimal → string at the boundary; see lib/money.ts.
          sellingPrice: product.sellingPrice.toFixed(2),
          costPrice: product.costPrice.toFixed(2),
          quantity: product.quantity,
          lowStockThreshold: product.lowStockThreshold,
        }}
      />

      <section className="flex flex-col gap-3 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Stock history
          </h2>
          <Link
            href={`/stock?product=${product.id}`}
            className={buttonVariants({
              variant: "outline",
              className: "h-11 px-4 text-base",
            })}
          >
            <ArrowDownUpIcon />
            Log movement
          </Link>
        </div>

        {/* The product is the heading of this page, so each row leads with the
            movement instead of repeating the name. */}
        <MovementList
          movements={movements}
          showProduct={false}
          emptyMessage="No movements yet. The opening count was set when this product was added."
        />

        {movements.length === HISTORY_LIMIT && (
          <p className="text-sm text-muted-foreground">
            Showing the {HISTORY_LIMIT} most recent movements.
          </p>
        )}
      </section>

      {/* Deleting is owner-only. The button is hidden from staff and the action
          refuses them regardless — hiding a control is not the guard. */}
      {user.role === Role.OWNER && (
        <div className="flex flex-col gap-2 border-t pt-4">
          <DeleteProductButton
            productId={product.id}
            productName={product.name}
          />
        </div>
      )}
    </main>
  );
}
