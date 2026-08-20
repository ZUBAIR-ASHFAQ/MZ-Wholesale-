import { z } from "zod";

import { isBusinessDateNotFuture } from "../../shared/utils/business-date.js";
import { isQuantityWithinDatabaseRange } from "../../shared/utils/decimal-validation.js";

const uuidSchema = z.string().uuid("ID must be a valid UUID.");
const refundModeSchema = z.enum(["DUE_REDUCTION", "CASH", "BANK_TRANSFER"]);
const stockConditionSchema = z.enum(["GOOD", "DAMAGED", "EXPIRED"]);

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

const mutationDateSchema = dateSchema.refine(
  isBusinessDateNotFuture,
  "Date cannot be in the future.",
);

const reasonSchema = z
  .string()
  .trim()
  .min(1, "Return reason is required.")
  .max(500, "Return reason must be 500 characters or fewer.");

/** Returns true when a YYYY-MM-DD string represents a real calendar date. */
function isValidDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Returns true when a quantity string is greater than zero. */
function isPositiveQuantity(value: string): boolean {
  return !/^0+(\.0+)?$/.test(value);
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

/** Enforces the account fields required by the selected sales-return refund mode. */
function validateSalesRefundAccount(
  input: {
    refundMode: "DUE_REDUCTION" | "CASH" | "BANK_TRANSFER";
    cashAccountId?: string;
    bankAccountId?: string;
  },
  context: z.RefinementCtx,
): void {
  if (input.refundMode === "CASH") {
    if (!input.cashAccountId || input.bankAccountId) {
      context.addIssue({
        code: "custom",
        path: ["cashAccountId"],
        message: "A CASH refund requires only a cash account.",
      });
    }
    return;
  }

  if (input.refundMode === "BANK_TRANSFER") {
    if (!input.bankAccountId || input.cashAccountId) {
      context.addIssue({
        code: "custom",
        path: ["bankAccountId"],
        message: "A BANK_TRANSFER refund requires only a bank account.",
      });
    }
    return;
  }

  if (input.cashAccountId || input.bankAccountId) {
    context.addIssue({
      code: "custom",
      path: ["refundMode"],
      message: "A DUE_REDUCTION return must not include a cash or bank account.",
    });
  }
}

/** Rejects the same original sales item appearing twice in one Sales Return. */
function validateUniqueSalesReturnItems(
  items: ReadonlyArray<{ originalSaleItemId: string }>,
  context: z.RefinementCtx,
): void {
  const seenItemIds = new Set<string>();

  items.forEach((item, index) => {
    if (seenItemIds.has(item.originalSaleItemId)) {
      context.addIssue({
        code: "custom",
        path: ["items", index, "originalSaleItemId"],
        message: "The same original sales item can be returned only once in one request.",
      });
      return;
    }

    seenItemIds.add(item.originalSaleItemId);
  });
}

/** Rejects the same original purchase item appearing twice in one Purchase Return. */
function validateUniquePurchaseReturnItems(
  items: ReadonlyArray<{ originalPurchaseItemId: string }>,
  context: z.RefinementCtx,
): void {
  const seenItemIds = new Set<string>();

  items.forEach((item, index) => {
    if (seenItemIds.has(item.originalPurchaseItemId)) {
      context.addIssue({
        code: "custom",
        path: ["items", index, "originalPurchaseItemId"],
        message: "The same original purchase item can be returned only once in one request.",
      });
      return;
    }

    seenItemIds.add(item.originalPurchaseItemId);
  });
}

const salesReturnItemSchema = z
  .object({
    originalSaleItemId: uuidSchema,
    quantity: positiveQuantitySchema,
    stockCondition: stockConditionSchema,
  })
  .strict();

const purchaseReturnItemSchema = z
  .object({
    originalPurchaseItemId: uuidSchema,
    quantity: positiveQuantitySchema,
  })
  .strict();

/** Validates filters and pagination for the Sales Return list. */
export const listSalesReturnsQuerySchema = z
  .object({
    customerId: uuidSchema.optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict()
  .superRefine(validateDateRange);

/** Validates the body used to create one confirmed Sales Return. */
export const createSalesReturnSchema = z
  .object({
    originalSaleId: uuidSchema,
    returnDate: mutationDateSchema,
    reason: reasonSchema,
    refundMode: refundModeSchema,
    cashAccountId: uuidSchema.optional(),
    bankAccountId: uuidSchema.optional(),
    items: z
      .array(salesReturnItemSchema)
      .min(1, "At least one sales return item is required.")
      .max(500, "A sales return cannot contain more than 500 items."),
  })
  .strict()
  .superRefine((input, context) => {
    validateSalesRefundAccount(input, context);
    validateUniqueSalesReturnItems(input.items, context);
  });

/** Validates the Sales Return UUID used by the detail route. */
export const salesReturnIdParamsSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

/** Validates filters and pagination for the Purchase Return list. */
export const listPurchaseReturnsQuerySchema = z
  .object({
    supplierId: uuidSchema.optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict()
  .superRefine(validateDateRange);

/** Validates the body used to create one confirmed Purchase Return. */
export const createPurchaseReturnSchema = z
  .object({
    originalPurchaseId: uuidSchema,
    returnDate: mutationDateSchema,
    reason: reasonSchema,
    items: z
      .array(purchaseReturnItemSchema)
      .min(1, "At least one purchase return item is required.")
      .max(500, "A purchase return cannot contain more than 500 items."),
  })
  .strict()
  .superRefine((input, context) => {
    validateUniquePurchaseReturnItems(input.items, context);
  });

/** Validates the Purchase Return UUID used by the detail route. */
export const purchaseReturnIdParamsSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

export type ListSalesReturnsQuery = z.infer<typeof listSalesReturnsQuerySchema>;
export type CreateSalesReturnInput = z.infer<typeof createSalesReturnSchema>;
export type ListPurchaseReturnsQuery = z.infer<typeof listPurchaseReturnsQuerySchema>;
export type CreatePurchaseReturnInput = z.infer<typeof createPurchaseReturnSchema>;
