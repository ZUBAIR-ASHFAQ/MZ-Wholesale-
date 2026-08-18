import { z } from "zod";

import { isMoneyWithinDatabaseRange } from "../../shared/utils/decimal-validation.js";

const uuidSchema = z.string().uuid("ID must be a valid UUID.");

const supplierNameSchema = z
  .string()
  .trim()
  .min(1, "Supplier name is required.")
  .max(160, "Supplier name must be 160 characters or fewer.");

const phoneSchema = z
  .string()
  .trim()
  .min(7, "Phone number must contain at least 7 characters.")
  .max(32, "Phone number must be 32 characters or fewer.")
  .regex(
    /^\+?[0-9][0-9 ()-]*[0-9]$/,
    "Phone number contains invalid characters.",
  );

const emailSchema = z
  .string()
  .trim()
  .email("Email address is invalid.")
  .max(254, "Email must be 254 characters or fewer.");

const addressSchema = z
  .string()
  .trim()
  .min(1, "Address cannot be blank.")
  .max(500, "Address must be 500 characters or fewer.");

const moneySchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Opening balance must be a non-negative money amount with up to two decimal places.")
  .refine(isMoneyWithinDatabaseRange, "Opening balance is too large for the database money field.");

/** Converts the active query-string value into a boolean. */
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

/** Validates supplier-list filters received from query parameters. */
export const listSuppliersQuerySchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    active: z
      .enum(["true", "false"])
      .transform(parseBooleanQueryValue)
      .optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

/** Validates a supplier UUID from the supplier-detail route. */
export const supplierIdParamsSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

/** Validates a supplier UUID from the open-purchases route. */
export const supplierOpenPurchasesParamsSchema = z
  .object({
    supplierId: uuidSchema,
  })
  .strict();

/** Validates open-purchase pagination query parameters. */
export const supplierOpenPurchasesQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

/** Validates all fields accepted when creating a supplier. */
export const createSupplierSchema = z
  .object({
    name: supplierNameSchema,
    phone: z.preprocess(
      emptyStringToNull,
      phoneSchema.nullable().optional(),
    ),
    email: z.preprocess(
      emptyStringToNull,
      emailSchema.nullable().optional(),
    ),
    address: z.preprocess(
      emptyStringToNull,
      addressSchema.nullable().optional(),
    ),
    openingBalance: moneySchema.default("0.00"),
  })
  .strict();

/** Validates fields accepted when updating an existing supplier. */
export const updateSupplierSchema = z
  .object({
    name: supplierNameSchema.optional(),
    phone: z.preprocess(
      emptyStringToNull,
      phoneSchema.nullable().optional(),
    ),
    email: z.preprocess(
      emptyStringToNull,
      emailSchema.nullable().optional(),
    ),
    address: z.preprocess(
      emptyStringToNull,
      addressSchema.nullable().optional(),
    ),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(hasAtLeastOneField, {
    message: "At least one field must be provided.",
  });

export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
export type SupplierOpenPurchasesQuery = z.infer<
  typeof supplierOpenPurchasesQuerySchema
>;
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
