import { requestApi } from "../../../lib/api-client.ts";
import type { ApiSuccess } from "../../../lib/api-types.ts";

/** One supplier row returned by the Supplier Management API. */
export interface Supplier {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One confirmed purchase summary shown on a supplier profile. */
export interface SupplierPurchaseSummary {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  productNames: string;
  dueAmount: string;
}

/** One page of confirmed supplier purchases that can receive a payment allocation. */
export interface SupplierOpenPurchasesPage {
  items: SupplierPurchaseSummary[];
  page: number;
  pageSize: number;
  total: number;
}

/** One page returned by GET /suppliers. */
export interface PaginatedSuppliers {
  items: Supplier[];
  total: number;
}

/** One supplier profile returned by GET /suppliers/:id. */
export interface SupplierProfile {
  supplier: Supplier;
  financialSummaryAvailable: boolean;
  currentPayable: string | null;
  recentPurchasesAvailable: boolean;
  recentPurchases: SupplierPurchaseSummary[];
}

/** Filters accepted by GET /suppliers. */
export interface SupplierListFilters {
  search?: string;
  active?: boolean;
  page?: number;
  pageSize?: number;
}

/** Pagination accepted by the supplier open-purchases route. */
export interface SupplierOpenPurchasesFilters {
  page?: number;
  pageSize?: number;
}

/** Fields accepted when creating a supplier. */
export interface CreateSupplierInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  openingBalance?: string;
}

/** Fields accepted when updating a supplier. */
export interface UpdateSupplierInput {
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
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

/** Builds the query string accepted by the supplier-list route. */
function buildSupplierListQuery(filters: SupplierListFilters): string {
  const params = new URLSearchParams();

  addTextFilter(params, "search", filters.search);

  if (filters.active !== undefined) {
    params.set("active", String(filters.active));
  }

  addPagination(params, filters);
  return createQueryString(params);
}

/** Loads one filtered and paginated supplier list. */
export async function loadSuppliers(
  filters: SupplierListFilters = {},
): Promise<ApiSuccess<PaginatedSuppliers>> {
  return requestApi<ApiSuccess<PaginatedSuppliers>>(
    `/suppliers${buildSupplierListQuery(filters)}`,
  );
}

/** Loads one supplier profile with deferred payable information. */
export async function loadSupplier(
  supplierId: string,
): Promise<ApiSuccess<SupplierProfile>> {
  return requestApi<ApiSuccess<SupplierProfile>>(`/suppliers/${supplierId}`);
}

/** Creates one supplier. */
export async function createSupplier(
  input: CreateSupplierInput,
): Promise<ApiSuccess<Supplier>> {
  return requestApi<ApiSuccess<Supplier>>("/suppliers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Updates approved fields on one supplier. */
export async function updateSupplier(
  supplierId: string,
  input: UpdateSupplierInput,
): Promise<ApiSuccess<Supplier>> {
  return requestApi<ApiSuccess<Supplier>>(`/suppliers/${supplierId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}


/** Loads confirmed outstanding purchases that can receive a supplier payment allocation. */
export async function loadSupplierOpenPurchases(
  supplierId: string,
  filters: SupplierOpenPurchasesFilters = {},
): Promise<ApiSuccess<SupplierOpenPurchasesPage>> {
  const params = new URLSearchParams();
  addPagination(params, filters);

  return requestApi<ApiSuccess<SupplierOpenPurchasesPage>>(
    `/suppliers/${supplierId}/open-purchases${createQueryString(params)}`,
  );
}
