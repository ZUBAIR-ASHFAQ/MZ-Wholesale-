import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  purchaseItems,
  purchaseReturns,
  purchases,
  supplierPaymentAllocations,
  supplierPayments,
} from "../../database/schema/index.js";
import type { ListPurchasesQuery } from "./purchases.schema.js";

/** Contains only the database methods required by the Purchase repository. */
export type PurchasesDatabase = Pick<
  NodePgDatabase,
  "select" | "insert" | "update" | "delete" | "execute"
> & {
  transaction?: NodePgDatabase["transaction"];
};

/** Represents one purchase header stored in PostgreSQL. */
export type PurchaseRecord = typeof purchases.$inferSelect;

/** Represents one purchase item stored in PostgreSQL. */
export type PurchaseItemRecord = typeof purchaseItems.$inferSelect;

/** Contains the values required to insert one purchase header. */
export type NewPurchase = typeof purchases.$inferInsert;

/** Contains the values required to insert one purchase item. */
export type NewPurchaseItem = typeof purchaseItems.$inferInsert;

/** Represents one supplier-payment allocation shown on a purchase detail. */
export interface PurchasePaymentRecord {
  paymentId: string;
  documentNumber: string;
  paymentDate: Date;
  status: "CONFIRMED" | "REVERSED";
  totalAmount: string;
  allocatedAmount: string;
}

/** Contains the editable and calculated fields that may change on a draft. */
export interface PurchaseDraftChanges {
  supplierId?: string;
  purchaseDate?: string;
  itemDiscountTotal?: string;
  invoiceDiscountAmount?: string;
  extraCostAmount?: string;
  subtotalAmount?: string;
  totalAmount?: string;
  notes?: string | null;
}

/** Contains the immutable values captured when a draft is confirmed. */
export interface PurchaseConfirmationChanges {
  purchaseNumber: string;
  itemDiscountTotal: string;
  invoiceDiscountAmount: string;
  extraCostAmount: string;
  subtotalAmount: string;
  totalAmount: string;
  initialPaidAmount: string;
  initialDueAmount: string;
  confirmedAt: Date;
}

/** Contains the values stored when an editable draft is cancelled. */
export interface PurchaseCancellationChanges {
  cancelledAt: Date;
  notes?: string | null;
}

/** Builds the approved supplier, status, and purchase-date filters. */
function buildPurchaseFilters(query: ListPurchasesQuery): SQL[] {
  const filters: SQL[] = [];

  if (query.supplierId) {
    filters.push(eq(purchases.supplierId, query.supplierId));
  }

  if (query.status) {
    filters.push(eq(purchases.status, query.status));
  }

  if (query.startDate) {
    filters.push(gte(purchases.purchaseDate, query.startDate));
  }

  if (query.endDate) {
    filters.push(lte(purchases.purchaseDate, query.endDate));
  }

  return filters;
}

/** Lists purchase headers using the approved filters and pagination. */
export async function listPurchases(
  database: PurchasesDatabase,
  query: ListPurchasesQuery,
): Promise<PurchaseRecord[]> {
  const filters = buildPurchaseFilters(query);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;

  return database
    .select()
    .from(purchases)
    .where(where)
    .orderBy(
      desc(purchases.purchaseDate),
      desc(purchases.createdAt),
      desc(purchases.id),
    )
    .limit(query.pageSize)
    .offset(offset);
}

/** Counts purchases using the same filters as the paginated list. */
export async function countPurchases(
  database: PurchasesDatabase,
  query: ListPurchasesQuery,
): Promise<number> {
  const filters = buildPurchaseFilters(query);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const rows = await database
    .select({ total: count() })
    .from(purchases)
    .where(where);

  return rows[0]?.total ?? 0;
}

/** Reads one purchase header by UUID. */
export async function findPurchaseById(
  database: PurchasesDatabase,
  purchaseId: string,
): Promise<PurchaseRecord | null> {
  const rows = await database
    .select()
    .from(purchases)
    .where(eq(purchases.id, purchaseId))
    .limit(1);

  return rows[0] ?? null;
}

/** Reads every item belonging to one purchase in stable creation order. */
export async function listPurchaseItems(
  database: PurchasesDatabase,
  purchaseId: string,
): Promise<PurchaseItemRecord[]> {
  return database
    .select()
    .from(purchaseItems)
    .where(eq(purchaseItems.purchaseId, purchaseId))
    .orderBy(asc(purchaseItems.createdAt), asc(purchaseItems.id));
}

/** Lists supplier payments that have an allocation to one purchase. */
export async function listPurchasePayments(
  database: PurchasesDatabase,
  purchaseId: string,
): Promise<PurchasePaymentRecord[]> {
  return database
    .select({
      paymentId: supplierPayments.id,
      documentNumber: supplierPayments.documentNumber,
      paymentDate: supplierPayments.paymentDate,
      status: supplierPayments.status,
      totalAmount: supplierPayments.totalAmount,
      allocatedAmount: supplierPaymentAllocations.amount,
    })
    .from(supplierPaymentAllocations)
    .innerJoin(
      supplierPayments,
      eq(supplierPayments.id, supplierPaymentAllocations.supplierPaymentId),
    )
    .where(eq(supplierPaymentAllocations.purchaseId, purchaseId))
    .orderBy(
      asc(supplierPayments.paymentDate),
      asc(supplierPayments.createdAt),
      asc(supplierPayments.id),
    );
}

/** Calculates current purchase outstanding after confirmed returns and active payment allocations. */
export async function getPurchaseOutstandingAmount(
  database: PurchasesDatabase,
  purchaseId: string,
): Promise<string> {
  const paidAmount = sql<string>`coalesce(sum(case when ${supplierPayments.status} = 'CONFIRMED' and ${supplierPayments.reversalOfPaymentId} is null then ${supplierPaymentAllocations.amount} else 0 end), 0)`;
  const returnedAmount = sql<string>`coalesce((
    select sum(${purchaseReturns.totalAmount})
    from ${purchaseReturns}
    where ${purchaseReturns.originalPurchaseId} = ${purchases.id}
      and ${purchaseReturns.status} = 'CONFIRMED'
  ), 0)`;
  const rows = await database
    .select({
      outstandingAmount: sql<string>`greatest(${purchases.totalAmount} - ${returnedAmount} - ${paidAmount}, 0)::text`,
    })
    .from(purchases)
    .leftJoin(
      supplierPaymentAllocations,
      eq(supplierPaymentAllocations.purchaseId, purchases.id),
    )
    .leftJoin(
      supplierPayments,
      eq(supplierPayments.id, supplierPaymentAllocations.supplierPaymentId),
    )
    .where(eq(purchases.id, purchaseId))
    .groupBy(purchases.id);

  return rows[0]?.outstandingAmount ?? "0.00";
}

/** Creates one purchase header and returns the saved row. */
export async function createPurchase(
  database: PurchasesDatabase,
  input: NewPurchase,
): Promise<PurchaseRecord | null> {
  const rows = await database.insert(purchases).values(input).returning();
  return rows[0] ?? null;
}

/** Creates purchase items and returns the saved rows. */
export async function createPurchaseItems(
  database: PurchasesDatabase,
  items: NewPurchaseItem[],
): Promise<PurchaseItemRecord[]> {
  if (items.length === 0) {
    return [];
  }

  return database.insert(purchaseItems).values(items).returning();
}

/** Replaces all items for a draft purchase inside the caller's transaction. */
export async function replacePurchaseItems(
  database: PurchasesDatabase,
  purchaseId: string,
  items: NewPurchaseItem[],
): Promise<PurchaseItemRecord[]> {
  await database
    .delete(purchaseItems)
    .where(eq(purchaseItems.purchaseId, purchaseId));

  if (items.length === 0) {
    return [];
  }

  return database.insert(purchaseItems).values(items).returning();
}

/** Updates editable or recalculated fields on a purchase draft. */
export async function updatePurchaseDraft(
  database: PurchasesDatabase,
  purchaseId: string,
  changes: PurchaseDraftChanges,
): Promise<PurchaseRecord | null> {
  const rows = await database
    .update(purchases)
    .set({ ...changes, updatedAt: new Date() })
    .where(and(eq(purchases.id, purchaseId), eq(purchases.status, "DRAFT")))
    .returning();

  return rows[0] ?? null;
}

/** Locks one purchase row before a transaction performs a status change. */
export async function lockPurchaseById(
  database: PurchasesDatabase,
  purchaseId: string,
): Promise<PurchaseRecord | null> {
  const rows = await database
    .select()
    .from(purchases)
    .where(eq(purchases.id, purchaseId))
    .for("update")
    .limit(1);

  return rows[0] ?? null;
}

/** Marks a draft purchase confirmed and stores its immutable total snapshots. */
export async function markPurchaseConfirmed(
  database: PurchasesDatabase,
  purchaseId: string,
  changes: PurchaseConfirmationChanges,
): Promise<PurchaseRecord | null> {
  const rows = await database
    .update(purchases)
    .set({
      ...changes,
      status: "CONFIRMED",
      cancelledAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(purchases.id, purchaseId), eq(purchases.status, "DRAFT")))
    .returning();

  return rows[0] ?? null;
}

/** Marks a draft purchase cancelled without changing any confirmed purchase. */
export async function markPurchaseCancelled(
  database: PurchasesDatabase,
  purchaseId: string,
  changes: PurchaseCancellationChanges,
): Promise<PurchaseRecord | null> {
  const rows = await database
    .update(purchases)
    .set({
      ...changes,
      status: "CANCELLED",
      confirmedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(purchases.id, purchaseId), eq(purchases.status, "DRAFT")))
    .returning();

  return rows[0] ?? null;
}
