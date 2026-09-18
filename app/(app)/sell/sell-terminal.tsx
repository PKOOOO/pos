"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2Icon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
  ShoppingCartIcon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { formatKes, fromMinorUnits, toMinorUnits } from "@/lib/money";
import { cn } from "@/lib/utils";
import { checkSaleProgress, startCheckout } from "@/app/(app)/sell/actions";
import {
  emptyCheckoutState,
  type CheckoutState,
} from "@/app/(app)/sell/checkout-state";

export type SellProduct = {
  id: string;
  name: string;
  shade: string | null;
  unit: string;
  quantity: number;
  /** Decimal as a string — see lib/money.ts. */
  sellingPrice: string;
};

const CONTROL = "h-11 text-base";

// The customer has to unlock their phone, find the prompt and type a PIN. Two
// minutes is generous for that; past it the sale is not abandoned, it is just no
// longer worth holding this screen hostage — /sales shows where it landed.
const POLL_MS = 3_000;
const MAX_POLLS = 40;
// Most polls only read our own row, which the webhook updates. Every fourth one
// also asks Paystack directly, so a dropped webhook still resolves.
const RECONCILE_EVERY = 4;

export function SellTerminal({ products }: { products: SellProduct[] }) {
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});

  const [state, formAction, pending] = useActionState<CheckoutState, FormData>(
    startCheckout,
    emptyCheckoutState,
  );

  // Once a prompt is out, this screen's job is to wait for the answer.
  const waitingOn =
    state.status === "success" && state.reference ? state.reference : null;

  // Only the *outcome* is state. "waiting" is derived from having a reference,
  // so the effect below never has to set state synchronously just to enter the
  // waiting phase — it writes only when the poll actually resolves.
  const [outcome, setOutcome] = useState<
    "paid" | "declined" | "unresolved" | null
  >(null);

  const progress = outcome ?? (waitingOn ? ("waiting" as const) : null);

  const shownFor = useRef<CheckoutState | null>(null);

  useEffect(() => {
    if (state === shownFor.current || state.status === "idle") return;
    shownFor.current = state;

    if (state.status === "error") toast.error(state.message);
  }, [state]);

  useEffect(() => {
    if (!waitingOn) return;

    let polls = 0;
    let cancelled = false;

    const tick = async () => {
      polls += 1;

      const result = await checkSaleProgress(
        waitingOn,
        polls % RECONCILE_EVERY === 0,
      );

      if (cancelled) return;

      if (result.status === "SUCCESS") {
        setOutcome("paid");
        setCart({});
        toast.success("Payment received.");
        return;
      }

      if (result.status === "FAILED") {
        setOutcome("declined");
        toast.error("The customer declined or the payment failed.");
        return;
      }

      if (polls >= MAX_POLLS) {
        setOutcome("unresolved");
        return;
      }

      timer = setTimeout(tick, POLL_MS);
    };

    let timer = setTimeout(tick, POLL_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [waitingOn]);

  const lines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, quantity]) => {
          const product = products.find((p) => p.id === id);
          return product ? { product, quantity } : null;
        })
        .filter((line): line is { product: SellProduct; quantity: number } =>
          Boolean(line),
        ),
    [cart, products],
  );

  // Summed in integer cents for the same reason the server does it — a running
  // float total would drift from the amount actually charged.
  const totalMinor = lines.reduce(
    (sum, line) =>
      sum + toMinorUnits(line.product.sellingPrice) * line.quantity,
    0,
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return products;

    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        (p.shade?.toLowerCase().includes(needle) ?? false),
    );
  }, [products, query]);

  function add(product: SellProduct) {
    setCart((current) => {
      const next = (current[product.id] ?? 0) + 1;
      // The binding check happens server-side at settlement; this just stops
      // staff building a cart the shelf visibly cannot fill.
      if (next > product.quantity) {
        toast.error(
          `Only ${product.quantity} ${product.unit} of ${product.name} left.`,
        );
        return current;
      }
      return { ...current, [product.id]: next };
    });
  }

  function remove(productId: string) {
    setCart((current) => {
      const next = (current[productId] ?? 0) - 1;
      if (next > 0) return { ...current, [productId]: next };

      // Dropped entirely at zero, so the line disappears from the cart rather
      // than lingering as a 0.
      const rest = { ...current };
      delete rest[productId];

      return rest;
    });
  }

  if (progress && waitingOn) {
    return (
      <WaitingScreen
        progress={progress}
        onDone={() => {
          setOutcome(null);
          shownFor.current = null;
          // A fresh mount resets useActionState, clearing the reference so the
          // next sale starts from a blank terminal.
          window.location.reload();
        }}
      />
    );
  }

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-4">
      <input type="hidden" name="items" value={JSON.stringify(
        lines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
      )} />

      <div className="relative">
        <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search products"
          autoComplete="off"
          className={`${CONTROL} pl-9`}
          aria-label="Search products"
        />
      </div>

      <ul className="flex flex-col gap-2">
        {visible.map((product) => {
          const inCart = cart[product.id] ?? 0;
          const soldOut = product.quantity === 0;

          return (
            <li key={product.id}>
              <div
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3",
                  inCart > 0 && "border-primary/50 bg-primary/5",
                  soldOut && "opacity-60",
                )}
              >
                <button
                  type="button"
                  onClick={() => add(product)}
                  disabled={soldOut}
                  className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
                >
                  <span className="truncate text-base font-medium">
                    {product.name}
                  </span>
                  <span className="truncate text-sm text-muted-foreground">
                    {[product.shade, `${product.quantity} ${product.unit} left`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="text-sm font-medium tabular-nums">
                    {formatKes(product.sellingPrice)}
                  </span>
                </button>

                {inCart > 0 ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-10"
                      onClick={() => remove(product.id)}
                      aria-label={`Remove one ${product.name}`}
                    >
                      <MinusIcon />
                    </Button>
                    <span className="w-8 text-center text-base font-semibold tabular-nums">
                      {inCart}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-10"
                      onClick={() => add(product)}
                      aria-label={`Add one ${product.name}`}
                    >
                      <PlusIcon />
                    </Button>
                  </div>
                ) : (
                  <Badge variant={soldOut ? "destructive" : "outline"}>
                    {soldOut ? "Out" : "Tap to add"}
                  </Badge>
                )}
              </div>
            </li>
          );
        })}

        {visible.length === 0 && (
          <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nothing matches that search.
          </li>
        )}
      </ul>

      {/* Sticky above the fixed bottom tab bar so the total and the charge
          button stay under the staff member's thumb while they scroll. */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] -mx-4 mt-auto flex flex-col gap-3 border-t bg-background px-4 py-3 md:bottom-0">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">
            {lines.length === 0
              ? "Cart is empty"
              : `${lines.reduce((n, l) => n + l.quantity, 0)} item${
                  lines.reduce((n, l) => n + l.quantity, 0) === 1 ? "" : "s"
                }`}
          </span>
          <span className="text-2xl font-semibold tabular-nums">
            {formatKes(fromMinorUnits(totalMinor))}
          </span>
        </div>

        <Field>
          <FieldLabel htmlFor="customerPhone" className="sr-only">
            Customer phone
          </FieldLabel>
          <Input
            id="customerPhone"
            name="customerPhone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0712 345 678"
            aria-invalid={Boolean(state.fieldErrors.customerPhone)}
            className={CONTROL}
          />
          <FieldError>{state.fieldErrors.customerPhone}</FieldError>
        </Field>

        <Button
          type="submit"
          disabled={pending || lines.length === 0}
          className="h-12 w-full text-base"
        >
          {pending && <Spinner />}
          <ShoppingCartIcon />
          Charge {formatKes(fromMinorUnits(totalMinor))}
        </Button>
      </div>
    </form>
  );
}

function WaitingScreen({
  progress,
  onDone,
}: {
  progress: "waiting" | "paid" | "declined" | "unresolved";
  onDone: () => void;
}) {
  const copy = {
    waiting: {
      icon: <Spinner className="size-10" />,
      title: "Waiting for the customer",
      body: "An M-Pesa prompt is on their phone. This updates itself the moment they approve it.",
    },
    paid: {
      icon: <CheckCircle2Icon className="size-10 text-primary" />,
      title: "Payment received",
      body: "Stock has been updated and the sale is recorded.",
    },
    declined: {
      icon: <XCircleIcon className="size-10 text-destructive" />,
      title: "Payment failed",
      body: "The customer declined the prompt or it timed out. Nothing was charged and stock is unchanged.",
    },
    unresolved: {
      icon: <XCircleIcon className="size-10 text-muted-foreground" />,
      title: "Still waiting",
      body: "The prompt has not been answered yet. The sale will settle on its own if they pay — check Sales in a moment.",
    },
  }[progress];

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      {copy.icon}
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">{copy.title}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">{copy.body}</p>
      </div>

      {progress !== "waiting" && (
        <Button onClick={onDone} className="h-11 px-6 text-base">
          New sale
        </Button>
      )}
    </div>
  );
}
