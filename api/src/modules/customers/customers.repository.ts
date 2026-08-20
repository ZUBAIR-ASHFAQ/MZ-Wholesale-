import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  cashBankMovements,
  customerLedgerEntries,
  customerPaymentAllocations,
  customerPayments,
  customers,
  purchases,
  salesInvoices,
  salesReturns,
  stockMovements,
} from "../../database/schema/index.js";
import type {
  CustomerOpenInvoicesQuery,
  ListCustomersQuery,
} from "./customers.schema.js";

/** Contains the database methods used by the Customer repository. */
export type CustomersDatabase = Pick<NodePgDatabase, "select" | "insert" | "update"> & {
  transaction?: NodePgDatabase["transaction"];
};

/** Represents one customer row saved in PostgreSQL. */
export type CustomerRecord = typeof customers.$inferSelect;

/** Contains the fields needed to create one customer row. */
export type NewCustomer = typeof customers.$inferInsert;

/** Contains the customer fields that may be changed. */
export interface CustomerChanges {
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  creditLimit?: string;
  isActive?: boolean;
}

/** Represents one customer row in the list with its ledger-derived current due. */
export interface CustomerListRecord extends CustomerRecord {
  currentDue: string;
}

/** Contains one page of customer records and the matching total count. */
export interface PaginatedCustomerRecords {
  items: CustomerListRecord[];
  total: number;
}

/** Builds customer-list filters from the approved query fields. */
function buildCustomerFilters(query: ListCustomersQuery): SQL[] {
  const filters: SQL[] = [];

  if (query.active !== undefined) {
    filters.push(eq(customers.isActive, query.active));
  }

  if (query.search) {
    const searchPattern = `%${query.search}%`;
    const searchFilter = or(
      ilike(customers.code, searchPattern),
      ilike(customers.name, searchPattern),
      ilike(customers.phone, searchPattern),
    );

    if (searchFilter) {
      filters.push(searchFilter);
    }
  }

  return filters;
}

/** Lists customers using search, active status and pagination. */
export async function listCustomers(
  database: CustomersDatabase,
  query: ListCustomersQuery,
): Promise<PaginatedCustomerRecords> {
  const filters = buildCustomerFilters(query);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;

  const customerRows = await database
    .select()
    .from(customers)
    .where(where)
    .orderBy(asc(customers.name), asc(customers.id))
    .limit(query.pageSize)
    .offset(offset);

  const dueRows = customerRows.length > 0
    ? await database
      .select({
        customerId: customerLedgerEntries.customerId,
        currentDue: sql<string>`coalesce(sum(${customerLedgerEntries.debit} - ${customerLedgerEntries.credit}), 0)::numeric(14,2)::text`,
      })
      .from(customerLedgerEntries)
      .where(inArray(customerLedgerEntries.customerId, customerRows.map((customer) => customer.id)))
      .groupBy(customerLedgerEntries.customerId)
    : [];
  const dueByCustomerId = new Map(
    dueRows.map((row) => [row.customerId, row.currentDue]),
  );
  const items = customerRows.map((customer) => ({
    ...customer,
    currentDue: dueByCustomerId.get(customer.id) ?? "0.00",
  }));

  const totalRows = await database
    .select({ total: count() })
    .from(customers)
    .where(where);

  return {
    items,
    total: totalRows[0]?.total ?? 0,
  };
}

/** Reads one customer by UUID. */
export async function findCustomerById(
  database: CustomersDatabase,
  customerId: string,
): Promise<CustomerRecord | null> {
  const rows = await database
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  return rows[0] ?? null;
}

/** Locks one customer row before a financial transaction uses its current state. */
export async function findCustomerByIdForUpdate(
  database: CustomersDatabase,
  customerId: string,
): Promise<CustomerRecord | null> {
  const rows = await database
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .for("update")
    .limit(1);

  return rows[0] ?? null;
}

/** Reads the single protected Walk-in Customer when it exists. */
export async function findWalkInCustomer(
  database: CustomersDatabase,
): Promise<CustomerRecord | null> {
  const rows = await database
    .select()
    .from(customers)
    .where(eq(customers.isWalkIn, true))
    .limit(1);

  return rows[0] ?? null;
}

/** Checks whether normal business activity has started after opening-data setup. */
export async function hasNormalBusinessActivity(
  database: CustomersDatabase,
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

/** Represents one recent confirmed sales invoice shown on the customer profile. */
export interface CustomerRecentInvoiceRecord {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueAmount: string;
}

/** Lists the latest confirmed invoices for one customer with their current due amount. */
export async function listRecentCustomerInvoices(
  database: CustomersDatabase,
  customerId: string,
  limit = 5,
): Promise<CustomerRecentInvoiceRecord[]> {
  const paidAmount = sql<string>`coalesce((
    select sum(${customerPaymentAllocations.amount})
    from ${customerPaymentAllocations}
    inner join ${customerPayments}
      on ${customerPayments.id} = ${customerPaymentAllocations.customerPaymentId}
    where ${customerPaymentAllocations.salesInvoiceId} = ${salesInvoices.id}
      and ${customerPayments.status} = 'CONFIRMED'
      and ${customerPayments.reversalOfPaymentId} is null
  ), 0)`;
  const returnedAmount = sql<string>`coalesce((
    select sum(${salesReturns.totalAmount})
    from ${salesReturns}
    where ${salesReturns.originalSaleId} = ${salesInvoices.id}
      and ${salesReturns.status} = 'CONFIRMED'
  ), 0)`;
  const dueAmount = sql<string>`greatest(${salesInvoices.totalAmount} - ${returnedAmount} - ${paidAmount}, 0)`;

  const rows = await database
    .select({
      id: salesInvoices.id,
      invoiceNumber: salesInvoices.invoiceNumber,
      invoiceDate: salesInvoices.invoiceDate,
      dueAmount: sql<string>`${dueAmount}::text`,
    })
    .from(salesInvoices)
    .where(
      and(
        eq(salesInvoices.customerId, customerId),
        eq(salesInvoices.status, "CONFIRMED"),
      ),
    )
    .orderBy(
      desc(salesInvoices.invoiceDate),
      desc(salesInvoices.createdAt),
      desc(salesInvoices.id),
    )
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    invoiceNumber: row.invoiceNumber as string,
  }));
}

/** Represents one confirmed sales invoice that still has an outstanding customer balance. */
export interface CustomerOpenInvoiceRecord {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueAmount: string;
}

/** Calculates the total invoice-linked due for one customer across every confirmed sale. */
export async function getCustomerOpenInvoiceDueTotal(
  database: CustomersDatabase,
  customerId: string,
): Promise<string> {
  const paidAmount = sql<string>`coalesce((
    select sum(${customerPaymentAllocations.amount})
    from ${customerPaymentAllocations}
    inner join ${customerPayments}
      on ${customerPayments.id} = ${customerPaymentAllocations.customerPaymentId}
    where ${customerPaymentAllocations.salesInvoiceId} = ${salesInvoices.id}
      and ${customerPayments.status} = 'CONFIRMED'
      and ${customerPayments.reversalOfPaymentId} is null
  ), 0)`;
  const returnedAmount = sql<string>`coalesce((
    select sum(${salesReturns.totalAmount})
    from ${salesReturns}
    where ${salesReturns.originalSaleId} = ${salesInvoices.id}
      and ${salesReturns.status} = 'CONFIRMED'
  ), 0)`;
  const dueAmount = sql<string>`greatest(${salesInvoices.totalAmount} - ${returnedAmount} - ${paidAmount}, 0)`;
  const openInvoiceDues = database
    .select({ dueAmount: sql<string>`${dueAmount}::numeric`.as("due_amount") })
    .from(salesInvoices)
    .where(
      and(
        eq(salesInvoices.customerId, customerId),
        eq(salesInvoices.status, "CONFIRMED"),
        sql`${dueAmount} > 0`,
      ),
    )
    .as("customer_open_invoice_due_totals");
  const rows = await database
    .select({
      total: sql<string>`coalesce(sum(${openInvoiceDues.dueAmount}), 0)::numeric(14,2)::text`,
    })
    .from(openInvoiceDues);

  return rows[0]?.total ?? "0.00";
}

/** Lists confirmed invoices with a positive outstanding amount for one customer. */
export async function listCustomerOpenInvoices(
  database: CustomersDatabase,
  customerId: string,
  query: CustomerOpenInvoicesQuery,
): Promise<{ items: CustomerOpenInvoiceRecord[]; total: number }> {
  const offset = (query.page - 1) * query.pageSize;
  const paidAmount = sql<string>`coalesce((
    select sum(${customerPaymentAllocations.amount})
    from ${customerPaymentAllocations}
    inner join ${customerPayments}
      on ${customerPayments.id} = ${customerPaymentAllocations.customerPaymentId}
    where ${customerPaymentAllocations.salesInvoiceId} = ${salesInvoices.id}
      and ${customerPayments.status} = 'CONFIRMED'
      and ${customerPayments.reversalOfPaymentId} is null
  ), 0)`;
  const returnedAmount = sql<string>`coalesce((
    select sum(${salesReturns.totalAmount})
    from ${salesReturns}
    where ${salesReturns.originalSaleId} = ${salesInvoices.id}
      and ${salesReturns.status} = 'CONFIRMED'
  ), 0)`;
  const dueAmount = sql<string>`greatest(${salesInvoices.totalAmount} - ${returnedAmount} - ${paidAmount}, 0)`;
  const baseWhere = and(
    eq(salesInvoices.customerId, customerId),
    eq(salesInvoices.status, "CONFIRMED"),
  );

  const items = await database
    .select({
      id: salesInvoices.id,
      invoiceNumber: salesInvoices.invoiceNumber,
      invoiceDate: salesInvoices.invoiceDate,
      dueAmount: sql<string>`${dueAmount}::text`,
    })
    .from(salesInvoices)
    .where(and(baseWhere, sql`${dueAmount} > 0`))
    .orderBy(asc(salesInvoices.invoiceDate), asc(salesInvoices.id))
    .limit(query.pageSize)
    .offset(offset);

  const countRows = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(
      database
        .select({ invoiceId: salesInvoices.id })
        .from(salesInvoices)
        .where(and(baseWhere, sql`${dueAmount} > 0`))
        .as("open_customer_invoices"),
    );

  return {
    items: items.map((item) => ({
      ...item,
      invoiceNumber: item.invoiceNumber as string,
    })),
    total: countRows[0]?.total ?? 0,
  };
}

/** Creates one customer and returns the saved row. */
export async function createCustomer(
  database: CustomersDatabase,
  input: NewCustomer,
): Promise<CustomerRecord | null> {
  const rows = await database.insert(customers).values(input).returning();
  return rows[0] ?? null;
}

/** Creates the protected Walk-in Customer only when it does not already exist. */
export async function createWalkInCustomerIfMissing(
  database: CustomersDatabase,
): Promise<void> {
  await database
    .insert(customers)
    .values({
      code: "WALK-IN",
      name: "Walk-in Customer",
      phone: null,
      email: null,
      address: null,
      creditLimit: "0.00",
      isWalkIn: true,
      isActive: true,
    })
    .onConflictDoNothing();
}

/** Updates allowed customer fields and refreshes the update timestamp. */
export async function updateCustomer(
  database: CustomersDatabase,
  customerId: string,
  changes: CustomerChanges,
): Promise<CustomerRecord | null> {
  const rows = await database
    .update(customers)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(customers.id, customerId))
    .returning();

  return rows[0] ?? null;
}
