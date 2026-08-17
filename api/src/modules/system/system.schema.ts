import { z } from "zod";

const uuidSchema = z.string().uuid("ID must be a valid UUID.");

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format.")
  .refine(isValidDate, "Date must be a valid calendar date.");

const pageSchema = z.coerce.number().int().positive().default(1);

const filterTextSchema = z
  .string()
  .trim()
  .min(1, "Filter cannot be blank.")
  .max(100, "Filter must be 100 characters or fewer.");

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(1, "Idempotency-Key is required.")
  .max(200, "Idempotency-Key must be 200 characters or fewer.");

/** Returns true when a YYYY-MM-DD string represents a real calendar date. */
function isValidDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Adds an error when an optional date range is supplied in reverse order. */
function validateOptionalDateRange(
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

/** Lists the opening/master data import types approved for Module 15. */
export const systemImportTypeSchema = z.enum([
  "products",
  "customers",
  "suppliers",
  "opening-stock",
  "opening-balances",
]);

/** Lists the persisted import-job states approved by the requirements. */
const systemImportStatusSchema = z.enum([
  "VALIDATED",
  "IMPORTED",
  "FAILED",
]);

/** Validates the import type used by template-download and upload-validation routes. */
export const systemImportTypeParamsSchema = z
  .object({
    type: systemImportTypeSchema,
  })
  .strict();

/** Validates the import job identifier used by import detail and confirmation routes. */
export const systemImportJobParamsSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

/** Validates filters for the paginated import-job history. */
export const systemImportListQuerySchema = z
  .object({
    type: systemImportTypeSchema.optional(),
    status: systemImportStatusSchema.optional(),
    page: pageSchema,
  })
  .strict();

/** Validates the Idempotency-Key header used by import POST requests. */
export const systemIdempotencyHeadersSchema = z
  .object({
    "idempotency-key": idempotencyKeySchema,
  })
  .passthrough();

/** Validates filters accepted by the read-only audit-log list route. */
export const systemAuditLogQuerySchema = z
  .object({
    action: filterTextSchema.optional(),
    entity: filterTextSchema.optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    page: pageSchema,
  })
  .strict()
  .superRefine(validateOptionalDateRange);

const systemExportTypeSchema = z.enum([
  "sales",
  "purchases",
  "inventory",
  "customer-outstanding",
  "supplier-payable",
  "cash-bank",
  "expenses",
  "profit-summary",
  "product-profit",
]);

/** Validates the approved report export type used by the System export endpoint. */
export const systemExportTypeParamsSchema = z
  .object({
    type: systemExportTypeSchema,
  })
  .strict();

/** Validates the common report-style filters accepted by System exports. */
export const systemExportQuerySchema = z
  .object({
    format: z.enum(["csv", "xlsx", "pdf"]).default("csv"),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    search: z.string().trim().min(1).max(200).optional(),
    customerId: uuidSchema.optional(),
    supplierId: uuidSchema.optional(),
    productId: uuidSchema.optional(),
    categoryId: uuidSchema.optional(),
    accountId: uuidSchema.optional(),
    lowStock: z.enum(["true", "false"]).optional(),
  })
  .strict()
  .superRefine(validateOptionalDateRange);

export type SystemImportType = z.infer<typeof systemImportTypeSchema>;
export type SystemImportStatus = z.infer<typeof systemImportStatusSchema>;
export type SystemImportTypeParams = z.infer<
  typeof systemImportTypeParamsSchema
>;
export type SystemImportListQuery = z.infer<
  typeof systemImportListQuerySchema
>;
export type SystemAuditLogQuery = z.infer<typeof systemAuditLogQuerySchema>;
export type SystemExportType = z.infer<typeof systemExportTypeSchema>;
export type SystemExportQuery = z.infer<typeof systemExportQuerySchema>;
