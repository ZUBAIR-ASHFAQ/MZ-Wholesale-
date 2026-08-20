import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  bankAccounts,
  cashAccounts,
  cashBankMovements,
  cashBankTransfers,
  cashReconciliations,
  customerPaymentAllocations,
  customerPaymentSplits,
  customerPayments,
  supplierPaymentAllocations,
  supplierPaymentSplits,
  supplierPayments,
  purchases,
  purchaseReturns,
  salesInvoices,
  salesReturns,
} from "../../database/schema/index.js";

/** Contains only the database methods needed by the Payments repository. */
export type PaymentsDatabase = Pick<
  NodePgDatabase,
  "select" | "insert" | "update"
> & {
  transaction?: NodePgDatabase["transaction"];
};

/** Represents one saved cash account. */
export type CashAccountRecord = typeof cashAccounts.$inferSelect;

/** Represents one saved bank account. */
export type BankAccountRecord = typeof bankAccounts.$inferSelect;

/** Contains the values needed to create a cash account. */
export type NewCashAccount = typeof cashAccounts.$inferInsert;

/** Contains the values needed to create a bank account. */
export type NewBankAccount = typeof bankAccounts.$inferInsert;

/** Represents one saved immutable customer receipt header. */
export type CustomerPaymentRecord = typeof customerPayments.$inferSelect;

/** Contains the values needed to create one customer receipt header. */
export type NewCustomerPayment = typeof customerPayments.$inferInsert;

/** Represents one saved customer receipt split. */
export type CustomerPaymentSplitRecord = typeof customerPaymentSplits.$inferSelect;

/** Contains the values needed to create one customer receipt split. */
export type NewCustomerPaymentSplit = typeof customerPaymentSplits.$inferInsert;

/** Represents one saved customer receipt allocation. */
export type CustomerPaymentAllocationRecord = typeof customerPaymentAllocations.$inferSelect;

/** Contains the values needed to create one customer receipt allocation. */
export type NewCustomerPaymentAllocation = typeof customerPaymentAllocations.$inferInsert;

/** Contains filters and pagination for customer receipt history. */
export interface CustomerPaymentListOptions {
  customerId?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  pageSize: number;
}

/** Represents one confirmed sales invoice locked for customer-receipt allocation validation. */
export interface CustomerPaymentSaleRecord {
  id: string;
  customerId: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: string;
  returnedAmount: string;
  allocatedAmount: string;
}

/** Represents one saved immutable supplier payment header. */
export type SupplierPaymentRecord = typeof supplierPayments.$inferSelect;

/** Contains the values needed to create one supplier payment header. */
export type NewSupplierPayment = typeof supplierPayments.$inferInsert;

/** Represents one saved supplier payment split. */
export type SupplierPaymentSplitRecord = typeof supplierPaymentSplits.$inferSelect;

/** Contains the values needed to create one supplier payment split. */
export type NewSupplierPaymentSplit = typeof supplierPaymentSplits.$inferInsert;

/** Represents one saved supplier payment allocation. */
export type SupplierPaymentAllocationRecord = typeof supplierPaymentAllocations.$inferSelect;

/** Contains the values needed to create one supplier payment allocation. */
export type NewSupplierPaymentAllocation = typeof supplierPaymentAllocations.$inferInsert;

/** Contains filters and pagination for supplier payment history. */
export interface SupplierPaymentListOptions {
  supplierId?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  pageSize: number;
}

/** Represents one confirmed purchase locked for supplier-payment allocation validation. */
export interface SupplierPaymentPurchaseRecord {
  id: string;
  supplierId: string;
  purchaseNumber: string;
  purchaseDate: string;
  totalAmount: string;
  returnedAmount: string;
  allocatedAmount: string;
}

/** Represents one saved immutable cash or bank transfer. */
export type CashBankTransferRecord = typeof cashBankTransfers.$inferSelect;

/** Contains the values needed to create one immutable transfer. */
export type NewCashBankTransfer = typeof cashBankTransfers.$inferInsert;

/** Contains filters and pagination for transfer history. */
export interface TransferListOptions {
  startDate?: string;
  endDate?: string;
  page: number;
  pageSize: number;
}

/** Represents one transfer row prepared for the Payments service. */
export interface CashBankTransferListItem extends CashBankTransferRecord {
  sourceAccountName: string;
  destinationAccountName: string;
}

/** Represents one saved cash reconciliation. */
export type CashReconciliationRecord = typeof cashReconciliations.$inferSelect;

/** Contains the values needed to create one draft cash reconciliation. */
export type NewCashReconciliation = typeof cashReconciliations.$inferInsert;

/** Contains the fields that may change while a reconciliation is still a draft. */
export interface CashReconciliationChanges {
  countedAmount?: string;
  differenceAmount?: string;
  notes?: string | null;
}

/** Contains the final values saved when a draft reconciliation is confirmed. */
export interface CashReconciliationConfirmation {
  systemBalance: string;
  differenceAmount: string;
  confirmedAt: Date;
}

/** Contains filters and pagination for cash reconciliation history. */
export interface ReconciliationListOptions {
  status?: "DRAFT" | "CONFIRMED";
  startDate?: string;
  endDate?: string;
  page: number;
  pageSize: number;
}

/** Adds a readable cash-account name to one reconciliation row. */
export interface CashReconciliationListItem extends CashReconciliationRecord {
  cashAccountName: string;
}

/** Contains the values needed to create one immutable account movement. */
export type NewCashBankMovement = typeof cashBankMovements.$inferInsert;

/** Represents one saved immutable account movement. */
export type CashBankMovementRecord = typeof cashBankMovements.$inferSelect;

/** Describes the source identity used to detect a duplicate account movement. */
export interface MovementSourceLookup {
  method: NewCashBankMovement["method"];
  cashAccountId: string | null;
  bankAccountId: string | null;
  direction: NewCashBankMovement["direction"];
  sourceType: NewCashBankMovement["sourceType"];
  sourceId: string | null;
}

/** Contains filters and pagination for the immutable movement history. */
export interface MovementListOptions {
  accountType?: "CASH" | "BANK";
  accountId?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  pageSize: number;
}

/** Represents one movement row prepared for the Payments service. */
export interface CashBankMovementListItem {
  id: string;
  occurredAt: Date;
  accountType: "CASH" | "BANK";
  accountId: string;
  accountName: string;
  direction: CashBankMovementRecord["direction"];
  method: CashBankMovementRecord["method"];
  sourceType: CashBankMovementRecord["sourceType"];
  sourceId: string | null;
  documentNumber: string | null;
  amount: string;
  description: string | null;
}

/** Contains the cash-account fields that may be changed. */
export interface CashAccountChanges {
  name?: string;
  isActive?: boolean;
}

/** Contains the bank-account fields that may be changed. */
export interface BankAccountChanges {
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  isActive?: boolean;
}

/** Adds a calculated balance to one cash-account row. */
export interface CashAccountWithBalance extends CashAccountRecord {
  balance: string;
}

/** Adds a calculated balance to one bank-account row. */
export interface BankAccountWithBalance extends BankAccountRecord {
  balance: string;
}

/** Lists cash accounts with balances calculated from immutable movements. */
export async function listCashAccounts(
  database: PaymentsDatabase,
): Promise<CashAccountWithBalance[]> {
  return database
    .select({
      id: cashAccounts.id,
      name: cashAccounts.name,
      openingBalance: cashAccounts.openingBalance,
      isActive: cashAccounts.isActive,
      createdAt: cashAccounts.createdAt,
      balance: sql<string>`(
        ${cashAccounts.openingBalance} + coalesce(sum(
          case
            when ${cashBankMovements.direction} = 'INFLOW' then ${cashBankMovements.amount}
            when ${cashBankMovements.direction} = 'OUTFLOW' then -${cashBankMovements.amount}
            else 0
          end
        ), 0)
      )::text`,
    })
    .from(cashAccounts)
    .leftJoin(
      cashBankMovements,
      and(
        eq(cashBankMovements.cashAccountId, cashAccounts.id),
        ne(cashBankMovements.sourceType, "OPENING_BALANCE"),
      ),
    )
    .groupBy(
      cashAccounts.id,
      cashAccounts.name,
      cashAccounts.openingBalance,
      cashAccounts.isActive,
      cashAccounts.createdAt,
    )
    .orderBy(asc(cashAccounts.name), asc(cashAccounts.id));
}

/** Lists bank accounts with balances calculated from immutable movements. */
export async function listBankAccounts(
  database: PaymentsDatabase,
): Promise<BankAccountWithBalance[]> {
  return database
    .select({
      id: bankAccounts.id,
      bankName: bankAccounts.bankName,
      accountName: bankAccounts.accountName,
      accountNumber: bankAccounts.accountNumber,
      openingBalance: bankAccounts.openingBalance,
      isActive: bankAccounts.isActive,
      createdAt: bankAccounts.createdAt,
      balance: sql<string>`(
        ${bankAccounts.openingBalance} + coalesce(sum(
          case
            when ${cashBankMovements.direction} = 'INFLOW' then ${cashBankMovements.amount}
            when ${cashBankMovements.direction} = 'OUTFLOW' then -${cashBankMovements.amount}
            else 0
          end
        ), 0)
      )::text`,
    })
    .from(bankAccounts)
    .leftJoin(
      cashBankMovements,
      and(
        eq(cashBankMovements.bankAccountId, bankAccounts.id),
        ne(cashBankMovements.sourceType, "OPENING_BALANCE"),
      ),
    )
    .groupBy(
      bankAccounts.id,
      bankAccounts.bankName,
      bankAccounts.accountName,
      bankAccounts.accountNumber,
      bankAccounts.openingBalance,
      bankAccounts.isActive,
      bankAccounts.createdAt,
    )
    .orderBy(
      asc(bankAccounts.bankName),
      asc(bankAccounts.accountName),
      asc(bankAccounts.id),
    );
}

/** Reads one cash account by UUID. */
export async function findCashAccountById(
  database: PaymentsDatabase,
  accountId: string,
): Promise<CashAccountRecord | null> {
  const rows = await database
    .select()
    .from(cashAccounts)
    .where(eq(cashAccounts.id, accountId))
    .limit(1);

  return rows[0] ?? null;
}

/** Reads one bank account by UUID. */
export async function findBankAccountById(
  database: PaymentsDatabase,
  accountId: string,
): Promise<BankAccountRecord | null> {
  const rows = await database
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.id, accountId))
    .limit(1);

  return rows[0] ?? null;
}

/** Reads a cash account by its unique name. */
export async function findCashAccountByName(
  database: PaymentsDatabase,
  name: string,
): Promise<CashAccountRecord | null> {
  const rows = await database
    .select()
    .from(cashAccounts)
    .where(eq(cashAccounts.name, name))
    .limit(1);

  return rows[0] ?? null;
}

/** Reads a bank account by its unique account number. */
export async function findBankAccountByAccountNumber(
  database: PaymentsDatabase,
  accountNumber: string,
): Promise<BankAccountRecord | null> {
  const rows = await database
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.accountNumber, accountNumber))
    .limit(1);

  return rows[0] ?? null;
}

/** Creates one cash account and returns the saved row. */
export async function createCashAccount(
  database: PaymentsDatabase,
  input: NewCashAccount,
): Promise<CashAccountRecord | null> {
  const rows = await database.insert(cashAccounts).values(input).returning();
  return rows[0] ?? null;
}

/** Creates one bank account and returns the saved row. */
export async function createBankAccount(
  database: PaymentsDatabase,
  input: NewBankAccount,
): Promise<BankAccountRecord | null> {
  const rows = await database.insert(bankAccounts).values(input).returning();
  return rows[0] ?? null;
}

/** Updates the allowed cash-account fields and returns the saved row. */
export async function updateCashAccount(
  database: PaymentsDatabase,
  accountId: string,
  changes: CashAccountChanges,
): Promise<CashAccountRecord | null> {
  const rows = await database
    .update(cashAccounts)
    .set(changes)
    .where(eq(cashAccounts.id, accountId))
    .returning();

  return rows[0] ?? null;
}

/** Updates the allowed bank-account fields and returns the saved row. */
export async function updateBankAccount(
  database: PaymentsDatabase,
  accountId: string,
  changes: BankAccountChanges,
): Promise<BankAccountRecord | null> {
  const rows = await database
    .update(bankAccounts)
    .set(changes)
    .where(eq(bankAccounts.id, accountId))
    .returning();

  return rows[0] ?? null;
}

/** Locks one cash account so a transaction can safely change related money data. */
export async function lockCashAccount(
  database: PaymentsDatabase,
  accountId: string,
): Promise<CashAccountRecord | null> {
  const rows = await database
    .select()
    .from(cashAccounts)
    .where(eq(cashAccounts.id, accountId))
    .limit(1)
    .for("update");

  return rows[0] ?? null;
}

/** Locks one bank account so a transaction can safely change related money data. */
export async function lockBankAccount(
  database: PaymentsDatabase,
  accountId: string,
): Promise<BankAccountRecord | null> {
  const rows = await database
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.id, accountId))
    .limit(1)
    .for("update");

  return rows[0] ?? null;
}

/** Calculates one cash-account balance from immutable inflow and outflow rows. */
export async function readCashAccountBalance(
  database: PaymentsDatabase,
  accountId: string,
): Promise<string> {
  const rows = await database
    .select({
      balance: sql<string>`(
        ${cashAccounts.openingBalance} + coalesce(sum(
          case
            when ${cashBankMovements.direction} = 'INFLOW' then ${cashBankMovements.amount}
            when ${cashBankMovements.direction} = 'OUTFLOW' then -${cashBankMovements.amount}
            else 0
          end
        ), 0)
      )::text`,
    })
    .from(cashAccounts)
    .leftJoin(
      cashBankMovements,
      and(
        eq(cashBankMovements.cashAccountId, cashAccounts.id),
        ne(cashBankMovements.sourceType, "OPENING_BALANCE"),
      ),
    )
    .where(eq(cashAccounts.id, accountId))
    .groupBy(cashAccounts.id, cashAccounts.openingBalance)
    .limit(1);

  return rows[0]?.balance ?? "0.00";
}

/** Contains the daily cash inflow and outflow totals for one account. */
export interface DailyCashMovementTotals {
  inflows: string;
  outflows: string;
}

/** Calculates the cash balance immediately before one Asia/Karachi business date. */
export async function getCashBalanceBeforeDate(
  database: PaymentsDatabase,
  cashAccountId: string,
  date: string,
): Promise<string> {
  const rows = await database
    .select({
      balance: sql<string>`coalesce(sum(
        case
          when ${cashBankMovements.direction} = 'INFLOW' then ${cashBankMovements.amount}
          else -${cashBankMovements.amount}
        end
      ), 0)::text`,
    })
    .from(cashBankMovements)
    .where(
      and(
        eq(cashBankMovements.cashAccountId, cashAccountId),
        sql`timezone('Asia/Karachi', ${cashBankMovements.occurredAt})::date < ${date}::date`,
      ),
    );

  return rows[0]?.balance ?? "0.00";
}

/** Sums cash inflows and outflows for one Asia/Karachi business date. */
export async function sumCashMovementsForDate(
  database: PaymentsDatabase,
  cashAccountId: string,
  date: string,
): Promise<DailyCashMovementTotals> {
  const rows = await database
    .select({
      inflows: sql<string>`coalesce(sum(
        case
          when ${cashBankMovements.direction} = 'INFLOW' then ${cashBankMovements.amount}
          else 0
        end
      ), 0)::text`,
      outflows: sql<string>`coalesce(sum(
        case
          when ${cashBankMovements.direction} = 'OUTFLOW' then ${cashBankMovements.amount}
          else 0
        end
      ), 0)::text`,
    })
    .from(cashBankMovements)
    .where(
      and(
        eq(cashBankMovements.cashAccountId, cashAccountId),
        sql`timezone('Asia/Karachi', ${cashBankMovements.occurredAt})::date = ${date}::date`,
      ),
    );

  return {
    inflows: rows[0]?.inflows ?? "0.00",
    outflows: rows[0]?.outflows ?? "0.00",
  };
}

/** Finds the confirmed cash reconciliation for one account and business date. */
export async function findCashReconciliationForDate(
  database: PaymentsDatabase,
  cashAccountId: string,
  date: string,
): Promise<CashReconciliationRecord | null> {
  const rows = await database
    .select()
    .from(cashReconciliations)
    .where(
      and(
        eq(cashReconciliations.cashAccountId, cashAccountId),
        eq(cashReconciliations.status, "CONFIRMED"),
        sql`timezone('Asia/Karachi', ${cashReconciliations.reconciliationDate})::date = ${date}::date`,
      ),
    )
    .orderBy(
      desc(cashReconciliations.confirmedAt),
      desc(cashReconciliations.createdAt),
      desc(cashReconciliations.id),
    )
    .limit(1);

  return rows[0] ?? null;
}

/** Calculates one bank-account balance from immutable inflow and outflow rows. */
export async function readBankAccountBalance(
  database: PaymentsDatabase,
  accountId: string,
): Promise<string> {
  const rows = await database
    .select({
      balance: sql<string>`(
        ${bankAccounts.openingBalance} + coalesce(sum(
          case
            when ${cashBankMovements.direction} = 'INFLOW' then ${cashBankMovements.amount}
            when ${cashBankMovements.direction} = 'OUTFLOW' then -${cashBankMovements.amount}
            else 0
          end
        ), 0)
      )::text`,
    })
    .from(bankAccounts)
    .leftJoin(
      cashBankMovements,
      and(
        eq(cashBankMovements.bankAccountId, bankAccounts.id),
        ne(cashBankMovements.sourceType, "OPENING_BALANCE"),
      ),
    )
    .where(eq(bankAccounts.id, accountId))
    .groupBy(bankAccounts.id, bankAccounts.openingBalance)
    .limit(1);

  return rows[0]?.balance ?? "0.00";
}

/** Creates one immutable cash or bank movement and returns the saved row. */
export async function createCashBankMovement(
  database: PaymentsDatabase,
  input: NewCashBankMovement,
): Promise<CashBankMovementRecord | null> {
  const rows = await database
    .insert(cashBankMovements)
    .values(input)
    .returning();

  return rows[0] ?? null;
}

/** Finds an existing movement with the same account, source, and direction. */
export async function findMovementBySource(
  database: PaymentsDatabase,
  input: MovementSourceLookup,
): Promise<CashBankMovementRecord | null> {
  const sourceCondition = input.sourceId === null
    ? isNull(cashBankMovements.sourceId)
    : eq(cashBankMovements.sourceId, input.sourceId);

  const accountCondition = input.method === "CASH"
    ? eq(cashBankMovements.cashAccountId, input.cashAccountId as string)
    : eq(cashBankMovements.bankAccountId, input.bankAccountId as string);

  const rows = await database
    .select()
    .from(cashBankMovements)
    .where(
      and(
        eq(cashBankMovements.method, input.method),
        accountCondition,
        eq(cashBankMovements.direction, input.direction),
        eq(cashBankMovements.sourceType, input.sourceType),
        sourceCondition,
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/** Builds the shared SQL filters used by movement list and count queries. */
function buildMovementFilters(options: MovementListOptions) {
  const filters = [];

  if (options.accountType === "CASH") {
    filters.push(eq(cashBankMovements.method, "CASH"));
  }

  if (options.accountType === "BANK") {
    filters.push(eq(cashBankMovements.method, "BANK_TRANSFER"));
  }

  if (options.accountId && options.accountType === "CASH") {
    filters.push(eq(cashBankMovements.cashAccountId, options.accountId));
  }

  if (options.accountId && options.accountType === "BANK") {
    filters.push(eq(cashBankMovements.bankAccountId, options.accountId));
  }

  if (options.startDate) {
    filters.push(
      sql`timezone('Asia/Karachi', ${cashBankMovements.occurredAt})::date >= ${options.startDate}::date`,
    );
  }

  if (options.endDate) {
    filters.push(
      sql`timezone('Asia/Karachi', ${cashBankMovements.occurredAt})::date <= ${options.endDate}::date`,
    );
  }

  return filters.length > 0 ? and(...filters) : undefined;
}

/** Lists immutable cash and bank movements with account names and stable ordering. */
export async function listCashBankMovements(
  database: PaymentsDatabase,
  options: MovementListOptions,
): Promise<CashBankMovementListItem[]> {
  const offset = (options.page - 1) * options.pageSize;
  const rows = await database
    .select({
      id: cashBankMovements.id,
      occurredAt: cashBankMovements.occurredAt,
      method: cashBankMovements.method,
      cashAccountId: cashBankMovements.cashAccountId,
      bankAccountId: cashBankMovements.bankAccountId,
      cashAccountName: cashAccounts.name,
      bankName: bankAccounts.bankName,
      bankAccountName: bankAccounts.accountName,
      direction: cashBankMovements.direction,
      sourceType: cashBankMovements.sourceType,
      sourceId: cashBankMovements.sourceId,
      documentNumber: cashBankMovements.documentNumber,
      amount: cashBankMovements.amount,
      description: cashBankMovements.description,
    })
    .from(cashBankMovements)
    .leftJoin(cashAccounts, eq(cashBankMovements.cashAccountId, cashAccounts.id))
    .leftJoin(bankAccounts, eq(cashBankMovements.bankAccountId, bankAccounts.id))
    .where(buildMovementFilters(options))
    .orderBy(
      desc(cashBankMovements.occurredAt),
      desc(cashBankMovements.createdAt),
      desc(cashBankMovements.id),
    )
    .limit(options.pageSize)
    .offset(offset);

  return rows.map((row) => {
    const isCash = row.method === "CASH";
    const accountId = isCash ? row.cashAccountId : row.bankAccountId;
    const accountName = isCash
      ? row.cashAccountName
      : [row.bankName, row.bankAccountName].filter(Boolean).join(" - ");

    if (!accountId || !accountName) {
      throw new Error("Movement account relationship is invalid.");
    }

    return {
      id: row.id,
      occurredAt: row.occurredAt,
      accountType: isCash ? "CASH" : "BANK",
      accountId,
      accountName,
      direction: row.direction,
      method: row.method,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      documentNumber: row.documentNumber,
      amount: row.amount,
      description: row.description,
    };
  });
}

/** Counts movements using exactly the same filters as the list query. */
export async function countCashBankMovements(
  database: PaymentsDatabase,
  options: MovementListOptions,
): Promise<number> {
  const rows = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(cashBankMovements)
    .where(buildMovementFilters(options));

  return rows[0]?.total ?? 0;
}

/** Creates one immutable transfer header and returns the saved row. */
export async function createTransfer(
  database: PaymentsDatabase,
  input: NewCashBankTransfer,
): Promise<CashBankTransferRecord | null> {
  const rows = await database
    .insert(cashBankTransfers)
    .values(input)
    .returning();

  return rows[0] ?? null;
}

/** Reads one transfer by UUID. */
export async function findTransferById(
  database: PaymentsDatabase,
  transferId: string,
): Promise<CashBankTransferRecord | null> {
  const rows = await database
    .select()
    .from(cashBankTransfers)
    .where(eq(cashBankTransfers.id, transferId))
    .limit(1);

  return rows[0] ?? null;
}

/** Builds the shared date filters used by transfer list and count queries. */
function buildTransferFilters(options: TransferListOptions) {
  const filters = [];

  if (options.startDate) {
    filters.push(
      sql`timezone('Asia/Karachi', ${cashBankTransfers.transferDate})::date >= ${options.startDate}::date`,
    );
  }

  if (options.endDate) {
    filters.push(
      sql`timezone('Asia/Karachi', ${cashBankTransfers.transferDate})::date <= ${options.endDate}::date`,
    );
  }

  return filters.length > 0 ? and(...filters) : undefined;
}

/** Lists immutable transfers with readable source and destination account names. */
export async function listTransfers(
  database: PaymentsDatabase,
  options: TransferListOptions,
): Promise<CashBankTransferListItem[]> {
  const offset = (options.page - 1) * options.pageSize;
  const rows = await database
    .select()
    .from(cashBankTransfers)
    .where(buildTransferFilters(options))
    .orderBy(
      desc(cashBankTransfers.transferDate),
      desc(cashBankTransfers.createdAt),
      desc(cashBankTransfers.id),
    )
    .limit(options.pageSize)
    .offset(offset);

  if (rows.length === 0) {
    return [];
  }

  const cashAccountIds = new Set<string>();
  const bankAccountIds = new Set<string>();

  for (const row of rows) {
    if (row.sourceCashAccountId) cashAccountIds.add(row.sourceCashAccountId);
    if (row.destinationCashAccountId) cashAccountIds.add(row.destinationCashAccountId);
    if (row.sourceBankAccountId) bankAccountIds.add(row.sourceBankAccountId);
    if (row.destinationBankAccountId) bankAccountIds.add(row.destinationBankAccountId);
  }

  const cashIds = [...cashAccountIds];
  const bankIds = [...bankAccountIds];
  const [cashRows, bankRows] = await Promise.all([
    cashIds.length > 0
      ? database
          .select({ id: cashAccounts.id, name: cashAccounts.name })
          .from(cashAccounts)
          .where(inArray(cashAccounts.id, cashIds))
      : Promise.resolve([]),
    bankIds.length > 0
      ? database
          .select({
            id: bankAccounts.id,
            bankName: bankAccounts.bankName,
            accountName: bankAccounts.accountName,
          })
          .from(bankAccounts)
          .where(inArray(bankAccounts.id, bankIds))
      : Promise.resolve([]),
  ]);

  const cashNames = new Map(cashRows.map((account) => [account.id, account.name]));
  const bankNames = new Map(
    bankRows.map((account) => [
      account.id,
      `${account.bankName} - ${account.accountName}`,
    ]),
  );

  return rows.map((row) => {
    const sourceAccountName = row.sourceMethod === "CASH"
      ? row.sourceCashAccountId && cashNames.get(row.sourceCashAccountId)
      : row.sourceBankAccountId && bankNames.get(row.sourceBankAccountId);
    const destinationAccountName = row.destinationMethod === "CASH"
      ? row.destinationCashAccountId && cashNames.get(row.destinationCashAccountId)
      : row.destinationBankAccountId && bankNames.get(row.destinationBankAccountId);

    if (!sourceAccountName || !destinationAccountName) {
      throw new Error("Transfer account relationship is invalid.");
    }

    return { ...row, sourceAccountName, destinationAccountName };
  });
}

/** Counts transfers using exactly the same filters as the list query. */
export async function countTransfers(
  database: PaymentsDatabase,
  options: TransferListOptions,
): Promise<number> {
  const rows = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(cashBankTransfers)
    .where(buildTransferFilters(options));

  return rows[0]?.total ?? 0;
}

/** Creates one draft cash reconciliation and returns the saved row. */
export async function createCashReconciliation(
  database: PaymentsDatabase,
  input: NewCashReconciliation,
): Promise<CashReconciliationRecord | null> {
  const rows = await database
    .insert(cashReconciliations)
    .values(input)
    .returning();

  return rows[0] ?? null;
}

/** Locks one cash reconciliation before a status-sensitive change. */
export async function lockCashReconciliation(
  database: PaymentsDatabase,
  reconciliationId: string,
): Promise<CashReconciliationRecord | null> {
  const rows = await database
    .select()
    .from(cashReconciliations)
    .where(eq(cashReconciliations.id, reconciliationId))
    .limit(1)
    .for("update");

  return rows[0] ?? null;
}

/** Updates only the editable fields of one draft cash reconciliation. */
export async function updateDraftCashReconciliation(
  database: PaymentsDatabase,
  reconciliationId: string,
  changes: CashReconciliationChanges,
): Promise<CashReconciliationRecord | null> {
  const rows = await database
    .update(cashReconciliations)
    .set(changes)
    .where(
      and(
        eq(cashReconciliations.id, reconciliationId),
        eq(cashReconciliations.status, "DRAFT"),
      ),
    )
    .returning();

  return rows[0] ?? null;
}

/** Confirms one draft reconciliation with the recalculated account balance. */
export async function confirmDraftCashReconciliation(
  database: PaymentsDatabase,
  reconciliationId: string,
  confirmation: CashReconciliationConfirmation,
): Promise<CashReconciliationRecord | null> {
  const rows = await database
    .update(cashReconciliations)
    .set({
      systemBalance: confirmation.systemBalance,
      differenceAmount: confirmation.differenceAmount,
      status: "CONFIRMED",
      confirmedAt: confirmation.confirmedAt,
    })
    .where(
      and(
        eq(cashReconciliations.id, reconciliationId),
        eq(cashReconciliations.status, "DRAFT"),
      ),
    )
    .returning();

  return rows[0] ?? null;
}

/** Builds the shared filters used by reconciliation list and count queries. */
function buildReconciliationFilters(options: ReconciliationListOptions) {
  const filters = [];

  if (options.status) {
    filters.push(eq(cashReconciliations.status, options.status));
  }

  if (options.startDate) {
    filters.push(
      sql`timezone('Asia/Karachi', ${cashReconciliations.reconciliationDate})::date >= ${options.startDate}::date`,
    );
  }

  if (options.endDate) {
    filters.push(
      sql`timezone('Asia/Karachi', ${cashReconciliations.reconciliationDate})::date <= ${options.endDate}::date`,
    );
  }

  return filters.length > 0 ? and(...filters) : undefined;
}

/** Lists cash reconciliations with their readable account names. */
export async function listCashReconciliations(
  database: PaymentsDatabase,
  options: ReconciliationListOptions,
): Promise<CashReconciliationListItem[]> {
  const offset = (options.page - 1) * options.pageSize;

  return database
    .select({
      id: cashReconciliations.id,
      cashAccountId: cashReconciliations.cashAccountId,
      reconciliationDate: cashReconciliations.reconciliationDate,
      systemBalance: cashReconciliations.systemBalance,
      countedAmount: cashReconciliations.countedAmount,
      differenceAmount: cashReconciliations.differenceAmount,
      status: cashReconciliations.status,
      notes: cashReconciliations.notes,
      confirmedAt: cashReconciliations.confirmedAt,
      createdAt: cashReconciliations.createdAt,
      cashAccountName: cashAccounts.name,
    })
    .from(cashReconciliations)
    .innerJoin(cashAccounts, eq(cashAccounts.id, cashReconciliations.cashAccountId))
    .where(buildReconciliationFilters(options))
    .orderBy(
      desc(cashReconciliations.reconciliationDate),
      desc(cashReconciliations.createdAt),
      desc(cashReconciliations.id),
    )
    .limit(options.pageSize)
    .offset(offset);
}

/** Counts cash reconciliations using the same filters as the list query. */
export async function countCashReconciliations(
  database: PaymentsDatabase,
  options: ReconciliationListOptions,
): Promise<number> {
  const rows = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(cashReconciliations)
    .where(buildReconciliationFilters(options));

  return rows[0]?.total ?? 0;
}

// Customer receipt queries

/** Locks confirmed sales invoices and returns their current return and receipt totals. */
export async function lockCustomerPaymentSales(
  database: PaymentsDatabase,
  salesInvoiceIds: string[],
): Promise<CustomerPaymentSaleRecord[]> {
  if (salesInvoiceIds.length === 0) return [];

  const invoiceRows = await database
    .select({
      id: salesInvoices.id,
      customerId: salesInvoices.customerId,
      invoiceNumber: salesInvoices.invoiceNumber,
      invoiceDate: salesInvoices.invoiceDate,
      totalAmount: salesInvoices.totalAmount,
    })
    .from(salesInvoices)
    .where(
      and(
        inArray(salesInvoices.id, salesInvoiceIds),
        eq(salesInvoices.status, "CONFIRMED"),
      ),
    )
    .orderBy(asc(salesInvoices.id))
    .for("update");

  const allocationRows = await database
    .select({
      salesInvoiceId: customerPaymentAllocations.salesInvoiceId,
      allocatedAmount: sql<string>`coalesce(sum(${customerPaymentAllocations.amount}), 0)::text`,
    })
    .from(customerPaymentAllocations)
    .innerJoin(
      customerPayments,
      eq(customerPayments.id, customerPaymentAllocations.customerPaymentId),
    )
    .where(
      and(
        inArray(customerPaymentAllocations.salesInvoiceId, salesInvoiceIds),
        eq(customerPayments.status, "CONFIRMED"),
        isNull(customerPayments.reversalOfPaymentId),
      ),
    )
    .groupBy(customerPaymentAllocations.salesInvoiceId);

  const returnRows = await database
    .select({
      salesInvoiceId: salesReturns.originalSaleId,
      returnedAmount: sql<string>`coalesce(sum(${salesReturns.totalAmount}), 0)::text`,
    })
    .from(salesReturns)
    .where(
      and(
        inArray(salesReturns.originalSaleId, salesInvoiceIds),
        eq(salesReturns.status, "CONFIRMED"),
      ),
    )
    .groupBy(salesReturns.originalSaleId);

  const allocatedByInvoice = new Map(
    allocationRows.map((row) => [row.salesInvoiceId, row.allocatedAmount]),
  );
  const returnedByInvoice = new Map(
    returnRows.map((row) => [row.salesInvoiceId, row.returnedAmount]),
  );

  return invoiceRows.map((invoice) => ({
    ...invoice,
    invoiceNumber: invoice.invoiceNumber as string,
    returnedAmount: returnedByInvoice.get(invoice.id) ?? "0.00",
    allocatedAmount: allocatedByInvoice.get(invoice.id) ?? "0.00",
  }));
}

/** Creates one immutable customer receipt header. */
export async function createCustomerPayment(
  database: PaymentsDatabase,
  values: NewCustomerPayment,
): Promise<CustomerPaymentRecord | null> {
  const rows = await database
    .insert(customerPayments)
    .values(values)
    .returning();

  return rows[0] ?? null;
}

/** Creates all cash and bank splits belonging to one customer receipt. */
export async function createCustomerPaymentSplits(
  database: PaymentsDatabase,
  values: NewCustomerPaymentSplit[],
): Promise<CustomerPaymentSplitRecord[]> {
  if (values.length === 0) {
    return [];
  }

  return database
    .insert(customerPaymentSplits)
    .values(values)
    .returning();
}

/** Creates all invoice allocations belonging to one customer receipt. */
export async function createCustomerPaymentAllocations(
  database: PaymentsDatabase,
  values: NewCustomerPaymentAllocation[],
): Promise<CustomerPaymentAllocationRecord[]> {
  if (values.length === 0) {
    return [];
  }

  return database
    .insert(customerPaymentAllocations)
    .values(values)
    .returning();
}

/** Reads one customer receipt header by UUID. */
export async function findCustomerPaymentById(
  database: PaymentsDatabase,
  paymentId: string,
): Promise<CustomerPaymentRecord | null> {
  const rows = await database
    .select()
    .from(customerPayments)
    .where(eq(customerPayments.id, paymentId))
    .limit(1);

  return rows[0] ?? null;
}

/** Locks one customer receipt before a reversal or other protected workflow. */
export async function lockCustomerPayment(
  database: PaymentsDatabase,
  paymentId: string,
): Promise<CustomerPaymentRecord | null> {
  const rows = await database
    .select()
    .from(customerPayments)
    .where(eq(customerPayments.id, paymentId))
    .limit(1)
    .for("update");

  return rows[0] ?? null;
}

/** Lists immutable customer receipt headers using optional party and date filters. */
export async function listCustomerPayments(
  database: PaymentsDatabase,
  options: CustomerPaymentListOptions,
): Promise<CustomerPaymentRecord[]> {
  const filters = buildCustomerPaymentFilters(options);
  const offset = (options.page - 1) * options.pageSize;

  return database
    .select()
    .from(customerPayments)
    .where(filters)
    .orderBy(
      desc(customerPayments.paymentDate),
      desc(customerPayments.createdAt),
      desc(customerPayments.id),
    )
    .limit(options.pageSize)
    .offset(offset);
}

/** Counts customer receipts using the same filters as the list query. */
export async function countCustomerPayments(
  database: PaymentsDatabase,
  options: CustomerPaymentListOptions,
): Promise<number> {
  const rows = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(customerPayments)
    .where(buildCustomerPaymentFilters(options));

  return rows[0]?.count ?? 0;
}

/** Lists the cash and bank splits saved for one customer receipt. */
export async function listCustomerPaymentSplits(
  database: PaymentsDatabase,
  paymentId: string,
): Promise<CustomerPaymentSplitRecord[]> {
  return database
    .select()
    .from(customerPaymentSplits)
    .where(eq(customerPaymentSplits.customerPaymentId, paymentId))
    .orderBy(asc(customerPaymentSplits.createdAt), asc(customerPaymentSplits.id));
}

/** Lists the invoice allocations saved for one customer receipt. */
export async function listCustomerPaymentAllocations(
  database: PaymentsDatabase,
  paymentId: string,
): Promise<CustomerPaymentAllocationRecord[]> {
  return database
    .select()
    .from(customerPaymentAllocations)
    .where(eq(customerPaymentAllocations.customerPaymentId, paymentId))
    .orderBy(
      asc(customerPaymentAllocations.createdAt),
      asc(customerPaymentAllocations.id),
    );
}

/** Finds the linked reversal record for one original customer receipt. */
export async function findCustomerPaymentReversal(
  database: PaymentsDatabase,
  originalPaymentId: string,
): Promise<CustomerPaymentRecord | null> {
  const rows = await database
    .select()
    .from(customerPayments)
    .where(eq(customerPayments.reversalOfPaymentId, originalPaymentId))
    .limit(1);

  return rows[0] ?? null;
}

/** Marks an original receipt reversed only after its linked reversal record exists. */
export async function markCustomerPaymentReversed(
  database: PaymentsDatabase,
  paymentId: string,
  reversalPaymentId: string,
): Promise<CustomerPaymentRecord | null> {
  const linkedReversalExists = sql`exists (
    select 1
    from ${customerPayments} reversal
    where reversal.id = ${reversalPaymentId}::uuid
      and reversal.reversal_of_payment_id = ${paymentId}::uuid
  )`;

  const rows = await database
    .update(customerPayments)
    .set({ status: "REVERSED" })
    .where(
      and(
        eq(customerPayments.id, paymentId),
        eq(customerPayments.status, "CONFIRMED"),
        linkedReversalExists,
      ),
    )
    .returning();

  return rows[0] ?? null;
}

/** Builds the shared customer receipt filters for list and count queries. */
function buildCustomerPaymentFilters(
  options: CustomerPaymentListOptions,
) {
  const filters = [];

  if (options.customerId) {
    filters.push(eq(customerPayments.customerId, options.customerId));
  }

  if (options.startDate) {
    filters.push(
      sql`timezone('Asia/Karachi', ${customerPayments.paymentDate})::date >= ${options.startDate}::date`,
    );
  }

  if (options.endDate) {
    filters.push(
      sql`timezone('Asia/Karachi', ${customerPayments.paymentDate})::date <= ${options.endDate}::date`,
    );
  }

  return filters.length > 0 ? and(...filters) : undefined;
}

/** Locks confirmed purchases and returns their currently allocated payment totals. */
export async function lockSupplierPaymentPurchases(
  database: PaymentsDatabase,
  purchaseIds: string[],
): Promise<SupplierPaymentPurchaseRecord[]> {
  if (purchaseIds.length === 0) return [];

  const purchaseRows = await database
    .select({
      id: purchases.id,
      supplierId: purchases.supplierId,
      purchaseNumber: purchases.purchaseNumber,
      purchaseDate: purchases.purchaseDate,
      totalAmount: purchases.totalAmount,
    })
    .from(purchases)
    .where(and(inArray(purchases.id, purchaseIds), eq(purchases.status, "CONFIRMED")))
    .orderBy(asc(purchases.id))
    .for("update");

  const allocationRows = await database
    .select({
      purchaseId: supplierPaymentAllocations.purchaseId,
      allocatedAmount: sql<string>`coalesce(sum(${supplierPaymentAllocations.amount}), 0)::text`,
    })
    .from(supplierPaymentAllocations)
    .innerJoin(
      supplierPayments,
      eq(supplierPayments.id, supplierPaymentAllocations.supplierPaymentId),
    )
    .where(
      and(
        inArray(supplierPaymentAllocations.purchaseId, purchaseIds),
        eq(supplierPayments.status, "CONFIRMED"),
        isNull(supplierPayments.reversalOfPaymentId),
      ),
    )
    .groupBy(supplierPaymentAllocations.purchaseId);

  const returnRows = await database
    .select({
      purchaseId: purchaseReturns.originalPurchaseId,
      returnedAmount: sql<string>`coalesce(sum(${purchaseReturns.totalAmount}), 0)::text`,
    })
    .from(purchaseReturns)
    .where(
      and(
        inArray(purchaseReturns.originalPurchaseId, purchaseIds),
        eq(purchaseReturns.status, "CONFIRMED"),
      ),
    )
    .groupBy(purchaseReturns.originalPurchaseId);

  const allocatedByPurchase = new Map(
    allocationRows.map((row) => [row.purchaseId, row.allocatedAmount]),
  );
  const returnedByPurchase = new Map(
    returnRows.map((row) => [row.purchaseId, row.returnedAmount]),
  );

  return purchaseRows.map((purchase) => ({
    ...purchase,
    purchaseNumber: purchase.purchaseNumber as string,
    returnedAmount: returnedByPurchase.get(purchase.id) ?? "0.00",
    allocatedAmount: allocatedByPurchase.get(purchase.id) ?? "0.00",
  }));
}

// Supplier payment queries

/** Creates one immutable supplier payment header. */
export async function createSupplierPayment(
  database: PaymentsDatabase,
  values: NewSupplierPayment,
): Promise<SupplierPaymentRecord | null> {
  const rows = await database
    .insert(supplierPayments)
    .values(values)
    .returning();

  return rows[0] ?? null;
}

/** Creates all cash and bank splits belonging to one supplier payment. */
export async function createSupplierPaymentSplits(
  database: PaymentsDatabase,
  values: NewSupplierPaymentSplit[],
): Promise<SupplierPaymentSplitRecord[]> {
  if (values.length === 0) {
    return [];
  }

  return database
    .insert(supplierPaymentSplits)
    .values(values)
    .returning();
}

/** Creates all purchase allocations belonging to one supplier payment. */
export async function createSupplierPaymentAllocations(
  database: PaymentsDatabase,
  values: NewSupplierPaymentAllocation[],
): Promise<SupplierPaymentAllocationRecord[]> {
  if (values.length === 0) {
    return [];
  }

  return database
    .insert(supplierPaymentAllocations)
    .values(values)
    .returning();
}

/** Reads one supplier payment header by UUID. */
export async function findSupplierPaymentById(
  database: PaymentsDatabase,
  paymentId: string,
): Promise<SupplierPaymentRecord | null> {
  const rows = await database
    .select()
    .from(supplierPayments)
    .where(eq(supplierPayments.id, paymentId))
    .limit(1);

  return rows[0] ?? null;
}

/** Locks one supplier payment before a reversal or other protected workflow. */
export async function lockSupplierPayment(
  database: PaymentsDatabase,
  paymentId: string,
): Promise<SupplierPaymentRecord | null> {
  const rows = await database
    .select()
    .from(supplierPayments)
    .where(eq(supplierPayments.id, paymentId))
    .limit(1)
    .for("update");

  return rows[0] ?? null;
}

/** Lists immutable supplier payment headers using optional party and date filters. */
export async function listSupplierPayments(
  database: PaymentsDatabase,
  options: SupplierPaymentListOptions,
): Promise<SupplierPaymentRecord[]> {
  const offset = (options.page - 1) * options.pageSize;

  return database
    .select()
    .from(supplierPayments)
    .where(buildSupplierPaymentFilters(options))
    .orderBy(
      desc(supplierPayments.paymentDate),
      desc(supplierPayments.createdAt),
      desc(supplierPayments.id),
    )
    .limit(options.pageSize)
    .offset(offset);
}

/** Counts supplier payments using the same filters as the list query. */
export async function countSupplierPayments(
  database: PaymentsDatabase,
  options: SupplierPaymentListOptions,
): Promise<number> {
  const rows = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(supplierPayments)
    .where(buildSupplierPaymentFilters(options));

  return rows[0]?.count ?? 0;
}

/** Lists the cash and bank splits saved for one supplier payment. */
export async function listSupplierPaymentSplits(
  database: PaymentsDatabase,
  paymentId: string,
): Promise<SupplierPaymentSplitRecord[]> {
  return database
    .select()
    .from(supplierPaymentSplits)
    .where(eq(supplierPaymentSplits.supplierPaymentId, paymentId))
    .orderBy(asc(supplierPaymentSplits.createdAt), asc(supplierPaymentSplits.id));
}

/** Lists the purchase allocations saved for one supplier payment. */
export async function listSupplierPaymentAllocations(
  database: PaymentsDatabase,
  paymentId: string,
): Promise<SupplierPaymentAllocationRecord[]> {
  return database
    .select()
    .from(supplierPaymentAllocations)
    .where(eq(supplierPaymentAllocations.supplierPaymentId, paymentId))
    .orderBy(
      asc(supplierPaymentAllocations.createdAt),
      asc(supplierPaymentAllocations.id),
    );
}

/** Finds the linked reversal record for one original supplier payment. */
export async function findSupplierPaymentReversal(
  database: PaymentsDatabase,
  originalPaymentId: string,
): Promise<SupplierPaymentRecord | null> {
  const rows = await database
    .select()
    .from(supplierPayments)
    .where(eq(supplierPayments.reversalOfPaymentId, originalPaymentId))
    .limit(1);

  return rows[0] ?? null;
}

/** Marks an original supplier payment reversed only after its linked reversal exists. */
export async function markSupplierPaymentReversed(
  database: PaymentsDatabase,
  paymentId: string,
  reversalPaymentId: string,
): Promise<SupplierPaymentRecord | null> {
  const linkedReversalExists = sql`exists (
    select 1
    from ${supplierPayments} reversal
    where reversal.id = ${reversalPaymentId}::uuid
      and reversal.reversal_of_payment_id = ${paymentId}::uuid
  )`;

  const rows = await database
    .update(supplierPayments)
    .set({ status: "REVERSED" })
    .where(
      and(
        eq(supplierPayments.id, paymentId),
        eq(supplierPayments.status, "CONFIRMED"),
        linkedReversalExists,
      ),
    )
    .returning();

  return rows[0] ?? null;
}

/** Builds the shared supplier payment filters for list and count queries. */
function buildSupplierPaymentFilters(
  options: SupplierPaymentListOptions,
) {
  const filters = [];

  if (options.supplierId) {
    filters.push(eq(supplierPayments.supplierId, options.supplierId));
  }

  if (options.startDate) {
    filters.push(
      sql`timezone('Asia/Karachi', ${supplierPayments.paymentDate})::date >= ${options.startDate}::date`,
    );
  }

  if (options.endDate) {
    filters.push(
      sql`timezone('Asia/Karachi', ${supplierPayments.paymentDate})::date <= ${options.endDate}::date`,
    );
  }

  return filters.length > 0 ? and(...filters) : undefined;
}

