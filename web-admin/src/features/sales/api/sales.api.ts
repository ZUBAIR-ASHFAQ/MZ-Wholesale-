import { requestApi } from "../../../lib/api-client.ts";
import type { ApiSuccess } from "../../../lib/api-types.ts";

export type SaleStatus = "DRAFT" | "HELD" | "CONFIRMED" | "CANCELLED";
export type SalePaymentMethod = "CASH" | "BANK_TRANSFER";

/** One sale header returned by the Counter Sales API. */
export interface Sale {
  id: string;
  invoiceNumber: string | null;
  customerId: string;
  invoiceDate: string;
  status: SaleStatus;
  itemDiscountTotal: string;
  invoiceDiscountAmount: string;
  subtotalAmount: string;
  totalAmount: string;
  initialPaidAmount: string | null;
  initialDueAmount: string | null;
  notes: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One immutable product/unit/manual-price snapshot stored on a sale. */
export interface SaleItem {
  id: string;
  salesInvoiceId: string;
  productId: string;
  productUnitId: string;
  productSkuSnapshot: string;
  productNameSnapshot: string;
  unitNameSnapshot: string;
  conversionToBaseSnapshot: string;
  quantity: string;
  baseQuantity: string;
  manualUnitPrice: string;
  itemDiscountAmount: string;
  lineTotal: string;
  unitCostSnapshot: string | null;
  createdAt: string;
}

/** One customer receipt allocation shown on a sale detail. */
export interface SalePayment {
  paymentId: string;
  documentNumber: string;
  paymentDate: string;
  status: "CONFIRMED" | "REVERSED";
  reversalOfPaymentId: string | null;
  totalAmount: string;
  allocatedAmount: string;
}

/** One sale detail response with item, payment, and outstanding information. */
export interface SaleDetail {
  sale: Sale;
  items: SaleItem[];
  payments: SalePayment[];
  currentOutstandingAmount: string | null;
}

/** One mutation response returned before read-only payment detail is reloaded. */
export interface SavedSale {
  sale: Sale;
  items: SaleItem[];
}

/** Filters accepted by GET /sales. */
export interface SaleListFilters {
  customerId?: string;
  status?: SaleStatus;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

/** One paginated Counter Sales list response. */
export interface PaginatedSales {
  items: Sale[];
  total: number;
  page: number;
  pageSize: number;
}

/** One manually priced product line accepted by Sales mutations. */
export interface SaleItemInput {
  productId: string;
  productUnitId: string;
  quantity: string;
  manualUnitPrice: string;
  itemDiscountAmount?: string;
}

/** One cash or bank split used for an initial customer payment. */
export interface SalePaymentSplitInput {
  method: SalePaymentMethod;
  amount: string;
  cashAccountId?: string;
  bankAccountId?: string;
}

/** Optional payment recorded when a sale is confirmed. */
export interface SaleInitialPaymentInput {
  splits: SalePaymentSplitInput[];
}

/** Fields accepted when creating a draft, held, or confirmed sale. */
export interface CreateSaleInput {
  customerId: string;
  invoiceDate: string;
  status?: "DRAFT" | "HELD" | "CONFIRMED";
  items: SaleItemInput[];
  invoiceDiscountAmount?: string;
  notes?: string | null;
  initialPayment?: SaleInitialPaymentInput;
}

/** Editable fields accepted by PATCH /sales/:id/draft. */
export interface UpdateSaleDraftInput {
  customerId?: string;
  invoiceDate?: string;
  status?: "DRAFT" | "HELD";
  items?: SaleItemInput[];
  invoiceDiscountAmount?: string;
  notes?: string | null;
}

/** Optional initial payment accepted when confirming a saved sale. */
export interface ConfirmSaleInput {
  initialPayment?: SaleInitialPaymentInput;
}

/** Optional note accepted when cancelling a draft sale. */
export interface CancelSaleInput {
  note?: string | null;
}

/** Adds one optional text value to a Sales list query string. */
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

/** Adds optional Sales pagination values to a query string. */
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

/** Converts URL parameters into an optional query-string suffix. */
function createQueryString(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Builds the customer/status/date/page query accepted by GET /sales. */
function buildSaleListQuery(filters: SaleListFilters): string {
  const params = new URLSearchParams();
  addTextFilter(params, "customerId", filters.customerId);
  addTextFilter(params, "status", filters.status);
  addTextFilter(params, "startDate", filters.startDate);
  addTextFilter(params, "endDate", filters.endDate);
  addPagination(params, filters);
  return createQueryString(params);
}

/** Loads one filtered and paginated Counter Sales list. */
export function loadSales(
  filters: SaleListFilters = {},
): Promise<ApiSuccess<PaginatedSales>> {
  return requestApi<ApiSuccess<PaginatedSales>>(
    `/sales${buildSaleListQuery(filters)}`,
  );
}

/** Loads one sale with all saved item snapshots. */
export function loadSale(saleId: string): Promise<ApiSuccess<SaleDetail>> {
  return requestApi<ApiSuccess<SaleDetail>>(`/sales/${saleId}`);
}

/** Creates one draft/held sale or immediately confirms it when requested. */
export function createSale(
  input: CreateSaleInput,
  idempotencyKey?: string,
): Promise<ApiSuccess<SavedSale>> {
  const headers =
    input.status === "CONFIRMED"
      ? { "Idempotency-Key": idempotencyKey ?? crypto.randomUUID() }
      : undefined;

  return requestApi<ApiSuccess<SavedSale>>("/sales", {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
}

/** Updates only editable fields on one DRAFT or HELD sale. */
export function updateSaleDraft(
  saleId: string,
  input: UpdateSaleDraftInput,
): Promise<ApiSuccess<SavedSale>> {
  return requestApi<ApiSuccess<SavedSale>>(`/sales/${saleId}/draft`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** Confirms one saved sale using the required explicit idempotency key. */
export function confirmSale(
  saleId: string,
  input: ConfirmSaleInput,
  idempotencyKey: string,
): Promise<ApiSuccess<SavedSale>> {
  return requestApi<ApiSuccess<SavedSale>>(`/sales/${saleId}/confirm`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}

/** Cancels one DRAFT sale without creating stock or financial effects. */
export function cancelSale(
  saleId: string,
  input: CancelSaleInput,
): Promise<ApiSuccess<Sale>> {
  return requestApi<ApiSuccess<Sale>>(`/sales/${saleId}/cancel`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
