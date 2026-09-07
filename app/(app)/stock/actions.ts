"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { MovementType, Role } from "@/generated/prisma/client";
import { requireRole } from "@/lib/auth";
import { applyStockMovement } from "@/lib/stock";
import type { ActionState } from "@/lib/action-state";
import {
  failed,
  invalid,
  optionalText,
  positiveWholeNumber,
  requiredText,
  succeeded,
} from "@/lib/form-fields";

// Only async functions may be exported from a "use server" module — the state
// shape and its initial value live in lib/action-state.ts.

const movementSchema = z.object({
  productId: requiredText("Product", 40),
  type: z.enum([MovementType.IN, MovementType.OUT], {
    error: "Choose stock in or stock out",
  }),
  quantity: positiveWholeNumber("Quantity"),
  note: optionalText("Note", 200),
});

/**
 * Logs one stock movement. Validation and auth live here; the transaction that
 * writes the movement and moves the count lives in lib/stock.ts, where it can
 * be exercised without a session.
 */
export async function logStockMovement(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole(Role.STAFF);

  const parsed = movementSchema.safeParse({
    productId: formData.get("productId") ?? "",
    type: formData.get("type") ?? "",
    quantity: formData.get("quantity") ?? "",
    note: formData.get("note") ?? "",
  });

  if (!parsed.success) return invalid(parsed.error);

  const { productId, type, quantity, note } = parsed.data;

  try {
    const outcome = await applyStockMovement({
      productId,
      type,
      quantity,
      note,
      // From the session, never the form: the client says which product moved,
      // not who moved it.
      staffId: user.id,
    });

    if (!outcome.ok) {
      if (outcome.reason === "missing") {
        return failed("That product no longer exists.");
      }

      const { name, quantity: available, unit } = outcome.product;
      return {
        status: "error",
        message: `Only ${available} ${unit} of ${name} in stock.`,
        fieldErrors: {
          quantity: `Can't take out more than ${available}`,
        },
      };
    }

    const { name, quantity: now, unit } = outcome.product;

    // The low-stock badge lives in the app shell, so revalidating single pages
    // would leave a stale count on every other screen. Every page here is
    // request-rendered anyway, so there is no cached work being thrown away.
    revalidatePath("/", "layout");

    return succeeded(
      `${type === MovementType.IN ? "Added" : "Removed"} ${quantity} — ${name} is now ${now} ${unit}.`,
    );
  } catch (error) {
    console.error("logStockMovement failed", error);
    return failed("Couldn't log that movement. Try again.");
  }
}
