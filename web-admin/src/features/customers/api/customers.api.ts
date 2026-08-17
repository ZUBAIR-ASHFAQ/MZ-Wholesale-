import { requestApi } from "../../../lib/api-client.ts";
import type { ApiSuccess } from "../../../lib/api-types.ts";

/** One customer row returned by the Customer Management API. */
export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxId: string | null;
  creditLimit: string;
  isWalkIn: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One recent sales invoice summary shown on a customer profile. */
export interface CustomerInvoiceSummary {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueAmount: string;
}

/** One page of confirmed customer invoices that can receive a payment allocation. */
export interface CustomerOpenInvoicesPage {
  items: CustomerInvoiceSummary[];
  page: number;
  pageSize: number;
  total: number;
}

/** One page returned by GET /customers. */
export interface PaginatedCustomers {
  items: Customer[];
  total: number;
}

/** One customer profile returned by GET /customers/:id. */
export interface CustomerProfile {
  customer: Customer;
  financialSummaryAvailable: boolean;
  currentDue: string | null;
  recentInvoicesAvailable: boolean;
  recentInvoices: CustomerInvoiceSummary[];
}

/** Filters accepted by GET /customers. */
export interface CustomerListFilters {
  search?: string;
  active?: boolean;
  page?: number;
  pageSize?: number;
}

/** Pagination accepted by the customer open-invoices route. */
export interface CustomerOpenInvoicesFilters {
  page?: number;
  pageSize?: number;
}

/** Fields accepted when creating a regular customer. */
export interface CreateCustomerInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxId?: string | null;
  creditLimit?: string;
  openingBalance?: string;
}

/** Fields accepted when updating a regular customer. */
export interface UpdateCustomerInput {
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxId?: string | null;
  creditLimit?: string;
  isActive?: boolean;
}

/** Adds one text query parameter when it contains a useful value. */
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

/** Adds the shared page and page-size query parameters. */
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

/** Converts URL search parameters into an optional query string. */
function createQueryString(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Builds the query string accepted by the customer-list route. */
function buildCustomerListQuery(filters: CustomerListFilters): string {
  const params = new URLSearchParams();

  addTextFilter(params, "search", filters.search);

  if (filters.active !== undefined) {
    params.set("active", String(filters.active));
  }

  addPagination(params, filters);
  return createQueryString(params);
}

/** Loads one filtered and paginated customer list. */
export async function loadCustomers(
  filters: CustomerListFilters = {},
): Promise<ApiSuccess<PaginatedCustomers>> {
  return requestApi<ApiSuccess<PaginatedCustomers>>(
    `/customers${buildCustomerListQuery(filters)}`,
  );
}

/** Loads one customer profile with its calculated balance information. */
export async function loadCustomer(
  customerId: string,
): Promise<ApiSuccess<CustomerProfile>> {
  return requestApi<ApiSuccess<CustomerProfile>>(`/customers/${customerId}`);
}

/** Creates one regular customer. */
export async function createCustomer(
  input: CreateCustomerInput,
): Promise<ApiSuccess<Customer>> {
  return requestApi<ApiSuccess<Customer>>("/customers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Updates approved fields on one regular customer. */
export async function updateCustomer(
  customerId: string,
  input: UpdateCustomerInput,
): Promise<ApiSuccess<Customer>> {
  return requestApi<ApiSuccess<Customer>>(`/customers/${customerId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}


/** Loads confirmed outstanding invoices that can receive a customer payment allocation. */
export async function loadCustomerOpenInvoices(
  customerId: string,
  filters: CustomerOpenInvoicesFilters = {},
): Promise<ApiSuccess<CustomerOpenInvoicesPage>> {
  const params = new URLSearchParams();
  addPagination(params, filters);

  return requestApi<ApiSuccess<CustomerOpenInvoicesPage>>(
    `/customers/${customerId}/open-invoices${createQueryString(params)}`,
  );
}
