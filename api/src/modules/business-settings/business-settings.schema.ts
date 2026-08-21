import { z } from "zod";

import {
  DOCUMENT_TYPES,
  FIXED_CURRENCY,
  FIXED_TIMEZONE,
} from "../../database/schema/business-settings.schema.js";

// Re-export the approved database values so existing module consumers keep one stable API.
export { DOCUMENT_TYPES, FIXED_CURRENCY, FIXED_TIMEZONE };

/** Lists the only document type values accepted by the application. */
export type DocumentType =
  | "SALE"
  | "PURCHASE"
  | "CUSTOMER_RECEIPT"
  | "SUPPLIER_PAYMENT"
  | "SALES_RETURN"
  | "PURCHASE_RETURN"
  | "EXPENSE"
  | "EMPLOYEE_ADVANCE"
  | "PAYROLL"
  | "SALARY_PAYMENT"
  | "ADVANCE_RECOVERY";

/** Keeps first-time setup compatible with the existing seven core document sequences. */
const INITIAL_SETUP_DOCUMENT_TYPES = [
  "SALE",
  "PURCHASE",
  "CUSTOMER_RECEIPT",
  "SUPPLIER_PAYMENT",
  "SALES_RETURN",
  "PURCHASE_RETURN",
  "EXPENSE",
] as const;

/** Contains the fields accepted for one document sequence. */
export interface DocumentSequenceInput {
  documentType: DocumentType;
  prefix: string;
  nextNumber: number;
}

/** Contains every field required during first-time business setup. */
export interface BusinessSettingsSetupInput {
  businessName: string;
  phone: string;
  email?: string | null;
  address: string;
  logoUrl?: string | null;
  currency: "PKR";
  timezone: "Asia/Karachi";
  sequences: DocumentSequenceInput[];
}

/** Contains fields that may be changed after first-time setup. */
export interface BusinessSettingsUpdateInput {
  businessName?: string;
  phone?: string;
  email?: string | null;
  address?: string;
  logoUrl?: string | null;
  sequences?: DocumentSequenceInput[];
}

/** Validates one document sequence without accessing the database. */
export const documentSequenceInputSchema = z
  .object({
    documentType: z.enum(DOCUMENT_TYPES),
    prefix: z
      .string()
      .trim()
      .min(1, "Prefix is required.")
      .max(20, "Prefix must be 20 characters or fewer.")
      .regex(
        /^[A-Z0-9-]+$/,
        "Prefix may contain only uppercase letters, numbers, and hyphens.",
      ),
    nextNumber: z
      .number()
      .int("Next number must be a whole number.")
      .positive("Next number must be greater than zero.")
      .safe("Next number is too large."),
  })
  .strict();

const businessNameSchema = z
  .string()
  .trim()
  .min(1, "Business name is required.")
  .max(160, "Business name must be 160 characters or fewer.");

const phoneSchema = z
  .string()
  .trim()
  .min(7, "Phone must contain at least 7 characters.")
  .max(32, "Phone must be 32 characters or fewer.")
  .regex(/^[0-9+() -]+$/, "Phone contains unsupported characters.");

const emailSchema = z
  .string()
  .trim()
  .max(254, "Email must be 254 characters or fewer.")
  .email("Email is invalid.");

const addressSchema = z
  .string()
  .trim()
  .min(1, "Address is required.")
  .max(1000, "Address must be 1000 characters or fewer.");

const logoUrlSchema = z
  .string()
  .trim()
  .max(2048, "Logo URL must be 2048 characters or fewer.")
  .url("Logo URL is invalid.");

/**
 * Adds field errors when sequence types or prefixes repeat in one request.
 * Database constraints will also protect uniqueness across saved records.
 */
function validateUniqueSequences(
  sequences: DocumentSequenceInput[],
  context: z.RefinementCtx,
): void {
  const usedDocumentTypes = new Set<string>();
  const usedPrefixes = new Set<string>();

  for (let index = 0; index < sequences.length; index += 1) {
    const sequence = sequences[index];

    if (usedDocumentTypes.has(sequence.documentType)) {
      context.addIssue({
        code: "custom",
        path: [index, "documentType"],
        message: "Document type appears more than once.",
      });
    }

    if (usedPrefixes.has(sequence.prefix)) {
      context.addIssue({
        code: "custom",
        path: [index, "prefix"],
        message: "Prefix appears more than once.",
      });
    }

    usedDocumentTypes.add(sequence.documentType);
    usedPrefixes.add(sequence.prefix);
  }
}

/** Adds errors when first-time setup does not contain every document type. */
function validateSetupSequences(
  sequences: DocumentSequenceInput[],
  context: z.RefinementCtx,
): void {
  validateUniqueSequences(sequences, context);

  for (const documentType of INITIAL_SETUP_DOCUMENT_TYPES) {
    let typeWasProvided = false;

    for (const sequence of sequences) {
      if (sequence.documentType === documentType) {
        typeWasProvided = true;
        break;
      }
    }

    if (!typeWasProvided) {
      context.addIssue({
        code: "custom",
        message: `${documentType} sequence is required during first-time setup.`,
      });
    }
  }
}

/** Checks sequence rules that apply to a complete first-time setup. */
function validateSetupRequest(
  input: BusinessSettingsSetupInput,
  context: z.RefinementCtx,
): void {
  validateSetupSequences(input.sequences, context);
}

/** Checks that an update changes something and has no repeated sequences. */
function validateUpdateRequest(
  input: BusinessSettingsUpdateInput,
  context: z.RefinementCtx,
): void {
  if (Object.keys(input).length === 0) {
    context.addIssue({
      code: "custom",
      message: "At least one field must be provided.",
    });
  }

  if (input.sequences) {
    validateUniqueSequences(input.sequences, context);
  }
}

/** Validates the complete request required when the business is first set up. */
export const businessSettingsSetupSchema = z
  .object({
    businessName: businessNameSchema,
    phone: phoneSchema,
    email: emailSchema.nullable().optional(),
    address: addressSchema,
    logoUrl: logoUrlSchema.nullable().optional(),
    currency: z.literal(FIXED_CURRENCY),
    timezone: z.literal(FIXED_TIMEZONE),
    sequences: z
      .array(documentSequenceInputSchema)
      .length(7, "Exactly seven document sequences are required."),
  })
  .strict()
  .superRefine(validateSetupRequest);

/** Validates a partial update after first-time setup has been completed. */
export const businessSettingsUpdateSchema = z
  .object({
    businessName: businessNameSchema.optional(),
    phone: phoneSchema.optional(),
    email: emailSchema.nullable().optional(),
    address: addressSchema.optional(),
    logoUrl: logoUrlSchema.nullable().optional(),
    sequences: z
      .array(documentSequenceInputSchema)
      .min(1, "At least one sequence is required when sequences are supplied.")
      .max(11, "No more than eleven sequences are allowed.")
      .optional(),
  })
  .strict()
  .superRefine(validateUpdateRequest);

/** Rejects every query parameter because the GET route defines no filters. */
export const businessSettingsQuerySchema = z.object({}).strict();

/**
 * Returns a new list of supported document types.
 * A new list protects the module contract from accidental changes by a caller.
 */
export function getSupportedDocumentTypes(): string[] {
  return [...DOCUMENT_TYPES];
}

/** Parses and returns a valid first-time setup request. */
export function parseBusinessSettingsSetup(
  input: unknown,
): BusinessSettingsSetupInput {
  return businessSettingsSetupSchema.parse(input);
}

/** Parses and returns a valid update request. */
export function parseBusinessSettingsUpdate(
  input: unknown,
): BusinessSettingsUpdateInput {
  return businessSettingsUpdateSchema.parse(input);
}

/** Validates that the Business Settings GET request has no query parameters. */
export function validateBusinessSettingsQuery(input: unknown): void {
  businessSettingsQuerySchema.parse(input);
}
