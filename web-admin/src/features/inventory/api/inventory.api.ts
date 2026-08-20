import { requestApi } from "../../../lib/api-client.ts";
import type { ApiSuccess } from "../../../lib/api-types.ts";

export type StockCondition = "SELLABLE" | "DAMAGED" | "EXPIRED";
export type StockDirection = "IN" | "OUT";
export type InventoryAdjustmentReason =
  | "FOUND_STOCK"
  | "MISSING_STOCK"
  | "DAMAGED"
  | "EXPIRED"
  | "DISPOSAL"
  | "DATA_CORRECTION"
  | "OTHER";
export type StockCountStatus = "DRAFT" | "CONFIRMED";

/** One row shown on the current inventory stock screen. */
export interface InventoryStockItem {
  productId: string;
  sku: string;
  productName: string;
  isActive: boolean;
  categoryName: string;
  brandName: string | null;
  baseUnitName: string;
  reorderLevel: string;
  sellableQuantity: string;
  damagedQuantity: string;
  expiredQuantity: string;
  weightedAverageCost: string;
  isLowStock: boolean;
}

/** One immutable stock movement returned by the Inventory API. */
export interface StockMovement {
  id: string;
  productId: string;
  movementType: string;
  stockCondition: StockCondition;
  direction: StockDirection;
  quantity: string;
  unitCost: string;
  allocatedExtraCost: string | null;
  sourceType: string | null;
  sourceId: string | null;
  reason: string | null;
  notes: string | null;
  occurredAt: string;
  createdAt: string;
}

/** One paginated current-stock response. */
export interface InventoryStockPage {
  items: InventoryStockItem[];
  page: number;
  pageSize: number;
  total: number;
}

/** One paginated stock-movement response. */
export interface ProductMovementPage {
  items: StockMovement[];
  page: number;
  pageSize: number;
  total: number;
}

/** Filters accepted by GET /inventory/stock. */
export interface InventoryStockFilters {
  search?: string;
  lowStock?: boolean;
  page?: number;
  pageSize?: number;
}

/** Filters accepted by the product movement-history route. */
export interface ProductMovementFilters {
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

/** One item accepted by the opening-stock route. */
export interface OpeningStockItemInput {
  productId: string;
  productSku: string;
  productName: string;
  baseUnitName: string;
  stockCondition: StockCondition;
  quantity: string;
  unitCost: string;
}

/** Fields accepted when creating setup opening stock. */
export interface CreateOpeningStockInput {
  items: OpeningStockItemInput[];
  notes?: string | null;
}

/** Fields accepted when creating one manual stock adjustment. */
export interface CreateInventoryAdjustmentInput {
  productId: string;
  stockCondition: StockCondition;
  direction: StockDirection;
  quantity: string;
  reason: InventoryAdjustmentReason;
  unitCost?: string;
  notes?: string | null;
}

/** One item accepted by a draft stock count. */
export interface StockCountItemInput {
  productId: string;
  stockCondition: StockCondition;
  countedQuantity: string;
}

/** Fields accepted when creating a draft stock count. */
export interface CreateStockCountInput {
  countDate: string;
  notes?: string | null;
  items: StockCountItemInput[];
}

/** Fields accepted when updating a draft stock count. */
export interface UpdateStockCountInput {
  notes?: string | null;
  items?: StockCountItemInput[];
}

/** Filters accepted by GET /inventory/counts. */
export interface StockCountListFilters {
  status?: StockCountStatus;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

/** One stock-count header returned by the API. */
export interface StockCount {
  id: string;
  countNumber: string;
  countDate: string;
  status: StockCountStatus;
  notes: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One saved stock-count item returned by the API. */
export interface StockCountItem {
  id: string;
  stockCountId: string;
  productId: string;
  productSku: string;
  productName: string;
  baseUnitName: string;
  stockCondition: StockCondition;
  systemQuantity: string;
  countedQuantity: string;
  differenceQuantity: string;
  createdAt: string;
  updatedAt: string;
}

/** One paginated stock-count list response. */
export interface StockCountPage {
  items: StockCount[];
  page: number;
  pageSize: number;
  total: number;
}

/** One stock-count detail response. */
export interface StockCountDetail {
  stockCount: StockCount;
  items: StockCountItem[];
  movements?: StockMovement[];
}

/** Adds one non-empty text query parameter. */
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

/** Adds shared pagination fields to a query string. */
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

/** Converts URL parameters into an optional query string. */
function queryString(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Builds the approved current-stock list query. */
function buildInventoryStockQuery(filters: InventoryStockFilters): string {
  const params = new URLSearchParams();
  addTextFilter(params, "search", filters.search);

  if (filters.lowStock !== undefined) {
    params.set("lowStock", String(filters.lowStock));
  }

  addPagination(params, filters);
  return queryString(params);
}

/** Builds the approved product movement-history query. */
function buildMovementQuery(filters: ProductMovementFilters): string {
  const params = new URLSearchParams();
  addTextFilter(params, "startDate", filters.startDate);
  addTextFilter(params, "endDate", filters.endDate);
  addPagination(params, filters);
  return queryString(params);
}

/** Builds the approved stock-count list query. */
function buildStockCountQuery(filters: StockCountListFilters): string {
  const params = new URLSearchParams();

  if (filters.status) {
    params.set("status", filters.status);
  }

  addTextFilter(params, "startDate", filters.startDate);
  addTextFilter(params, "endDate", filters.endDate);
  addPagination(params, filters);
  return queryString(params);
}

/** Loads current inventory stock with approved filters. */
export async function loadInventoryStock(
  filters: InventoryStockFilters = {},
): Promise<ApiSuccess<InventoryStockPage>> {
  return requestApi<ApiSuccess<InventoryStockPage>>(
    `/inventory/stock${buildInventoryStockQuery(filters)}`,
  );
}

/** Loads one product's immutable stock movement history. */
export async function loadProductMovements(
  productId: string,
  filters: ProductMovementFilters = {},
): Promise<ApiSuccess<ProductMovementPage>> {
  return requestApi<ApiSuccess<ProductMovementPage>>(
    `/inventory/products/${productId}/movements${buildMovementQuery(filters)}`,
  );
}

/** Creates setup opening stock. */
export async function createOpeningStock(
  input: CreateOpeningStockInput,
  idempotencyKey: string,
): Promise<ApiSuccess<unknown>> {
  return requestApi<ApiSuccess<unknown>>("/inventory/opening-stock", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}

/** Creates one manual inventory adjustment. */
export async function createInventoryAdjustment(
  input: CreateInventoryAdjustmentInput,
  idempotencyKey: string,
): Promise<ApiSuccess<unknown>> {
  return requestApi<ApiSuccess<unknown>>("/inventory/adjustments", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}

/** Loads stock-count headers with approved filters. */
export async function loadStockCounts(
  filters: StockCountListFilters = {},
): Promise<ApiSuccess<StockCountPage>> {
  return requestApi<ApiSuccess<StockCountPage>>(
    `/inventory/counts${buildStockCountQuery(filters)}`,
  );
}

/** Creates one draft stock count. */
export async function createStockCount(
  input: CreateStockCountInput,
): Promise<ApiSuccess<StockCountDetail>> {
  return requestApi<ApiSuccess<StockCountDetail>>("/inventory/counts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Loads one stock count with all saved items. */
export async function loadStockCount(
  stockCountId: string,
): Promise<ApiSuccess<StockCountDetail>> {
  return requestApi<ApiSuccess<StockCountDetail>>(
    `/inventory/counts/${stockCountId}`,
  );
}

/** Updates one draft stock count. */
export async function updateStockCount(
  stockCountId: string,
  input: UpdateStockCountInput,
): Promise<ApiSuccess<StockCountDetail>> {
  return requestApi<ApiSuccess<StockCountDetail>>(
    `/inventory/counts/${stockCountId}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

/** Confirms one draft stock count. */
export async function confirmStockCount(
  stockCountId: string,
  idempotencyKey: string,
): Promise<ApiSuccess<StockCountDetail>> {
  return requestApi<ApiSuccess<StockCountDetail>>(
    `/inventory/counts/${stockCountId}/confirm`,
    { method: "POST", headers: { "Idempotency-Key": idempotencyKey } },
  );
}
