import { z } from "zod";

const uuidSchema = z.string().uuid("ID must be a valid UUID.");

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format.")
  .refine(isValidDate, "Date must be a valid calendar date.");

const searchSchema = z
  .string()
  .trim()
  .min(1, "Search cannot be blank.")
  .max(200, "Search must be 200 characters or fewer.");

const pageSchema = z.coerce.number().int().positive().default(1);
const pageSizeSchema = z.coerce.number().int().positive().max(100).default(20);

/** Returns true when a YYYY-MM-DD string represents a real calendar date. */
function isValidDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Converts the low-stock query-string value into a boolean. */
function parseBooleanQueryValue(value: "true" | "false"): boolean {
  return value === "true";
}

/** Adds a validation issue when the report date range is reversed. */
function validateDateRange(
  input: { startDate: string; endDate: string },
  context: z.RefinementCtx,
): void {
  if (input.startDate > input.endDate) {
    context.addIssue({
      code: "custom",
      path: ["endDate"],
      message: "End date must be on or after start date.",
    });
  }
}

/** Validates filters accepted by the Sales Report route. */
export const salesReportQuerySchema = z
  .object({
    startDate: dateSchema,
    endDate: dateSchema,
    customerId: uuidSchema.optional(),
    productId: uuidSchema.optional(),
  })
  .strict()
  .superRefine(validateDateRange);

/** Validates filters accepted by the Purchase Report route. */
export const purchasesReportQuerySchema = z
  .object({
    startDate: dateSchema,
    endDate: dateSchema,
    supplierId: uuidSchema.optional(),
    productId: uuidSchema.optional(),
  })
  .strict()
  .superRefine(validateDateRange);

/** Validates filters accepted by the Inventory Report route. */
export const inventoryReportQuerySchema = z
  .object({
    startDate: dateSchema,
    endDate: dateSchema,
    productId: uuidSchema.optional(),
    lowStock: z
      .enum(["true", "false"])
      .transform(parseBooleanQueryValue)
      .optional(),
  })
  .strict()
  .superRefine(validateDateRange);


/** Validates filters and pagination for the Inventory Valuation Report. */
export const inventoryValuationReportQuerySchema = z
  .object({
    search: searchSchema.optional(),
    categoryId: uuidSchema.optional(),
    active: z
      .enum(["true", "false"])
      .transform(parseBooleanQueryValue)
      .optional(),
    page: pageSchema,
    pageSize: pageSizeSchema,
  })
  .strict();

/** Validates the as-of date, search, and pagination for the Customer Aging Report. */
export const customerAgingReportQuerySchema = z
  .object({
    asOfDate: dateSchema,
    search: searchSchema.optional(),
    page: pageSchema,
    pageSize: pageSizeSchema,
  })
  .strict();

/** Validates the as-of date, search, and pagination for the Supplier Aging Report. */
export const supplierAgingReportQuerySchema = z
  .object({
    asOfDate: dateSchema,
    search: searchSchema.optional(),
    page: pageSchema,
    pageSize: pageSizeSchema,
  })
  .strict();

/** Validates search and pagination for the Customer Outstanding Report. */
export const customerOutstandingReportQuerySchema = z
  .object({
    search: searchSchema.optional(),
    page: pageSchema,
    pageSize: pageSizeSchema,
  })
  .strict();

/** Validates search and pagination for the Supplier Payable Report. */
export const supplierPayableReportQuerySchema = z
  .object({
    search: searchSchema.optional(),
    page: pageSchema,
    pageSize: pageSizeSchema,
  })
  .strict();

/** Validates account and date filters for the Cash/Bank Report. */
export const cashBankReportQuerySchema = z
  .object({
    startDate: dateSchema,
    endDate: dateSchema,
    accountId: uuidSchema.optional(),
  })
  .strict()
  .superRefine(validateDateRange);

/** Validates category and date filters for the Expense Report. */
export const expenseReportQuerySchema = z
  .object({
    startDate: dateSchema,
    endDate: dateSchema,
    categoryId: uuidSchema.optional(),
  })
  .strict()
  .superRefine(validateDateRange);

/** Validates the date range used by the estimated Profit Summary Report. */
export const profitSummaryReportQuerySchema = z
  .object({
    startDate: dateSchema,
    endDate: dateSchema,
  })
  .strict()
  .superRefine(validateDateRange);

/** Validates filters and pagination for the Product Profit Report. */
export const productProfitReportQuerySchema = z
  .object({
    startDate: dateSchema,
    endDate: dateSchema,
    productId: uuidSchema.optional(),
    page: pageSchema,
    pageSize: pageSizeSchema,
  })
  .strict()
  .superRefine(validateDateRange);


/** Validates search and pagination for the Employee Register. */
export const employeeRegisterReportQuerySchema = z
  .object({
    search: searchSchema.optional(),
    page: pageSchema,
    pageSize: pageSizeSchema,
  })
  .strict();

/** Validates the date range used by the Attendance Summary. */
export const attendanceSummaryReportQuerySchema = z
  .object({
    startDate: dateSchema,
    endDate: dateSchema,
  })
  .strict()
  .superRefine(validateDateRange);

/** Validates the date range used by the confirmed Payroll Register. */
export const payrollRegisterReportQuerySchema = z
  .object({
    startDate: dateSchema,
    endDate: dateSchema,
  })
  .strict()
  .superRefine(validateDateRange);

/** Validates search and pagination for current Salary Payable. */
export const salaryPayableReportQuerySchema = z
  .object({
    search: searchSchema.optional(),
    page: pageSchema,
    pageSize: pageSizeSchema,
  })
  .strict();

/** Validates search and pagination for Employee Advance Outstanding. */
export const employeeAdvanceOutstandingReportQuerySchema = z
  .object({
    search: searchSchema.optional(),
    page: pageSchema,
    pageSize: pageSizeSchema,
  })
  .strict();

/** Validates the date range used by the Labor Cost Summary. */
export const laborCostSummaryReportQuerySchema = z
  .object({
    startDate: dateSchema,
    endDate: dateSchema,
  })
  .strict()
  .superRefine(validateDateRange);

export type SalesReportQuery = z.infer<typeof salesReportQuerySchema>;
export type PurchasesReportQuery = z.infer<typeof purchasesReportQuerySchema>;
export type InventoryReportQuery = z.infer<typeof inventoryReportQuerySchema>;
export type InventoryValuationReportQuery = z.infer<
  typeof inventoryValuationReportQuerySchema
>;
export type CustomerAgingReportQuery = z.infer<
  typeof customerAgingReportQuerySchema
>;
export type SupplierAgingReportQuery = z.infer<
  typeof supplierAgingReportQuerySchema
>;
export type CustomerOutstandingReportQuery = z.infer<
  typeof customerOutstandingReportQuerySchema
>;
export type SupplierPayableReportQuery = z.infer<
  typeof supplierPayableReportQuerySchema
>;
export type CashBankReportQuery = z.infer<typeof cashBankReportQuerySchema>;
export type ExpenseReportQuery = z.infer<typeof expenseReportQuerySchema>;
export type ProfitSummaryReportQuery = z.infer<
  typeof profitSummaryReportQuerySchema
>;
export type ProductProfitReportQuery = z.infer<
  typeof productProfitReportQuerySchema
>;
export type EmployeeRegisterReportQuery = z.infer<
  typeof employeeRegisterReportQuerySchema
>;
export type AttendanceSummaryReportQuery = z.infer<
  typeof attendanceSummaryReportQuerySchema
>;
export type PayrollRegisterReportQuery = z.infer<
  typeof payrollRegisterReportQuerySchema
>;
export type SalaryPayableReportQuery = z.infer<
  typeof salaryPayableReportQuerySchema
>;
export type EmployeeAdvanceOutstandingReportQuery = z.infer<
  typeof employeeAdvanceOutstandingReportQuerySchema
>;
export type LaborCostSummaryReportQuery = z.infer<
  typeof laborCostSummaryReportQuerySchema
>;
