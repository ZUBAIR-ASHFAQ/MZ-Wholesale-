import { z } from "zod";

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format.")
  .refine(isValidDate, "Date must be a valid calendar date.");

const pageSchema = z.coerce.number().int().positive().default(1);

/** Returns true when a YYYY-MM-DD string represents a real calendar date. */
function isValidDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Validates the optional business date accepted by the Dashboard overview route. */
export const dashboardOverviewQuerySchema = z
  .object({
    date: dateSchema.optional(),
  })
  .strict();

/** Validates pagination accepted by the Dashboard low-stock route. */
export const dashboardLowStockQuerySchema = z
  .object({
    page: pageSchema,
  })
  .strict();

export type DashboardOverviewQuery = z.infer<
  typeof dashboardOverviewQuerySchema
>;
export type DashboardLowStockQuery = z.infer<
  typeof dashboardLowStockQuerySchema
>;
