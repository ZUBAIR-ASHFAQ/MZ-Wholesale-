import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  customerPaymentAllocations,
  customerPayments,
  salesInvoiceItems,
  salesInvoices,
  salesReturns,
} from "../../database/schema/index.js";
import type { ListSalesQuery } from "./sales.schema.js";

/** Contains only the database methods required by the Sales repository. */
export type SalesDatabase = Pick<
  NodePgDatabase,
  "select" | "insert" | "update" | "delete" | "execute"
> & {
  transaction?: NodePgDatabase["transaction"];
};

/** Represents one sales invoice header stored in PostgreSQL. */
export type SaleRecord = typeof salesInvoices.$inferSelect;

/** Represents one sales invoice item stored in PostgreSQL. */
export type SaleItemRecord = typeof salesInvoiceItems.$inferSelect;

/** Contains the values required to insert one sales invoice header. */
export type NewSale = typeof salesInvoices.$inferInsert;

/** Contains the values required to insert one sales invoice item. */
export type NewSaleItem = typeof salesInvoiceItems.$inferInsert;


/** Represents one customer receipt allocation shown on a sale detail. */
export interface SalePaymentRecord {
  paymentId: string;
  documentNumber: string;
  paymentDate: Date;
  status: "CONFIRMED" | "REVERSED";
  reversalOfPaymentId: string | null;
  totalAmount: string;
  allocatedAmount: string;
}

/** Contains the editable and recalculated fields that may change on an unconfirmed sale. */
export interface SaleDraftChanges {
  customerId?: string;
  invoiceDate?: string;
  status?: "DRAFT" | "HELD";
  itemDiscountTotal?: string;
  invoiceDiscountAmount?: string;
  subtotalAmount?: string;
  totalAmount?: string;
  notes?: string | null;
}

/** Builds the approved customer, status, and invoice-date filters. */
function buildSaleFilters(query: ListSalesQuery): SQL[] {
  const filters: SQL[] = [];

  if (query.customerId) {
    filters.push(eq(salesInvoices.customerId, query.customerId));
  }

  if (query.status) {
    filters.push(eq(salesInvoices.status, query.status));
  }

  if (query.startDate) {
    filters.push(gte(salesInvoices.invoiceDate, query.startDate));
  }

  if (query.endDate) {
    filters.push(lte(salesInvoices.invoiceDate, query.endDate));
  }

  if (query.returnableOnly) {
    filters.push(eq(salesInvoices.status, "CONFIRMED"));
    filters.push(sql`not exists (
      select 1
      from ${salesReturns}
      where ${salesReturns.originalSaleId} = ${salesInvoices.id}
    )`);
  }

  return filters;
}

/** Lists sales invoice headers using the approved filters and pagination. */
export async function listSales(
  database: SalesDatabase,
  query: ListSalesQuery,
): Promise<SaleRecord[]> {
  const filters = buildSaleFilters(query);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;

  return database
    .select()
    .from(salesInvoices)
    .where(where)
    .orderBy(
      desc(salesInvoices.invoiceDate),
      desc(salesInvoices.createdAt),
      desc(salesInvoices.id),
    )
    .limit(query.pageSize)
    .offset(offset);
}

/** Counts sales invoices using the same filters as the paginated list. */
export async function countSales(
  database: SalesDatabase,
  query: ListSalesQuery,
): Promise<number> {
  const filters = buildSaleFilters(query);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const rows = await database
    .select({ total: count() })
    .from(salesInvoices)
    .where(where);

  return rows[0]?.total ?? 0;
}

/** Reads one sales invoice header by UUID. */
export async function findSaleById(
  database: SalesDatabase,
  saleId: string,
): Promise<SaleRecord | null> {
  const rows = await database
    .select()
    .from(salesInvoices)
    .where(eq(salesInvoices.id, saleId))
    .limit(1);

  return rows[0] ?? null;
}

/** Locks one sales invoice row before a transaction changes its status or items. */
export async function findSaleByIdForUpdate(
  database: SalesDatabase,
  saleId: string,
): Promise<SaleRecord | null> {
  const rows = await database
    .select()
    .from(salesInvoices)
    .where(eq(salesInvoices.id, saleId))
    .for("update")
    .limit(1);

  return rows[0] ?? null;
}

/** Reads every item belonging to one sale in stable creation order. */
export async function findSaleItems(
  database: SalesDatabase,
  saleId: string,
): Promise<SaleItemRecord[]> {
  return database
    .select()
    .from(salesInvoiceItems)
    .where(eq(salesInvoiceItems.salesInvoiceId, saleId))
    .orderBy(asc(salesInvoiceItems.createdAt), asc(salesInvoiceItems.id));
}

/** Lists customer receipts that have an allocation to one sales invoice. */
export async function listSalePayments(
  database: SalesDatabase,
  saleId: string,
): Promise<SalePaymentRecord[]> {
  return database
    .select({
      paymentId: customerPayments.id,
      documentNumber: customerPayments.documentNumber,
      paymentDate: customerPayments.paymentDate,
      status: customerPayments.status,
      reversalOfPaymentId: customerPayments.reversalOfPaymentId,
      totalAmount: customerPayments.totalAmount,
      allocatedAmount: customerPaymentAllocations.amount,
    })
    .from(customerPaymentAllocations)
    .innerJoin(
      customerPayments,
      eq(customerPayments.id, customerPaymentAllocations.customerPaymentId),
    )
    .where(eq(customerPaymentAllocations.salesInvoiceId, saleId))
    .orderBy(
      asc(customerPayments.paymentDate),
      asc(customerPayments.createdAt),
      asc(customerPayments.id),
    );
}

/** Calculates current sale outstanding after confirmed returns and active receipt allocations. */
export async function getSaleOutstandingAmount(
  database: SalesDatabase,
  saleId: string,
): Promise<string> {
  const paidAmount = sql<string>`coalesce(sum(case when ${customerPayments.status} = 'CONFIRMED' and ${customerPayments.reversalOfPaymentId} is null then ${customerPaymentAllocations.amount} else 0 end), 0)`;
  const returnedAmount = sql<string>`coalesce((
    select sum(${salesReturns.totalAmount})
    from ${salesReturns}
    where ${salesReturns.originalSaleId} = ${salesInvoices.id}
      and ${salesReturns.status} = 'CONFIRMED'
  ), 0)`;
  const refundedAmount = sql<string>`coalesce((
    select sum(${salesReturns.totalAmount})
    from ${salesReturns}
    where ${salesReturns.originalSaleId} = ${salesInvoices.id}
      and ${salesReturns.status} = 'CONFIRMED'
      and ${salesReturns.refundMode} in ('CASH', 'BANK_TRANSFER')
  ), 0)`;
  const rows = await database
    .select({
      outstandingAmount: sql<string>`greatest(${salesInvoices.totalAmount} - ${returnedAmount} - ${paidAmount} + ${refundedAmount}, 0)::text`,
    })
    .from(salesInvoices)
    .leftJoin(
      customerPaymentAllocations,
      eq(customerPaymentAllocations.salesInvoiceId, salesInvoices.id),
    )
    .leftJoin(
      customerPayments,
      eq(customerPayments.id, customerPaymentAllocations.customerPaymentId),
    )
    .where(eq(salesInvoices.id, saleId))
    .groupBy(salesInvoices.id);

  return rows[0]?.outstandingAmount ?? "0.00";
}

/** Creates one sales invoice header and returns the saved row. */
export async function createSale(
  database: SalesDatabase,
  input: NewSale,
): Promise<SaleRecord | null> {
  const rows = await database.insert(salesInvoices).values(input).returning();
  return rows[0] ?? null;
}

/** Creates sales invoice items and returns the saved rows. */
export async function createSaleItems(
  database: SalesDatabase,
  items: NewSaleItem[],
): Promise<SaleItemRecord[]> {
  if (items.length === 0) {
    return [];
  }

  return database.insert(salesInvoiceItems).values(items).returning();
}

/** Updates editable and recalculated fields only while the sale is DRAFT or HELD. */
export async function updateSaleDraft(
  database: SalesDatabase,
  saleId: string,
  changes: SaleDraftChanges,
): Promise<SaleRecord | null> {
  const rows = await database
    .update(salesInvoices)
    .set({ ...changes, updatedAt: new Date() })
    .where(
      and(
        eq(salesInvoices.id, saleId),
        inArray(salesInvoices.status, ["DRAFT", "HELD"]),
      ),
    )
    .returning();

  return rows[0] ?? null;
}

/** Deletes every item for a sale after the service has verified it is editable. */
export async function deleteSaleDraftItems(
  database: SalesDatabase,
  saleId: string,
): Promise<void> {
  await database
    .delete(salesInvoiceItems)
    .where(eq(salesInvoiceItems.salesInvoiceId, saleId));
}

/** Marks a DRAFT sale as cancelled after the service has locked and validated it. */
export async function cancelSaleDraft(
  database: SalesDatabase,
  saleId: string,
  cancelledAt: Date,
  notes?: string | null,
): Promise<SaleRecord | null> {
  const rows = await database
    .update(salesInvoices)
    .set({
      status: "CANCELLED",
      cancelledAt,
      confirmedAt: null,
      ...(notes !== undefined ? { notes } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(salesInvoices.id, saleId),
        eq(salesInvoices.status, "DRAFT"),
      ),
    )
    .returning();

  return rows[0] ?? null;
}

/** Stores the weighted-average cost snapshot captured when one sale item is confirmed. */
export async function updateSaleItemCostSnapshot(
  database: SalesDatabase,
  itemId: string,
  unitCostSnapshot: string,
): Promise<SaleItemRecord | null> {
  const rows = await database
    .update(salesInvoiceItems)
    .set({ unitCostSnapshot })
    .where(eq(salesInvoiceItems.id, itemId))
    .returning();

  return rows[0] ?? null;
}

/** Marks a locked DRAFT or HELD sale as confirmed with immutable number/payment snapshots. */
export async function markSaleConfirmed(
  database: SalesDatabase,
  saleId: string,
  changes: {
    invoiceNumber: string;
    initialPaidAmount: string;
    initialDueAmount: string;
    confirmedAt: Date;
  },
): Promise<SaleRecord | null> {
  const rows = await database
    .update(salesInvoices)
    .set({
      status: "CONFIRMED",
      invoiceNumber: changes.invoiceNumber,
      initialPaidAmount: changes.initialPaidAmount,
      initialDueAmount: changes.initialDueAmount,
      confirmedAt: changes.confirmedAt,
      cancelledAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(salesInvoices.id, saleId),
        inArray(salesInvoices.status, ["DRAFT", "HELD"]),
      ),
    )
    .returning();

  return rows[0] ?? null;
}
