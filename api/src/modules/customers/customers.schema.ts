import { z } from "zod";

import { isMoneyWithinDatabaseRange } from "../../shared/utils/decimal-validation.js";

const uuidSchema = z.string().uuid("ID must be a valid UUID.");

const customerNameSchema = z
  .string()
  .trim()
  .min(1, "Customer name is required.")
  .max(160, "Customer name must be 160 characters or fewer.");

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
  .regex(/^\d+(\.\d{1,2})?$/, "Amount must be a non-negative money value with up to two decimal places.")
  .refine(isMoneyWithinDatabaseRange, "Amount is too large for the database money field.");

const creditLimitSchema = z
  .string()
  .trim()
  .regex(
    /^\d+(\.\d{1,2})?$/,
    "Credit limit must be a non-negative money amount with up to two decimal places.",
  )
  .refine(isMoneyWithinDatabaseRange, "Credit limit is too large for the database money field.");

/** Converts a valid non-negative money string into integer cents for exact comparisons. */
function moneyToCents(value: string): bigint | null {
  const match = value.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);

  if (!match) {
    return null;
  }

  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

/** Ensures a new customer's existing due does not exceed the approved credit limit. */
function validateOpeningBalanceWithinCreditLimit(
  input: { openingBalance: string; creditLimit: string },
  context: z.RefinementCtx,
): void {
  const openingBalance = moneyToCents(input.openingBalance);
  const creditLimit = moneyToCents(input.creditLimit);

  if (openingBalance !== null && creditLimit !== null && openingBalance > creditLimit) {
    context.addIssue({
      code: "custom",
      path: ["openingBalance"],
      message: "Opening balance cannot exceed the credit limit.",
    });
  }
}

/** Converts the active query-string value into a boolean. */
function parseBooleanQueryValue(value: "true" | "false"): boolean {
  return value === "true";
}

/** Returns true when an update request contains at least one field. */
function hasAtLeastOneField(input: Record<string, unknown>): boolean {
  return Object.keys(input).length > 0;
}

/** Validates customer-list filters received from query parameters. */
export const listCustomersQuerySchema = z
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

/** Validates a customer UUID from the customer-detail route. */
export const customerIdParamsSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

/** Validates a customer UUID from the open-invoices route. */
export const customerOpenInvoicesParamsSchema = z
  .object({
    customerId: uuidSchema,
  })
  .strict();

/** Validates open-invoice pagination query parameters. */
export const customerOpenInvoicesQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

/** Validates all fields accepted when creating a regular customer. */
export const createCustomerSchema = z
  .object({
    name: customerNameSchema,
    phone: phoneSchema.nullable().optional(),
    email: emailSchema.nullable().optional(),
    address: addressSchema.nullable().optional(),
    creditLimit: creditLimitSchema.default("0.00"),
    openingBalance: moneySchema.default("0.00"),
  })
  .strict()
  .superRefine(validateOpeningBalanceWithinCreditLimit);

/** Validates fields accepted when updating an existing customer. */
export const updateCustomerSchema = z
  .object({
    name: customerNameSchema.optional(),
    phone: phoneSchema.nullable().optional(),
    email: emailSchema.nullable().optional(),
    address: addressSchema.nullable().optional(),
    creditLimit: creditLimitSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(hasAtLeastOneField, {
    message: "At least one field must be provided.",
  });

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type CustomerOpenInvoicesQuery = z.infer<
  typeof customerOpenInvoicesQuerySchema
>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
