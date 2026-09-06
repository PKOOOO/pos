"use client";

import { usePathname } from "next/navigation";
import { useActionState, useCallback, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRightIcon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { MovementType } from "@/generated/prisma/enums";
import { emptyActionState, type ActionState } from "@/lib/action-state";
import { useUrlSearch } from "@/hooks/use-url-search";
import { cn } from "@/lib/utils";
import { logStockMovement } from "@/app/(app)/stock/actions";

export type PickerProduct = {
  id: string;
  name: string;
  shade: string | null;
  unit: string;
  quantity: number;
};

const CONTROL = "h-12 text-base";

export function StockForm({
  products,
  query,
  initialProduct,
  moreResults,
}: {
  products: PickerProduct[];
  query: string;
  initialProduct: PickerProduct | null;
  moreResults: boolean;
}) {
  const pathname = usePathname();

  // Keeping the picked product out of the URL means logging one movement after
  // another costs no round trip; the search itself stays in the URL.
  const [picked, setPicked] = useState<PickerProduct | null>(initialProduct);
  const [type, setType] = useState<MovementType>(MovementType.IN);
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");

  const hrefFor = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      return trimmed
        ? `${pathname}?q=${encodeURIComponent(trimmed)}`
        : pathname;
    },
    [pathname],
  );

  const {
    term,
    setTerm,
    setImmediately,
    pending: searching,
  } = useUrlSearch({
    query,
    hrefFor,
  });

  // The action is wrapped rather than passed straight to useActionState so the
  // toast and the field reset happen where the result arrives. Doing it in an
  // effect instead means a second render pass for every submission.
  const [state, formAction, submitting] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await logStockMovement(previous, formData);

      if (result.status === "success") {
        toast.success(result.message);
        // Staff usually log several movements in a row, so the product stays
        // picked and only the movement itself is cleared.
        setQuantity("1");
        setNote("");
      } else {
        toast.error(result.message);
      }

      return result;
    },
    emptyActionState,
  );

  // Prefer the freshly rendered row over the snapshot taken when it was picked,
  // so the count on screen is the one the last movement left behind.
  const selected = picked
    ? (products.find((product) => product.id === picked.id) ?? picked)
    : null;

  const amount = /^\d+$/.test(quantity.trim()) ? Number(quantity.trim()) : null;
  const isOut = type === MovementType.OUT;
  const nextQuantity =
    selected && amount !== null
      ? selected.quantity + (isOut ? -amount : amount)
      : null;
  const overdrawn = nextQuantity !== null && nextQuantity < 0;

  function step(by: number) {
    setQuantity(String(Math.max(1, (amount ?? 0) + by)));
  }

  if (!selected) {
    return (
      <div className="flex flex-col gap-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search products"
            aria-label="Search products by name"
            autoComplete="off"
            className="h-12 pr-10 pl-9 text-base"
          />
          {searching && (
            <Spinner className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground" />
          )}
        </div>

        {products.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            {query
              ? "No products match that search."
              : "No products yet — add one before logging stock."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {products.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => setPicked(product)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-xl border bg-card px-4 py-2 text-left active:bg-muted"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{product.name}</span>
                    {product.shade && (
                      <span className="truncate text-sm text-muted-foreground">
                        {product.shade}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-lg leading-none font-semibold tabular-nums">
                      {product.quantity}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {product.unit}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {moreResults && (
          <p className="text-sm text-muted-foreground">
            Showing the first {products.length} — search to narrow it down.
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="productId" value={selected.id} />

      <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-base font-medium">
            {selected.name}
          </span>
          <span className="truncate text-sm text-muted-foreground">
            {[selected.shade, `${selected.quantity} ${selected.unit} in stock`]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => {
            setPicked(null);
            setImmediately("");
          }}
        >
          <XIcon />
          Change
        </Button>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-base font-medium">Movement</legend>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: MovementType.IN, label: "Stock in", hint: "Received" },
            {
              value: MovementType.OUT,
              label: "Stock out",
              hint: "Used or sold",
            },
          ].map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex min-h-16 cursor-pointer flex-col items-center justify-center rounded-xl border-2 px-2 text-center",
                type === option.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card active:bg-muted",
              )}
            >
              <input
                type="radio"
                name="type"
                value={option.value}
                checked={type === option.value}
                onChange={() => setType(option.value)}
                className="sr-only"
              />
              <span className="text-base font-semibold">{option.label}</span>
              <span
                className={cn(
                  "text-xs",
                  type === option.value
                    ? "text-primary-foreground/80"
                    : "text-muted-foreground",
                )}
              >
                {option.hint}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field>
        <FieldLabel htmlFor="quantity" className="text-base">
          Quantity
        </FieldLabel>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="One fewer"
            className="size-12 shrink-0"
            onClick={() => step(-1)}
          >
            <MinusIcon />
          </Button>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            required
            aria-invalid={Boolean(state.fieldErrors.quantity) || overdrawn}
            className="h-12 flex-1 text-center text-xl font-semibold"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="One more"
            className="size-12 shrink-0"
            onClick={() => step(1)}
          >
            <PlusIcon />
          </Button>
        </div>
        <FieldError>{state.fieldErrors.quantity}</FieldError>
      </Field>

      {/* The sanity check: what the count is now, and what it will be. */}
      <p
        aria-live="polite"
        className={cn(
          "flex items-center justify-center gap-2 rounded-xl border p-3 text-base",
          overdrawn
            ? "border-destructive/40 bg-destructive/5 text-destructive"
            : "bg-muted",
        )}
      >
        {overdrawn ? (
          <span className="font-medium">
            Only {selected.quantity} {selected.unit} in stock
          </span>
        ) : (
          <>
            <span className="tabular-nums">
              {selected.quantity} {selected.unit}
            </span>
            <ArrowRightIcon className="size-4 text-muted-foreground" />
            <span className="text-lg font-semibold tabular-nums">
              {nextQuantity ?? selected.quantity} {selected.unit}
            </span>
          </>
        )}
      </p>

      <Field>
        <FieldLabel htmlFor="note" className="text-base">
          Note{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </FieldLabel>
        <Input
          id="note"
          name="note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Delivery, breakage, salon use…"
          maxLength={200}
          autoComplete="off"
          aria-invalid={Boolean(state.fieldErrors.note)}
          className={CONTROL}
        />
        <FieldError>{state.fieldErrors.note}</FieldError>
      </Field>

      <Button
        type="submit"
        disabled={submitting || overdrawn || amount === null || amount < 1}
        className="h-14 text-base"
      >
        {submitting && <Spinner />}
        {isOut ? "Log stock out" : "Log stock in"}
      </Button>
    </form>
  );
}
