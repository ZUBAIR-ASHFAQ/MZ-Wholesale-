import { requestApi } from "../../../lib/api-client.ts";
import type { ApiSuccess } from "../../../lib/api-types.ts";

/** One product category returned by the API. */
export interface ProductCategory {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One optional product brand returned by the API. */
export interface Brand {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One unit that can be used when buying or selling a product. */
export interface ProductUnit {
  id: string;
  productId: string;
  unitName: string;
  conversionToBase: string;
  isBaseUnit: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One product row shown in the paginated product list. */
export interface ProductSummary {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  categoryId: string;
  categoryName: string;
  brandId: string | null;
  brandName: string | null;
  baseUnitName: string;
  reorderLevel: string;
  referencePurchasePrice: string | null;
  referenceSalePrice: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One product with all of its allowed units. */
export interface ProductDetail extends ProductSummary {
  units: ProductUnit[];
}

/** One page returned by GET /products. */
export interface PaginatedProducts {
  items: ProductSummary[];
  total: number;
}

/** Filters accepted by GET /products. */
export interface ProductListFilters {
  search?: string;
  barcode?: string;
  categoryId?: string;
  active?: boolean;
  page?: number;
  pageSize?: number;
}

/** One additional unit submitted with a product. */
export interface ProductUnitInput {
  id?: string;
  unitName: string;
  conversionToBase: string;
  isActive?: boolean;
}

/** Fields required to create a product. */
export interface CreateProductInput {
  sku: string;
  barcode?: string | null;
  name: string;
  categoryId: string;
  brandId?: string | null;
  baseUnitName: string;
  reorderLevel?: string;
  referencePurchasePrice?: string | null;
  referenceSalePrice?: string | null;
  units?: ProductUnitInput[];
}

/** Fields that may be changed on an existing product. */
export interface UpdateProductInput {
  sku?: string;
  barcode?: string | null;
  name?: string;
  categoryId?: string;
  brandId?: string | null;
  baseUnitName?: string;
  reorderLevel?: string;
  referencePurchasePrice?: string | null;
  referenceSalePrice?: string | null;
  isActive?: boolean;
  units?: ProductUnitInput[];
}

/** Fields required to create a category. */
export interface CreateCategoryInput {
  name: string;
}

/** Fields that may be changed on a category. */
export interface UpdateCategoryInput {
  name?: string;
  isActive?: boolean;
}

/** Fields required to create a brand. */
export interface CreateBrandInput {
  name: string;
}

/** Fields that may be changed on a brand. */
export interface UpdateBrandInput {
  name?: string;
  isActive?: boolean;
}

/** Adds one optional text query parameter when it has a useful value. */
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

/** Builds the query string accepted by the product list route. */
function buildProductListQuery(filters: ProductListFilters): string {
  const params = new URLSearchParams();

  addTextFilter(params, "search", filters.search);
  addTextFilter(params, "barcode", filters.barcode);
  addTextFilter(params, "categoryId", filters.categoryId);

  if (filters.active !== undefined) {
    params.set("active", String(filters.active));
  }

  if (filters.page !== undefined) {
    params.set("page", String(filters.page));
  }

  if (filters.pageSize !== undefined) {
    params.set("pageSize", String(filters.pageSize));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Loads one filtered page of products. */
export async function loadProducts(
  filters: ProductListFilters = {},
): Promise<ApiSuccess<PaginatedProducts>> {
  return requestApi<ApiSuccess<PaginatedProducts>>(
    `/products${buildProductListQuery(filters)}`,
  );
}

/** Loads one product with all allowed units. */
export async function loadProduct(
  productId: string,
): Promise<ApiSuccess<ProductDetail>> {
  return requestApi<ApiSuccess<ProductDetail>>(`/products/${productId}`);
}

/** Creates one product and its base and additional units. */
export async function createProduct(
  input: CreateProductInput,
): Promise<ApiSuccess<ProductDetail>> {
  return requestApi<ApiSuccess<ProductDetail>>("/products", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Updates the allowed fields of one product. */
export async function updateProduct(
  productId: string,
  input: UpdateProductInput,
): Promise<ApiSuccess<ProductDetail>> {
  return requestApi<ApiSuccess<ProductDetail>>(`/products/${productId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** Loads all product categories. */
export async function loadProductCategories(): Promise<
  ApiSuccess<ProductCategory[]>
> {
  return requestApi<ApiSuccess<ProductCategory[]>>("/product-categories");
}

/** Creates one product category. */
export async function createProductCategory(
  input: CreateCategoryInput,
): Promise<ApiSuccess<ProductCategory>> {
  return requestApi<ApiSuccess<ProductCategory>>("/product-categories", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Renames or activates/deactivates one product category. */
export async function updateProductCategory(
  categoryId: string,
  input: UpdateCategoryInput,
): Promise<ApiSuccess<ProductCategory>> {
  return requestApi<ApiSuccess<ProductCategory>>(
    `/product-categories/${categoryId}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

/** Loads all brands. */
export async function loadBrands(): Promise<ApiSuccess<Brand[]>> {
  return requestApi<ApiSuccess<Brand[]>>("/brands");
}

/** Creates one brand. */
export async function createBrand(
  input: CreateBrandInput,
): Promise<ApiSuccess<Brand>> {
  return requestApi<ApiSuccess<Brand>>("/brands", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Renames or activates/deactivates one brand. */
export async function updateBrand(
  brandId: string,
  input: UpdateBrandInput,
): Promise<ApiSuccess<Brand>> {
  return requestApi<ApiSuccess<Brand>>(`/brands/${brandId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
