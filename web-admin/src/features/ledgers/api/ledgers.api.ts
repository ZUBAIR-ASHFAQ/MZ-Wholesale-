import { requestApi } from "../../../lib/api-client.ts";
import type { ApiSuccess } from "../../../lib/api-types.ts";

export interface LedgerPartySummary {
  id: string;
  code: string;
  name: string;
  phone: string | null;
}

export interface LedgerEntry {
  id: string;
  occurredAt: string;
  referenceType: string;
  referenceId: string | null;
  documentNumber: string | null;
  description: string | null;
  debit: string;
  credit: string;
  notes: string | null;
  createdAt: string;
  runningBalance: string;
}

interface LedgerStatementBase {
  dateFrom: string | null;
  dateTo: string | null;
  openingBalance: string;
  totalDebit: string;
  totalCredit: string;
  closingBalance: string;
  entries: LedgerEntry[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CustomerStatement extends LedgerStatementBase {
  customer: LedgerPartySummary;
}

export interface SupplierStatement extends LedgerStatementBase {
  supplier: LedgerPartySummary;
}

export interface CustomerOutstandingItem {
  customerId: string;
  customerCode: string;
  customerName: string;
  phone: string | null;
  outstandingAmount: string;
}

export interface SupplierPayableItem {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  phone: string | null;
  payableAmount: string;
}

export interface PaginatedCustomerOutstanding {
  items: CustomerOutstandingItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PaginatedSupplierPayables {
  items: SupplierPayableItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface LedgerStatementFilters {
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface OutstandingListFilters {
  search?: string;
  page?: number;
  pageSize?: number;
}

/** Adds the text filter. */
function addTextFilter(
  params: URLSearchParams,
  name: string,
  value: string | undefined,
): void {
  const trimmedValue = value?.trim();

  if (trimmedValue) {
    params.set(name, trimmedValue);
  }
}

/** Adds the pagination. */
function addPagination(
  params: URLSearchParams,
  filters: { page?: number; pageSize?: number },
): void {
  if (filters.page !== undefined) {
    params.set("page", String(filters.page));
  }

  if (filters.pageSize !== undefined) {
    params.set("pageSize", String(filters.pageSize));
  }
}

/** Creates the query string. */
function createQueryString(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Builds the statement query. */
function buildStatementQuery(filters: LedgerStatementFilters): string {
  const params = new URLSearchParams();

  addTextFilter(params, "startDate", filters.startDate);
  addTextFilter(params, "endDate", filters.endDate);
  addPagination(params, filters);

  return createQueryString(params);
}

/** Builds the outstanding query. */
function buildOutstandingQuery(filters: OutstandingListFilters): string {
  const params = new URLSearchParams();

  addTextFilter(params, "search", filters.search);
  addPagination(params, filters);

  return createQueryString(params);
}

/** Loads the customer statement. */
export function loadCustomerStatement(
  customerId: string,
  filters: LedgerStatementFilters = {},
): Promise<ApiSuccess<CustomerStatement>> {
  return requestApi<ApiSuccess<CustomerStatement>>(
    `/ledgers/customers/${customerId}${buildStatementQuery(filters)}`,
  );
}

/** Loads the supplier statement. */
export function loadSupplierStatement(
  supplierId: string,
  filters: LedgerStatementFilters = {},
): Promise<ApiSuccess<SupplierStatement>> {
  return requestApi<ApiSuccess<SupplierStatement>>(
    `/ledgers/suppliers/${supplierId}${buildStatementQuery(filters)}`,
  );
}

/** Loads the customer outstanding. */
export function loadCustomerOutstanding(
  filters: OutstandingListFilters = {},
): Promise<ApiSuccess<PaginatedCustomerOutstanding>> {
  return requestApi<ApiSuccess<PaginatedCustomerOutstanding>>(
    `/ledgers/customer-outstanding${buildOutstandingQuery(filters)}`,
  );
}

/** Loads the supplier payables. */
export function loadSupplierPayables(
  filters: OutstandingListFilters = {},
): Promise<ApiSuccess<PaginatedSupplierPayables>> {
  return requestApi<ApiSuccess<PaginatedSupplierPayables>>(
    `/ledgers/supplier-payables${buildOutstandingQuery(filters)}`,
  );
}
