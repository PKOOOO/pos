// The shape the product form actions return, kept OUT of actions.ts on purpose:
// a `"use server"` module may only export async functions. A value exported from
// one is replaced by an action reference in the client bundle, so importing the
// initial state from there gave the form a `state` with no `fieldErrors` on it.

export type ProductFormState = {
  status: "idle" | "success" | "error";
  message: string;
  /** field name -> first message for that field, rendered next to the input */
  fieldErrors: Record<string, string>;
};

export const emptyProductFormState: ProductFormState = {
  status: "idle",
  message: "",
  fieldErrors: {},
};
