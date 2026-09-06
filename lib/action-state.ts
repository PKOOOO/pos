/**
 * The shape every form Server Action in this app returns, kept in its own
 * client-safe module on purpose: a `"use server"` file may only export async
 * functions, so a state constant declared alongside the actions is replaced by
 * an action reference in the client bundle and arrives without its fields.
 *
 * No zod import here either — this module is pulled into client bundles by the
 * forms. The zod helpers that build these live in lib/form-fields.ts.
 */
export type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
  /** field name -> first message for that field, rendered next to the input */
  fieldErrors: Record<string, string>;
};

export const emptyActionState: ActionState = {
  status: "idle",
  message: "",
  fieldErrors: {},
};
