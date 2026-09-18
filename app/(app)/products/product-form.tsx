"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { PRODUCT_CATEGORIES, PRODUCT_UNITS } from "@/lib/products";
import { createProduct, updateProduct } from "@/app/(app)/products/actions";
import { emptyActionState, type ActionState } from "@/lib/action-state";

export type ProductFormValues = {
  id: string;
  name: string;
  category: string;
  shade: string | null;
  unit: string;
  // Strings, not Decimals: Prisma's Decimal is a class instance and cannot cross
  // into a Client Component. The page passes `price.toFixed(2)`. See lib/money.ts.
  sellingPrice: string;
  costPrice: string;
  quantity: number;
  lowStockThreshold: number;
};

// Counter-height controls: staff tap these on a phone, in a hurry, under shop
// lighting. `text-base` also stops iOS zooming the page on focus.
const CONTROL = "h-11 text-base";

export function ProductForm({ product }: { product?: ProductFormValues }) {
  const router = useRouter();
  const isEdit = product !== undefined;

  // `updateProduct` takes the id as a bound first argument rather than a hidden
  // input, so the id never round-trips through the rendered HTML.
  const action = isEdit ? updateProduct.bind(null, product.id) : createProduct;

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    emptyActionState,
  );

  // The action's result is the toast trigger. Guarding on identity keeps a
  // re-render from re-firing a toast for a result already shown.
  const shownFor = useRef<ActionState | null>(null);

  useEffect(() => {
    if (state === shownFor.current || state.status === "idle") return;
    shownFor.current = state;

    if (state.status === "success") {
      toast.success(state.message);
      router.push("/products");
      return;
    }

    toast.error(state.message);
  }, [state, router]);

  // Leave the form disabled after a success while the router navigates away, so
  // a double-tap can't submit the same product twice.
  const busy = pending || state.status === "success";
  const error = (field: string) => state.fieldErrors[field];

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-6">
      <FieldGroup className="gap-5">
        <Field>
          <FieldLabel htmlFor="name" className="text-base">
            Name
          </FieldLabel>
          <Input
            id="name"
            name="name"
            defaultValue={product?.name}
            placeholder="Nail Polish"
            autoComplete="off"
            required
            maxLength={120}
            aria-invalid={Boolean(error("name"))}
            className={CONTROL}
          />
          <FieldError>{error("name")}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="category" className="text-base">
            Category
          </FieldLabel>
          <Select name="category" defaultValue={product?.category ?? null}>
            <SelectTrigger
              id="category"
              aria-invalid={Boolean(error("category"))}
              className={`w-full ${CONTROL}`}
            >
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              {PRODUCT_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category} className="h-10">
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError>{error("category")}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="shade" className="text-base">
            Shade or variant{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </FieldLabel>
          <Input
            id="shade"
            name="shade"
            defaultValue={product?.shade ?? ""}
            placeholder="Ruby Red"
            autoComplete="off"
            maxLength={80}
            aria-invalid={Boolean(error("shade"))}
            className={CONTROL}
          />
          <FieldError>{error("shade")}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="unit" className="text-base">
            Unit
          </FieldLabel>
          <Select name="unit" defaultValue={product?.unit ?? null}>
            <SelectTrigger
              id="unit"
              aria-invalid={Boolean(error("unit"))}
              className={`w-full ${CONTROL}`}
            >
              <SelectValue placeholder="Choose a unit" />
            </SelectTrigger>
            <SelectContent>
              {PRODUCT_UNITS.map((unit) => (
                <SelectItem key={unit} value={unit} className="h-10">
                  {unit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError>{error("unit")}</FieldError>
        </Field>

        {/* Side by side from `sm` up; stacked on a phone so neither box gets
            too narrow to read a price in. */}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="sellingPrice" className="text-base">
              Selling price
            </FieldLabel>
            <Input
              id="sellingPrice"
              name="sellingPrice"
              // `text` + `inputMode="decimal"` rather than `type="number"`:
              // number inputs swallow a trailing "." mid-typing and expose
              // spinners nobody wants on a price.
              type="text"
              inputMode="decimal"
              defaultValue={product?.sellingPrice ?? ""}
              placeholder="1200.00"
              autoComplete="off"
              required
              aria-invalid={Boolean(error("sellingPrice"))}
              className={CONTROL}
            />
            <FieldDescription>What the customer pays, in KES.</FieldDescription>
            <FieldError>{error("sellingPrice")}</FieldError>
          </Field>

          <Field>
            <FieldLabel htmlFor="costPrice" className="text-base">
              Cost price
            </FieldLabel>
            <Input
              id="costPrice"
              name="costPrice"
              type="text"
              inputMode="decimal"
              defaultValue={product?.costPrice ?? ""}
              placeholder="800.00"
              autoComplete="off"
              required
              aria-invalid={Boolean(error("costPrice"))}
              className={CONTROL}
            />
            <FieldDescription>
              What the shop paid. Used for margin reporting, never shown at
              checkout.
            </FieldDescription>
            <FieldError>{error("costPrice")}</FieldError>
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="quantity" className="text-base">
            {isEdit ? "Current stock" : "Starting stock"}
          </FieldLabel>
          <Input
            id="quantity"
            // On edit this field is display-only, so it carries no `name` and
            // submits nothing — stock changes belong to stock movements.
            name={isEdit ? undefined : "quantity"}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            defaultValue={product?.quantity ?? 0}
            disabled={isEdit}
            required={!isEdit}
            aria-invalid={Boolean(error("quantity"))}
            className={CONTROL}
          />
          <FieldDescription>
            {isEdit
              ? "Stock changes are logged as stock in/out so the history stays accurate."
              : "The count on the shelf right now. Every change after this is logged as stock in/out."}
          </FieldDescription>
          <FieldError>{error("quantity")}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="lowStockThreshold" className="text-base">
            Low-stock alert at
          </FieldLabel>
          <Input
            id="lowStockThreshold"
            name="lowStockThreshold"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            defaultValue={product?.lowStockThreshold ?? 0}
            required
            aria-invalid={Boolean(error("lowStockThreshold"))}
            className={CONTROL}
          />
          <FieldDescription>
            Flag this product once its stock drops to this number.
          </FieldDescription>
          <FieldError>{error("lowStockThreshold")}</FieldError>
        </Field>
      </FieldGroup>

      {/* Sticky on a phone so Save is always in reach of a thumb — offset by the
          height of the fixed bottom tab bar so the two don't overlap. */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] -mx-4 mt-auto flex gap-3 border-t bg-background px-4 py-3 md:bottom-0">
        <Link
          href="/products"
          className={buttonVariants({
            variant: "outline",
            className: "h-11 flex-1 text-base",
          })}
        >
          Cancel
        </Link>
        <Button type="submit" disabled={busy} className="h-11 flex-1 text-base">
          {busy && <Spinner />}
          {isEdit ? "Save changes" : "Add product"}
        </Button>
      </div>
    </form>
  );
}
