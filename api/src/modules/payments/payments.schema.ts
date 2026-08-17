import { z } from "zod";

import { isMoneyWithinDatabaseRange } from "../../shared/utils/decimal-validation.js";

const uuidSchema = z.string().uuid("ID must be a valid UUID.");

const paymentMethodSchema = z.enum(["CASH", "BANK_TRANSFER"]);
const accountTypeSchema = z.enum(["CASH", "BANK"]);
const reconciliationStatusSchema = z.enum(["DRAFT", "CONFIRMED"]);

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

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format.")
  .refine(isValidDate, "Date must be a valid calendar date.");

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required.")
  .max(120, "Name must be 120 characters or fewer.");

const accountNumberSchema = z
  .string()
  .trim()
  .min(1, "Account number is required.")
  .max(80, "Account number must be 80 characters or fewer.");

const notesSchema = z
  .string()
  .trim()
  .min(1, "Notes cannot be blank.")
  .max(500, "Notes must be 500 characters or fewer.");

const reasonSchema = z
  .string()
  .trim()
  .min(1, "Reason is required.")
  .max(500, "Reason must be 500 characters or fewer.");

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

/** Converts an empty optional text field into null. */
function emptyStringToNull(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

/** Returns true when an update request contains at least one field. */
function hasAtLeastOneField(input: Record<string, unknown>): boolean {
  return Object.keys(input).length > 0;
}

/** Adds a validation issue when a date range is reversed. */
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

/** Enforces the account field required by a payment split method. */
function validateSplitAccount(
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

/** Rejects repeated account splits in one payment request. */
function validateUniqueSplits(
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

/** Rejects repeated document allocations in one payment request. */
function validateUniqueAllocations(
  allocations: ReadonlyArray<{ documentId: string }>,
  context: z.RefinementCtx,
): void {
  const seenDocumentIds = new Set<string>();

  allocations.forEach((allocation, index) => {
    if (seenDocumentIds.has(allocation.documentId)) {
      context.addIssue({
        code: "custom",
        path: ["allocations", index, "documentId"],
        message: "The same document can be allocated only once.",
      });
      return;
    }

    seenDocumentIds.add(allocation.documentId);
  });
}

/** Requires split totals and allocation totals to be exactly equal. */
function validatePaymentTotals(
  input: {
    splits: ReadonlyArray<{ amount: string }>;
    allocations: ReadonlyArray<{ amount: string }>;
  },
  context: z.RefinementCtx,
): void {
  const splitTotal = input.splits.reduce(
    (total, split) => total + moneyToCents(split.amount),
    0n,
  );
  const allocationTotal = input.allocations.reduce(
    (total, allocation) => total + moneyToCents(allocation.amount),
    0n,
  );

  if (splitTotal !== allocationTotal) {
    context.addIssue({
      code: "custom",
      path: ["allocations"],
      message: "Payment split total must equal allocation total.",
    });
  }
}

const paymentSplitSchema = z
  .object({
    method: paymentMethodSchema,
    amount: positiveMoneySchema,
    cashAccountId: uuidSchema.optional(),
    bankAccountId: uuidSchema.optional(),
  })
  .strict()
  .superRefine(validateSplitAccount);

const paymentAllocationSchema = z
  .object({
    documentId: uuidSchema,
    amount: positiveMoneySchema,
  })
  .strict();

const paymentRequestFields = {
  paymentDate: dateSchema,
  splits: z
    .array(paymentSplitSchema)
    .min(1, "At least one payment split is required.")
    .max(20, "A payment cannot contain more than 20 splits."),
  allocations: z
    .array(paymentAllocationSchema)
    .min(1, "At least one allocation is required.")
    .max(200, "A payment cannot contain more than 200 allocations."),
  notes: z.preprocess(emptyStringToNull, notesSchema.nullable().optional()),
} as const;

/** Validates a UUID used by payment account, record, transfer, and reconciliation routes. */
export const paymentIdParamsSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

/** Validates all fields accepted when creating a cash account. */
export const createCashAccountSchema = z
  .object({
    name: nameSchema,
    openingBalance: moneySchema.default("0.00"),
  })
  .strict();

/** Validates fields accepted when updating a cash account. */
export const updateCashAccountSchema = z
  .object({
    name: nameSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(hasAtLeastOneField, "At least one field must be provided.");

/** Validates all fields accepted when creating a bank account. */
export const createBankAccountSchema = z
  .object({
    bankName: nameSchema,
    accountName: nameSchema,
    accountNumber: accountNumberSchema,
    openingBalance: moneySchema.default("0.00"),
  })
  .strict();

/** Validates fields accepted when updating a bank account. */
export const updateBankAccountSchema = z
  .object({
    bankName: nameSchema.optional(),
    accountName: nameSchema.optional(),
    accountNumber: accountNumberSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(hasAtLeastOneField, "At least one field must be provided.");

/** Validates customer receipt list filters and pagination. */
export const customerReceiptListQuerySchema = z
  .object({
    customerId: uuidSchema.optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict()
  .superRefine(validateDateRange);

/** Validates supplier payment list filters and pagination. */
export const supplierPaymentListQuerySchema = z
  .object({
    supplierId: uuidSchema.optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict()
  .superRefine(validateDateRange);

/** Validates one customer receipt with exact splits and invoice allocations. */
export const createCustomerReceiptSchema = z
  .object({
    customerId: uuidSchema,
    ...paymentRequestFields,
  })
  .strict()
  .superRefine((input, context) => {
    validateUniqueSplits(input.splits, context);
    validateUniqueAllocations(input.allocations, context);
    validatePaymentTotals(input, context);
  });

/** Validates one supplier payment with exact splits and purchase allocations. */
export const createSupplierPaymentSchema = z
  .object({
    supplierId: uuidSchema,
    ...paymentRequestFields,
  })
  .strict()
  .superRefine((input, context) => {
    validateUniqueSplits(input.splits, context);
    validateUniqueAllocations(input.allocations, context);
    validatePaymentTotals(input, context);
  });

/** Validates the required reason for a payment reversal. */
export const reversePaymentSchema = z
  .object({
    reason: reasonSchema,
  })
  .strict();

/** Validates cash and bank movement filters. */
export const movementListQuerySchema = z
  .object({
    accountType: accountTypeSchema.optional(),
    accountId: uuidSchema.optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict()
  .superRefine((input, context) => {
    validateDateRange(input, context);

    if (input.accountId && !input.accountType) {
      context.addIssue({
        code: "custom",
        path: ["accountType"],
        message: "Account type is required when an account ID is provided.",
      });
    }
  });

/** Validates all fields accepted when creating an internal account transfer. */
export const createTransferSchema = z
  .object({
    sourceAccountType: accountTypeSchema,
    sourceAccountId: uuidSchema,
    destinationAccountType: accountTypeSchema,
    destinationAccountId: uuidSchema,
    amount: positiveMoneySchema,
    transferDate: dateSchema,
    notes: z.preprocess(emptyStringToNull, notesSchema.nullable().optional()),
  })
  .strict()
  .refine(
    (input) =>
      input.sourceAccountType !== input.destinationAccountType ||
      input.sourceAccountId !== input.destinationAccountId,
    {
      path: ["destinationAccountId"],
      message: "Transfer source and destination must be different accounts.",
    },
  );

/** Validates transfer list date filters and pagination. */
export const transferListQuerySchema = z
  .object({
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict()
  .superRefine(validateDateRange);

/** Validates all fields accepted when creating a draft cash reconciliation. */
export const createCashReconciliationSchema = z
  .object({
    cashAccountId: uuidSchema,
    reconciliationDate: dateSchema,
    countedAmount: moneySchema,
    notes: z.preprocess(emptyStringToNull, notesSchema.nullable().optional()),
  })
  .strict();

/** Validates editable fields on a draft cash reconciliation. */
export const updateCashReconciliationSchema = z
  .object({
    countedAmount: moneySchema.optional(),
    notes: z.preprocess(emptyStringToNull, notesSchema.nullable().optional()),
  })
  .strict()
  .refine(hasAtLeastOneField, "At least one field must be provided.");

/** Validates cash reconciliation list filters and pagination. */
export const reconciliationListQuerySchema = z
  .object({
    status: reconciliationStatusSchema.optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict()
  .superRefine(validateDateRange);

/** Validates the account and business date used by the production daily cash summary. */
export const dailyCashSummaryQuerySchema = z
  .object({
    cashAccountId: uuidSchema,
    date: dateSchema,
  })
  .strict();

export type CreateCashAccountInput = z.infer<typeof createCashAccountSchema>;
export type UpdateCashAccountInput = z.infer<typeof updateCashAccountSchema>;
export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;
export type CustomerReceiptListQuery = z.infer<typeof customerReceiptListQuerySchema>;
export type SupplierPaymentListQuery = z.infer<typeof supplierPaymentListQuerySchema>;
export type CreateCustomerReceiptInput = z.infer<typeof createCustomerReceiptSchema>;
export type CreateSupplierPaymentInput = z.infer<typeof createSupplierPaymentSchema>;
export type ReversePaymentInput = z.infer<typeof reversePaymentSchema>;
export type MovementListQuery = z.infer<typeof movementListQuerySchema>;
export type CreateTransferInput = z.infer<typeof createTransferSchema>;
export type TransferListQuery = z.infer<typeof transferListQuerySchema>;
export type CreateCashReconciliationInput = z.infer<
  typeof createCashReconciliationSchema
>;
export type UpdateCashReconciliationInput = z.infer<
  typeof updateCashReconciliationSchema
>;
export type ReconciliationListQuery = z.infer<
  typeof reconciliationListQuerySchema
>;
export type DailyCashSummaryQuery = z.infer<typeof dailyCashSummaryQuerySchema>;
