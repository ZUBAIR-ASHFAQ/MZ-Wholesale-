import { z } from "zod";

import { isMoneyWithinDatabaseRange } from "../../shared/utils/decimal-validation.js";

const uuidSchema = z.string().uuid("ID must be a valid UUID.");
const paymentMethodSchema = z.enum(["CASH", "BANK_TRANSFER"]);

const categoryNameSchema = z
  .string()
  .trim()
  .min(1, "Expense category name is required.")
  .max(120, "Expense category name must be 120 characters or fewer.");

const moneySchema = z
  .string()
  .trim()
  .regex(
    /^\d+(\.\d{1,2})?$/,
    "Amount must be a non-negative number with up to two decimal places.",
  )
  .refine(isMoneyWithinDatabaseRange, "Amount is too large for the database money field.");

const positiveMoneySchema = moneySchema.refine(
  isPositiveMoney,
  "Amount must be greater than zero.",
);

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format.")
  .refine(isValidDate, "Date must be a valid calendar date.");

const noteSchema = z
  .string()
  .trim()
  .min(1, "Note cannot be blank.")
  .max(500, "Note must be 500 characters or fewer.");

const receiptUrlSchema = z
  .string()
  .trim()
  .url("Receipt URL must be a valid URL.")
  .max(2048, "Receipt URL must be 2048 characters or fewer.");

const reversalReasonSchema = z
  .string()
  .trim()
  .min(1, "Reversal reason is required.")
  .max(500, "Reversal reason must be 500 characters or fewer.");

/** Returns true when a YYYY-MM-DD string represents a real calendar date. */
function isValidDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Converts a valid money string into integer cents for exact comparison. */
function moneyToCents(value: string): bigint {
  const [wholePart, decimalPart = ""] = value.split(".");
  return BigInt(wholePart) * 100n + BigInt(decimalPart.padEnd(2, "0"));
}

/** Returns true when a money amount is greater than zero. */
function isPositiveMoney(value: string): boolean {
  return moneyToCents(value) > 0n;
}

/** Converts an empty optional text field into null. */
function emptyStringToNull(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

/** Returns true when an update request contains at least one editable field. */
function hasAtLeastOneField(input: Record<string, unknown>): boolean {
  return Object.keys(input).length > 0;
}

/** Adds a validation issue when an expense-list date range is reversed. */
function validateDateRange(
  input: { startDate?: string; endDate?: string },
  context: z.RefinementCtx,
): void {
  if (input.startDate && input.endDate && input.startDate > input.endDate) {
    context.addIssue({
      code: "custom",
      path: ["endDate"],
      message: "End date must be on or after start date.",
    });
  }
}

/** Enforces exactly one account matching the selected expense payment method. */
function validateExpenseAccount(
  input: {
    paymentMethod: "CASH" | "BANK_TRANSFER";
    cashAccountId?: string;
    bankAccountId?: string;
  },
  context: z.RefinementCtx,
): void {
  if (input.paymentMethod === "CASH") {
    if (!input.cashAccountId || input.bankAccountId) {
      context.addIssue({
        code: "custom",
        path: ["cashAccountId"],
        message: "A CASH expense requires only a cash account.",
      });
    }
    return;
  }

  if (!input.bankAccountId || input.cashAccountId) {
    context.addIssue({
      code: "custom",
      path: ["bankAccountId"],
      message: "A BANK_TRANSFER expense requires only a bank account.",
    });
  }
}

/** Validates expense-list filters and pagination. */
export const listExpensesQuerySchema = z
  .object({
    categoryId: uuidSchema.optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict()
  .superRefine(validateDateRange);

/** Validates the body used to create an expense category. */
export const createExpenseCategorySchema = z
  .object({
    name: categoryNameSchema,
  })
  .strict();

/** Validates fields accepted when renaming or activating an expense category. */
export const updateExpenseCategorySchema = z
  .object({
    name: categoryNameSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(hasAtLeastOneField, {
    message: "At least one field must be provided.",
  });

/** Validates the body used to create one confirmed expense. */
export const createExpenseSchema = z
  .object({
    expenseCategoryId: uuidSchema,
    expenseDate: dateSchema,
    amount: positiveMoneySchema,
    paymentMethod: paymentMethodSchema,
    cashAccountId: uuidSchema.optional(),
    bankAccountId: uuidSchema.optional(),
    note: z.preprocess(emptyStringToNull, noteSchema.nullable().optional()),
    receiptUrl: z.preprocess(
      emptyStringToNull,
      receiptUrlSchema.nullable().optional(),
    ),
  })
  .strict()
  .superRefine(validateExpenseAccount);

/** Validates the reason required to reverse an immutable confirmed expense. */
export const reverseExpenseSchema = z
  .object({
    reason: reversalReasonSchema,
  })
  .strict();

/** Validates an expense UUID from expense detail and reversal routes. */
export const expenseIdParamsSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

/** Validates an expense-category UUID from the category update route. */
export const expenseCategoryIdParamsSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
export type CreateExpenseCategoryInput = z.infer<
  typeof createExpenseCategorySchema
>;
export type UpdateExpenseCategoryInput = z.infer<
  typeof updateExpenseCategorySchema
>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type ReverseExpenseInput = z.infer<typeof reverseExpenseSchema>;
