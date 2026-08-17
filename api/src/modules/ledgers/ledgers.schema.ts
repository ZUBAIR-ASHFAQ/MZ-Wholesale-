import { z } from "zod";

const uuidSchema = z.string().uuid("ID must be a valid UUID.");
const dateSchema = z.string().date("Date must use YYYY-MM-DD format.");
const pageSchema = z.coerce.number().int().min(1).max(1_000_000).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(20);

/** Checks whether the valid date range condition is true. */
function hasValidDateRange(input: { startDate?: string; endDate?: string }): boolean {
  return !input.startDate || !input.endDate || input.startDate <= input.endDate;
}

export const customerStatementParamsSchema = z
  .object({ customerId: uuidSchema })
  .strict();

export const supplierStatementParamsSchema = z
  .object({ supplierId: uuidSchema })
  .strict();

export const ledgerStatementQuerySchema = z
  .object({
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    page: pageSchema,
    pageSize: pageSizeSchema,
  })
  .strict()
  .refine(hasValidDateRange, {
    message: "Start date must not be after end date.",
    path: ["startDate"],
  });

export const outstandingListQuerySchema = z
  .object({
    search: z.string().trim().min(1).max(200).optional(),
    page: pageSchema,
    pageSize: pageSizeSchema,
  })
  .strict();

export type LedgerStatementQuery = z.infer<typeof ledgerStatementQuerySchema>;
export type OutstandingListQuery = z.infer<typeof outstandingListQuerySchema>;
