import { emptyActionState, type ActionState } from "@/lib/action-state";

/**
 * Checkout's action state. In its own client-safe module, not in `actions.ts`:
 * a `"use server"` file may only export async functions, so a constant declared
 * beside the actions is replaced by an action reference in the client bundle and
 * arrives with none of its fields.
 *
 * `reference` is what the waiting screen polls on. It is set as soon as the sale
 * row exists — including when the charge request then fails — so staff always
 * have a handle to look the sale up by.
 */
export type CheckoutState = ActionState & { reference: string | null };

export const emptyCheckoutState: CheckoutState = {
  ...emptyActionState,
  reference: null,
};
