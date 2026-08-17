import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  cashBankMovements,
  purchases,
  purchaseReturns,
  stockMovements,
  supplierPaymentAllocations,
  supplierPayments,
  suppliers,
} from "../../database/schema/index.js";
import type { ListSuppliersQuery, SupplierOpenPurchasesQuery } from "./suppliers.schema.js";

/** Contains the database methods used by the Supplier repository. */
export type SuppliersDatabase = Pick<NodePgDatabase, "select" | "insert" | "update"> & {
  transaction?: NodePgDatabase["transaction"];
};

/** Represents one supplier row saved in PostgreSQL. */
export type SupplierRecord = typeof suppliers.$inferSelect;

/** Contains the fields needed to create one supplier row. */
export type NewSupplier = typeof suppliers.$inferInsert;

/** Contains the supplier fields that may be changed. */
export interface SupplierChanges {
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxId?: string | null;
  isActive?: boolean;
}

/** Contains one page of supplier records and the matching total count. */
export interface PaginatedSupplierRecords {
  items: SupplierRecord[];
  total: number;
}

/** Builds supplier-list filters from the approved query fields. */
function buildSupplierFilters(query: ListSuppliersQuery): SQL[] {
  const filters: SQL[] = [];

  if (query.active !== undefined) {
    filters.push(eq(suppliers.isActive, query.active));
  }

  if (query.search) {
    const searchPattern = `%${query.search}%`;
    const searchFilter = or(
      ilike(suppliers.code, searchPattern),
      ilike(suppliers.name, searchPattern),
      ilike(suppliers.phone, searchPattern),
    );

    if (searchFilter) {
      filters.push(searchFilter);
    }
  }

  return filters;
}

/** Lists suppliers using search, active status and pagination. */
export async function listSuppliers(
  database: SuppliersDatabase,
  query: ListSuppliersQuery,
): Promise<PaginatedSupplierRecords> {
  const filters = buildSupplierFilters(query);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;

  const items = await database
    .select()
    .from(suppliers)
    .where(where)
    .orderBy(
      asc(suppliers.name),
      asc(suppliers.code),
      asc(suppliers.id),
    )
    .limit(query.pageSize)
    .offset(offset);

  const totalRows = await database
    .select({ total: count() })
    .from(suppliers)
    .where(where);

  return {
    items,
    total: totalRows[0]?.total ?? 0,
  };
}

/** Reads one supplier by UUID. */
export async function findSupplierById(
  database: SuppliersDatabase,
  supplierId: string,
): Promise<SupplierRecord | null> {
  const rows = await database
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);

  return rows[0] ?? null;
}

/** Locks one supplier row before a financial transaction changes its payable. */
export async function findSupplierByIdForUpdate(
  database: SuppliersDatabase,
  supplierId: string,
): Promise<SupplierRecord | null> {
  const rows = await database
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .for("update")
    .limit(1);

  return rows[0] ?? null;
}

/** Checks whether normal business activity has started after opening-data setup. */
export async function hasNormalBusinessActivity(
  database: SuppliersDatabase,
): Promise<boolean> {
  const confirmedPurchases = await database
    .select({ id: purchases.id })
    .from(purchases)
    .where(eq(purchases.status, "CONFIRMED"))
    .limit(1);

  if (confirmedPurchases.length > 0) {
    return true;
  }

  const normalStockMovements = await database
    .select({ id: stockMovements.id })
    .from(stockMovements)
    .where(ne(stockMovements.movementType, "OPENING_STOCK"))
    .limit(1);

  if (normalStockMovements.length > 0) {
    return true;
  }

  const normalMoneyMovements = await database
    .select({ id: cashBankMovements.id })
    .from(cashBankMovements)
    .where(ne(cashBankMovements.sourceType, "OPENING_BALANCE"))
    .limit(1);

  return normalMoneyMovements.length > 0;
}

/** Creates one supplier and returns the saved row. */
export async function createSupplier(
  database: SuppliersDatabase,
  input: NewSupplier,
): Promise<SupplierRecord | null> {
  const rows = await database.insert(suppliers).values(input).returning();
  return rows[0] ?? null;
}

/** Updates allowed supplier fields and refreshes the update timestamp. */
export async function updateSupplier(
  database: SuppliersDatabase,
  supplierId: string,
  changes: SupplierChanges,
): Promise<SupplierRecord | null> {
  const rows = await database
    .update(suppliers)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(suppliers.id, supplierId))
    .returning();

  return rows[0] ?? null;
}

/** Represents one confirmed purchase that still has an outstanding supplier balance. */
export interface SupplierOpenPurchaseRecord {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  dueAmount: string;
}

/** Represents one recent confirmed purchase shown on the supplier profile. */
export interface SupplierRecentPurchaseRecord {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  totalAmount: string;
}

/** Lists the latest confirmed purchases for one supplier. */
export async function listRecentSupplierPurchases(
  database: SuppliersDatabase,
  supplierId: string,
  limit = 5,
): Promise<SupplierRecentPurchaseRecord[]> {
  const rows = await database
    .select({
      id: purchases.id,
      purchaseNumber: purchases.purchaseNumber,
      purchaseDate: purchases.purchaseDate,
      totalAmount: purchases.totalAmount,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.supplierId, supplierId),
        eq(purchases.status, "CONFIRMED"),
      ),
    )
    .orderBy(
      desc(purchases.purchaseDate),
      desc(purchases.createdAt),
      desc(purchases.id),
    )
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    purchaseNumber: row.purchaseNumber as string,
  }));
}

/** Lists confirmed purchases with a positive outstanding amount for one supplier. */
export async function listSupplierOpenPurchases(
  database: SuppliersDatabase,
  supplierId: string,
  query: SupplierOpenPurchasesQuery,
): Promise<{ items: SupplierOpenPurchaseRecord[]; total: number }> {
  const offset = (query.page - 1) * query.pageSize;
  const paidAmount = sql<string>`coalesce((
    select sum(${supplierPaymentAllocations.amount})
    from ${supplierPaymentAllocations}
    inner join ${supplierPayments}
      on ${supplierPayments.id} = ${supplierPaymentAllocations.supplierPaymentId}
    where ${supplierPaymentAllocations.purchaseId} = ${purchases.id}
      and ${supplierPayments.status} = 'CONFIRMED'
      and ${supplierPayments.reversalOfPaymentId} is null
  ), 0)`;
  const returnedAmount = sql<string>`coalesce((
    select sum(${purchaseReturns.totalAmount})
    from ${purchaseReturns}
    where ${purchaseReturns.originalPurchaseId} = ${purchases.id}
      and ${purchaseReturns.status} = 'CONFIRMED'
  ), 0)`;
  const dueAmount = sql<string>`greatest(${purchases.totalAmount} - ${returnedAmount} - ${paidAmount}, 0)`;
  const baseWhere = and(
    eq(purchases.supplierId, supplierId),
    eq(purchases.status, "CONFIRMED"),
  );

  const items = await database
    .select({
      id: purchases.id,
      purchaseNumber: purchases.purchaseNumber,
      purchaseDate: purchases.purchaseDate,
      dueAmount: sql<string>`${dueAmount}::text`,
    })
    .from(purchases)
    .where(and(baseWhere, sql`${dueAmount} > 0`))
    .orderBy(asc(purchases.purchaseDate), asc(purchases.id))
    .limit(query.pageSize)
    .offset(offset);

  const countRows = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(
      database
        .select({ purchaseId: purchases.id })
        .from(purchases)
        .where(and(baseWhere, sql`${dueAmount} > 0`))
        .as("open_supplier_purchases"),
    );

  return { items: items.map((item) => ({ ...item, purchaseNumber: item.purchaseNumber as string })), total: countRows[0]?.total ?? 0 };
}
