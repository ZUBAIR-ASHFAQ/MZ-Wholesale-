import { requestApi } from "../../../lib/api-client.ts";
import type { ApiSuccess } from "../../../lib/api-types.ts";

/** The only document-number sequence types supported in version 1. */
export const DOCUMENT_TYPES = [
  "SALE",
  "PURCHASE",
  "CUSTOMER_RECEIPT",
  "SUPPLIER_PAYMENT",
  "SALES_RETURN",
  "PURCHASE_RETURN",
  "EXPENSE",
] as const;

/** One approved document-number sequence type. */
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Currency is fixed for version 1 and is never user-selectable. */
export type BusinessCurrency = "PKR";

/** Reporting timezone is fixed for version 1 and is never user-selectable. */
export type BusinessTimezone = "Asia/Karachi";

/** Contains the one saved business identity record returned by the API. */
export interface BusinessSettingsRecord {
  id: string;
  singletonKey: 1;
  businessName: string;
  phone: string;
  email: string | null;
  address: string;
  logoUrl: string | null;
  currency: BusinessCurrency;
  timezone: BusinessTimezone;
  createdAt: string;
  updatedAt: string;
}

/** Contains one saved document-number sequence returned by the API. */
export interface DocumentSequenceRecord {
  id: string;
  documentType: DocumentType;
  prefix: string;
  nextNumber: number;
  createdAt: string;
  updatedAt: string;
}

/** Contains the complete response data returned by both settings routes. */
export interface BusinessSettingsData {
  isConfigured: boolean;
  settings: BusinessSettingsRecord | null;
  sequences: DocumentSequenceRecord[];
}

/** Contains one sequence accepted by the settings update route. */
export interface DocumentSequenceInput {
  documentType: DocumentType;
  prefix: string;
  nextNumber: number;
}

/**
 * Contains every field required when settings are created for the first time.
 * Fixed currency and timezone values are sent to satisfy the backend contract,
 * but the future form must not render them as editable controls.
 */
export interface CreateBusinessSettingsInput {
  businessName: string;
  phone: string;
  email?: string | null;
  address: string;
  logoUrl?: string | null;
  currency: BusinessCurrency;
  timezone: BusinessTimezone;
  sequences: DocumentSequenceInput[];
}

/** Contains only fields that the backend permits after initial setup. */
export interface UpdateBusinessSettingsInput {
  businessName?: string;
  phone?: string;
  email?: string | null;
  address?: string;
  logoUrl?: string | null;
  sequences?: DocumentSequenceInput[];
}

/** The PATCH route accepts either first-time setup or a later partial update. */
export type SaveBusinessSettingsInput =
  | CreateBusinessSettingsInput
  | UpdateBusinessSettingsInput;

/** Loads the current business identity and document sequences. */
export async function loadBusinessSettings(): Promise<
  ApiSuccess<BusinessSettingsData>
> {
  return requestApi<ApiSuccess<BusinessSettingsData>>("/business-settings");
}

/** Saves validated setup or update fields through the protected Fastify route. */
export async function saveBusinessSettings(
  input: SaveBusinessSettingsInput,
): Promise<ApiSuccess<BusinessSettingsData>> {
  return requestApi<ApiSuccess<BusinessSettingsData>>("/business-settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
