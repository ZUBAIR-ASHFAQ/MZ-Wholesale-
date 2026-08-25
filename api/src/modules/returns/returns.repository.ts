import { and, asc, count, desc, eq, gte, isNull, lte, ne, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  customerPaymentAllocations,
  customerPayments,
  purchaseItems,
  purchases,
  purchaseReturnItems,
  purchaseReturns,
  salesInvoiceItems,
  salesInvoices,
  salesReturnItems,
  salesReturns,
  supplierPaymentAllocations,
  supplierPayments,
} from "../../database/schema/index.js";
import type {
  ListPurchaseReturnsQuery,
  ListSalesReturnsQuery,
} from "./returns.schema.js";

/** Contains only the database methods required by the Returns repository. */
export type ReturnsDatabase = Pick<
  NodePgDatabase,
  "select" | "insert" | "update" | "delete" | "execute"
> & {
  transaction?: NodePgDatabase["transaction"];
};

/** Represents one Sales Return header stored in PostgreSQL. */
export type SalesReturnRecord = typeof salesReturns.$inferSelect;

/** Represents one Sales Return item stored in PostgreSQL. */
export type SalesReturnItemRecord = typeof salesReturnItems.$inferSelect;

/** Represents the confirmed sale header used as the source of a Sales Return. */
export type OriginalSaleRecord = typeof salesInvoices.$inferSelect;

/** Represents one original sale item used to build a Sales Return snapshot. */
export type OriginalSaleItemRecord = typeof salesInvoiceItems.$inferSelect;

/** Represents the confirmed purchase header used as the source of a Purchase Return. */
export type OriginalPurchaseRecord = typeof purchases.$inferSelect;

/** Represents one original purchase item used to build a Purchase Return snapshot. */
export type OriginalPurchaseItemRecord = typeof purchaseItems.$inferSelect;

/** Represents one Purchase Return header stored in PostgreSQL. */
export type PurchaseReturnRecord = typeof purchaseReturns.$inferSelect;

/** Represents one Purchase Return list row plus its summed returned quantity. */
export type PurchaseReturnListRecord = PurchaseReturnRecord & {
  returnedQuantity: string;
};

/** Represents one Purchase Return item stored in PostgreSQL. */
export type PurchaseReturnItemRecord = typeof purchaseReturnItems.$inferSelect;


/** Summarizes the original sale settlement amounts used to prevent over-refunding. */
export interface SalesReturnSettlementAmounts {
  paidAmount: string;
  previousReturnAmount: string;
  previousRefundAmount: string;
}

/** Summarizes the original purchase settlement amounts used to prevent cross-purchase payable reductions. */
export interface PurchaseReturnSettlementAmounts {
  paidAmount: string;
  previousReturnAmount: string;
}

/** Contains the values required to insert one Sales Return header. */
export type NewSalesReturn = typeof salesReturns.$inferInsert;

/** Contains the values required to insert one Sales Return item. */
export type NewSalesReturnItem = typeof salesReturnItems.$inferInsert;

/** Contains the values required to insert one Purchase Return header. */
export type NewPurchaseReturn = typeof purchaseReturns.$inferInsert;

/** Contains the values required to insert one Purchase Return item. */
export type NewPurchaseReturnItem = typeof purchaseReturnItems.$inferInsert;

/** Builds the approved customer and return-date filters for Sales Returns. */
function buildSalesReturnFilters(query: ListSalesReturnsQuery): SQL[] {
  const filters: SQL[] = [];

  if (query.customerId) {
    filters.push(eq(salesReturns.customerId, query.customerId));
  }

  if (query.startDate) {
    filters.push(gte(salesReturns.returnDate, query.startDate));
  }

  if (query.endDate) {
    filters.push(lte(salesReturns.returnDate, query.endDate));
  }

  return filters;
}

/** Builds the approved supplier and return-date filters for Purchase Returns. */
function buildPurchaseReturnFilters(query: ListPurchaseReturnsQuery): SQL[] {
  const filters: SQL[] = [];

  if (query.supplierId) {
    filters.push(eq(purchaseReturns.supplierId, query.supplierId));
  }

  if (query.startDate) {
    filters.push(gte(purchaseReturns.returnDate, query.startDate));
  }

  if (query.endDate) {
    filters.push(lte(purchaseReturns.returnDate, query.endDate));
  }

  return filters;
}

/** Lists Sales Return headers using the approved filters and pagination. */
export async function listSalesReturns(
  database: ReturnsDatabase,
  query: ListSalesReturnsQuery,
): Promise<SalesReturnRecord[]> {
  const filters = buildSalesReturnFilters(query);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;

  return database
    .select()
    .from(salesReturns)
    .where(where)
    .orderBy(
      desc(salesReturns.returnDate),
      desc(salesReturns.createdAt),
      desc(salesReturns.id),
    )
    .limit(query.pageSize)
    .offset(offset);
}

/** Counts Sales Returns using the same filters as the paginated list. */
export async function countSalesReturns(
  database: ReturnsDatabase,
  query: ListSalesReturnsQuery,
): Promise<number> {
  const filters = buildSalesReturnFilters(query);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const rows = await database
    .select({ total: count() })
    .from(salesReturns)
    .where(where);

  return rows[0]?.total ?? 0;
}

/** Reads the existing Sales Return for one original sale, if that sale was already returned. */
export async function findSalesReturnByOriginalSaleId(
  database: ReturnsDatabase,
  originalSaleId: string,
): Promise<SalesReturnRecord | null> {
  const rows = await database
    .select()
    .from(salesReturns)
    .where(eq(salesReturns.originalSaleId, originalSaleId))
    .limit(1);

  return rows[0] ?? null;
}

/** Reads one Sales Return header by UUID. */
export async function findSalesReturnById(
  database: ReturnsDatabase,
  salesReturnId: string,
): Promise<SalesReturnRecord | null> {
  const rows = await database
    .select()
    .from(salesReturns)
    .where(eq(salesReturns.id, salesReturnId))
    .limit(1);

  return rows[0] ?? null;
}

/** Reads every item belonging to one Sales Return in stable creation order. */
export async function findSalesReturnItems(
  database: ReturnsDatabase,
  salesReturnId: string,
): Promise<SalesReturnItemRecord[]> {
  return database
    .select()
    .from(salesReturnItems)
    .where(eq(salesReturnItems.salesReturnId, salesReturnId))
    .orderBy(asc(salesReturnItems.createdAt), asc(salesReturnItems.id));
}

/** Creates one Sales Return header and returns the saved row. */
export async function createSalesReturn(
  database: ReturnsDatabase,
  input: NewSalesReturn,
): Promise<SalesReturnRecord | null> {
  const rows = await database.insert(salesReturns).values(input).returning();
  return rows[0] ?? null;
}

/** Creates Sales Return items and returns the saved rows. */
export async function createSalesReturnItems(
  database: ReturnsDatabase,
  items: NewSalesReturnItem[],
): Promise<SalesReturnItemRecord[]> {
  if (items.length === 0) {
    return [];
  }

  return database.insert(salesReturnItems).values(items).returning();
}

/** Reads paid, returned, and already-refunded amounts for one original sale. */
export async function getSalesReturnSettlementAmounts(
  database: ReturnsDatabase,
  originalSaleId: string,
  excludeSalesReturnId?: string,
): Promise<SalesReturnSettlementAmounts> {
  const returnFilters = [eq(salesReturns.originalSaleId, originalSaleId)];

  if (excludeSalesReturnId) {
    returnFilters.push(ne(salesReturns.id, excludeSalesReturnId));
  }

  const [paymentRows, returnRows] = await Promise.all([
    database
      .select({
        paidAmount: sql<string>`coalesce(sum(${customerPaymentAllocations.amount}), 0)::text`,
      })
      .from(customerPaymentAllocations)
      .innerJoin(
        customerPayments,
        eq(customerPayments.id, customerPaymentAllocations.customerPaymentId),
      )
      .where(
        and(
          eq(customerPaymentAllocations.salesInvoiceId, originalSaleId),
          eq(customerPayments.status, "CONFIRMED"),
          isNull(customerPayments.reversalOfPaymentId),
        ),
      ),
    database
      .select({
        previousReturnAmount: sql<string>`coalesce(sum(${salesReturns.totalAmount}), 0)::text`,
        previousRefundAmount: sql<string>`coalesce(sum(case when ${salesReturns.refundMode} in ('CASH', 'BANK_TRANSFER') then ${salesReturns.totalAmount} else 0 end), 0)::text`,
      })
      .from(salesReturns)
      .where(and(...returnFilters)),
  ]);

  return {
    paidAmount: paymentRows[0]?.paidAmount ?? "0.00",
    previousReturnAmount: returnRows[0]?.previousReturnAmount ?? "0.00",
    previousRefundAmount: returnRows[0]?.previousRefundAmount ?? "0.00",
  };
}

/** Reads paid and already-returned amounts for one original purchase. */
export async function getPurchaseReturnSettlementAmounts(
  database: ReturnsDatabase,
  originalPurchaseId: string,
  excludePurchaseReturnId?: string,
): Promise<PurchaseReturnSettlementAmounts> {
  const returnFilters = [eq(purchaseReturns.originalPurchaseId, originalPurchaseId)];

  if (excludePurchaseReturnId) {
    returnFilters.push(ne(purchaseReturns.id, excludePurchaseReturnId));
  }

  const [paymentRows, returnRows] = await Promise.all([
    database
      .select({
        paidAmount: sql<string>`coalesce(sum(${supplierPaymentAllocations.amount}), 0)::text`,
      })
      .from(supplierPaymentAllocations)
      .innerJoin(
        supplierPayments,
        eq(supplierPayments.id, supplierPaymentAllocations.supplierPaymentId),
      )
      .where(
        and(
          eq(supplierPaymentAllocations.purchaseId, originalPurchaseId),
          eq(supplierPayments.status, "CONFIRMED"),
          isNull(supplierPayments.reversalOfPaymentId),
        ),
      ),
    database
      .select({
        previousReturnAmount: sql<string>`coalesce(sum(${purchaseReturns.totalAmount}), 0)::text`,
      })
      .from(purchaseReturns)
      .where(and(...returnFilters)),
  ]);

  return {
    paidAmount: paymentRows[0]?.paidAmount ?? "0.00",
    previousReturnAmount: returnRows[0]?.previousReturnAmount ?? "0.00",
  };
}

/** Reads the original sale only when it is confirmed and valid for a return. */
export async function findConfirmedSaleForReturn(
  database: ReturnsDatabase,
  saleId: string,
): Promise<OriginalSaleRecord | null> {
  const rows = await database
    .select()
    .from(salesInvoices)
    .where(
      and(
        eq(salesInvoices.id, saleId),
        eq(salesInvoices.status, "CONFIRMED"),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/** Locks the confirmed original sale so concurrent returns are serialized. */
export async function lockConfirmedSaleForReturn(
  database: ReturnsDatabase,
  saleId: string,
): Promise<OriginalSaleRecord | null> {
  const rows = await database
    .select()
    .from(salesInvoices)
    .where(
      and(
        eq(salesInvoices.id, saleId),
        eq(salesInvoices.status, "CONFIRMED"),
      ),
    )
    .for("update")
    .limit(1);

  return rows[0] ?? null;
}

/** Reads every original item belonging to one sale in stable creation order. */
export async function findOriginalSaleItems(
  database: ReturnsDatabase,
  saleId: string,
): Promise<OriginalSaleItemRecord[]> {
  return database
    .select()
    .from(salesInvoiceItems)
    .where(eq(salesInvoiceItems.salesInvoiceId, saleId))
    .orderBy(asc(salesInvoiceItems.createdAt), asc(salesInvoiceItems.id));
}

/** Locks all original sale items before remaining-return quantities are checked. */
export async function lockOriginalSaleItemsForReturn(
  database: ReturnsDatabase,
  saleId: string,
): Promise<OriginalSaleItemRecord[]> {
  return database
    .select()
    .from(salesInvoiceItems)
    .where(eq(salesInvoiceItems.salesInvoiceId, saleId))
    .orderBy(asc(salesInvoiceItems.id))
    .for("update");
}

/** Reads one original sale item only when it belongs to the selected sale. */
export async function findOriginalSaleItemForReturn(
  database: ReturnsDatabase,
  saleId: string,
  saleItemId: string,
): Promise<OriginalSaleItemRecord | null> {
  const rows = await database
    .select()
    .from(salesInvoiceItems)
    .where(
      and(
        eq(salesInvoiceItems.id, saleItemId),
        eq(salesInvoiceItems.salesInvoiceId, saleId),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/** Returns the total quantity already returned for one original sale item. */
export async function getSalesItemReturnedQuantity(
  database: ReturnsDatabase,
  originalSaleItemId: string,
): Promise<string> {
  const rows = await database
    .select({
      returnedQuantity: sql<string>`coalesce(sum(${salesReturnItems.quantity}), 0)::text`,
    })
    .from(salesReturnItems)
    .where(eq(salesReturnItems.originalSaleItemId, originalSaleItemId));

  return rows[0]?.returnedQuantity ?? "0.000";
}

/** Returns the total money value already returned for one original sale item. */
export async function getSalesItemReturnedAmount(
  database: ReturnsDatabase,
  originalSaleItemId: string,
): Promise<string> {
  const rows = await database
    .select({
      returnedAmount: sql<string>`coalesce(sum(${salesReturnItems.lineTotal}), 0)::text`,
    })
    .from(salesReturnItems)
    .where(eq(salesReturnItems.originalSaleItemId, originalSaleItemId));

  return rows[0]?.returnedAmount ?? "0.00";
}

/** Reads the original purchase only when it is confirmed and valid for a return. */
export async function findConfirmedPurchaseForReturn(
  database: ReturnsDatabase,
  purchaseId: string,
): Promise<OriginalPurchaseRecord | null> {
  const rows = await database
    .select()
    .from(purchases)
    .where(
      and(
        eq(purchases.id, purchaseId),
        eq(purchases.status, "CONFIRMED"),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/** Locks the confirmed original purchase so concurrent returns are serialized. */
export async function lockConfirmedPurchaseForReturn(
  database: ReturnsDatabase,
  purchaseId: string,
): Promise<OriginalPurchaseRecord | null> {
  const rows = await database
    .select()
    .from(purchases)
    .where(
      and(
        eq(purchases.id, purchaseId),
        eq(purchases.status, "CONFIRMED"),
      ),
    )
    .for("update")
    .limit(1);

  return rows[0] ?? null;
}

/** Locks all original purchase items before remaining-return quantities are checked. */
export async function lockOriginalPurchaseItemsForReturn(
  database: ReturnsDatabase,
  purchaseId: string,
): Promise<OriginalPurchaseItemRecord[]> {
  return database
    .select()
    .from(purchaseItems)
    .where(eq(purchaseItems.purchaseId, purchaseId))
    .orderBy(asc(purchaseItems.id))
    .for("update");
}

/** Reads one original purchase item only when it belongs to the selected purchase. */
export async function findOriginalPurchaseItemForReturn(
  database: ReturnsDatabase,
  purchaseId: string,
  purchaseItemId: string,
): Promise<OriginalPurchaseItemRecord | null> {
  const rows = await database
    .select()
    .from(purchaseItems)
    .where(
      and(
        eq(purchaseItems.id, purchaseItemId),
        eq(purchaseItems.purchaseId, purchaseId),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/** Returns the total quantity already returned for one original purchase item. */
export async function getPurchaseItemReturnedQuantity(
  database: ReturnsDatabase,
  originalPurchaseItemId: string,
): Promise<string> {
  const rows = await database
    .select({
      returnedQuantity: sql<string>`coalesce(sum(${purchaseReturnItems.quantity}), 0)::text`,
    })
    .from(purchaseReturnItems)
    .where(eq(purchaseReturnItems.originalPurchaseItemId, originalPurchaseItemId));

  return rows[0]?.returnedQuantity ?? "0.000";
}

/** Lists Purchase Return headers using the approved filters and pagination. */
export async function listPurchaseReturns(
  database: ReturnsDatabase,
  query: ListPurchaseReturnsQuery,
): Promise<PurchaseReturnListRecord[]> {
  const filters = buildPurchaseReturnFilters(query);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;

  return database
    .select({
      id: purchaseReturns.id,
      returnNumber: purchaseReturns.returnNumber,
      originalPurchaseId: purchaseReturns.originalPurchaseId,
      supplierId: purchaseReturns.supplierId,
      returnDate: purchaseReturns.returnDate,
      status: purchaseReturns.status,
      reason: purchaseReturns.reason,
      totalAmount: purchaseReturns.totalAmount,
      createdAt: purchaseReturns.createdAt,
      returnedQuantity: sql<string>`coalesce((
        select sum(${purchaseReturnItems.quantity})
        from ${purchaseReturnItems}
        where ${purchaseReturnItems.purchaseReturnId} = ${purchaseReturns.id}
      ), 0)::text`,
    })
    .from(purchaseReturns)
    .where(where)
    .orderBy(
      desc(purchaseReturns.returnDate),
      desc(purchaseReturns.createdAt),
      desc(purchaseReturns.id),
    )
    .limit(query.pageSize)
    .offset(offset);
}

/** Counts Purchase Returns using the same filters as the paginated list. */
export async function countPurchaseReturns(
  database: ReturnsDatabase,
  query: ListPurchaseReturnsQuery,
): Promise<number> {
  const filters = buildPurchaseReturnFilters(query);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const rows = await database
    .select({ total: count() })
    .from(purchaseReturns)
    .where(where);

  return rows[0]?.total ?? 0;
}

/** Reads one Purchase Return header by UUID. */
export async function findPurchaseReturnById(
  database: ReturnsDatabase,
  purchaseReturnId: string,
): Promise<PurchaseReturnRecord | null> {
  const rows = await database
    .select()
    .from(purchaseReturns)
    .where(eq(purchaseReturns.id, purchaseReturnId))
    .limit(1);

  return rows[0] ?? null;
}

/** Reads every item belonging to one Purchase Return in stable creation order. */
export async function findPurchaseReturnItems(
  database: ReturnsDatabase,
  purchaseReturnId: string,
): Promise<PurchaseReturnItemRecord[]> {
  return database
    .select()
    .from(purchaseReturnItems)
    .where(eq(purchaseReturnItems.purchaseReturnId, purchaseReturnId))
    .orderBy(asc(purchaseReturnItems.createdAt), asc(purchaseReturnItems.id));
}

/** Creates one Purchase Return header and returns the saved row. */
export async function createPurchaseReturn(
  database: ReturnsDatabase,
  input: NewPurchaseReturn,
): Promise<PurchaseReturnRecord | null> {
  const rows = await database.insert(purchaseReturns).values(input).returning();
  return rows[0] ?? null;
}

/** Creates Purchase Return items and returns the saved rows. */
export async function createPurchaseReturnItems(
  database: ReturnsDatabase,
  items: NewPurchaseReturnItem[],
): Promise<PurchaseReturnItemRecord[]> {
  if (items.length === 0) {
    return [];
  }

  return database.insert(purchaseReturnItems).values(items).returning();
}
