import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";

import { MovementType } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";
import { formatShopDateTime } from "@/lib/time";

export type MovementRow = {
  id: string;
  type: MovementType;
  quantity: number;
  note: string | null;
  createdAt: Date;
  product: { name: string; shade: string | null; unit: string };
  staff: { name: string };
};

/**
 * The ledger, rendered. Used twice: newest-first for one product on its edit
 * page, and newest-first across the shop on /stock.
 */
export function MovementList({
  movements,
  showProduct = true,
  emptyMessage = "No stock movements logged yet.",
}: {
  movements: MovementRow[];
  showProduct?: boolean;
  emptyMessage?: string;
}) {
  if (movements.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {movements.map((movement) => {
        const isIn = movement.type === MovementType.IN;

        return (
          <li
            key={movement.id}
            className="flex items-start gap-3 rounded-xl border bg-card p-3"
          >
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full",
                isIn
                  ? "bg-accent text-accent-foreground"
                  : "bg-destructive/10 text-destructive",
              )}
              aria-hidden
            >
              {isIn ? (
                <ArrowDownIcon className="size-5" />
              ) : (
                <ArrowUpIcon className="size-5" />
              )}
            </span>

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-medium">
                  {showProduct
                    ? [movement.product.name, movement.product.shade]
                        .filter(Boolean)
                        .join(" · ")
                    : isIn
                      ? "Stock in"
                      : "Stock out"}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-base font-semibold tabular-nums",
                    isIn ? "text-foreground" : "text-destructive",
                  )}
                >
                  {isIn ? "+" : "−"}
                  {movement.quantity} {movement.product.unit}
                </span>
              </div>

              <p className="text-sm text-muted-foreground">
                {movement.staff.name} · {formatShopDateTime(movement.createdAt)}
              </p>

              {movement.note && (
                <p className="text-sm break-words text-foreground/80">
                  {movement.note}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
