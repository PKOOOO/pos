import Link from "next/link";
import { ChevronRightIcon, TriangleAlertIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Role } from "@/generated/prisma/client";
import { requireRole } from "@/lib/auth";
import { getLowStockProducts } from "@/lib/stock";

// Enough to act on at the counter; the rest are a tap away in Products, which
// sorts low stock to the top.
const SHOWN = 5;

export default async function DashboardPage() {
  // The proxy already bounced signed-out visitors and the shell looked the user
  // up, but neither is the guard for this route — this call is.
  const user = await requireRole(Role.STAFF);

  const lowStock = await getLowStockProducts();
  const firstName = user.name.split(" ")[0];

  return (
    <main className="flex flex-1 flex-col gap-6 p-4">
      <h1 className="text-2xl font-semibold tracking-tight">Hi {firstName}</h1>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Low on stock</h2>
          {lowStock.length > 0 && (
            <Badge variant="destructive">{lowStock.length}</Badge>
          )}
        </div>

        {lowStock.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Nothing is at its threshold. Every product has more on the shelf
            than its low-stock number.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {lowStock.slice(0, SHOWN).map((product) => (
                <li key={product.id}>
                  {/* Straight to the stock screen with this product already
                      picked: from "we're low" to logging a delivery in one tap. */}
                  <Link
                    href={`/stock?product=${product.id}`}
                    className="flex min-h-16 items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 active:bg-destructive/10"
                  >
                    <TriangleAlertIcon
                      className="size-5 shrink-0 text-destructive"
                      aria-hidden
                    />

                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">
                        {product.name}
                      </span>
                      {product.shade && (
                        <span className="truncate text-sm text-muted-foreground">
                          {product.shade}
                        </span>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      <span className="block text-lg leading-none font-semibold text-destructive tabular-nums">
                        {product.quantity} {product.unit}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        alert at {product.lowStockThreshold}
                      </span>
                    </div>

                    <ChevronRightIcon
                      className="size-5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>

            {lowStock.length > SHOWN && (
              <Link
                href="/products"
                className={buttonVariants({
                  variant: "outline",
                  className: "h-11 px-4 text-base",
                })}
              >
                See all {lowStock.length} in Products
              </Link>
            )}
          </>
        )}
      </section>

      <p className="text-sm text-muted-foreground">
        Checkout{user.role === Role.OWNER ? " and reports" : ""} come next — use
        the menu to move around.
      </p>
    </main>
  );
}
