import { z } from "zod";

import type { ActionState } from "@/lib/action-state";
import { MAX_MONEY_INTEGER_DIGITS } from "@/lib/money";

/**
 * Field parsers shared by every form action, so products and stock movements
 * accept and reject exactly the same things.
 *
 * FormData values are always strings. Rejecting non-digits outright beats
 * coercion: "1.5", "-2" and "" each get a message a person can act on instead
 * of silently becoming 1, -2 or 0.
 */
export const requiredText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);

/** Trimmed, length-capped, and empty becomes null — nullable columns store null. */
export const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .transform((value) => (value.length > 0 ? value : null));

export const wholeNumber = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .regex(/^\d+$/, `${label} must be a whole number, 0 or more`)
    .transform(Number)
    .refine(Number.isSafeInteger, `${label} is too large`);

/** As above, but a movement of zero units is not a movement. */
export const positiveWholeNumber = (label: string) =>
  wholeNumber(label).refine(
    (value) => value > 0,
    `${label} must be at least 1`,
  );

/**
 * An amount of money, which stays a **string** — Prisma takes one for a Decimal
 * column, and `Number()` here would route every price through a float.
 *
 * The length check counts digits rather than comparing magnitudes, for the same
 * reason. Zero is allowed: a free sample or a promotional item is priced at 0,
 * and that is different from leaving the box empty.
 */
export const money = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .regex(
      /^\d+(\.\d{1,2})?$/,
      `${label} must be an amount like 1200 or 1200.50`,
    )
    .refine(
      (value) => value.split(".")[0].length <= MAX_MONEY_INTEGER_DIGITS,
      `${label} is too large`,
    );

export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
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

export function invalid(error: z.ZodError): ActionState {
  return {
    status: "error",
    message: "Check the highlighted fields.",
    fieldErrors: fieldErrorsFrom(error),
  };
}

export function failed(message: string): ActionState {
  return { status: "error", message, fieldErrors: {} };
}

export function succeeded(message: string): ActionState {
  return { status: "success", message, fieldErrors: {} };
}
