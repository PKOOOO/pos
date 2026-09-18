import { PackageIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Role } from "@/generated/prisma/client";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SellTerminal } from "@/app/(app)/sell/sell-terminal";

export default async function SellPage() {
  // The page guard. Actions re-check independently.
  await requireRole(Role.STAFF);

  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      shade: true,
      unit: true,
      quantity: true,
      sellingPrice: true,
    },
  });

  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Sell</h1>
        <p className="text-sm text-muted-foreground">
          Tap products to build the cart, then charge the customer by M-Pesa.
        </p>
      </header>

      {products.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing to sell yet</EmptyTitle>
            <EmptyDescription>
              Add products to the catalogue first — checkout prices from it.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link
              href="/products/new"
              className={buttonVariants({ className: "h-11 px-4 text-base" })}
            >
              Add a product
            </Link>
          </EmptyContent>
        </Empty>
      ) : (
        // The whole catalogue is sent once and filtered in the browser: a picker
        // is a search surface, and on shop wifi a round trip per keystroke is
        // worse than one slightly larger payload.
        <SellTerminal
          products={products.map((product) => ({
            ...product,
            // Decimal → string at the boundary; see lib/money.ts.
            sellingPrice: product.sellingPrice.toFixed(2),
          }))}
        />
      )}
    </main>
  );
}
