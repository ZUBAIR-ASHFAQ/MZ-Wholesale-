import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  brands,
  inventoryBalances,
  productCategories,
  products,
  productUnits,
  stockCountItems,
  stockCounts,
  stockMovements,
} from "../../database/schema/index.js";
import type {
  ListInventoryQuery,
  ListProductMovementsQuery,
  ListStockCountsQuery,
} from "./inventory.schema.js";

/** Contains the database methods used by the Inventory repository. */
export type InventoryDatabase = Pick<
  NodePgDatabase,
  "select" | "insert" | "update" | "delete" | "execute"
>;

/** Represents one saved inventory-balance row. */
export type InventoryBalanceRecord = typeof inventoryBalances.$inferSelect;

/** Contains the fields needed to create one inventory-balance row. */
export type NewInventoryBalance = typeof inventoryBalances.$inferInsert;

/** Represents the product fields required by Inventory workflows. */
export interface InventoryProductRecord {
  id: string;
  isActive: boolean;
}

/** Contains the inventory-balance fields that may be changed internally. */
export interface InventoryBalanceChanges {
  sellableQuantityOnHand?: string;
  damagedQuantityOnHand?: string;
  expiredQuantityOnHand?: string;
  weightedAverageCost?: string;
}

/** Represents one saved immutable stock-movement row. */
export type StockMovementRecord = typeof stockMovements.$inferSelect;

/** Contains the fields needed to create one immutable stock movement. */
export type NewStockMovement = typeof stockMovements.$inferInsert;

/** Builds the approved date filters for one product's movement history. */
function buildProductMovementFilters(
  productId: string,
  query: ListProductMovementsQuery,
): SQL[] {
  const filters: SQL[] = [eq(stockMovements.productId, productId)];

  if (query.startDate) {
    filters.push(
      sql`timezone('Asia/Karachi', ${stockMovements.occurredAt})::date >= ${query.startDate}::date`,
    );
  }

  if (query.endDate) {
    filters.push(
      sql`timezone('Asia/Karachi', ${stockMovements.occurredAt})::date <= ${query.endDate}::date`,
    );
  }

  return filters;
}

/** Represents one row shown on the current-stock screen. */
export interface InventoryStockRecord {
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

/** Builds Inventory stock-list filters from the approved query fields. */
function buildInventoryFilters(query: ListInventoryQuery): SQL[] {
  const filters: SQL[] = [];

  if (query.search) {
    const searchPattern = `%${query.search}%`;
    const searchFilter = or(
      ilike(products.sku, searchPattern),
      ilike(products.barcode, searchPattern),
      ilike(products.name, searchPattern),
      ilike(productCategories.name, searchPattern),
      ilike(brands.name, searchPattern),
    );

    if (searchFilter) {
      filters.push(searchFilter);
    }
  }

  if (query.lowStock === true) {
    filters.push(
      lte(
        sql`coalesce(${inventoryBalances.sellableQuantityOnHand}, 0.000)`,
        products.reorderLevel,
      ),
    );
  }

  return filters;
}

/** Returns the selected fields used by the current-stock list query. */
function inventoryStockSelection() {
  return {
    productId: products.id,
    sku: products.sku,
    productName: products.name,
    isActive: products.isActive,
    categoryName: productCategories.name,
    brandName: brands.name,
    baseUnitName: productUnits.unitName,
    reorderLevel: products.reorderLevel,
    sellableQuantity: sql<string>`coalesce(${inventoryBalances.sellableQuantityOnHand}, 0.000)`,
    damagedQuantity: sql<string>`coalesce(${inventoryBalances.damagedQuantityOnHand}, 0.000)`,
    expiredQuantity: sql<string>`coalesce(${inventoryBalances.expiredQuantityOnHand}, 0.000)`,
    weightedAverageCost: sql<string>`coalesce(${inventoryBalances.weightedAverageCost}, 0.00)`,
    isLowStock: sql<boolean>`coalesce(${inventoryBalances.sellableQuantityOnHand}, 0.000) <= ${products.reorderLevel}`,
  };
}

/** Lists current stock with product details, approved filters and pagination. */
export async function listInventoryBalances(
  database: InventoryDatabase,
  query: ListInventoryQuery,
): Promise<InventoryStockRecord[]> {
  const filters = buildInventoryFilters(query);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;

  return database
    .select(inventoryStockSelection())
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
    .leftJoin(inventoryBalances, eq(inventoryBalances.productId, products.id))
    .where(where)
    .orderBy(asc(products.name), asc(products.sku), asc(products.id))
    .limit(query.pageSize)
    .offset(offset);
}

/** Counts products matching the same filters used by the current-stock list. */
export async function countInventoryBalances(
  database: InventoryDatabase,
  query: ListInventoryQuery,
): Promise<number> {
  const filters = buildInventoryFilters(query);
  const where = filters.length > 0 ? and(...filters) : undefined;

  const rows = await database
    .select({ total: count() })
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
    .leftJoin(inventoryBalances, eq(inventoryBalances.productId, products.id))
    .where(where);

  return rows[0]?.total ?? 0;
}

/** Reads the product fields required before an Inventory mutation. */
export async function findInventoryProductById(
  database: InventoryDatabase,
  productId: string,
): Promise<InventoryProductRecord | null> {
  const rows = await database
    .select({ id: products.id, isActive: products.isActive })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  return rows[0] ?? null;
}

/** Serializes stock changes for one product inside the current transaction. */
export async function acquireInventoryProductLock(
  database: InventoryDatabase,
  productId: string,
): Promise<void> {
  await database.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`inventory:${productId}`}, 0))`,
  );
}

/** Reads one inventory balance by its product UUID. */
export async function findInventoryBalanceByProductId(
  database: InventoryDatabase,
  productId: string,
): Promise<InventoryBalanceRecord | null> {
  const rows = await database
    .select()
    .from(inventoryBalances)
    .where(eq(inventoryBalances.productId, productId))
    .limit(1);

  return rows[0] ?? null;
}

/** Creates one inventory balance and returns the saved row. */
export async function createInventoryBalance(
  database: InventoryDatabase,
  input: NewInventoryBalance,
): Promise<InventoryBalanceRecord | null> {
  const rows = await database
    .insert(inventoryBalances)
    .values(input)
    .returning();

  return rows[0] ?? null;
}

/** Locks one product balance before a transaction calculates a stock change. */
export async function lockInventoryBalanceByProductId(
  database: InventoryDatabase,
  productId: string,
): Promise<InventoryBalanceRecord | null> {
  const rows = await database
    .select()
    .from(inventoryBalances)
    .where(eq(inventoryBalances.productId, productId))
    .for("update")
    .limit(1);

  return rows[0] ?? null;
}

/** Updates one locked inventory balance and refreshes its update timestamp. */
export async function updateInventoryBalance(
  database: InventoryDatabase,
  productId: string,
  changes: InventoryBalanceChanges,
): Promise<InventoryBalanceRecord | null> {
  const rows = await database
    .update(inventoryBalances)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(inventoryBalances.productId, productId))
    .returning();

  return rows[0] ?? null;
}

/** Creates one immutable stock movement and returns the saved row. */
export async function createStockMovement(
  database: InventoryDatabase,
  input: NewStockMovement,
): Promise<StockMovementRecord | null> {
  const rows = await database
    .insert(stockMovements)
    .values(input)
    .returning();

  return rows[0] ?? null;
}

/** Lists one product's immutable stock movements with date filters and pagination. */
export async function listProductMovements(
  database: InventoryDatabase,
  productId: string,
  query: ListProductMovementsQuery,
): Promise<StockMovementRecord[]> {
  const filters = buildProductMovementFilters(productId, query);
  const offset = (query.page - 1) * query.pageSize;

  return database
    .select()
    .from(stockMovements)
    .where(and(...filters))
    .orderBy(
      desc(stockMovements.occurredAt),
      desc(stockMovements.createdAt),
      desc(stockMovements.id),
    )
    .limit(query.pageSize)
    .offset(offset);
}

/** Counts one product's movements using the same approved date filters. */
export async function countProductMovements(
  database: InventoryDatabase,
  productId: string,
  query: ListProductMovementsQuery,
): Promise<number> {
  const filters = buildProductMovementFilters(productId, query);
  const rows = await database
    .select({ total: count() })
    .from(stockMovements)
    .where(and(...filters));

  return rows[0]?.total ?? 0;
}

/** Checks whether a product has any movement other than setup opening stock. */
export async function hasNormalProductTransactions(
  database: InventoryDatabase,
  productId: string,
): Promise<boolean> {
  const rows = await database
    .select({ id: stockMovements.id })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.productId, productId),
        ne(stockMovements.movementType, "OPENING_STOCK"),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

/** Represents one saved physical stock-count header. */
export type StockCountRecord = typeof stockCounts.$inferSelect;

/** Contains the fields needed to create one stock-count header. */
export type NewStockCount = typeof stockCounts.$inferInsert;

/** Represents one saved physical stock-count item row. */
export type StockCountItemRecord = typeof stockCountItems.$inferSelect;

/** Represents one stock-count item together with product display fields. */
export interface StockCountItemDetail extends StockCountItemRecord {
  productSku: string;
  productName: string;
  baseUnitName: string;
}

/** Contains the fields needed to create one stock-count item. */
export type NewStockCountItem = typeof stockCountItems.$inferInsert;

/** Contains the editable fields for one draft stock-count header. */
export interface StockCountChanges {
  countDate?: string;
  notes?: string | null;
}

/** Builds the approved filters for the stock-count list. */
function buildStockCountFilters(query: ListStockCountsQuery): SQL[] {
  const filters: SQL[] = [];

  if (query.status) {
    filters.push(eq(stockCounts.status, query.status));
  }

  if (query.startDate) {
    filters.push(sql`${stockCounts.countDate} >= ${query.startDate}::date`);
  }

  if (query.endDate) {
    filters.push(sql`${stockCounts.countDate} <= ${query.endDate}::date`);
  }

  return filters;
}

/** Lists stock-count headers with approved filters and pagination. */
export async function listStockCounts(
  database: InventoryDatabase,
  query: ListStockCountsQuery,
): Promise<StockCountRecord[]> {
  const filters = buildStockCountFilters(query);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;

  return database
    .select()
    .from(stockCounts)
    .where(where)
    .orderBy(
      desc(stockCounts.countDate),
      desc(stockCounts.createdAt),
      desc(stockCounts.id),
    )
    .limit(query.pageSize)
    .offset(offset);
}

/** Counts stock-count headers using the same approved filters. */
export async function countStockCounts(
  database: InventoryDatabase,
  query: ListStockCountsQuery,
): Promise<number> {
  const filters = buildStockCountFilters(query);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const rows = await database
    .select({ total: count() })
    .from(stockCounts)
    .where(where);

  return rows[0]?.total ?? 0;
}

/** Reads one stock-count header by UUID. */
export async function findStockCountById(
  database: InventoryDatabase,
  stockCountId: string,
): Promise<StockCountRecord | null> {
  const rows = await database
    .select()
    .from(stockCounts)
    .where(eq(stockCounts.id, stockCountId))
    .limit(1);

  return rows[0] ?? null;
}

/** Lists saved count items with the product fields needed by the UI. */
export async function findStockCountItems(
  database: InventoryDatabase,
  stockCountId: string,
): Promise<StockCountItemDetail[]> {
  return database
    .select({
      id: stockCountItems.id,
      stockCountId: stockCountItems.stockCountId,
      productId: stockCountItems.productId,
      productSku: products.sku,
      productName: products.name,
      baseUnitName: productUnits.unitName,
      stockCondition: stockCountItems.stockCondition,
      systemQuantity: stockCountItems.systemQuantity,
      countedQuantity: stockCountItems.countedQuantity,
      differenceQuantity: stockCountItems.differenceQuantity,
      createdAt: stockCountItems.createdAt,
      updatedAt: stockCountItems.updatedAt,
    })
    .from(stockCountItems)
    .innerJoin(products, eq(stockCountItems.productId, products.id))
    .innerJoin(
      productUnits,
      and(
        eq(productUnits.productId, products.id),
        eq(productUnits.isBaseUnit, true),
      ),
    )
    .where(eq(stockCountItems.stockCountId, stockCountId))
    .orderBy(
      asc(products.name),
      asc(products.sku),
      asc(stockCountItems.stockCondition),
      asc(stockCountItems.id),
    );
}

/** Creates one draft stock-count header and returns the saved row. */
export async function createStockCount(
  database: InventoryDatabase,
  input: NewStockCount,
): Promise<StockCountRecord | null> {
  const rows = await database
    .insert(stockCounts)
    .values(input)
    .returning();

  return rows[0] ?? null;
}

/** Creates all item rows for one draft stock count. */
export async function createStockCountItems(
  database: InventoryDatabase,
  inputs: NewStockCountItem[],
): Promise<StockCountItemRecord[]> {
  if (inputs.length === 0) {
    return [];
  }

  return database
    .insert(stockCountItems)
    .values(inputs)
    .returning();
}

/** Updates editable fields on one draft stock-count header. */
export async function updateStockCount(
  database: InventoryDatabase,
  stockCountId: string,
  changes: StockCountChanges,
): Promise<StockCountRecord | null> {
  const rows = await database
    .update(stockCounts)
    .set({ ...changes, updatedAt: new Date() })
    .where(
      and(
        eq(stockCounts.id, stockCountId),
        eq(stockCounts.status, "DRAFT"),
      ),
    )
    .returning();

  return rows[0] ?? null;
}

/** Replaces items after the caller locks the header and verifies DRAFT status. */
export async function replaceItemsForLockedDraftCount(
  database: InventoryDatabase,
  stockCountId: string,
  inputs: NewStockCountItem[],
): Promise<StockCountItemRecord[]> {
  await database
    .delete(stockCountItems)
    .where(eq(stockCountItems.stockCountId, stockCountId));

  return createStockCountItems(database, inputs);
}

/** Locks one stock-count header before an edit or confirmation workflow. */
export async function lockStockCountById(
  database: InventoryDatabase,
  stockCountId: string,
): Promise<StockCountRecord | null> {
  const rows = await database
    .select()
    .from(stockCounts)
    .where(eq(stockCounts.id, stockCountId))
    .for("update")
    .limit(1);

  return rows[0] ?? null;
}

/** Updates the final system and difference snapshots for one stock-count item. */
export async function updateStockCountItemSnapshot(
  database: InventoryDatabase,
  stockCountItemId: string,
  input: {
    systemQuantity: string;
    differenceQuantity: string;
  },
): Promise<StockCountItemRecord | null> {
  const rows = await database
    .update(stockCountItems)
    .set({
      systemQuantity: input.systemQuantity,
      differenceQuantity: input.differenceQuantity,
      updatedAt: new Date(),
    })
    .where(eq(stockCountItems.id, stockCountItemId))
    .returning();

  return rows[0] ?? null;
}

/** Marks one draft stock count as confirmed inside the current transaction. */
export async function markStockCountConfirmed(
  database: InventoryDatabase,
  stockCountId: string,
  confirmedAt: Date,
): Promise<StockCountRecord | null> {
  const rows = await database
    .update(stockCounts)
    .set({
      status: "CONFIRMED",
      confirmedAt,
      updatedAt: confirmedAt,
    })
    .where(
      and(
        eq(stockCounts.id, stockCountId),
        eq(stockCounts.status, "DRAFT"),
      ),
    )
    .returning();

  return rows[0] ?? null;
}

