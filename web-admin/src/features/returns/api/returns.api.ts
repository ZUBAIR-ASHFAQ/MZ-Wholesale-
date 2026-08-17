import { requestApi } from "../../../lib/api-client.ts";
import type { ApiSuccess } from "../../../lib/api-types.ts";
import type { Purchase } from "../../purchases/api/purchases.api.ts";
import type { Sale } from "../../sales/api/sales.api.ts";

export type ReturnStatus = "CONFIRMED";
export type SalesReturnRefundMode = "DUE_REDUCTION" | "CASH" | "BANK_TRANSFER";
export type SalesReturnStockCondition = "GOOD" | "DAMAGED" | "EXPIRED";

/** One confirmed Sales Return header returned by the Returns API. */
export interface SalesReturn {
  id: string;
  returnNumber: string;
  originalSaleId: string;
  customerId: string;
  returnDate: string;
  status: ReturnStatus;
  reason: string;
  refundMode: SalesReturnRefundMode;
  cashAccountId: string | null;
  bankAccountId: string | null;
  totalAmount: string;
  createdAt: string;
}

/** One immutable item snapshot stored on a confirmed Sales Return. */
export interface SalesReturnItem {
  id: string;
  salesReturnId: string;
  originalSaleItemId: string;
  productId: string;
  productUnitId: string;
  productSkuSnapshot: string;
  productNameSnapshot: string;
  unitNameSnapshot: string;
  conversionToBaseSnapshot: string;
  quantity: string;
  baseQuantity: string;
  unitPriceSnapshot: string;
  unitCostSnapshot: string;
  stockCondition: SalesReturnStockCondition;
  lineTotal: string;
  createdAt: string;
}

/** One stock result row returned on Sales Return detail. */
export interface SalesReturnStockResultItem {
  productId: string;
  stockCondition: SalesReturnStockCondition;
  baseQuantity: string;
}

/** Settlement summary returned with one confirmed Sales Return. */
export interface SalesReturnSettlementResult {
  refundMode: SalesReturnRefundMode;
  totalAmount: string;
  cashAccountId: string | null;
  bankAccountId: string | null;
}

/** One Sales Return detail response with source sale and stored effects. */
export interface SalesReturnDetail {
  salesReturn: SalesReturn;
  items: SalesReturnItem[];
  originalSale: Sale;
  stockResult: SalesReturnStockResultItem[];
  settlementResult: SalesReturnSettlementResult;
}

/** Filters accepted by GET /sales-returns. */
export interface SalesReturnListFilters {
  customerId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

/** One paginated Sales Return list response. */
export interface PaginatedSalesReturns {
  items: SalesReturn[];
  total: number;
  page: number;
  pageSize: number;
}

/** One requested line accepted when creating a confirmed Sales Return. */
export interface CreateSalesReturnItemInput {
  originalSaleItemId: string;
  quantity: string;
  stockCondition: SalesReturnStockCondition;
}

/** Fields accepted by POST /sales-returns. */
export interface CreateSalesReturnInput {
  originalSaleId: string;
  returnDate: string;
  reason: string;
  refundMode: SalesReturnRefundMode;
  cashAccountId?: string;
  bankAccountId?: string;
  items: CreateSalesReturnItemInput[];
}

/** One confirmed Purchase Return header returned by the Returns API. */
export interface PurchaseReturn {
  id: string;
  returnNumber: string;
  originalPurchaseId: string;
  supplierId: string;
  returnDate: string;
  status: ReturnStatus;
  reason: string;
  totalAmount: string;
  createdAt: string;
}

/** One immutable item snapshot stored on a confirmed Purchase Return. */
export interface PurchaseReturnItem {
  id: string;
  purchaseReturnId: string;
  originalPurchaseItemId: string;
  productId: string;
  productUnitId: string;
  productSkuSnapshot: string;
  productNameSnapshot: string;
  unitNameSnapshot: string;
  conversionToBaseSnapshot: string;
  quantity: string;
  baseQuantity: string;
  unitCostSnapshot: string;
  lineTotal: string;
  createdAt: string;
}

/** One stock-out result row returned on Purchase Return detail. */
export interface PurchaseReturnStockResultItem {
  productId: string;
  baseQuantity: string;
  unitCostSnapshot: string;
}

/** Supplier payable reduction returned with one Purchase Return. */
export interface PurchaseReturnSupplierBalanceResult {
  reductionAmount: string;
}

/** One Purchase Return detail response with source purchase and stored effects. */
export interface PurchaseReturnDetail {
  purchaseReturn: PurchaseReturn;
  items: PurchaseReturnItem[];
  originalPurchase: Purchase;
  stockResult: PurchaseReturnStockResultItem[];
  supplierBalanceResult: PurchaseReturnSupplierBalanceResult;
}

/** Filters accepted by GET /purchase-returns. */
export interface PurchaseReturnListFilters {
  supplierId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

/** One paginated Purchase Return list response. */
export interface PaginatedPurchaseReturns {
  items: PurchaseReturn[];
  total: number;
  page: number;
  pageSize: number;
}

/** One requested line accepted when creating a confirmed Purchase Return. */
export interface CreatePurchaseReturnItemInput {
  originalPurchaseItemId: string;
  quantity: string;
}

/** Fields accepted by POST /purchase-returns. */
export interface CreatePurchaseReturnInput {
  originalPurchaseId: string;
  returnDate: string;
  reason: string;
  items: CreatePurchaseReturnItemInput[];
}

/** Adds one optional text filter to a Returns query string. */
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

/** Adds optional Returns pagination values to a query string. */
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

/** Builds the customer/date/page query accepted by GET /sales-returns. */
function buildSalesReturnListQuery(filters: SalesReturnListFilters): string {
  const params = new URLSearchParams();
  addTextFilter(params, "customerId", filters.customerId);
  addTextFilter(params, "startDate", filters.startDate);
  addTextFilter(params, "endDate", filters.endDate);
  addPagination(params, filters);
  return createQueryString(params);
}

/** Builds the supplier/date/page query accepted by GET /purchase-returns. */
function buildPurchaseReturnListQuery(filters: PurchaseReturnListFilters): string {
  const params = new URLSearchParams();
  addTextFilter(params, "supplierId", filters.supplierId);
  addTextFilter(params, "startDate", filters.startDate);
  addTextFilter(params, "endDate", filters.endDate);
  addPagination(params, filters);
  return createQueryString(params);
}

/** Loads one filtered and paginated Sales Return list. */
export function loadSalesReturns(
  filters: SalesReturnListFilters = {},
): Promise<ApiSuccess<PaginatedSalesReturns>> {
  return requestApi<ApiSuccess<PaginatedSalesReturns>>(
    `/sales-returns${buildSalesReturnListQuery(filters)}`,
  );
}

/** Loads one confirmed Sales Return detail. */
export function loadSalesReturn(
  salesReturnId: string,
): Promise<ApiSuccess<SalesReturnDetail>> {
  return requestApi<ApiSuccess<SalesReturnDetail>>(`/sales-returns/${salesReturnId}`);
}

/** Creates one confirmed Sales Return using an explicit idempotency key. */
export function createSalesReturn(
  input: CreateSalesReturnInput,
  idempotencyKey: string,
): Promise<ApiSuccess<SalesReturnDetail>> {
  return requestApi<ApiSuccess<SalesReturnDetail>>("/sales-returns", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}

/** Loads one filtered and paginated Purchase Return list. */
export function loadPurchaseReturns(
  filters: PurchaseReturnListFilters = {},
): Promise<ApiSuccess<PaginatedPurchaseReturns>> {
  return requestApi<ApiSuccess<PaginatedPurchaseReturns>>(
    `/purchase-returns${buildPurchaseReturnListQuery(filters)}`,
  );
}

/** Loads one confirmed Purchase Return detail. */
export function loadPurchaseReturn(
  purchaseReturnId: string,
): Promise<ApiSuccess<PurchaseReturnDetail>> {
  return requestApi<ApiSuccess<PurchaseReturnDetail>>(
    `/purchase-returns/${purchaseReturnId}`,
  );
}

/** Creates one confirmed Purchase Return using an explicit idempotency key. */
export function createPurchaseReturn(
  input: CreatePurchaseReturnInput,
  idempotencyKey: string,
): Promise<ApiSuccess<PurchaseReturnDetail>> {
  return requestApi<ApiSuccess<PurchaseReturnDetail>>("/purchase-returns", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}
