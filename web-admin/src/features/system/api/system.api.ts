import { requestApi, requestApiFile } from "../../../lib/api-client.ts";
import type { ApiSuccess } from "../../../lib/api-types.ts";

export type SystemImportType =
  | "products"
  | "customers"
  | "suppliers"
  | "opening-stock"
  | "opening-balances";

export type SystemImportStatus = "VALIDATED" | "IMPORTED" | "FAILED";

export type SystemExportType =
  | "sales"
  | "purchases"
  | "inventory"
  | "customer-outstanding"
  | "supplier-payable"
  | "cash-bank"
  | "expenses"
  | "profit-summary"
  | "product-profit";

export type SystemExportFormat = "csv" | "xlsx" | "pdf";

/** One saved import job shown in history and validation results. */
export interface SystemImportJob {
  id: string;
  type: SystemImportType;
  status: SystemImportStatus;
  fileName: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  importedRows: number;
  errorSummary: string | null;
  startedAt?: string;
  completedAt?: string | null;
}

/** One row-level error saved for an import job. */
export interface SystemImportError {
  id?: string;
  importJobId?: string;
  rowNumber: number;
  columnName: string;
  errorCode: string;
  message: string;
  rawRow?: unknown;
  createdAt?: string;
}

/** Result returned after validating one uploaded import file. */
export interface SystemImportValidationResult {
  job: SystemImportJob;
  errors: SystemImportError[];
}

/** Paginated import history returned by GET /system/imports. */
export interface SystemImportPage {
  items: SystemImportJob[];
  page: number;
  pageSize: number;
  total: number;
}

/** Full import job detail with saved row errors. */
export interface SystemImportDetail {
  job: SystemImportJob;
  errors: SystemImportError[];
}

/** Confirmation result shared by the supported import workflows. */
export interface SystemImportConfirmationResult {
  job: {
    id: string;
    type: SystemImportType;
    status: "IMPORTED";
    totalRows: number;
    importedRows: number;
  };
  productsCreated?: number;
  recordsCreated?: number;
  movementsCreated?: number;
  customerEntriesCreated?: number;
  supplierEntriesCreated?: number;
}

/** One immutable audit-log row shown in the System area. */
export interface SystemAuditLog {
  id: string;
  adminUserId: string | null;
  adminName: string | null;
  adminEmail: string | null;
  requestId: string;
  ipAddress: string | null;
  device: string | null;
  action: string;
  entity: string;
  beforeData: unknown;
  afterData: unknown;
  createdAt: string;
}

/** Paginated audit-log history returned by GET /system/audit-logs. */
export interface SystemAuditLogPage {
  items: SystemAuditLog[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SystemImportListFilters {
  type?: SystemImportType;
  status?: SystemImportStatus;
  page?: number;
}

export interface SystemAuditLogFilters {
  action?: string;
  entity?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
}

export interface SystemExportFilters {
  format?: SystemExportFormat;
  startDate?: string;
  endDate?: string;
  search?: string;
  customerId?: string;
  supplierId?: string;
  productId?: string;
  categoryId?: string;
  accountId?: string;
  lowStock?: boolean;
}

/** Adds one defined query value without sending empty filters. */
function addQueryValue(
  params: URLSearchParams,
  name: string,
  value: string | number | boolean | undefined,
): void {
  if (value !== undefined && value !== "") {
    params.set(name, String(value));
  }
}

/** Adds a query suffix only when at least one filter is present. */
function withQuery(path: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** Loads one CSV import template as a downloadable browser file. */
export function downloadImportTemplate(type: SystemImportType) {
  return requestApiFile(`/system/import-templates/${type}`);
}

/** Uploads one CSV file for validation only; confirmation is a separate action. */
export async function validateSystemImport(
  type: SystemImportType,
  file: File,
  idempotencyKey: string,
): Promise<SystemImportValidationResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await requestApi<ApiSuccess<SystemImportValidationResult>>(
    `/system/imports/${type}`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: formData,
    },
  );

  return response.data;
}

/** Loads one filtered page of previous import jobs. */
export async function loadSystemImports(
  filters: SystemImportListFilters = {},
): Promise<SystemImportPage> {
  const params = new URLSearchParams();
  addQueryValue(params, "type", filters.type);
  addQueryValue(params, "status", filters.status);
  addQueryValue(params, "page", filters.page);

  const response = await requestApi<ApiSuccess<SystemImportPage>>(
    withQuery("/system/imports", params),
  );
  return response.data;
}

/** Loads one import job together with its row-level validation errors. */
export async function loadSystemImport(importJobId: string): Promise<SystemImportDetail> {
  const response = await requestApi<ApiSuccess<SystemImportDetail>>(
    `/system/imports/${importJobId}`,
  );
  return response.data;
}

/** Confirms one previously validated import with an explicit idempotency key. */
export async function confirmSystemImport(
  importJobId: string,
  idempotencyKey: string,
): Promise<SystemImportConfirmationResult> {
  const response = await requestApi<ApiSuccess<SystemImportConfirmationResult>>(
    `/system/imports/${importJobId}/confirm`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
    },
  );
  return response.data;
}

/** Loads one filtered page of immutable audit logs. */
export async function loadSystemAuditLogs(
  filters: SystemAuditLogFilters = {},
): Promise<SystemAuditLogPage> {
  const params = new URLSearchParams();
  addQueryValue(params, "action", filters.action?.trim());
  addQueryValue(params, "entity", filters.entity?.trim());
  addQueryValue(params, "startDate", filters.startDate);
  addQueryValue(params, "endDate", filters.endDate);
  addQueryValue(params, "page", filters.page);

  const response = await requestApi<ApiSuccess<SystemAuditLogPage>>(
    withQuery("/system/audit-logs", params),
  );
  return response.data;
}

/** Downloads one report export in CSV, Excel or PDF format. */
export function downloadSystemExport(
  type: SystemExportType,
  filters: SystemExportFilters = {},
) {
  const params = new URLSearchParams();
  addQueryValue(params, "format", filters.format);
  addQueryValue(params, "startDate", filters.startDate);
  addQueryValue(params, "endDate", filters.endDate);
  addQueryValue(params, "search", filters.search?.trim());
  addQueryValue(params, "customerId", filters.customerId);
  addQueryValue(params, "supplierId", filters.supplierId);
  addQueryValue(params, "productId", filters.productId);
  addQueryValue(params, "categoryId", filters.categoryId);
  addQueryValue(params, "accountId", filters.accountId);
  addQueryValue(params, "lowStock", filters.lowStock);

  return requestApiFile(withQuery(`/system/exports/${type}`, params));
}
