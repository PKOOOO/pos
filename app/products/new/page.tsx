import Link from "next/link";

import { Role } from "@/generated/prisma/client";
import { requireRole } from "@/lib/auth";
import { ProductForm } from "@/app/products/product-form";

export default async function NewProductPage() {
  // Staff add products themselves; the owner can too.
  await requireRole(Role.STAFF);

  return (
    <main className="flex flex-1 flex-col gap-6 p-4">
      <header className="flex flex-col gap-1">
        <Link
          href="/products"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Products
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Add product</h1>
        <p className="text-sm text-muted-foreground">
          One row per shade or size — for example, Nail Polish · Ruby Red · 15ml.
        </p>
      </header>

      <ProductForm />
    </main>
  );
}
