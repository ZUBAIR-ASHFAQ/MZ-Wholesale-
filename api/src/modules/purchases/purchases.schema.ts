import { z } from "zod";

import {
  isMoneyWithinDatabaseRange,
  isQuantityWithinDatabaseRange,
} from "../../shared/utils/decimal-validation.js";

const uuidSchema = z.string().uuid("ID must be a valid UUID.");
const purchaseStatusSchema = z.enum(["DRAFT", "CONFIRMED", "CANCELLED"]);
const createPurchaseStatusSchema = z.enum(["DRAFT", "CONFIRMED"]);
const paymentMethodSchema = z.enum(["CASH", "BANK_TRANSFER"]);

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

const quantitySchema = z
  .string()
  .trim()
  .regex(
    /^\d+(\.\d{1,3})?$/,
    "Quantity must be a non-negative number with up to three decimal places.",
  )
  .refine(isQuantityWithinDatabaseRange, "Quantity is too large for the database quantity field.");

const positiveQuantitySchema = quantitySchema.refine(
  isPositiveQuantity,
  "Quantity must be greater than zero.",
);

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format.")
  .refine(isValidDate, "Date must be a valid calendar date.");

const notesSchema = z
  .string()
  .trim()
  .min(1, "Notes cannot be blank.")
  .max(1000, "Notes must be 1000 characters or fewer.");

/** Returns true when a YYYY-MM-DD string represents a real calendar date. */
function isValidDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Converts a valid money string into integer cents for exact comparisons. */
function moneyToCents(value: string): bigint {
  const [wholePart, decimalPart = ""] = value.split(".");
  return BigInt(wholePart) * 100n + BigInt(decimalPart.padEnd(2, "0"));
}

/** Returns true when a money string is greater than zero. */
function isPositiveMoney(value: string): boolean {
  return moneyToCents(value) > 0n;
}

/** Returns true when a quantity string is greater than zero. */
function isPositiveQuantity(value: string): boolean {
  return !/^0+(\.0+)?$/.test(value);
}

/** Converts an empty optional text field into null. */
function emptyStringToNull(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

/** Returns true when a draft update contains at least one editable field. */
function hasAtLeastOneField(input: Record<string, unknown>): boolean {
  return Object.keys(input).length > 0;
}

/** Adds a validation issue when a list date range is reversed. */
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

/** Enforces the one matching account required by a purchase payment split. */
function validatePaymentSplitAccount(
  input: {
    method: "CASH" | "BANK_TRANSFER";
    cashAccountId?: string;
    bankAccountId?: string;
  },
  context: z.RefinementCtx,
): void {
  if (input.method === "CASH") {
    if (!input.cashAccountId || input.bankAccountId) {
      context.addIssue({
        code: "custom",
        path: ["cashAccountId"],
        message: "A CASH split requires only a cash account.",
      });
    }
    return;
  }

  if (!input.bankAccountId || input.cashAccountId) {
    context.addIssue({
      code: "custom",
      path: ["bankAccountId"],
      message: "A BANK_TRANSFER split requires only a bank account.",
    });
  }
}

/** Rejects repeated cash/bank accounts inside one initial payment. */
function validateUniquePaymentSplits(
  splits: ReadonlyArray<{
    method: "CASH" | "BANK_TRANSFER";
    cashAccountId?: string;
    bankAccountId?: string;
  }>,
  context: z.RefinementCtx,
): void {
  const seenAccounts = new Set<string>();

  splits.forEach((split, index) => {
    const accountId = split.cashAccountId ?? split.bankAccountId;
    if (!accountId) {
      return;
    }

    const key = `${split.method}:${accountId}`;
    if (seenAccounts.has(key)) {
      context.addIssue({
        code: "custom",
        path: ["splits", index],
        message: "The same account can appear only once in payment splits.",
      });
      return;
    }

    seenAccounts.add(key);
  });
}

const purchaseItemInputSchema = z
  .object({
    productId: uuidSchema,
    productUnitId: uuidSchema,
    quantity: positiveQuantitySchema,
    unitCost: positiveMoneySchema,
    itemDiscountAmount: moneySchema.default("0.00"),
  })
  .strict();

const initialPaymentSplitSchema = z
  .object({
    method: paymentMethodSchema,
    amount: positiveMoneySchema,
    cashAccountId: uuidSchema.optional(),
    bankAccountId: uuidSchema.optional(),
  })
  .strict()
  .superRefine(validatePaymentSplitAccount);

const initialPaymentSchema = z
  .object({
    splits: z
      .array(initialPaymentSplitSchema)
      .min(1, "At least one payment split is required.")
      .max(20, "An initial payment cannot contain more than 20 splits."),
  })
  .strict()
  .superRefine((input, context) => {
    validateUniquePaymentSplits(input.splits, context);
  });

const purchaseFields = {
  supplierId: uuidSchema,
  purchaseDate: dateSchema,
  items: z
    .array(purchaseItemInputSchema)
    .min(1, "At least one purchase item is required.")
    .max(500, "A purchase cannot contain more than 500 items."),
  invoiceDiscountAmount: moneySchema.default("0.00"),
  extraCostAmount: moneySchema.default("0.00"),
  notes: z.preprocess(emptyStringToNull, notesSchema.nullable().optional()),
} as const;

/** Validates a purchase UUID used by purchase detail and mutation routes. */
export const purchaseIdParamsSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

/** Validates Purchase list filters and pagination. */
export const listPurchasesQuerySchema = z
  .object({
    supplierId: uuidSchema.optional(),
    status: purchaseStatusSchema.optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict()
  .superRefine(validateDateRange);

/** Validates a new draft or immediately confirmed purchase request. */
export const createPurchaseSchema = z
  .object({
    ...purchaseFields,
    status: createPurchaseStatusSchema.default("DRAFT"),
    initialPayment: initialPaymentSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.status === "DRAFT" && input.initialPayment) {
      context.addIssue({
        code: "custom",
        path: ["initialPayment"],
        message: "An initial payment can only be recorded when the purchase is confirmed.",
      });
    }
  });

/** Validates the editable business fields of an unconfirmed purchase draft. */
export const updatePurchaseDraftSchema = z
  .object({
    supplierId: uuidSchema.optional(),
    purchaseDate: dateSchema.optional(),
    items: z
      .array(purchaseItemInputSchema)
      .min(1, "At least one purchase item is required.")
      .max(500, "A purchase cannot contain more than 500 items.")
      .optional(),
    invoiceDiscountAmount: moneySchema.optional(),
    extraCostAmount: moneySchema.optional(),
    notes: z.preprocess(emptyStringToNull, notesSchema.nullable().optional()),
  })
  .strict()
  .refine(hasAtLeastOneField, "At least one field must be provided.");

/** Validates the optional initial payment supplied when confirming a saved draft. */
export const confirmPurchaseSchema = z
  .object({
    initialPayment: initialPaymentSchema.optional(),
  })
  .strict();

/** Validates the optional note supplied when cancelling a purchase draft. */
export const cancelPurchaseSchema = z
  .object({
    note: z.preprocess(emptyStringToNull, notesSchema.nullable().optional()),
  })
  .strict();

export type ListPurchasesQuery = z.infer<typeof listPurchasesQuerySchema>;
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type UpdatePurchaseDraftInput = z.infer<typeof updatePurchaseDraftSchema>;
export type ConfirmPurchaseInput = z.infer<typeof confirmPurchaseSchema>;
export type CancelPurchaseInput = z.infer<typeof cancelPurchaseSchema>;
