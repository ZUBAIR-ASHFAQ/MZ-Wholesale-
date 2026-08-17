import { requestApi } from "../../../lib/api-client.ts";
import type { ApiSuccess } from "../../../lib/api-types.ts";

export type PurchaseStatus = "DRAFT" | "CONFIRMED" | "CANCELLED";
export type PurchasePaymentMethod = "CASH" | "BANK_TRANSFER";

/** One purchase header returned by the Purchase Management API. */
export interface Purchase {
  id: string;
  purchaseNumber: string | null;
  supplierId: string;
  purchaseDate: string;
  status: PurchaseStatus;
  itemDiscountTotal: string;
  invoiceDiscountAmount: string;
  extraCostAmount: string;
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

/** One immutable item snapshot stored on a purchase. */
export interface PurchaseItem {
  id: string;
  purchaseId: string;
  productId: string;
  productUnitId: string;
  productSkuSnapshot: string;
  productNameSnapshot: string;
  unitNameSnapshot: string;
  conversionToBaseSnapshot: string;
  quantity: string;
  baseQuantity: string;
  unitCost: string;
  itemDiscountAmount: string;
  lineTotal: string;
  allocatedExtraCost: string;
  landedUnitCost: string;
  createdAt: string;
}

/** One supplier payment allocation shown on purchase detail. */
export interface PurchasePayment {
  paymentId: string;
  documentNumber: string;
  paymentDate: string;
  status: "CONFIRMED" | "REVERSED";
  totalAmount: string;
  allocatedAmount: string;
}

/** One purchase detail response with items, payments, and calculated outstanding. */
export interface PurchaseDetail {
  purchase: Purchase;
  items: PurchaseItem[];
  payments: PurchasePayment[];
  currentOutstandingAmount: string | null;
}

/** Filters accepted by GET /purchases. */
export interface PurchaseListFilters {
  supplierId?: string;
  status?: PurchaseStatus;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

/** One paginated Purchase Management list response. */
export interface PaginatedPurchases {
  items: Purchase[];
  total: number;
  page: number;
  pageSize: number;
}

/** One product/unit line accepted by Purchase create and draft-update requests. */
export interface PurchaseItemInput {
  productId: string;
  productUnitId: string;
  quantity: string;
  unitCost: string;
  itemDiscountAmount?: string;
}

/** One cash or bank split used for the optional initial supplier payment. */
export interface PurchasePaymentSplitInput {
  method: PurchasePaymentMethod;
  amount: string;
  cashAccountId?: string;
  bankAccountId?: string;
}

/** Optional payment recorded when a purchase is confirmed. */
export interface PurchaseInitialPaymentInput {
  splits: PurchasePaymentSplitInput[];
}

/** Fields accepted when creating a draft or immediately confirmed purchase. */
export interface CreatePurchaseInput {
  supplierId: string;
  purchaseDate: string;
  status?: "DRAFT" | "CONFIRMED";
  items: PurchaseItemInput[];
  invoiceDiscountAmount?: string;
  extraCostAmount?: string;
  notes?: string | null;
  initialPayment?: PurchaseInitialPaymentInput;
}

/** Editable fields accepted by PATCH /purchases/:id/draft. */
export interface UpdatePurchaseDraftInput {
  supplierId?: string;
  purchaseDate?: string;
  items?: PurchaseItemInput[];
  invoiceDiscountAmount?: string;
  extraCostAmount?: string;
  notes?: string | null;
}

/** Optional initial payment accepted when confirming a saved draft. */
export interface ConfirmPurchaseInput {
  initialPayment?: PurchaseInitialPaymentInput;
}

/** Optional note accepted when cancelling a draft purchase. */
export interface CancelPurchaseInput {
  note?: string | null;
}

/** Adds one optional text value to a Purchase list query string. */
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

/** Adds optional Purchase pagination values to a query string. */
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

/** Builds the supplier/status/date/page query accepted by GET /purchases. */
function buildPurchaseListQuery(filters: PurchaseListFilters): string {
  const params = new URLSearchParams();
  addTextFilter(params, "supplierId", filters.supplierId);
  addTextFilter(params, "status", filters.status);
  addTextFilter(params, "startDate", filters.startDate);
  addTextFilter(params, "endDate", filters.endDate);
  addPagination(params, filters);
  return createQueryString(params);
}

/** Loads one filtered and paginated purchase list. */
export function loadPurchases(
  filters: PurchaseListFilters = {},
): Promise<ApiSuccess<PaginatedPurchases>> {
  return requestApi<ApiSuccess<PaginatedPurchases>>(
    `/purchases${buildPurchaseListQuery(filters)}`,
  );
}

/** Loads one purchase with item snapshots and supplier-payment allocations. */
export function loadPurchase(
  purchaseId: string,
): Promise<ApiSuccess<PurchaseDetail>> {
  return requestApi<ApiSuccess<PurchaseDetail>>(`/purchases/${purchaseId}`);
}

/** Creates one draft purchase or immediately confirms it when requested. */
export function createPurchase(
  input: CreatePurchaseInput,
  idempotencyKey?: string,
): Promise<ApiSuccess<PurchaseDetail>> {
  const headers =
    input.status === "CONFIRMED"
      ? { "Idempotency-Key": idempotencyKey ?? crypto.randomUUID() }
      : undefined;

  return requestApi<ApiSuccess<PurchaseDetail>>("/purchases", {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
}

/** Updates only the editable fields of one purchase draft. */
export function updatePurchaseDraft(
  purchaseId: string,
  input: UpdatePurchaseDraftInput,
): Promise<ApiSuccess<PurchaseDetail>> {
  return requestApi<ApiSuccess<PurchaseDetail>>(`/purchases/${purchaseId}/draft`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** Confirms one saved draft using an explicit idempotency key. */
export function confirmPurchase(
  purchaseId: string,
  input: ConfirmPurchaseInput,
  idempotencyKey: string,
): Promise<ApiSuccess<PurchaseDetail>> {
  return requestApi<ApiSuccess<PurchaseDetail>>(`/purchases/${purchaseId}/confirm`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}

/** Cancels one editable draft without creating stock or financial effects. */
export function cancelPurchase(
  purchaseId: string,
  input: CancelPurchaseInput,
): Promise<ApiSuccess<PurchaseDetail>> {
  return requestApi<ApiSuccess<PurchaseDetail>>(`/purchases/${purchaseId}/cancel`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
