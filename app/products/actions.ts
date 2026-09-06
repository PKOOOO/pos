"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { Prisma, Role } from "@/generated/prisma/client";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PRODUCT_CATEGORIES, PRODUCT_UNITS } from "@/lib/products";
import type { ProductFormState } from "@/app/products/form-state";

const PRODUCTS_PATH = "/products";

// Only async functions may be exported from this file — see form-state.ts for
// the state shape and its initial value.
export type DeleteProductResult = { ok: boolean; message: string };

// Surfaced verbatim to the user, so it reads like a fact about the shop rather
// than a database constraint.
const HAS_HISTORY_MESSAGE =
  "This product has stock history and can't be deleted.";

// --- validation -------------------------------------------------------------

const requiredText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);

// FormData values are always strings. Rejecting non-digits outright beats
// coercion: "1.5", "-2" and "" each get a message a person can act on instead
// of silently becoming 1, -2 or 0.
const wholeNumber = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .regex(/^\d+$/, `${label} must be a whole number, 0 or more`)
    .transform(Number)
    .refine(Number.isSafeInteger, `${label} is too large`);

const productFields = {
  name: requiredText("Name", 120),
  category: z.enum(PRODUCT_CATEGORIES, { error: "Choose a category" }),
  unit: z.enum(PRODUCT_UNITS, { error: "Choose a unit" }),
  shade: z
    .string()
    .trim()
    .max(80, "Shade must be 80 characters or fewer")
    // The column is nullable; an empty box means "no shade", not "".
    .transform((value) => (value.length > 0 ? value : null)),
  lowStockThreshold: wholeNumber("Low-stock threshold"),
};

const createProductSchema = z.object({
  ...productFields,
  quantity: wholeNumber("Quantity"),
});

// `quantity` is deliberately absent. After create, stock only moves through
// StockMovement — editing the number here would break the audit trail, so the
// field is never read on update even if a client posts one.
const updateProductSchema = z.object(productFields);

function readProductForm(formData: FormData) {
  return {
    name: formData.get("name") ?? "",
    category: formData.get("category") ?? "",
    shade: formData.get("shade") ?? "",
    unit: formData.get("unit") ?? "",
    quantity: formData.get("quantity") ?? "",
    lowStockThreshold: formData.get("lowStockThreshold") ?? "",
  };
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    // First message per field wins — the form shows one line per input.
    if (typeof field === "string" && !(field in fieldErrors)) {
      fieldErrors[field] = issue.message;
    }
  }

  return fieldErrors;
}

function invalid(error: z.ZodError): ProductFormState {
  return {
    status: "error",
    message: "Check the highlighted fields.",
    fieldErrors: fieldErrorsFrom(error),
  };
}

function failed(message: string): ProductFormState {
  return { status: "error", message, fieldErrors: {} };
}

// --- actions ----------------------------------------------------------------

/**
 * A Server Action is a POST endpoint on the page that declares it, reachable
 * without going through the UI. Rendering the form behind a guarded page proves
 * nothing, so every action below re-checks the role itself.
 */
export async function createProduct(
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  await requireRole(Role.STAFF);

  const parsed = createProductSchema.safeParse(readProductForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  try {
    const product = await prisma.product.create({ data: parsed.data });
    revalidatePath(PRODUCTS_PATH);

    return {
      status: "success",
      message: `${product.name} added.`,
      fieldErrors: {},
    };
  } catch (error) {
    console.error("createProduct failed", error);
    return failed("Couldn't save that product. Try again.");
  }
}

export async function updateProduct(
  productId: string,
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  await requireRole(Role.STAFF);

  const parsed = updateProductSchema.safeParse(readProductForm(formData));
  if (!parsed.success) return invalid(parsed.error);

  try {
    const product = await prisma.product.update({
      where: { id: productId },
      data: parsed.data,
    });

    revalidatePath(PRODUCTS_PATH);
    revalidatePath(`/products/${productId}/edit`);

    return {
      status: "success",
      message: `${product.name} updated.`,
      fieldErrors: {},
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return failed("That product no longer exists.");
    }

    console.error("updateProduct failed", error);
    return failed("Couldn't save your changes. Try again.");
  }
}

/**
 * Owner only, and strict: `requireRole(Role.OWNER)` does not accept STAFF.
 *
 * `StockMovement` and `SaleItem` both reference `Product` with
 * `onDelete: Restrict`, so a product that has ever moved cannot be deleted. We
 * check for that first to give a readable message; the P2003 branch still
 * catches the race where a movement lands between the count and the delete.
 */
export async function deleteProduct(
  productId: string,
): Promise<DeleteProductResult> {
  await requireRole(Role.OWNER);

  try {
    const [movementCount, saleItemCount] = await Promise.all([
      prisma.stockMovement.count({ where: { productId } }),
      prisma.saleItem.count({ where: { productId } }),
    ]);

    if (movementCount > 0 || saleItemCount > 0) {
      return { ok: false, message: HAS_HISTORY_MESSAGE };
    }

    const product = await prisma.product.delete({ where: { id: productId } });
    revalidatePath(PRODUCTS_PATH);

    return { ok: true, message: `${product.name} deleted.` };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2003") {
        return { ok: false, message: HAS_HISTORY_MESSAGE };
      }
      if (error.code === "P2025") {
        return { ok: false, message: "That product no longer exists." };
      }
    }

    console.error("deleteProduct failed", error);
    return { ok: false, message: "Couldn't delete that product. Try again." };
  }
}
