import Link from "next/link";
import { notFound } from "next/navigation";

import { Role } from "@/generated/prisma/client";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DeleteProductButton } from "@/app/(app)/products/delete-product-button";
import { ProductForm } from "@/app/(app)/products/product-form";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole(Role.STAFF);
  const { id } = await params;

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) notFound();

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
          quantity: product.quantity,
          lowStockThreshold: product.lowStockThreshold,
        }}
      />

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
