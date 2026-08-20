import { z } from "zod";

import { isBusinessDateNotFuture } from "../../shared/utils/business-date.js";
import {
  isDecimalGreaterThanZero,
  isMoneyWithinDatabaseRange,
  isQuantityWithinDatabaseRange,
} from "../../shared/utils/decimal-validation.js";

const uuidSchema = z.string().uuid("ID must be a valid UUID.");

const stockConditionSchema = z.enum(["SELLABLE", "DAMAGED", "EXPIRED"]);
const stockDirectionSchema = z.enum(["IN", "OUT"]);
const stockCountStatusSchema = z.enum(["DRAFT", "CONFIRMED"]);

const quantitySchema = z
  .string()
  .trim()
  .regex(
    /^\d+(\.\d{1,3})?$/,
    "Quantity must be a non-negative number with up to three decimal places.",
  )
  .refine(isQuantityWithinDatabaseRange, "Quantity is too large for the database quantity field.");

const positiveQuantitySchema = quantitySchema.refine(
  isDecimalGreaterThanZero,
  "Quantity must be greater than zero.",
);

const nonNegativeCostSchema = z
  .string()
  .trim()
  .regex(
    /^\d+(\.\d{1,2})?$/,
    "Unit cost must be a non-negative amount with up to two decimal places.",
  )
  .refine(isMoneyWithinDatabaseRange, "Unit cost is too large for the database money field.");

const positiveCostSchema = nonNegativeCostSchema.refine(
  isDecimalGreaterThanZero,
  "Unit cost must be greater than zero.",
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

const notesSchema = z
  .string()
  .trim()
  .min(1, "Notes cannot be blank.")
  .max(1000, "Notes must be 1000 characters or fewer.");

const inventoryAdjustmentReasonSchema = z.enum([
  "FOUND_STOCK",
  "MISSING_STOCK",
  "DAMAGED",
  "EXPIRED",
  "DISPOSAL",
  "DATA_CORRECTION",
  "OTHER",
]);

/** Returns true when a YYYY-MM-DD string represents a real calendar date. */
function isValidDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Converts the low-stock query-string value into a boolean. */
function parseBooleanQueryValue(value: "true" | "false"): boolean {
  return value === "true";
}

/** Converts an empty optional text field into null. */
function emptyStringToNull(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

/** Returns true when an update request contains at least one field. */
function hasAtLeastOneField(input: Record<string, unknown>): boolean {
  return Object.keys(input).length > 0;
}

/** Builds a stable key for detecting duplicate product-condition lines. */
function buildProductConditionKey(input: {
  productId: string;
  stockCondition: string;
}): string {
  return `${input.productId}:${input.stockCondition}`;
}

/** Adds a validation error when an item list repeats a product and condition. */
function validateUniqueProductConditions(
  items: ReadonlyArray<{ productId: string; stockCondition: string }>,
  context: z.RefinementCtx,
): void {
  const seenKeys = new Set<string>();

  items.forEach((item, index) => {
    const key = buildProductConditionKey(item);

    if (seenKeys.has(key)) {
      context.addIssue({
        code: "custom",
        path: [index, "productId"],
        message: "A product and stock condition can appear only once.",
      });
      return;
    }

    seenKeys.add(key);
  });
}

/** Enforces the unit-cost rules for manual inventory adjustments. */
function validateAdjustmentCost(
  input: { direction: "IN" | "OUT"; unitCost?: string },
  context: z.RefinementCtx,
): void {
  if (input.direction === "IN" && input.unitCost === undefined) {
    context.addIssue({
      code: "custom",
      path: ["unitCost"],
      message: "Unit cost is required for an IN adjustment.",
    });
  }

  if (input.direction === "OUT" && input.unitCost !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["unitCost"],
      message: "Unit cost must not be provided for an OUT adjustment.",
    });
  }
}

const openingStockItemSchema = z
  .object({
    productId: uuidSchema,
    stockCondition: stockConditionSchema,
    quantity: positiveQuantitySchema,
    unitCost: positiveCostSchema,
  })
  .strict();

const stockCountItemInputSchema = z
  .object({
    productId: uuidSchema,
    stockCondition: stockConditionSchema,
    countedQuantity: quantitySchema,
  })
  .strict();

/** Validates inventory-stock list filters received from query parameters. */
export const listInventoryQuerySchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    lowStock: z
      .enum(["true", "false"])
      .transform(parseBooleanQueryValue)
      .optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

/** Validates a product UUID from the stock-movement route. */
export const productMovementsParamsSchema = z
  .object({
    productId: uuidSchema,
  })
  .strict();

/** Validates stock-movement date filters and pagination. */
export const listProductMovementsQuerySchema = z
  .object({
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict()
  .refine(
    (input) => !input.startDate || !input.endDate || input.startDate <= input.endDate,
    {
      path: ["endDate"],
      message: "End date must be on or after start date.",
    },
  );

/** Validates the opening-stock items entered during setup or migration. */
export const createOpeningStockSchema = z
  .object({
    items: z
      .array(openingStockItemSchema)
      .min(1, "At least one opening-stock item is required.")
      .max(500, "Opening stock cannot contain more than 500 items."),
    notes: z.preprocess(emptyStringToNull, notesSchema.nullable().optional()),
  })
  .strict()
  .superRefine((input, context) => {
    validateUniqueProductConditions(input.items, context);
  });

/** Validates one manual stock adjustment. */
export const createAdjustmentSchema = z
  .object({
    productId: uuidSchema,
    stockCondition: stockConditionSchema,
    direction: stockDirectionSchema,
    quantity: positiveQuantitySchema,
    reason: inventoryAdjustmentReasonSchema,
    unitCost: positiveCostSchema.optional(),
    notes: z.preprocess(emptyStringToNull, notesSchema.nullable().optional()),
  })
  .strict()
  .superRefine((input, context) => {
    validateAdjustmentCost(input, context);

    if (input.reason === "OTHER" && !input.notes) {
      context.addIssue({
        code: "custom",
        path: ["notes"],
        message: "Notes are required when the adjustment reason is OTHER.",
      });
    }
  });

/** Validates stock-count list filters received from query parameters. */
export const listStockCountsQuerySchema = z
  .object({
    status: stockCountStatusSchema.optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict()
  .refine(
    (input) => !input.startDate || !input.endDate || input.startDate <= input.endDate,
    {
      path: ["endDate"],
      message: "End date must be on or after start date.",
    },
  );

/** Validates all fields accepted when creating a draft stock count. */
export const createStockCountSchema = z
  .object({
    countDate: mutationDateSchema,
    notes: z.preprocess(emptyStringToNull, notesSchema.nullable().optional()),
    items: z
      .array(stockCountItemInputSchema)
      .min(1, "At least one stock-count item is required.")
      .max(1000, "A stock count cannot contain more than 1000 items."),
  })
  .strict()
  .superRefine((input, context) => {
    validateUniqueProductConditions(input.items, context);
  });

/** Validates a stock-count UUID from detail and confirmation routes. */
export const stockCountIdParamsSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

/** Validates editable fields for a draft stock count. */
export const updateStockCountSchema = z
  .object({
    notes: z.preprocess(emptyStringToNull, notesSchema.nullable().optional()),
    items: z
      .array(stockCountItemInputSchema)
      .min(1, "At least one stock-count item is required.")
      .max(1000, "A stock count cannot contain more than 1000 items.")
      .optional(),
  })
  .strict()
  .refine(hasAtLeastOneField, {
    message: "At least one field must be provided.",
  })
  .superRefine((input, context) => {
    if (input.items) {
      validateUniqueProductConditions(input.items, context);
    }
  });

export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;
export type ListProductMovementsQuery = z.infer<
  typeof listProductMovementsQuerySchema
>;
export type CreateOpeningStockInput = z.infer<
  typeof createOpeningStockSchema
>;
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;
export type ListStockCountsQuery = z.infer<typeof listStockCountsQuerySchema>;
export type CreateStockCountInput = z.infer<typeof createStockCountSchema>;
export type UpdateStockCountInput = z.infer<typeof updateStockCountSchema>;

