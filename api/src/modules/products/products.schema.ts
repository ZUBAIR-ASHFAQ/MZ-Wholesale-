import { z } from "zod";

import {
  isDecimalGreaterThanZero,
  isMoneyWithinDatabaseRange,
  isQuantityWithinDatabaseRange,
} from "../../shared/utils/decimal-validation.js";

const uuidSchema = z.string().uuid("ID must be a valid UUID.");

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required.")
  .max(120, "Name must be 120 characters or fewer.");

const productNameSchema = z
  .string()
  .trim()
  .min(1, "Product name is required.")
  .max(200, "Product name must be 200 characters or fewer.");

const skuSchema = z
  .string()
  .trim()
  .min(1, "SKU is required.")
  .max(64, "SKU must be 64 characters or fewer.");

const barcodeSchema = z
  .string()
  .trim()
  .min(1, "Barcode cannot be blank.")
  .max(128, "Barcode must be 128 characters or fewer.");

const unitNameSchema = z
  .string()
  .trim()
  .min(1, "Unit name is required.")
  .max(80, "Unit name must be 80 characters or fewer.");

/** Accepts an unsigned decimal with no more than three decimal places. */
const quantityDecimalSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/, "Value must be a valid quantity.")
  .refine(isQuantityWithinDatabaseRange, "Value is too large for the database quantity field.");

/** Accepts a positive decimal with no more than three decimal places. */
const positiveConversionSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/, "Conversion must be a valid quantity.")
  .refine(isQuantityWithinDatabaseRange, "Conversion is too large for the database quantity field.")
  .refine(
    isDecimalGreaterThanZero,
    "Conversion to base must be greater than zero.",
  );

/** Accepts a non-negative money value with no more than two decimal places. */
const moneyDecimalSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Price must be a valid money amount.")
  .refine(isMoneyWithinDatabaseRange, "Price is too large for the database money field.");

/** Validates product-list filters received from query parameters. */
export const listProductsQuerySchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    barcode: barcodeSchema.optional(),
    categoryId: uuidSchema.optional(),
    active: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

/** Validates a product UUID from a route parameter. */
export const productIdParamsSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

/** Validates a category UUID from a route parameter. */
export const categoryIdParamsSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

/** Validates a brand UUID from a route parameter. */
export const brandIdParamsSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

/** Validates one additional product unit. The base unit is created separately. */
const productUnitInputSchema = z
  .object({
    id: uuidSchema.optional(),
    unitName: unitNameSchema,
    conversionToBase: positiveConversionSchema,
    isActive: z.boolean().default(true),
  })
  .strict();

type ProductUnitInput = z.infer<typeof productUnitInputSchema>;

/** Rejects repeated unit names, including a unit that repeats the base unit. */
function validateUniqueUnitNames(
  baseUnitName: string | undefined,
  units: ProductUnitInput[] | undefined,
  context: z.RefinementCtx,
): void {
  if (!units) {
    return;
  }

  const usedNames = new Set<string>();

  if (baseUnitName) {
    usedNames.add(baseUnitName.trim().toLowerCase());
  }

  for (let index = 0; index < units.length; index += 1) {
    const normalizedName = units[index].unitName.trim().toLowerCase();

    if (usedNames.has(normalizedName)) {
      context.addIssue({
        code: "custom",
        path: ["units", index, "unitName"],
        message: "Unit name appears more than once.",
      });
    }

    usedNames.add(normalizedName);
  }
}

/** Rejects repeated saved-unit IDs in one update request. */
function validateUniqueUnitIds(
  units: ProductUnitInput[] | undefined,
  context: z.RefinementCtx,
): void {
  if (!units) {
    return;
  }

  const usedIds = new Set<string>();

  for (let index = 0; index < units.length; index += 1) {
    const unitId = units[index].id;

    if (!unitId) {
      continue;
    }

    if (usedIds.has(unitId)) {
      context.addIssue({
        code: "custom",
        path: ["units", index, "id"],
        message: "Product unit appears more than once.",
      });
    }

    usedIds.add(unitId);
  }
}

/** Validates all fields accepted when creating a product. */
export const createProductSchema = z
  .object({
    sku: skuSchema,
    barcode: barcodeSchema.nullable().optional(),
    name: productNameSchema,
    categoryId: uuidSchema,
    brandId: uuidSchema.nullable().optional(),
    baseUnitName: unitNameSchema,
    reorderLevel: quantityDecimalSchema.default("0.000"),
    referencePurchasePrice: moneyDecimalSchema.nullable().optional(),
    referenceSalePrice: moneyDecimalSchema.nullable().optional(),
    units: z.array(productUnitInputSchema).max(50).default([]),
  })
  .strict()
  .superRefine((input, context) => {
    validateUniqueUnitNames(input.baseUnitName, input.units, context);
    validateUniqueUnitIds(input.units, context);
  });

/** Validates fields accepted when updating an existing product. */
export const updateProductSchema = z
  .object({
    sku: skuSchema.optional(),
    barcode: barcodeSchema.nullable().optional(),
    name: productNameSchema.optional(),
    categoryId: uuidSchema.optional(),
    brandId: uuidSchema.nullable().optional(),
    baseUnitName: unitNameSchema.optional(),
    reorderLevel: quantityDecimalSchema.optional(),
    referencePurchasePrice: moneyDecimalSchema.nullable().optional(),
    referenceSalePrice: moneyDecimalSchema.nullable().optional(),
    isActive: z.boolean().optional(),
    units: z.array(productUnitInputSchema).max(50).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (Object.keys(input).length === 0) {
      context.addIssue({
        code: "custom",
        message: "At least one field must be provided.",
      });
    }

    validateUniqueUnitNames(input.baseUnitName, input.units, context);
    validateUniqueUnitIds(input.units, context);
  });

/** Validates a category creation request. */
export const createCategorySchema = z
  .object({
    name: nameSchema,
  })
  .strict();

/** Validates a category rename or active-status change. */
export const updateCategorySchema = z
  .object({
    name: nameSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field must be provided.",
  });

/** Validates a brand creation request. */
export const createBrandSchema = z
  .object({
    name: nameSchema,
  })
  .strict();

/** Validates a brand rename or active-status change. */
export const updateBrandSchema = z
  .object({
    name: nameSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field must be provided.",
  });

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;
