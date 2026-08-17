import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  brands,
  productCategories,
  products,
  productUnits,
} from "../../database/schema/index.js";
import type { ListProductsQuery } from "./products.schema.js";

/** Contains the database methods used by the Product repository. */
export type ProductsDatabase = Pick<
  NodePgDatabase,
  "select" | "insert" | "update"
>;

/** Represents one saved category row. */
export type ProductCategoryRecord = typeof productCategories.$inferSelect;

/** Represents one saved brand row. */
export type BrandRecord = typeof brands.$inferSelect;

/** Represents one saved product row. */
export type ProductRecord = typeof products.$inferSelect;

/** Represents one saved product-unit row. */
export type ProductUnitRecord = typeof productUnits.$inferSelect;

/** Contains fields needed to create a category. */
export type NewProductCategory = typeof productCategories.$inferInsert;

/** Contains fields that may be changed on a category. */
export interface ProductCategoryChanges {
  name?: string;
  isActive?: boolean;
}

/** Contains fields needed to create a brand. */
export type NewBrand = typeof brands.$inferInsert;

/** Contains fields that may be changed on a brand. */
export interface BrandChanges {
  name?: string;
  isActive?: boolean;
}

/** Contains fields needed to create a product. */
export type NewProduct = typeof products.$inferInsert;

/** Contains fields that may be changed on a product. */
export interface ProductChanges {
  sku?: string;
  barcode?: string | null;
  name?: string;
  categoryId?: string;
  brandId?: string | null;
  reorderLevel?: string;
  referencePurchasePrice?: string | null;
  referenceSalePrice?: string | null;
  isActive?: boolean;
}

/** Contains fields needed to create one product unit. */
export type NewProductUnit = typeof productUnits.$inferInsert;

/** Contains fields that may be changed on one product unit. */
export interface ProductUnitChanges {
  unitName?: string;
  conversionToBase?: string;
  isActive?: boolean;
}

/** Represents one product row shown in the paginated product list. */
export interface ProductListRecord {
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
  createdAt: Date;
  updatedAt: Date;
}

/** Contains one page of product records and the matching total count. */
export interface PaginatedProductRecords {
  items: ProductListRecord[];
  total: number;
}

/** Represents a product with its category, optional brand and allowed units. */
export interface ProductDetailRecord extends ProductListRecord {
  units: ProductUnitRecord[];
}

/** Builds the approved list filters without adding business decisions. */
function buildProductFilters(query: ListProductsQuery): SQL[] {
  const filters: SQL[] = [];

  if (query.barcode) {
    filters.push(eq(products.barcode, query.barcode));
  }

  if (query.categoryId) {
    filters.push(eq(products.categoryId, query.categoryId));
  }

  if (query.active !== undefined) {
    filters.push(eq(products.isActive, query.active));
  }

  if (query.search) {
    const searchPattern = `%${query.search}%`;
    const searchFilter = or(
      ilike(products.name, searchPattern),
      ilike(products.sku, searchPattern),
    );

    if (searchFilter) {
      filters.push(searchFilter);
    }
  }

  return filters;
}

/** Returns the shared product-list selection used by list and detail reads. */
function productListSelection() {
  return {
    id: products.id,
    sku: products.sku,
    barcode: products.barcode,
    name: products.name,
    categoryId: products.categoryId,
    categoryName: productCategories.name,
    brandId: products.brandId,
    brandName: brands.name,
    baseUnitName: productUnits.unitName,
    reorderLevel: products.reorderLevel,
    referencePurchasePrice: products.referencePurchasePrice,
    referenceSalePrice: products.referenceSalePrice,
    isActive: products.isActive,
    createdAt: products.createdAt,
    updatedAt: products.updatedAt,
  };
}

/** Lists products with approved filters, deterministic sorting and pagination. */
export async function listProducts(
  database: ProductsDatabase,
  query: ListProductsQuery,
): Promise<PaginatedProductRecords> {
  const filters = buildProductFilters(query);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;

  const items = await database
    .select(productListSelection())
    .from(products)
    .innerJoin(productCategories, eq(products.categoryId, productCategories.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .innerJoin(
      productUnits,
      and(
        eq(productUnits.productId, products.id),
        eq(productUnits.isBaseUnit, true),
      ),
    )
    .where(where)
    .orderBy(asc(products.name), asc(products.id))
    .limit(query.pageSize)
    .offset(offset);

  const totalRows = await database
    .select({ total: count() })
    .from(products)
    .where(where);

  return {
    items,
    total: totalRows[0]?.total ?? 0,
  };
}

/** Reads one product with its category, optional brand and allowed units. */
export async function findProductById(
  database: ProductsDatabase,
  productId: string,
): Promise<ProductDetailRecord | null> {
  const rows = await database
    .select(productListSelection())
    .from(products)
    .innerJoin(productCategories, eq(products.categoryId, productCategories.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .innerJoin(
      productUnits,
      and(
        eq(productUnits.productId, products.id),
        eq(productUnits.isBaseUnit, true),
      ),
    )
    .where(eq(products.id, productId))
    .limit(1);

  const product = rows[0];

  if (!product) {
    return null;
  }

  const units = await findProductUnits(database, productId);
  return { ...product, units };
}

/** Reads one product by its normalized unique SKU. */
export async function findProductBySku(
  database: ProductsDatabase,
  sku: string,
): Promise<ProductRecord | null> {
  const rows = await database
    .select()
    .from(products)
    .where(eq(sql`lower(trim(${products.sku}))`, sku.trim().toLowerCase()))
    .limit(1);

  return rows[0] ?? null;
}

/** Reads one product by its exact non-null barcode. */
export async function findProductByBarcode(
  database: ProductsDatabase,
  barcode: string,
): Promise<ProductRecord | null> {
  const rows = await database
    .select()
    .from(products)
    .where(eq(products.barcode, barcode))
    .limit(1);

  return rows[0] ?? null;
}

/** Creates one product row and returns the saved database record. */
export async function createProduct(
  database: ProductsDatabase,
  input: NewProduct,
): Promise<ProductRecord | null> {
  const rows = await database.insert(products).values(input).returning();
  return rows[0] ?? null;
}

/** Updates allowed product fields and refreshes the update timestamp. */
export async function updateProduct(
  database: ProductsDatabase,
  productId: string,
  changes: ProductChanges,
): Promise<ProductRecord | null> {
  const rows = await database
    .update(products)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(products.id, productId))
    .returning();

  return rows[0] ?? null;
}

/** Reads one product unit by UUID and verifies that it belongs to the requested product. */
export async function findProductUnitById(
  database: ProductsDatabase,
  productId: string,
  unitId: string,
): Promise<ProductUnitRecord | null> {
  const rows = await database
    .select()
    .from(productUnits)
    .where(
      and(
        eq(productUnits.id, unitId),
        eq(productUnits.productId, productId),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/** Reads all units for one product with the base unit first. */
async function findProductUnits(
  database: ProductsDatabase,
  productId: string,
): Promise<ProductUnitRecord[]> {
  return database
    .select()
    .from(productUnits)
    .where(eq(productUnits.productId, productId))
    .orderBy(
      desc(productUnits.isBaseUnit),
      asc(productUnits.unitName),
      asc(productUnits.id),
    );
}

/** Creates one or more units for a product. */
export async function createProductUnits(
  database: ProductsDatabase,
  units: NewProductUnit[],
): Promise<ProductUnitRecord[]> {
  if (units.length === 0) {
    return [];
  }

  return database.insert(productUnits).values(units).returning();
}

/** Updates one existing product unit. */
export async function updateProductUnit(
  database: ProductsDatabase,
  productId: string,
  unitId: string,
  changes: ProductUnitChanges,
): Promise<ProductUnitRecord | null> {
  const rows = await database
    .update(productUnits)
    .set({ ...changes, updatedAt: new Date() })
    .where(
      and(
        eq(productUnits.id, unitId),
        eq(productUnits.productId, productId),
      ),
    )
    .returning();

  return rows[0] ?? null;
}

/** Lists categories in stable name order. */
export async function listCategories(
  database: ProductsDatabase,
): Promise<ProductCategoryRecord[]> {
  return database
    .select()
    .from(productCategories)
    .orderBy(asc(productCategories.name), asc(productCategories.id));
}

/** Reads one category by UUID. */
export async function findCategoryById(
  database: ProductsDatabase,
  categoryId: string,
): Promise<ProductCategoryRecord | null> {
  const rows = await database
    .select()
    .from(productCategories)
    .where(eq(productCategories.id, categoryId))
    .limit(1);

  return rows[0] ?? null;
}

/** Reads one category by its case-insensitive unique name. */
export async function findCategoryByName(
  database: ProductsDatabase,
  name: string,
): Promise<ProductCategoryRecord | null> {
  const rows = await database
    .select()
    .from(productCategories)
    .where(
      eq(
        sql`lower(trim(${productCategories.name}))`,
        name.trim().toLowerCase(),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/** Creates one product category. */
export async function createCategory(
  database: ProductsDatabase,
  input: NewProductCategory,
): Promise<ProductCategoryRecord | null> {
  const rows = await database
    .insert(productCategories)
    .values(input)
    .returning();

  return rows[0] ?? null;
}

/** Renames or activates/deactivates one product category. */
export async function updateCategory(
  database: ProductsDatabase,
  categoryId: string,
  changes: ProductCategoryChanges,
): Promise<ProductCategoryRecord | null> {
  const rows = await database
    .update(productCategories)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(productCategories.id, categoryId))
    .returning();

  return rows[0] ?? null;
}

/** Lists brands in stable name order. */
export async function listBrands(
  database: ProductsDatabase,
): Promise<BrandRecord[]> {
  return database
    .select()
    .from(brands)
    .orderBy(asc(brands.name), asc(brands.id));
}

/** Reads one brand by UUID. */
export async function findBrandById(
  database: ProductsDatabase,
  brandId: string,
): Promise<BrandRecord | null> {
  const rows = await database
    .select()
    .from(brands)
    .where(eq(brands.id, brandId))
    .limit(1);

  return rows[0] ?? null;
}

/** Reads one brand by its case-insensitive unique name. */
export async function findBrandByName(
  database: ProductsDatabase,
  name: string,
): Promise<BrandRecord | null> {
  const rows = await database
    .select()
    .from(brands)
    .where(
      eq(sql`lower(trim(${brands.name}))`, name.trim().toLowerCase()),
    )
    .limit(1);

  return rows[0] ?? null;
}

/** Creates one brand. */
export async function createBrand(
  database: ProductsDatabase,
  input: NewBrand,
): Promise<BrandRecord | null> {
  const rows = await database.insert(brands).values(input).returning();
  return rows[0] ?? null;
}

/** Renames or activates/deactivates one brand. */
export async function updateBrand(
  database: ProductsDatabase,
  brandId: string,
  changes: BrandChanges,
): Promise<BrandRecord | null> {
  const rows = await database
    .update(brands)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(brands.id, brandId))
    .returning();

  return rows[0] ?? null;
}
