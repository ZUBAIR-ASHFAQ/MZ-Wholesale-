import { AppError } from "../../shared/errors/app-error.js";
import {
  createCustomerLedgerEntry,
  createSupplierLedgerEntry,
  findCustomerById,
  findCustomerEntryBySource,
  findSupplierById,
  findSupplierEntryBySource,
  readCustomerOutstandingPage,
  readSupplierPayablesPage,
  readCustomerCurrentDue,
  readCustomerStatement,
  readSupplierCurrentPayable,
  readSupplierStatement,
  type LedgersDatabase,
} from "./ledgers.repository.js";
import type { OutstandingListQuery, LedgerStatementQuery } from "./ledgers.schema.js";

const customerDebitSources = new Set([
  "OPENING_BALANCE",
  "SALE",
  "CUSTOMER_PAYMENT_REVERSAL",
  "SALES_RETURN_REFUND",
]);
const customerCreditSources = new Set(["CUSTOMER_PAYMENT", "SALES_RETURN"]);
const supplierDebitSources = new Set(["SUPPLIER_PAYMENT", "PURCHASE_RETURN"]);
const supplierCreditSources = new Set(["OPENING_BALANCE", "PURCHASE", "SUPPLIER_PAYMENT_REVERSAL"]);

interface LedgerWriteDetails {
  occurredAt: Date;
  referenceType: string;
  referenceId?: string | null;
  documentNumber?: string | null;
  description?: string | null;
  notes?: string | null;
}

interface CustomerLedgerWriteInput extends LedgerWriteDetails {
  customerId: string;
  amount: string;
}

interface SupplierLedgerWriteInput extends LedgerWriteDetails {
  supplierId: string;
  amount: string;
}

/** Creates a consistent application error for ledger operations. */
function ledgerError(code: string, message: string, statusCode: number): AppError {
  return new AppError(code, message, statusCode);
}

/** Converts a decimal money string to integer cents for exact calculations. */
function moneyToCents(value: string): bigint {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) {
    throw ledgerError("INVALID_LEDGER_AMOUNT", "Ledger amount must use at most two decimal places.", 400);
  }

  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = value.replace("-", "").split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -cents : cents;
}

/** Validates and returns the positive amount. */
function requirePositiveAmount(value: string): string {
  if (moneyToCents(value) <= 0n) {
    throw ledgerError("INVALID_LEDGER_AMOUNT", "Ledger amount must be greater than zero.", 400);
  }
  return value;
}

/** Formats integer cents as a two-decimal money string. */
function centsToMoney(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

/** Normalizes the source. */
function normalizeSource(input: LedgerWriteDetails): { referenceId: string | null; documentNumber: string | null; description: string | null; notes: string | null } {
  const referenceId = input.referenceId ?? null;

  if (input.referenceType === "OPENING_BALANCE" && referenceId !== null) {
    throw ledgerError("INVALID_LEDGER_SOURCE", "Opening balance must not have a source ID.", 400);
  }

  if (input.referenceType !== "OPENING_BALANCE" && referenceId === null) {
    throw ledgerError("INVALID_LEDGER_SOURCE", "A source ID is required for this ledger entry.", 400);
  }

  return {
    referenceId,
    documentNumber: input.documentNumber?.trim() || null,
    description: input.description?.trim() || null,
    notes: input.notes?.trim() || null,
  };
}

/** Validates and returns the allowed source. */
function requireAllowedSource(referenceType: string, allowedSources: ReadonlySet<string>): void {
  if (!allowedSources.has(referenceType)) {
    throw ledgerError("INVALID_LEDGER_SOURCE", `Ledger source ${referenceType} is not allowed for this entry direction.`, 400);
  }
}

/** Loads the customer current due. */
export function getCustomerCurrentDue(database: LedgersDatabase, customerId: string): Promise<string> {
  return readCustomerCurrentDue(database, customerId);
}

/** Loads the supplier current payable. */
export function getSupplierCurrentPayable(database: LedgersDatabase, supplierId: string): Promise<string> {
  return readSupplierCurrentPayable(database, supplierId);
}

/** Loads the customer statement. */
export async function getCustomerStatement(database: LedgersDatabase, customerId: string, query: LedgerStatementQuery) {
  const customer = await findCustomerById(database, customerId);
  if (!customer) throw ledgerError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);

  const statement = await readCustomerStatement(database, customerId, query);
  const openingCents = moneyToCents(statement.openingBalance);
  const totalDebitCents = moneyToCents(statement.totalDebit);
  const totalCreditCents = moneyToCents(statement.totalCredit);

  return {
    customer: { id: customer.id, code: customer.code, name: customer.name, phone: customer.phone },
    dateFrom: query.startDate ?? null,
    dateTo: query.endDate ?? null,
    openingBalance: statement.openingBalance,
    totalDebit: statement.totalDebit,
    totalCredit: statement.totalCredit,
    closingBalance: centsToMoney(openingCents + totalDebitCents - totalCreditCents),
    entries: statement.entries.map(({ periodEffect, ...entry }) => ({
      ...entry,
      runningBalance: centsToMoney(openingCents + moneyToCents(periodEffect)),
    })),
    page: statement.page,
    pageSize: statement.pageSize,
    total: statement.total,
  };
}

/** Loads the supplier statement. */
export async function getSupplierStatement(database: LedgersDatabase, supplierId: string, query: LedgerStatementQuery) {
  const supplier = await findSupplierById(database, supplierId);
  if (!supplier) throw ledgerError("SUPPLIER_NOT_FOUND", "Supplier was not found.", 404);

  const statement = await readSupplierStatement(database, supplierId, query);
  const openingCents = moneyToCents(statement.openingBalance);
  const totalDebitCents = moneyToCents(statement.totalDebit);
  const totalCreditCents = moneyToCents(statement.totalCredit);

  return {
    supplier: { id: supplier.id, code: supplier.code, name: supplier.name, phone: supplier.phone },
    dateFrom: query.startDate ?? null,
    dateTo: query.endDate ?? null,
    openingBalance: statement.openingBalance,
    totalDebit: statement.totalDebit,
    totalCredit: statement.totalCredit,
    closingBalance: centsToMoney(openingCents + totalCreditCents - totalDebitCents),
    entries: statement.entries.map(({ periodEffect, ...entry }) => ({
      ...entry,
      runningBalance: centsToMoney(openingCents + moneyToCents(periodEffect)),
    })),
    page: statement.page,
    pageSize: statement.pageSize,
    total: statement.total,
  };
}

/** Loads the customer outstanding. */
export async function getCustomerOutstanding(database: LedgersDatabase, query: OutstandingListQuery) {
  const page = await readCustomerOutstandingPage(database, query);
  return {
    ...page,
    items: page.items.map((item) => ({
      ...item,
      outstandingAmount: centsToMoney(moneyToCents(item.outstandingAmount)),
    })),
  };
}

/** Loads the supplier payables. */
export async function getSupplierPayables(database: LedgersDatabase, query: OutstandingListQuery) {
  const page = await readSupplierPayablesPage(database, query);
  return {
    ...page,
    items: page.items.map((item) => ({
      ...item,
      payableAmount: centsToMoney(moneyToCents(item.payableAmount)),
    })),
  };
}

/** Creates the customer effect. */
async function createCustomerEffect(
  database: LedgersDatabase,
  input: CustomerLedgerWriteInput,
  direction: "DEBIT" | "CREDIT",
  allowedSources: ReadonlySet<string>,
) {
  requireAllowedSource(input.referenceType, allowedSources);
  const amount = requirePositiveAmount(input.amount);
  const source = normalizeSource(input);

  if (!(await findCustomerById(database, input.customerId))) {
    throw ledgerError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
  }

  const existing = await findCustomerEntryBySource(database, {
    customerId: input.customerId,
    referenceType: input.referenceType,
    referenceId: source.referenceId,
  });
  if (existing) {
    throw ledgerError("DUPLICATE_LEDGER_SOURCE", "A customer ledger entry already exists for this source.", 409);
  }

  return createCustomerLedgerEntry(database, {
    customerId: input.customerId,
    occurredAt: input.occurredAt,
    referenceType: input.referenceType,
    ...source,
    debit: direction === "DEBIT" ? amount : "0.00",
    credit: direction === "CREDIT" ? amount : "0.00",
  });
}

/** Creates the supplier effect. */
async function createSupplierEffect(
  database: LedgersDatabase,
  input: SupplierLedgerWriteInput,
  direction: "DEBIT" | "CREDIT",
  allowedSources: ReadonlySet<string>,
) {
  requireAllowedSource(input.referenceType, allowedSources);
  const amount = requirePositiveAmount(input.amount);
  const source = normalizeSource(input);

  if (!(await findSupplierById(database, input.supplierId))) {
    throw ledgerError("SUPPLIER_NOT_FOUND", "Supplier was not found.", 404);
  }

  const existing = await findSupplierEntryBySource(database, {
    supplierId: input.supplierId,
    referenceType: input.referenceType,
    referenceId: source.referenceId,
  });
  if (existing) {
    throw ledgerError("DUPLICATE_LEDGER_SOURCE", "A supplier ledger entry already exists for this source.", 409);
  }

  return createSupplierLedgerEntry(database, {
    supplierId: input.supplierId,
    occurredAt: input.occurredAt,
    referenceType: input.referenceType,
    ...source,
    debit: direction === "DEBIT" ? amount : "0.00",
    credit: direction === "CREDIT" ? amount : "0.00",
  });
}

/** Creates an immutable customer debit entry from an approved source transaction. */
export function writeCustomerDebit(database: LedgersDatabase, input: CustomerLedgerWriteInput) {
  return createCustomerEffect(database, input, "DEBIT", customerDebitSources);
}

/** Creates an immutable customer credit entry from an approved source transaction. */
export function writeCustomerCredit(database: LedgersDatabase, input: CustomerLedgerWriteInput) {
  return createCustomerEffect(database, input, "CREDIT", customerCreditSources);
}

/** Creates an immutable supplier debit entry from an approved source transaction. */
export function writeSupplierDebit(database: LedgersDatabase, input: SupplierLedgerWriteInput) {
  return createSupplierEffect(database, input, "DEBIT", supplierDebitSources);
}

/** Creates an immutable supplier credit entry from an approved source transaction. */
export function writeSupplierCredit(database: LedgersDatabase, input: SupplierLedgerWriteInput) {
  return createSupplierEffect(database, input, "CREDIT", supplierCreditSources);
}
