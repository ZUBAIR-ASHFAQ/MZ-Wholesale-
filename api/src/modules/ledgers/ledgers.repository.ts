import { and, asc, count, desc, eq, gt, ilike, or, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  customerLedgerEntries,
  customers,
  supplierLedgerEntries,
  suppliers,
} from "../../database/schema/index.js";
import type { LedgerStatementQuery, OutstandingListQuery } from "./ledgers.schema.js";

export type LedgersDatabase = Pick<NodePgDatabase, "select" | "insert">;
export type CustomerLedgerEntry = typeof customerLedgerEntries.$inferSelect;
export type SupplierLedgerEntry = typeof supplierLedgerEntries.$inferSelect;

export interface CustomerStatementEntry extends CustomerLedgerEntry {
  periodEffect: string;
}

export interface SupplierStatementEntry extends SupplierLedgerEntry {
  periodEffect: string;
}

export interface LedgerStatementPage<T> {
  openingBalance: string;
  entries: T[];
  totalDebit: string;
  totalCredit: string;
  closingBalance: string;
  page: number;
  pageSize: number;
  total: number;
}

export interface OutstandingPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Converts a decimal money string to integer cents for exact calculations. */
function moneyToCents(value: unknown): bigint {
  const text = String(value ?? "0").trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);

  if (!match) {
    throw new Error("Database returned an invalid money value.");
  }

  const sign = match[1] === "-" ? -1n : 1n;
  const whole = BigInt(match[2]);
  const fraction = (match[3] ?? "").padEnd(2, "0");

  // Ledger columns use numeric(14,2), so extra non-zero decimal places
  // indicate a schema or query contract problem rather than a value to round.
  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) {
    throw new Error("Database money value has more than two decimal places.");
  }

  return sign * (whole * 100n + BigInt(fraction.slice(0, 2) || "0"));
}

/** Formats integer cents as a two-decimal money string. */
function centsToMoney(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

/** Converts the money. */
function toMoney(value: unknown): string {
  return centsToMoney(moneyToCents(value));
}

/** Builds customer-ledger date filters from the requested statement range. */
function customerDateFilters(query: LedgerStatementQuery): SQL[] {
  const filters: SQL[] = [];
  if (query.startDate) filters.push(sql`timezone('Asia/Karachi', ${customerLedgerEntries.occurredAt})::date >= ${query.startDate}::date`);
  if (query.endDate) filters.push(sql`timezone('Asia/Karachi', ${customerLedgerEntries.occurredAt})::date <= ${query.endDate}::date`);
  return filters;
}

/** Builds supplier-ledger date filters from the requested statement range. */
function supplierDateFilters(query: LedgerStatementQuery): SQL[] {
  const filters: SQL[] = [];
  if (query.startDate) filters.push(sql`timezone('Asia/Karachi', ${supplierLedgerEntries.occurredAt})::date >= ${query.startDate}::date`);
  if (query.endDate) filters.push(sql`timezone('Asia/Karachi', ${supplierLedgerEntries.occurredAt})::date <= ${query.endDate}::date`);
  return filters;
}

/** Finds the customer by id. */
export async function findCustomerById(database: LedgersDatabase, customerId: string) {
  const rows = await database.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  return rows[0] ?? null;
}

/** Finds the supplier by id. */
export async function findSupplierById(database: LedgersDatabase, supplierId: string) {
  const rows = await database.select().from(suppliers).where(eq(suppliers.id, supplierId)).limit(1);
  return rows[0] ?? null;
}

/** Reads the customer current due. */
export async function readCustomerCurrentDue(database: LedgersDatabase, customerId: string): Promise<string> {
  const rows = await database
    .select({ balance: sql<string>`coalesce(sum(${customerLedgerEntries.debit} - ${customerLedgerEntries.credit}), 0)` })
    .from(customerLedgerEntries)
    .where(eq(customerLedgerEntries.customerId, customerId));

  return toMoney(rows[0]?.balance);
}

/** Reads the supplier current payable. */
export async function readSupplierCurrentPayable(database: LedgersDatabase, supplierId: string): Promise<string> {
  const rows = await database
    .select({ balance: sql<string>`coalesce(sum(${supplierLedgerEntries.credit} - ${supplierLedgerEntries.debit}), 0)` })
    .from(supplierLedgerEntries)
    .where(eq(supplierLedgerEntries.supplierId, supplierId));

  return toMoney(rows[0]?.balance);
}

/** Lists the customer statement entries. */
export async function listCustomerStatementEntries(
  database: LedgersDatabase,
  customerId: string,
  query: LedgerStatementQuery,
): Promise<CustomerStatementEntry[]> {
  const filters = [eq(customerLedgerEntries.customerId, customerId), ...customerDateFilters(query)];

  return database
    .select({
      id: customerLedgerEntries.id,
      customerId: customerLedgerEntries.customerId,
      occurredAt: customerLedgerEntries.occurredAt,
      referenceType: customerLedgerEntries.referenceType,
      referenceId: customerLedgerEntries.referenceId,
      documentNumber: customerLedgerEntries.documentNumber,
      description: customerLedgerEntries.description,
      debit: customerLedgerEntries.debit,
      credit: customerLedgerEntries.credit,
      notes: customerLedgerEntries.notes,
      createdAt: customerLedgerEntries.createdAt,
      periodEffect: sql<string>`sum(${customerLedgerEntries.debit} - ${customerLedgerEntries.credit}) over (order by ${customerLedgerEntries.occurredAt}, ${customerLedgerEntries.createdAt}, ${customerLedgerEntries.id} rows between unbounded preceding and current row)`,
    })
    .from(customerLedgerEntries)
    .where(and(...filters))
    .orderBy(asc(customerLedgerEntries.occurredAt), asc(customerLedgerEntries.createdAt), asc(customerLedgerEntries.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);
}

/** Counts customer statement entries that match the selected date range. */
export async function countCustomerStatementEntries(
  database: LedgersDatabase,
  customerId: string,
  query: LedgerStatementQuery,
): Promise<number> {
  const filters = [eq(customerLedgerEntries.customerId, customerId), ...customerDateFilters(query)];
  const rows = await database.select({ total: count() }).from(customerLedgerEntries).where(and(...filters));
  return rows[0]?.total ?? 0;
}

/** Calculates customer debit and credit totals for the selected statement period. */
async function sumCustomerStatementPeriod(
  database: LedgersDatabase,
  customerId: string,
  query: LedgerStatementQuery,
): Promise<{ debit: string; credit: string }> {
  const filters = [eq(customerLedgerEntries.customerId, customerId), ...customerDateFilters(query)];
  const rows = await database
    .select({
      debit: sql<string>`coalesce(sum(${customerLedgerEntries.debit}), 0)`,
      credit: sql<string>`coalesce(sum(${customerLedgerEntries.credit}), 0)`,
    })
    .from(customerLedgerEntries)
    .where(and(...filters));

  return { debit: toMoney(rows[0]?.debit), credit: toMoney(rows[0]?.credit) };
}

/** Calculates the customer opening balance before the selected start date. */
export async function sumCustomerBalanceBeforeDate(
  database: LedgersDatabase,
  customerId: string,
  startDate?: string,
): Promise<string> {
  if (!startDate) return "0.00";

  const rows = await database
    .select({ value: sql<string>`coalesce(sum(${customerLedgerEntries.debit} - ${customerLedgerEntries.credit}), 0)` })
    .from(customerLedgerEntries)
    .where(and(eq(customerLedgerEntries.customerId, customerId), sql`timezone('Asia/Karachi', ${customerLedgerEntries.occurredAt})::date < ${startDate}::date`));

  return toMoney(rows[0]?.value);
}

/** Lists the supplier statement entries. */
export async function listSupplierStatementEntries(
  database: LedgersDatabase,
  supplierId: string,
  query: LedgerStatementQuery,
): Promise<SupplierStatementEntry[]> {
  const filters = [eq(supplierLedgerEntries.supplierId, supplierId), ...supplierDateFilters(query)];

  return database
    .select({
      id: supplierLedgerEntries.id,
      supplierId: supplierLedgerEntries.supplierId,
      occurredAt: supplierLedgerEntries.occurredAt,
      referenceType: supplierLedgerEntries.referenceType,
      referenceId: supplierLedgerEntries.referenceId,
      documentNumber: supplierLedgerEntries.documentNumber,
      description: supplierLedgerEntries.description,
      debit: supplierLedgerEntries.debit,
      credit: supplierLedgerEntries.credit,
      notes: supplierLedgerEntries.notes,
      createdAt: supplierLedgerEntries.createdAt,
      periodEffect: sql<string>`sum(${supplierLedgerEntries.credit} - ${supplierLedgerEntries.debit}) over (order by ${supplierLedgerEntries.occurredAt}, ${supplierLedgerEntries.createdAt}, ${supplierLedgerEntries.id} rows between unbounded preceding and current row)`,
    })
    .from(supplierLedgerEntries)
    .where(and(...filters))
    .orderBy(asc(supplierLedgerEntries.occurredAt), asc(supplierLedgerEntries.createdAt), asc(supplierLedgerEntries.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);
}

/** Counts supplier statement entries that match the selected date range. */
export async function countSupplierStatementEntries(
  database: LedgersDatabase,
  supplierId: string,
  query: LedgerStatementQuery,
): Promise<number> {
  const filters = [eq(supplierLedgerEntries.supplierId, supplierId), ...supplierDateFilters(query)];
  const rows = await database.select({ total: count() }).from(supplierLedgerEntries).where(and(...filters));
  return rows[0]?.total ?? 0;
}

/** Calculates supplier debit and credit totals for the selected statement period. */
async function sumSupplierStatementPeriod(
  database: LedgersDatabase,
  supplierId: string,
  query: LedgerStatementQuery,
): Promise<{ debit: string; credit: string }> {
  const filters = [eq(supplierLedgerEntries.supplierId, supplierId), ...supplierDateFilters(query)];
  const rows = await database
    .select({
      debit: sql<string>`coalesce(sum(${supplierLedgerEntries.debit}), 0)`,
      credit: sql<string>`coalesce(sum(${supplierLedgerEntries.credit}), 0)`,
    })
    .from(supplierLedgerEntries)
    .where(and(...filters));

  return { debit: toMoney(rows[0]?.debit), credit: toMoney(rows[0]?.credit) };
}

/** Calculates the supplier opening balance before the selected start date. */
export async function sumSupplierBalanceBeforeDate(
  database: LedgersDatabase,
  supplierId: string,
  startDate?: string,
): Promise<string> {
  if (!startDate) return "0.00";

  const rows = await database
    .select({ value: sql<string>`coalesce(sum(${supplierLedgerEntries.credit} - ${supplierLedgerEntries.debit}), 0)` })
    .from(supplierLedgerEntries)
    .where(and(eq(supplierLedgerEntries.supplierId, supplierId), sql`timezone('Asia/Karachi', ${supplierLedgerEntries.occurredAt})::date < ${startDate}::date`));

  return toMoney(rows[0]?.value);
}

/** Reads the customer statement. */
export async function readCustomerStatement(
  database: LedgersDatabase,
  customerId: string,
  query: LedgerStatementQuery,
): Promise<LedgerStatementPage<CustomerStatementEntry>> {
  const [entries, total, period, openingBalance] = await Promise.all([
    listCustomerStatementEntries(database, customerId, query),
    countCustomerStatementEntries(database, customerId, query),
    sumCustomerStatementPeriod(database, customerId, query),
    sumCustomerBalanceBeforeDate(database, customerId, query.startDate),
  ]);

  return {
    openingBalance,
    entries,
    totalDebit: period.debit,
    totalCredit: period.credit,
    closingBalance: centsToMoney(moneyToCents(openingBalance) + moneyToCents(period.debit) - moneyToCents(period.credit)),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

/** Reads the supplier statement. */
export async function readSupplierStatement(
  database: LedgersDatabase,
  supplierId: string,
  query: LedgerStatementQuery,
): Promise<LedgerStatementPage<SupplierStatementEntry>> {
  const [entries, total, period, openingBalance] = await Promise.all([
    listSupplierStatementEntries(database, supplierId, query),
    countSupplierStatementEntries(database, supplierId, query),
    sumSupplierStatementPeriod(database, supplierId, query),
    sumSupplierBalanceBeforeDate(database, supplierId, query.startDate),
  ]);

  return {
    openingBalance,
    entries,
    totalDebit: period.debit,
    totalCredit: period.credit,
    closingBalance: centsToMoney(moneyToCents(openingBalance) + moneyToCents(period.credit) - moneyToCents(period.debit)),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

/** Builds the query that returns customers with an outstanding balance. */
function customerOutstandingQuery(database: LedgersDatabase, query: OutstandingListQuery) {
  const balanceExpression = sql<string>`sum(${customerLedgerEntries.debit} - ${customerLedgerEntries.credit})`;
  const search = query.search
    ? or(
        ilike(customers.code, `%${query.search}%`),
        ilike(customers.name, `%${query.search}%`),
        ilike(customers.phone, `%${query.search}%`),
      )
    : undefined;

  return database
    .select({
      customerId: customers.id,
      customerCode: customers.code,
      customerName: customers.name,
      phone: customers.phone,
      outstandingAmount: balanceExpression.as("outstanding_amount"),
    })
    .from(customers)
    .innerJoin(customerLedgerEntries, eq(customerLedgerEntries.customerId, customers.id))
    .where(and(eq(customers.isWalkIn, false), search))
    .groupBy(customers.id)
    .having(gt(balanceExpression, "0"))
    .as("customer_outstanding");
}

/** Lists the customer outstanding. */
export async function listCustomerOutstanding(database: LedgersDatabase, query: OutstandingListQuery) {
  const grouped = customerOutstandingQuery(database, query);
  return database
    .select()
    .from(grouped)
    .orderBy(desc(grouped.outstandingAmount), asc(grouped.customerName), asc(grouped.customerId))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);
}

/** Counts customers that match the outstanding-balance filters. */
export async function countCustomerOutstanding(database: LedgersDatabase, query: OutstandingListQuery): Promise<number> {
  const grouped = customerOutstandingQuery(database, query);
  const rows = await database.select({ total: count() }).from(grouped);
  return rows[0]?.total ?? 0;
}

/** Builds the query that returns suppliers with a payable balance. */
function supplierPayablesQuery(database: LedgersDatabase, query: OutstandingListQuery) {
  const balanceExpression = sql<string>`sum(${supplierLedgerEntries.credit} - ${supplierLedgerEntries.debit})`;
  const search = query.search
    ? or(
        ilike(suppliers.code, `%${query.search}%`),
        ilike(suppliers.name, `%${query.search}%`),
        ilike(suppliers.phone, `%${query.search}%`),
      )
    : undefined;

  return database
    .select({
      supplierId: suppliers.id,
      supplierCode: suppliers.code,
      supplierName: suppliers.name,
      phone: suppliers.phone,
      payableAmount: balanceExpression.as("payable_amount"),
    })
    .from(suppliers)
    .innerJoin(supplierLedgerEntries, eq(supplierLedgerEntries.supplierId, suppliers.id))
    .where(search)
    .groupBy(suppliers.id)
    .having(gt(balanceExpression, "0"))
    .as("supplier_payables");
}

/** Lists the supplier payables. */
export async function listSupplierPayables(database: LedgersDatabase, query: OutstandingListQuery) {
  const grouped = supplierPayablesQuery(database, query);
  return database
    .select()
    .from(grouped)
    .orderBy(desc(grouped.payableAmount), asc(grouped.supplierName), asc(grouped.supplierId))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);
}

/** Counts suppliers that match the payable-balance filters. */
export async function countSupplierPayables(database: LedgersDatabase, query: OutstandingListQuery): Promise<number> {
  const grouped = supplierPayablesQuery(database, query);
  const rows = await database.select({ total: count() }).from(grouped);
  return rows[0]?.total ?? 0;
}

/** Reads the customer outstanding page. */
export async function readCustomerOutstandingPage(
  database: LedgersDatabase,
  query: OutstandingListQuery,
): Promise<OutstandingPage<Awaited<ReturnType<typeof listCustomerOutstanding>>[number]>> {
  const [items, total] = await Promise.all([
    listCustomerOutstanding(database, query),
    countCustomerOutstanding(database, query),
  ]);
  return { items, page: query.page, pageSize: query.pageSize, total };
}

/** Reads the supplier payables page. */
export async function readSupplierPayablesPage(
  database: LedgersDatabase,
  query: OutstandingListQuery,
): Promise<OutstandingPage<Awaited<ReturnType<typeof listSupplierPayables>>[number]>> {
  const [items, total] = await Promise.all([
    listSupplierPayables(database, query),
    countSupplierPayables(database, query),
  ]);
  return { items, page: query.page, pageSize: query.pageSize, total };
}

/** Finds the customer entry by source. */
export async function findCustomerEntryBySource(
  database: LedgersDatabase,
  input: { customerId: string; referenceType: string; referenceId: string | null },
): Promise<CustomerLedgerEntry | null> {
  const sourceFilter = input.referenceId === null
    ? sql`${customerLedgerEntries.referenceId} is null`
    : eq(customerLedgerEntries.referenceId, input.referenceId);

  const rows = await database
    .select()
    .from(customerLedgerEntries)
    .where(
      and(
        eq(customerLedgerEntries.customerId, input.customerId),
        eq(customerLedgerEntries.referenceType, input.referenceType),
        sourceFilter,
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/** Finds the supplier entry by source. */
export async function findSupplierEntryBySource(
  database: LedgersDatabase,
  input: { supplierId: string; referenceType: string; referenceId: string | null },
): Promise<SupplierLedgerEntry | null> {
  const sourceFilter = input.referenceId === null
    ? sql`${supplierLedgerEntries.referenceId} is null`
    : eq(supplierLedgerEntries.referenceId, input.referenceId);

  const rows = await database
    .select()
    .from(supplierLedgerEntries)
    .where(
      and(
        eq(supplierLedgerEntries.supplierId, input.supplierId),
        eq(supplierLedgerEntries.referenceType, input.referenceType),
        sourceFilter,
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/** Creates the customer ledger entry. */
export async function createCustomerLedgerEntry(
  database: LedgersDatabase,
  input: typeof customerLedgerEntries.$inferInsert,
): Promise<CustomerLedgerEntry> {
  const rows = await database.insert(customerLedgerEntries).values(input).returning();
  if (!rows[0]) throw new Error("Customer ledger entry was not created.");
  return rows[0];
}

/** Creates the supplier ledger entry. */
export async function createSupplierLedgerEntry(
  database: LedgersDatabase,
  input: typeof supplierLedgerEntries.$inferInsert,
): Promise<SupplierLedgerEntry> {
  const rows = await database.insert(supplierLedgerEntries).values(input).returning();
  if (!rows[0]) throw new Error("Supplier ledger entry was not created.");
  return rows[0];
}
