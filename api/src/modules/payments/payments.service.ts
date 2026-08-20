import { AppError } from "../../shared/errors/app-error.js";
import { reserveBusinessDocumentNumberInTransaction } from "../business-settings/index.js";
import { getCustomerCurrentDue, getSupplierCurrentPayable, writeCustomerCredit, writeCustomerDebit, writeSupplierCredit, writeSupplierDebit } from "../ledgers/ledgers.service.js";
import {
  findCustomerById,
  findCustomerByIdForUpdate,
  getCustomerOpenInvoiceDueTotal,
} from "../customers/customers.repository.js";
import {
  findSupplierById,
  findSupplierByIdForUpdate,
  getSupplierOpenPurchaseDueTotal,
} from "../suppliers/suppliers.repository.js";
import {
  createBankAccount as insertBankAccount,
  createCashAccount as insertCashAccount,
  countCashBankMovements,
  countTransfers,
  countCashReconciliations,
  countSupplierPayments,
  confirmDraftCashReconciliation,
  createCashBankMovement,
  createCashReconciliation as insertCashReconciliation,
  createCustomerPayment as insertCustomerPayment,
  createCustomerPaymentAllocations,
  createCustomerPaymentSplits,
  countCustomerPayments,
  createSupplierPayment as insertSupplierPayment,
  createSupplierPaymentAllocations,
  createSupplierPaymentSplits,
  createTransfer as insertTransfer,
  findBankAccountByAccountNumber,
  findBankAccountById,
  findCashAccountById,
  findCashReconciliationForDate,
  getCashBalanceBeforeDate,
  findCashAccountByName,
  findTransferById,
  findCustomerPaymentById,
  findCustomerPaymentReversal,
  findSupplierPaymentById,
  findSupplierPaymentReversal,
  findMovementBySource,
  listTransfers as readTransfers,
  listCustomerPayments as readCustomerPayments,
  listCustomerPaymentSplits,
  listCustomerPaymentAllocations,
  listSupplierPayments as readSupplierPayments,
  listSupplierPaymentSplits,
  listSupplierPaymentAllocations,
  lockCustomerPayment,
  lockCustomerPaymentSales,
  markCustomerPaymentReversed,
  lockSupplierPayment,
  lockSupplierPaymentPurchases,
  markSupplierPaymentReversed,
  listCashReconciliations as readCashReconciliations,
  lockBankAccount,
  lockCashAccount,
  lockCashReconciliation,
  listBankAccounts,
  listCashAccounts,
  listCashBankMovements as readCashBankMovements,
  readBankAccountBalance,
  readCashAccountBalance,
  sumCashMovementsForDate,
  updateBankAccount as saveBankAccountChanges,
  updateCashAccount as saveCashAccountChanges,
  updateDraftCashReconciliation,
  type BankAccountChanges,
  type BankAccountRecord,
  type BankAccountWithBalance,
  type CashAccountChanges,
  type CashAccountRecord,
  type CashAccountWithBalance,
  type CashBankMovementListItem,
  type CashBankTransferListItem,
  type CashBankTransferRecord,
  type CashReconciliationListItem,
  type CashReconciliationRecord,
  type NewCashReconciliation,
  type NewCashBankMovement,
  type NewCashBankTransfer,
  type CustomerPaymentRecord,
  type PaymentsDatabase,
  type SupplierPaymentRecord,
} from "./payments.repository.js";
import type {
  CreateBankAccountInput,
  CreateCashAccountInput,
  CreateCustomerReceiptInput,
  CreateSupplierPaymentInput,
  CustomerReceiptListQuery,
  SupplierPaymentListQuery,
  ReversePaymentInput,
  CreateTransferInput,
  UpdateBankAccountInput,
  MovementListQuery,
  TransferListQuery,
  CreateCashReconciliationInput,
  ReconciliationListQuery,
  DailyCashSummaryQuery,
  UpdateCashReconciliationInput,
  UpdateCashAccountInput,
} from "./payments.schema.js";

/** Contains both account types returned by the accounts screen. */
export interface PaymentAccounts {
  cashAccounts: CashAccountWithBalance[];
  bankAccounts: BankAccountWithBalance[];
}

/** Contains the expected cash position for one account and Asia/Karachi business date. */
export interface DailyCashSummary {
  cashAccountId: string;
  cashAccountName: string;
  date: string;
  opening: string;
  inflows: string;
  outflows: string;
  expectedClosing: string;
  countedAmount: string | null;
  difference: string | null;
}

/** Contains one paginated page of immutable cash and bank movements. */
export interface CashBankMovementPage {
  items: CashBankMovementListItem[];
  page: number;
  pageSize: number;
  total: number;
}

/** Contains one paginated page of immutable account transfers. */
export interface CashBankTransferPage {
  items: CashBankTransferListItem[];
  page: number;
  pageSize: number;
  total: number;
}

/** Contains one paginated page of draft and confirmed cash reconciliations. */
export interface CashReconciliationPage {
  items: CashReconciliationListItem[];
  page: number;
  pageSize: number;
  total: number;
}

/** Contains one paginated page of immutable customer receipts. */
export interface CustomerReceiptPage {
  items: CustomerPaymentRecord[];
  page: number;
  pageSize: number;
  total: number;
}

/** Contains one customer receipt with the rows needed by the detail screen. */
export interface CustomerReceiptDetail extends CustomerPaymentRecord {
  customerName: string;
  splits: Awaited<ReturnType<typeof listCustomerPaymentSplits>>;
  allocations: Array<{ documentId: string; amount: string }>;
  customerDueAmount: string;
  customerBalance: string;
}

/** Contains one paginated page of immutable supplier payments. */
export interface SupplierPaymentPage {
  items: SupplierPaymentRecord[];
  page: number;
  pageSize: number;
  total: number;
}

/** Contains one supplier payment with the rows needed by the detail screen. */
export interface SupplierPaymentDetail extends SupplierPaymentRecord {
  supplierName: string;
  splits: Awaited<ReturnType<typeof listSupplierPaymentSplits>>;
  allocations: Array<{ documentId: string; amount: string }>;
  supplierPayableAmount: string;
  supplierBalance: string;
}

/** Describes one cash or bank account used by a transfer. */
interface TransferAccount {
  accountType: "CASH" | "BANK";
  accountId: string;
  isActive: boolean;
}

/** Contains the shared fields needed to create an immutable account movement. */
export interface AccountMovementInput {
  accountId: string;
  sourceType: NewCashBankMovement["sourceType"];
  sourceId: string | null;
  amount: string;
  occurredAt: Date;
  documentNumber?: string | null;
  description?: string | null;
}

/** Describes one payment split before it is saved. */
interface PaymentSplitForValidation {
  method: "CASH" | "BANK_TRANSFER";
  amount: string;
  cashAccountId?: string;
  bankAccountId?: string;
}

/** Describes one document allocation before it is saved. */
interface PaymentAllocationForValidation {
  documentId: string;
  amount: string;
}

/** Contains trusted document data loaded by Sales or Purchases. */
interface ResolvedAllocationDocument {
  documentId: string;
  partyId: string;
  outstandingAmount: string;
}

/** Contains the trusted values used when a confirmed sale records its initial customer receipt. */
export interface SaleInitialCustomerReceiptInput {
  customerId: string;
  saleId: string;
  saleNumber: string;
  paymentDate: Date;
  splits: ReadonlyArray<{
    method: "CASH" | "BANK_TRANSFER";
    amount: string;
    cashAccountId?: string;
    bankAccountId?: string;
  }>;
  notes?: string | null;
}

/** Contains the trusted values used when a confirmed purchase records its initial supplier payment. */
export interface PurchaseInitialSupplierPaymentInput {
  supplierId: string;
  purchaseId: string;
  purchaseNumber: string;
  paymentDate: Date;
  splits: ReadonlyArray<{
    method: "CASH" | "BANK_TRANSFER";
    amount: string;
    cashAccountId?: string;
    bankAccountId?: string;
  }>;
  notes?: string | null;
}

/** Creates one stable Payments error for the shared error handler. */
function paymentError(
  code: string,
  message: string,
  statusCode = 400,
  field?: string,
): AppError {
  return new AppError(
    code,
    message,
    statusCode,
    field ? [{ field, message }] : undefined,
  );
}

/** Returns true when a decimal money string is greater than zero. */
function hasPositiveAmount(amount: string): boolean {
  const [wholePart, decimalPart = ""] = amount.split(".");
  const cents = BigInt(wholePart) * 100n + BigInt(decimalPart.padEnd(2, "0"));
  return cents > 0n;
}

/** Rejects a negative money amount that would break a non-negative business field. */
function requireNonNegativeAmount(amount: string, field: string): void {
  if (moneyToCents(amount) < 0n) {
    throw paymentError(
      "PAYMENT_AMOUNT_INVALID",
      "Amount cannot be negative.",
      400,
      field,
    );
  }
}

/** Ensures one split contains the account required by its payment method. */
function validateMatchingAccount(split: PaymentSplitForValidation): void {
  const usesCashAccount = Boolean(split.cashAccountId);
  const usesBankAccount = Boolean(split.bankAccountId);

  if (split.method === "CASH" && usesCashAccount && !usesBankAccount) return;
  if (split.method === "BANK_TRANSFER" && usesBankAccount && !usesCashAccount) return;

  throw paymentError(
    "INVALID_PAYMENT_METHOD",
    split.method === "CASH"
      ? "A cash split requires only a cash account."
      : "A bank-transfer split requires only a bank account.",
    400,
    split.method === "CASH" ? "cashAccountId" : "bankAccountId",
  );
}

/** Validates positive amounts, matching accounts, and duplicate split accounts. */
function validateSplits(splits: readonly PaymentSplitForValidation[]): void {
  if (splits.length === 0) {
    throw paymentError(
      "PAYMENT_AMOUNT_INVALID",
      "At least one payment split is required.",
      400,
      "splits",
    );
  }

  const usedAccounts = new Set<string>();

  for (const split of splits) {
    if (!hasPositiveAmount(split.amount)) {
      throw paymentError(
        "PAYMENT_AMOUNT_INVALID",
        "Every payment split amount must be greater than zero.",
        400,
        "splits",
      );
    }

    validateMatchingAccount(split);

    const accountId = split.cashAccountId ?? split.bankAccountId;
    const accountKey = `${split.method}:${accountId}`;
    if (usedAccounts.has(accountKey)) {
      throw paymentError(
        "DUPLICATE_PAYMENT_SPLIT",
        "The same account can appear only once in payment splits.",
        400,
        "splits",
      );
    }

    usedAccounts.add(accountKey);
  }
}

/** Validates positive amounts and prevents duplicate document allocations. */
function validateAllocations(
  allocations: readonly PaymentAllocationForValidation[],
): void {
  if (allocations.length === 0) {
    throw paymentError(
      "PAYMENT_AMOUNT_INVALID",
      "At least one document allocation is required.",
      400,
      "allocations",
    );
  }

  const usedDocuments = new Set<string>();

  for (const allocation of allocations) {
    if (!hasPositiveAmount(allocation.amount)) {
      throw paymentError(
        "PAYMENT_AMOUNT_INVALID",
        "Every allocation amount must be greater than zero.",
        400,
        "allocations",
      );
    }

    if (usedDocuments.has(allocation.documentId)) {
      throw paymentError(
        "DUPLICATE_PAYMENT_ALLOCATION",
        "The same document can be allocated only once.",
        400,
        "allocations",
      );
    }

    usedDocuments.add(allocation.documentId);
  }
}

/** Requires split and allocation totals to match exactly in integer cents. */
function validateSplitAndAllocationTotals(
  splits: readonly PaymentSplitForValidation[],
  allocations: readonly PaymentAllocationForValidation[],
): void {
  const splitTotal = splits.reduce(
    (total, split) => total + moneyToCents(split.amount),
    0n,
  );
  const allocationTotal = allocations.reduce(
    (total, allocation) => total + moneyToCents(allocation.amount),
    0n,
  );

  if (splitTotal !== allocationTotal) {
    throw paymentError(
      "PAYMENT_TOTAL_MISMATCH",
      "Payment split total must equal allocation total.",
      400,
      "allocations",
    );
  }
}

/** Ensures every account selected by a payment exists and is active. */
async function validateAccountsAreActive(
  database: PaymentsDatabase,
  splits: readonly PaymentSplitForValidation[],
): Promise<void> {
  for (const split of splits) {
    const account = split.method === "CASH"
      ? await requireCashAccount(database, split.cashAccountId as string)
      : await requireBankAccount(database, split.bankAccountId as string);

    if (!account.isActive) {
      throw paymentError(
        "ACCOUNT_INACTIVE",
        "Inactive accounts cannot be used for a new payment.",
        409,
      );
    }
  }
}

/** Ensures every allocated document belongs to the selected customer or supplier. */
function validateAllocationParty(
  partyId: string,
  documents: readonly ResolvedAllocationDocument[],
): void {
  const wrongParty = documents.some((document) => document.partyId !== partyId);

  if (wrongParty) {
    throw paymentError(
      "PAYMENT_PARTY_MISMATCH",
      "Every allocated document must belong to the selected party.",
      400,
      "allocations",
    );
  }
}

/** Ensures each allocation exists and does not exceed its outstanding amount. */
function validateOutstandingAmounts(
  allocations: readonly PaymentAllocationForValidation[],
  documents: readonly ResolvedAllocationDocument[],
): void {
  const documentsById = new Map(
    documents.map((document) => [document.documentId, document]),
  );

  for (const allocation of allocations) {
    const document = documentsById.get(allocation.documentId);

    if (!document) {
      throw paymentError(
        "PAYMENT_DOCUMENT_NOT_FOUND",
        "An allocated document was not found.",
        404,
        "allocations",
      );
    }

    if (moneyToCents(allocation.amount) > moneyToCents(document.outstandingAmount)) {
      throw paymentError(
        "ALLOCATION_EXCEEDS_OUTSTANDING",
        "An allocation cannot exceed the document outstanding amount.",
        409,
        "allocations",
      );
    }
  }
}

/** Runs all shared checks needed before a receipt or supplier payment is saved. */
async function validatePaymentRequest(
  database: PaymentsDatabase,
  partyId: string,
  splits: readonly PaymentSplitForValidation[],
  allocations: readonly PaymentAllocationForValidation[],
  documents: readonly ResolvedAllocationDocument[],
): Promise<void> {
  validateSplits(splits);
  validateAllocations(allocations);
  validateSplitAndAllocationTotals(splits, allocations);
  await validateAccountsAreActive(database, splits);
  validateAllocationParty(partyId, documents);
  validateOutstandingAmounts(allocations, documents);
}

/** Validates a customer receipt that can settle invoices and/or non-invoice customer due. */
async function validateCustomerReceiptRequest(
  database: PaymentsDatabase,
  customerId: string,
  splits: readonly PaymentSplitForValidation[],
  allocations: readonly PaymentAllocationForValidation[],
  documents: readonly ResolvedAllocationDocument[],
  customerDueAmount: string,
  availableCustomerDueAmount: string,
): Promise<void> {
  validateSplits(splits);

  if (allocations.length > 0) {
    validateAllocations(allocations);
  }

  if (allocations.length === 0 && moneyToCents(customerDueAmount) <= 0n) {
    throw paymentError(
      "PAYMENT_AMOUNT_INVALID",
      "Allocate the receipt to an invoice or existing customer due.",
      400,
      "allocations",
    );
  }

  await validateAccountsAreActive(database, splits);
  validateAllocationParty(customerId, documents);
  validateOutstandingAmounts(allocations, documents);

  if (moneyToCents(customerDueAmount) > moneyToCents(availableCustomerDueAmount)) {
    throw paymentError(
      "CUSTOMER_DUE_EXCEEDED",
      "Customer due payment cannot exceed the available non-invoice due.",
      409,
      "customerDueAmount",
    );
  }

  const splitTotal = splits.reduce(
    (total, split) => total + moneyToCents(split.amount),
    0n,
  );
  const receiptTotal = allocations.reduce(
    (total, allocation) => total + moneyToCents(allocation.amount),
    moneyToCents(customerDueAmount),
  );

  if (splitTotal !== receiptTotal) {
    throw paymentError(
      "PAYMENT_TOTAL_MISMATCH",
      "Payment split total must equal invoice allocations plus customer due payment.",
      400,
      "allocations",
    );
  }
}

/** Validates a supplier payment that can settle purchases and/or non-purchase supplier payable. */
async function validateSupplierPaymentRequest(
  database: PaymentsDatabase,
  supplierId: string,
  splits: readonly PaymentSplitForValidation[],
  allocations: readonly PaymentAllocationForValidation[],
  documents: readonly ResolvedAllocationDocument[],
  supplierPayableAmount: string,
  availableSupplierPayableAmount: string,
): Promise<void> {
  validateSplits(splits);

  if (allocations.length > 0) {
    validateAllocations(allocations);
  }

  if (allocations.length === 0 && moneyToCents(supplierPayableAmount) <= 0n) {
    throw paymentError(
      "PAYMENT_AMOUNT_INVALID",
      "Allocate the payment to a purchase or existing supplier payable.",
      400,
      "allocations",
    );
  }

  await validateAccountsAreActive(database, splits);
  validateAllocationParty(supplierId, documents);
  validateOutstandingAmounts(allocations, documents);

  if (moneyToCents(supplierPayableAmount) > moneyToCents(availableSupplierPayableAmount)) {
    throw paymentError(
      "SUPPLIER_PAYABLE_EXCEEDED",
      "Supplier payable payment cannot exceed the available non-purchase payable.",
      409,
      "supplierPayableAmount",
    );
  }

  const splitTotal = splits.reduce(
    (total, split) => total + moneyToCents(split.amount),
    0n,
  );
  const paymentTotal = allocations.reduce(
    (total, allocation) => total + moneyToCents(allocation.amount),
    moneyToCents(supplierPayableAmount),
  );

  if (splitTotal !== paymentTotal) {
    throw paymentError(
      "PAYMENT_TOTAL_MISMATCH",
      "Payment split total must equal purchase allocations plus supplier payable payment.",
      400,
      "allocations",
    );
  }
}

/** Runs related account writes in one PostgreSQL transaction. */
async function requireTransaction<T>(
  database: PaymentsDatabase,
  work: (transaction: PaymentsDatabase) => Promise<T>,
): Promise<T> {
  if (!database.transaction) {
    throw paymentError(
      "DATABASE_TRANSACTION_REQUIRED",
      "This financial operation requires a database transaction.",
      500,
    );
  }

  return database.transaction(async (transaction) =>
    work(transaction as unknown as PaymentsDatabase),
  );
}

/** Converts one two-decimal money string into exact signed integer cents. */
function moneyToCents(amount: string): bigint {
  const isNegative = amount.startsWith("-");
  const unsignedAmount = isNegative ? amount.slice(1) : amount;
  const [wholePart, decimalPart = ""] = unsignedAmount.split(".");
  const cents = BigInt(wholePart) * 100n + BigInt(decimalPart.padEnd(2, "0"));
  return isNegative ? -cents : cents;
}

/** Converts exact integer cents back into a two-decimal API money string. */
function centsToMoney(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const absolute = cents < 0n ? -cents : cents;
  const whole = absolute / 100n;
  const decimal = (absolute % 100n).toString().padStart(2, "0");
  return `${sign}${whole}.${decimal}`;
}

/** Converts an Asia/Karachi business date into its UTC timestamp. */
function businessDateToUtc(date: string): Date {
  return new Date(`${date}T00:00:00+05:00`);
}

/** Calculates the physical-count difference without floating-point arithmetic. */
function calculateReconciliationDifference(
  countedAmount: string,
  systemBalance: string,
): string {
  return centsToMoney(moneyToCents(countedAmount) - moneyToCents(systemBalance));
}

/** Converts an API account type into the database payment-method value. */
function toPaymentMethod(accountType: "CASH" | "BANK"): "CASH" | "BANK_TRANSFER" {
  return accountType === "CASH" ? "CASH" : "BANK_TRANSFER";
}

/** Loads and locks one transfer account inside the current transaction. */
async function lockTransferAccount(
  database: PaymentsDatabase,
  accountType: "CASH" | "BANK",
  accountId: string,
): Promise<TransferAccount> {
  const account = accountType === "CASH"
    ? await lockCashAccount(database, accountId)
    : await lockBankAccount(database, accountId);

  if (!account) {
    throw paymentError("ACCOUNT_NOT_FOUND", "Transfer account was not found.", 404);
  }

  return { accountType, accountId, isActive: account.isActive };
}

/** Locks both transfer accounts in stable order to reduce deadlock risk. */
async function lockTransferAccounts(
  database: PaymentsDatabase,
  input: CreateTransferInput,
): Promise<void> {
  const accounts = [
    { accountType: input.sourceAccountType, accountId: input.sourceAccountId },
    { accountType: input.destinationAccountType, accountId: input.destinationAccountId },
  ].sort((left, right) =>
    `${left.accountType}:${left.accountId}`.localeCompare(`${right.accountType}:${right.accountId}`),
  );

  for (const accountInput of accounts) {
    const account = await lockTransferAccount(
      database,
      accountInput.accountType,
      accountInput.accountId,
    );

    if (!account.isActive) {
      throw paymentError(
        "ACCOUNT_INACTIVE",
        "Inactive accounts cannot be used for transfers.",
        409,
      );
    }
  }
}

/** Reads the exact current balance for one transfer account. */
async function readTransferAccountBalance(
  database: PaymentsDatabase,
  accountType: "CASH" | "BANK",
  accountId: string,
): Promise<string> {
  return accountType === "CASH"
    ? readCashAccountBalance(database, accountId)
    : readBankAccountBalance(database, accountId);
}

/** Reads a PostgreSQL error code without trusting an unknown thrown value. */
function readPostgresCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  return typeof error.code === "string" ? error.code : null;
}

/** Converts a unique database conflict into a readable account error. */
function throwAccountConflict(error: unknown, field: string): never {
  if (readPostgresCode(error) === "23505") {
    throw paymentError(
      "DUPLICATE_ACCOUNT",
      "An account with the same identifying value already exists.",
      409,
      field,
    );
  }

  throw error;
}

/** Loads one cash account or throws the approved not-found error. */
async function requireCashAccount(
  database: PaymentsDatabase,
  accountId: string,
): Promise<CashAccountRecord> {
  const account = await findCashAccountById(database, accountId);

  if (!account) {
    throw paymentError("ACCOUNT_NOT_FOUND", "Cash account was not found.", 404);
  }

  return account;
}

/** Loads one bank account or throws the approved not-found error. */
async function requireBankAccount(
  database: PaymentsDatabase,
  accountId: string,
): Promise<BankAccountRecord> {
  const account = await findBankAccountById(database, accountId);

  if (!account) {
    throw paymentError("ACCOUNT_NOT_FOUND", "Bank account was not found.", 404);
  }

  return account;
}

/** Copies only approved cash-account fields into a repository update object. */
function readCashAccountChanges(input: UpdateCashAccountInput): CashAccountChanges {
  const changes: CashAccountChanges = {};

  if (input.name !== undefined) changes.name = input.name.trim();
  if (input.isActive !== undefined) changes.isActive = input.isActive;

  return changes;
}

/** Copies only approved bank-account fields into a repository update object. */
function readBankAccountChanges(input: UpdateBankAccountInput): BankAccountChanges {
  const changes: BankAccountChanges = {};

  if (input.bankName !== undefined) changes.bankName = input.bankName.trim();
  if (input.accountName !== undefined) changes.accountName = input.accountName.trim();
  if (input.accountNumber !== undefined) changes.accountNumber = input.accountNumber.trim();
  if (input.isActive !== undefined) changes.isActive = input.isActive;

  return changes;
}

/** Validates that a movement source has the required source identifier. */
function validateMovementSource(input: AccountMovementInput): void {
  const isOpeningBalance = input.sourceType === "OPENING_BALANCE";

  if (isOpeningBalance && input.sourceId !== null) {
    throw paymentError(
      "INVALID_MOVEMENT_SOURCE",
      "An opening balance movement cannot have a source ID.",
      400,
      "sourceId",
    );
  }

  if (!isOpeningBalance && input.sourceId === null) {
    throw paymentError(
      "INVALID_MOVEMENT_SOURCE",
      "This movement source requires a source ID.",
      400,
      "sourceId",
    );
  }
}

/** Converts a duplicate movement insert into a stable business error. */
function throwMovementConflict(error: unknown): never {
  if (readPostgresCode(error) === "23505") {
    throw paymentError(
      "DUPLICATE_MOVEMENT_SOURCE",
      "This account movement was already created.",
      409,
    );
  }

  throw error;
}

/** Writes one validated immutable movement for a cash or bank account. */
async function writeAccountMovement(
  database: PaymentsDatabase,
  method: "CASH" | "BANK_TRANSFER",
  direction: "INFLOW" | "OUTFLOW",
  input: AccountMovementInput,
): Promise<void> {
  if (!hasPositiveAmount(input.amount)) {
    throw paymentError(
      "PAYMENT_AMOUNT_INVALID",
      "Movement amount must be greater than zero.",
      400,
      "amount",
    );
  }

  validateMovementSource(input);

  const cashAccountId = method === "CASH" ? input.accountId : null;
  const bankAccountId = method === "BANK_TRANSFER" ? input.accountId : null;
  const account = method === "CASH"
    ? await requireCashAccount(database, input.accountId)
    : await requireBankAccount(database, input.accountId);

  if (!account.isActive) {
    throw paymentError(
      "ACCOUNT_INACTIVE",
      "Inactive accounts cannot be used for new movements.",
      409,
    );
  }

  const duplicate = await findMovementBySource(database, {
    method,
    cashAccountId,
    bankAccountId,
    direction,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  });

  if (duplicate) {
    throw paymentError(
      "DUPLICATE_MOVEMENT_SOURCE",
      "This account movement was already created.",
      409,
    );
  }

  try {
    const movement = await createCashBankMovement(database, {
      method,
      cashAccountId,
      bankAccountId,
      direction,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      amount: input.amount,
      occurredAt: input.occurredAt,
      documentNumber: input.documentNumber ?? null,
      description: input.description ?? null,
    });

    if (!movement) {
      throw paymentError(
        "ACCOUNT_MOVEMENT_CREATE_FAILED",
        "Account movement could not be created.",
        500,
      );
    }
  } catch (error) {
    throwMovementConflict(error);
  }
}

// Account movement writers

/** Writes one immutable inflow to a cash account. */
export async function writeCashInflow(
  database: PaymentsDatabase,
  input: AccountMovementInput,
): Promise<void> {
  await writeAccountMovement(database, "CASH", "INFLOW", input);
}

/** Writes one immutable outflow from a cash account. */
export async function writeCashOutflow(
  database: PaymentsDatabase,
  input: AccountMovementInput,
): Promise<void> {
  await writeAccountMovement(database, "CASH", "OUTFLOW", input);
}

/** Writes one immutable inflow to a bank account. */
export async function writeBankInflow(
  database: PaymentsDatabase,
  input: AccountMovementInput,
): Promise<void> {
  await writeAccountMovement(database, "BANK_TRANSFER", "INFLOW", input);
}

/** Writes one immutable outflow from a bank account. */
export async function writeBankOutflow(
  database: PaymentsDatabase,
  input: AccountMovementInput,
): Promise<void> {
  await writeAccountMovement(database, "BANK_TRANSFER", "OUTFLOW", input);
}

/** Creates the immutable opening movement for a cash account when needed. */
async function createCashOpeningMovement(
  database: PaymentsDatabase,
  account: CashAccountRecord,
): Promise<void> {
  if (!hasPositiveAmount(account.openingBalance)) return;

  await writeCashInflow(database, {
    accountId: account.id,
    sourceType: "OPENING_BALANCE",
    sourceId: null,
    amount: account.openingBalance,
    occurredAt: new Date(),
    description: "Opening cash account balance",
  });
}

/** Creates the immutable opening movement for a bank account when needed. */
async function createBankOpeningMovement(
  database: PaymentsDatabase,
  account: BankAccountRecord,
): Promise<void> {
  if (!hasPositiveAmount(account.openingBalance)) return;

  await writeBankInflow(database, {
    accountId: account.id,
    sourceType: "OPENING_BALANCE",
    sourceId: null,
    amount: account.openingBalance,
    occurredAt: new Date(),
    description: "Opening bank account balance",
  });
}

// Account operations

/** Builds the read-only daily cash summary for one cash account and business date. */
export async function getDailyCashSummary(
  database: PaymentsDatabase,
  query: DailyCashSummaryQuery,
): Promise<DailyCashSummary> {
  const account = await findCashAccountById(database, query.cashAccountId);

  if (!account) {
    throw paymentError(
      "ACCOUNT_NOT_FOUND",
      "Cash account was not found.",
      404,
      "cashAccountId",
    );
  }

  const [opening, movements, reconciliation] = await Promise.all([
    getCashBalanceBeforeDate(database, query.cashAccountId, query.date),
    sumCashMovementsForDate(database, query.cashAccountId, query.date),
    findCashReconciliationForDate(database, query.cashAccountId, query.date),
  ]);

  const expectedClosing = centsToMoney(
    moneyToCents(opening)
      + moneyToCents(movements.inflows)
      - moneyToCents(movements.outflows),
  );

  return {
    cashAccountId: account.id,
    cashAccountName: account.name,
    date: query.date,
    opening: centsToMoney(moneyToCents(opening)),
    inflows: centsToMoney(moneyToCents(movements.inflows)),
    outflows: centsToMoney(moneyToCents(movements.outflows)),
    expectedClosing,
    countedAmount: reconciliation?.countedAmount ?? null,
    difference: reconciliation?.differenceAmount ?? null,
  };
}

/** Lists all cash and bank accounts with balances from immutable movements. */
export async function listAccounts(
  database: PaymentsDatabase,
): Promise<PaymentAccounts> {
  const [cashAccountRows, bankAccountRows] = await Promise.all([
    listCashAccounts(database),
    listBankAccounts(database),
  ]);

  return { cashAccounts: cashAccountRows, bankAccounts: bankAccountRows };
}

/** Creates one cash account and its opening movement in one transaction. */
export async function createCashAccount(
  database: PaymentsDatabase,
  input: CreateCashAccountInput,
): Promise<CashAccountRecord> {
  requireNonNegativeAmount(input.openingBalance, "openingBalance");
  const name = input.name.trim();

  if (await findCashAccountByName(database, name)) {
    throw paymentError("DUPLICATE_ACCOUNT", "Cash account name already exists.", 409, "name");
  }

  try {
    return await requireTransaction(database, async (transaction) => {
      const account = await insertCashAccount(transaction, {
        name,
        openingBalance: input.openingBalance,
        isActive: true,
      });

      if (!account) {
        throw paymentError("ACCOUNT_CREATE_FAILED", "Cash account could not be created.", 500);
      }

      await createCashOpeningMovement(transaction, account);
      return account;
    });
  } catch (error) {
    return throwAccountConflict(error, "name");
  }
}

/** Updates the permitted cash-account fields without changing opening balance. */
export async function updateCashAccount(
  database: PaymentsDatabase,
  accountId: string,
  input: UpdateCashAccountInput,
): Promise<CashAccountRecord> {
  await requireCashAccount(database, accountId);

  if (input.name !== undefined) {
    const duplicate = await findCashAccountByName(database, input.name.trim());
    if (duplicate && duplicate.id !== accountId) {
      throw paymentError("DUPLICATE_ACCOUNT", "Cash account name already exists.", 409, "name");
    }
  }

  try {
    const account = await saveCashAccountChanges(
      database,
      accountId,
      readCashAccountChanges(input),
    );

    if (!account) {
      throw paymentError("ACCOUNT_UPDATE_FAILED", "Cash account could not be updated.", 500);
    }

    return account;
  } catch (error) {
    return throwAccountConflict(error, "name");
  }
}

/** Creates one bank account and its opening movement in one transaction. */
export async function createBankAccount(
  database: PaymentsDatabase,
  input: CreateBankAccountInput,
): Promise<BankAccountRecord> {
  requireNonNegativeAmount(input.openingBalance, "openingBalance");
  const accountNumber = input.accountNumber.trim();

  if (await findBankAccountByAccountNumber(database, accountNumber)) {
    throw paymentError(
      "DUPLICATE_ACCOUNT",
      "Bank account number already exists.",
      409,
      "accountNumber",
    );
  }

  try {
    return await requireTransaction(database, async (transaction) => {
      const account = await insertBankAccount(transaction, {
        bankName: input.bankName.trim(),
        accountName: input.accountName.trim(),
        accountNumber,
        openingBalance: input.openingBalance,
        isActive: true,
      });

      if (!account) {
        throw paymentError("ACCOUNT_CREATE_FAILED", "Bank account could not be created.", 500);
      }

      await createBankOpeningMovement(transaction, account);
      return account;
    });
  } catch (error) {
    return throwAccountConflict(error, "accountNumber");
  }
}

/** Updates the permitted bank-account fields without changing opening balance. */
export async function updateBankAccount(
  database: PaymentsDatabase,
  accountId: string,
  input: UpdateBankAccountInput,
): Promise<BankAccountRecord> {
  await requireBankAccount(database, accountId);

  if (input.accountNumber !== undefined) {
    const duplicate = await findBankAccountByAccountNumber(
      database,
      input.accountNumber.trim(),
    );
    if (duplicate && duplicate.id !== accountId) {
      throw paymentError(
        "DUPLICATE_ACCOUNT",
        "Bank account number already exists.",
        409,
        "accountNumber",
      );
    }
  }

  try {
    const account = await saveBankAccountChanges(
      database,
      accountId,
      readBankAccountChanges(input),
    );

    if (!account) {
      throw paymentError("ACCOUNT_UPDATE_FAILED", "Bank account could not be updated.", 500);
    }

    return account;
  } catch (error) {
    return throwAccountConflict(error, "accountNumber");
  }
}

// Movement history operations

/** Lists immutable account movements after validating an optional account filter. */
export async function listCashBankMovements(
  database: PaymentsDatabase,
  query: MovementListQuery,
): Promise<CashBankMovementPage> {
  if (query.accountId && query.accountType === "CASH") {
    await requireCashAccount(database, query.accountId);
  }

  if (query.accountId && query.accountType === "BANK") {
    await requireBankAccount(database, query.accountId);
  }

  const options = {
    accountType: query.accountType,
    accountId: query.accountId,
    startDate: query.startDate,
    endDate: query.endDate,
    page: query.page,
    pageSize: query.pageSize,
  };

  const [items, total] = await Promise.all([
    readCashBankMovements(database, options),
    countCashBankMovements(database, options),
  ]);

  return { items, page: query.page, pageSize: query.pageSize, total };
}

// Transfer operations

/** Lists immutable account transfers with pagination. */
export async function listTransfers(
  database: PaymentsDatabase,
  query: TransferListQuery,
): Promise<CashBankTransferPage> {
  const options = {
    startDate: query.startDate,
    endDate: query.endDate,
    page: query.page,
    pageSize: query.pageSize,
  };

  const [items, total] = await Promise.all([
    readTransfers(database, options),
    countTransfers(database, options),
  ]);

  return { items, page: query.page, pageSize: query.pageSize, total };
}

/** Loads one immutable transfer or returns the approved not-found error. */
export async function getTransfer(
  database: PaymentsDatabase,
  transferId: string,
): Promise<CashBankTransferRecord> {
  const transfer = await findTransferById(database, transferId);

  if (!transfer) {
    throw paymentError("TRANSFER_NOT_FOUND", "Transfer was not found.", 404);
  }

  return transfer;
}

/** Creates one transfer and its linked outflow and inflow in one transaction. */
export async function createTransfer(
  database: PaymentsDatabase,
  input: CreateTransferInput,
): Promise<CashBankTransferRecord> {
  if (!hasPositiveAmount(input.amount)) {
    throw paymentError(
      "PAYMENT_AMOUNT_INVALID",
      "Transfer amount must be greater than zero.",
      400,
      "amount",
    );
  }

  if (
    input.sourceAccountType === input.destinationAccountType &&
    input.sourceAccountId === input.destinationAccountId
  ) {
    throw paymentError(
      "INVALID_TRANSFER_ACCOUNT",
      "Transfer source and destination must be different accounts.",
      400,
      "destinationAccountId",
    );
  }

  return requireTransaction(database, async (transaction) => {
    await lockTransferAccounts(transaction, input);

    const sourceBalance = await readTransferAccountBalance(
      transaction,
      input.sourceAccountType,
      input.sourceAccountId,
    );

    if (moneyToCents(sourceBalance) < moneyToCents(input.amount)) {
      throw paymentError(
        "INSUFFICIENT_ACCOUNT_BALANCE",
        "The source account does not have enough balance for this transfer.",
        409,
        "amount",
      );
    }

    const transferInput: NewCashBankTransfer = {
      transferDate: businessDateToUtc(input.transferDate),
      amount: input.amount,
      sourceMethod: toPaymentMethod(input.sourceAccountType),
      sourceCashAccountId: input.sourceAccountType === "CASH" ? input.sourceAccountId : null,
      sourceBankAccountId: input.sourceAccountType === "BANK" ? input.sourceAccountId : null,
      destinationMethod: toPaymentMethod(input.destinationAccountType),
      destinationCashAccountId:
        input.destinationAccountType === "CASH" ? input.destinationAccountId : null,
      destinationBankAccountId:
        input.destinationAccountType === "BANK" ? input.destinationAccountId : null,
      notes: input.notes ?? null,
    };

    const transfer = await insertTransfer(transaction, transferInput);

    if (!transfer) {
      throw paymentError("TRANSFER_CREATE_FAILED", "Transfer could not be created.", 500);
    }

    const movementInput = {
      sourceType: "TRANSFER" as const,
      sourceId: transfer.id,
      amount: transfer.amount,
      occurredAt: transfer.transferDate,
      description: transfer.notes ?? "Internal account transfer",
    };

    if (input.sourceAccountType === "CASH") {
      await writeCashOutflow(transaction, { ...movementInput, accountId: input.sourceAccountId });
    } else {
      await writeBankOutflow(transaction, { ...movementInput, accountId: input.sourceAccountId });
    }

    if (input.destinationAccountType === "CASH") {
      await writeCashInflow(transaction, {
        ...movementInput,
        accountId: input.destinationAccountId,
      });
    } else {
      await writeBankInflow(transaction, {
        ...movementInput,
        accountId: input.destinationAccountId,
      });
    }

    return transfer;
  });
}

// Cash reconciliation operations

/** Lists draft and confirmed cash reconciliations with pagination. */
export async function listCashReconciliations(
  database: PaymentsDatabase,
  query: ReconciliationListQuery,
): Promise<CashReconciliationPage> {
  const options = {
    status: query.status,
    startDate: query.startDate,
    endDate: query.endDate,
    page: query.page,
    pageSize: query.pageSize,
  };

  const [items, total] = await Promise.all([
    readCashReconciliations(database, options),
    countCashReconciliations(database, options),
  ]);

  return { items, page: query.page, pageSize: query.pageSize, total };
}

/** Creates one editable cash-count draft using the account balance at that time. */
export async function createCashReconciliation(
  database: PaymentsDatabase,
  input: CreateCashReconciliationInput,
): Promise<CashReconciliationRecord> {
  requireNonNegativeAmount(input.countedAmount, "countedAmount");

  return requireTransaction(database, async (transaction) => {
    const account = await lockCashAccount(transaction, input.cashAccountId);

    if (!account) {
      throw paymentError("ACCOUNT_NOT_FOUND", "Cash account was not found.", 404);
    }

    if (!account.isActive) {
      throw paymentError(
        "ACCOUNT_INACTIVE",
        "Inactive cash accounts cannot be reconciled.",
        409,
      );
    }

    const systemBalance = await readCashAccountBalance(
      transaction,
      input.cashAccountId,
    );
    const differenceAmount = calculateReconciliationDifference(
      input.countedAmount,
      systemBalance,
    );
    const reconciliationInput: NewCashReconciliation = {
      cashAccountId: input.cashAccountId,
      reconciliationDate: businessDateToUtc(input.reconciliationDate),
      systemBalance,
      countedAmount: input.countedAmount,
      differenceAmount,
      status: "DRAFT",
      notes: input.notes ?? null,
      confirmedAt: null,
    };

    const reconciliation = await insertCashReconciliation(
      transaction,
      reconciliationInput,
    );

    if (!reconciliation) {
      throw paymentError(
        "RECONCILIATION_CREATE_FAILED",
        "Cash reconciliation could not be created.",
        500,
      );
    }

    return reconciliation;
  });
}

/** Updates counted cash or notes while the reconciliation remains a draft. */
export async function updateCashReconciliation(
  database: PaymentsDatabase,
  reconciliationId: string,
  input: UpdateCashReconciliationInput,
): Promise<CashReconciliationRecord> {
  if (input.countedAmount !== undefined) {
    requireNonNegativeAmount(input.countedAmount, "countedAmount");
  }

  return requireTransaction(database, async (transaction) => {
    const existing = await lockCashReconciliation(transaction, reconciliationId);

    if (!existing) {
      throw paymentError(
        "RECONCILIATION_NOT_FOUND",
        "Cash reconciliation was not found.",
        404,
      );
    }

    if (existing.status !== "DRAFT") {
      throw paymentError(
        "RECONCILIATION_ALREADY_CONFIRMED",
        "A confirmed cash reconciliation cannot be edited.",
        409,
      );
    }

    const countedAmount = input.countedAmount ?? existing.countedAmount;
    const changes = {
      ...(input.countedAmount !== undefined
        ? {
            countedAmount,
            differenceAmount: calculateReconciliationDifference(
              countedAmount,
              existing.systemBalance,
            ),
          }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    };
    const updated = await updateDraftCashReconciliation(
      transaction,
      reconciliationId,
      changes,
    );

    if (!updated) {
      throw paymentError(
        "RECONCILIATION_UPDATE_FAILED",
        "Cash reconciliation could not be updated.",
        409,
      );
    }

    return updated;
  });
}

/** Confirms one cash count and records any adjustment on the reconciliation business date. */
export async function confirmCashReconciliation(
  database: PaymentsDatabase,
  reconciliationId: string,
): Promise<CashReconciliationRecord> {
  return requireTransaction(database, async (transaction) => {
    const reconciliation = await lockCashReconciliation(
      transaction,
      reconciliationId,
    );

    if (!reconciliation) {
      throw paymentError(
        "RECONCILIATION_NOT_FOUND",
        "Cash reconciliation was not found.",
        404,
      );
    }

    if (reconciliation.status !== "DRAFT") {
      throw paymentError(
        "RECONCILIATION_ALREADY_CONFIRMED",
        "Cash reconciliation was already confirmed.",
        409,
      );
    }

    const account = await lockCashAccount(
      transaction,
      reconciliation.cashAccountId,
    );

    if (!account) {
      throw paymentError("ACCOUNT_NOT_FOUND", "Cash account was not found.", 404);
    }

    if (!account.isActive) {
      throw paymentError(
        "ACCOUNT_INACTIVE",
        "Inactive cash accounts cannot be reconciled.",
        409,
      );
    }

    const systemBalance = await readCashAccountBalance(
      transaction,
      reconciliation.cashAccountId,
    );
    const differenceAmount = calculateReconciliationDifference(
      reconciliation.countedAmount,
      systemBalance,
    );
    const differenceCents = moneyToCents(differenceAmount);
    const confirmedAt = new Date();

    const confirmed = await confirmDraftCashReconciliation(
      transaction,
      reconciliationId,
      { systemBalance, differenceAmount, confirmedAt },
    );

    if (!confirmed) {
      throw paymentError(
        "RECONCILIATION_CONFIRM_FAILED",
        "Cash reconciliation could not be confirmed.",
        409,
      );
    }

    if (differenceCents > 0n) {
      await writeCashInflow(transaction, {
        accountId: reconciliation.cashAccountId,
        sourceType: "RECONCILIATION_ADJUSTMENT",
        sourceId: reconciliation.id,
        amount: centsToMoney(differenceCents),
        occurredAt: reconciliation.reconciliationDate,
        description: "Cash reconciliation surplus adjustment",
      });
    }

    if (differenceCents < 0n) {
      await writeCashOutflow(transaction, {
        accountId: reconciliation.cashAccountId,
        sourceType: "RECONCILIATION_ADJUSTMENT",
        sourceId: reconciliation.id,
        amount: centsToMoney(-differenceCents),
        occurredAt: reconciliation.reconciliationDate,
        description: "Cash reconciliation shortage adjustment",
      });
    }

    return confirmed;
  });
}

// Customer receipt operations

/** Loads one customer receipt with its splits, allocations, customer name, and current due. */
async function buildCustomerReceiptDetail(
  database: PaymentsDatabase,
  payment: CustomerPaymentRecord,
): Promise<CustomerReceiptDetail> {
  const [customer, splits, allocations, customerBalance] = await Promise.all([
    findCustomerById(database, payment.customerId),
    listCustomerPaymentSplits(database, payment.id),
    listCustomerPaymentAllocations(database, payment.id),
    getCustomerCurrentDue(database, payment.customerId),
  ]);

  if (!customer) {
    throw paymentError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
  }

  const allocatedAmount = allocations.reduce(
    (total, allocation) => total + moneyToCents(allocation.amount),
    0n,
  );

  return {
    ...payment,
    customerName: customer.name,
    splits,
    allocations: allocations.map((allocation) => ({
      documentId: allocation.salesInvoiceId,
      amount: allocation.amount,
    })),
    customerDueAmount: centsToMoney(
      moneyToCents(payment.totalAmount) - allocatedAmount,
    ),
    customerBalance,
  };
}

/** Lists customer receipts using the approved customer/date filters and pagination. */
export async function listCustomerReceipts(
  database: PaymentsDatabase,
  query: CustomerReceiptListQuery,
): Promise<CustomerReceiptPage> {
  const [items, total] = await Promise.all([
    readCustomerPayments(database, query),
    countCustomerPayments(database, query),
  ]);

  return { items, page: query.page, pageSize: query.pageSize, total };
}

/** Creates one immutable customer receipt against invoice-linked and/or existing customer due. */
export async function createCustomerReceipt(
  database: PaymentsDatabase,
  input: CreateCustomerReceiptInput,
): Promise<CustomerReceiptDetail> {
  const customer = await findCustomerByIdForUpdate(database, input.customerId);
  if (!customer) {
    throw paymentError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
  }

  const invoiceRows = await lockCustomerPaymentSales(
    database,
    input.allocations.map((allocation) => allocation.documentId),
  );
  const documents: ResolvedAllocationDocument[] = invoiceRows.map((invoice) => ({
    documentId: invoice.id,
    partyId: invoice.customerId,
    outstandingAmount: centsToMoney(
      moneyToCents(invoice.totalAmount)
        - moneyToCents(invoice.returnedAmount)
        - moneyToCents(invoice.allocatedAmount),
    ),
  }));

  const [currentDue, invoiceDue] = await Promise.all([
    getCustomerCurrentDue(database, input.customerId),
    getCustomerOpenInvoiceDueTotal(database, input.customerId),
  ]);
  const unallocatedDueCents = moneyToCents(currentDue) - moneyToCents(invoiceDue);
  const availableCustomerDueAmount = centsToMoney(
    unallocatedDueCents > 0n ? unallocatedDueCents : 0n,
  );

  await validateCustomerReceiptRequest(
    database,
    input.customerId,
    input.splits,
    input.allocations,
    documents,
    input.customerDueAmount,
    availableCustomerDueAmount,
  );

  const totalAmount = centsToMoney(
    input.splits.reduce((total, split) => total + moneyToCents(split.amount), 0n),
  );
  const paymentDate = businessDateToUtc(input.paymentDate);
  const reservedNumber = await reserveBusinessDocumentNumberInTransaction(
    database,
    "CUSTOMER_RECEIPT",
  );
  const documentNumber = `${reservedNumber.prefix}-${reservedNumber.number}`;
  const payment = await insertCustomerPayment(database, {
    customerId: input.customerId,
    documentNumber,
    paymentDate,
    totalAmount,
    notes: input.notes?.trim() || null,
  });

  if (!payment) {
    throw paymentError(
      "CUSTOMER_RECEIPT_CREATE_FAILED",
      "Customer receipt could not be created.",
      500,
    );
  }

  await createCustomerPaymentSplits(
    database,
    input.splits.map((split) => ({
      customerPaymentId: payment.id,
      method: split.method,
      amount: split.amount,
      cashAccountId: split.method === "CASH" ? split.cashAccountId ?? null : null,
      bankAccountId:
        split.method === "BANK_TRANSFER" ? split.bankAccountId ?? null : null,
    })),
  );
  await createCustomerPaymentAllocations(
    database,
    input.allocations.map((allocation) => ({
      customerPaymentId: payment.id,
      salesInvoiceId: allocation.documentId,
      amount: allocation.amount,
    })),
  );

  await writeCustomerCredit(database, {
    customerId: payment.customerId,
    amount: payment.totalAmount,
    occurredAt: payment.paymentDate,
    referenceType: "CUSTOMER_PAYMENT",
    referenceId: payment.id,
    documentNumber: payment.documentNumber,
    description: `Customer receipt ${payment.documentNumber}`,
    notes: payment.notes,
  });

  for (const split of input.splits) {
    const movement = {
      accountId: (split.cashAccountId ?? split.bankAccountId) as string,
      sourceType: "CUSTOMER_RECEIPT" as const,
      sourceId: payment.id,
      amount: split.amount,
      occurredAt: payment.paymentDate,
      documentNumber: payment.documentNumber,
      description: `Customer receipt ${payment.documentNumber}`,
    };

    if (split.method === "CASH") await writeCashInflow(database, movement);
    else await writeBankInflow(database, movement);
  }

  return buildCustomerReceiptDetail(database, payment);
}

/** Loads one customer receipt with its immutable splits and invoice allocations. */
export async function getCustomerReceipt(
  database: PaymentsDatabase,
  paymentId: string,
): Promise<CustomerReceiptDetail> {
  const payment = await findCustomerPaymentById(database, paymentId);
  if (!payment) {
    throw paymentError(
      "CUSTOMER_RECEIPT_NOT_FOUND",
      "Customer receipt was not found.",
      404,
    );
  }

  return buildCustomerReceiptDetail(database, payment);
}

/** Reverses a customer receipt and restores its ledger/account effects atomically. */
export async function reverseCustomerReceipt(
  database: PaymentsDatabase,
  paymentId: string,
  input: ReversePaymentInput,
): Promise<CustomerReceiptDetail> {
  const payment = await lockCustomerPayment(database, paymentId);
  if (!payment) {
    throw paymentError(
      "CUSTOMER_RECEIPT_NOT_FOUND",
      "Customer receipt was not found.",
      404,
    );
  }
  if (payment.status !== "CONFIRMED" || payment.reversalOfPaymentId) {
    throw paymentError(
      "INVALID_PAYMENT_STATUS",
      "Only an unreversed customer receipt can be reversed.",
      409,
    );
  }
  if (await findCustomerPaymentReversal(database, payment.id)) {
    throw paymentError(
      "PAYMENT_ALREADY_REVERSED",
      "Customer receipt was already reversed.",
      409,
    );
  }

  const [splits, allocations] = await Promise.all([
    listCustomerPaymentSplits(database, payment.id),
    listCustomerPaymentAllocations(database, payment.id),
  ]);
  await lockCustomerPaymentSales(
    database,
    allocations.map((allocation) => allocation.salesInvoiceId),
  );

  const reservedNumber = await reserveBusinessDocumentNumberInTransaction(
    database,
    "CUSTOMER_RECEIPT",
  );
  const documentNumber = `${reservedNumber.prefix}-${reservedNumber.number}`;
  const reversal = await insertCustomerPayment(database, {
    customerId: payment.customerId,
    documentNumber,
    paymentDate: new Date(),
    totalAmount: payment.totalAmount,
    reversalOfPaymentId: payment.id,
    reversalReason: input.reason.trim(),
    notes: `Reversal of ${payment.documentNumber}`,
  });

  if (!reversal) {
    throw paymentError(
      "CUSTOMER_RECEIPT_REVERSAL_FAILED",
      "Customer receipt reversal could not be created.",
      500,
    );
  }

  await createCustomerPaymentSplits(
    database,
    splits.map((split) => ({
      customerPaymentId: reversal.id,
      method: split.method,
      amount: split.amount,
      cashAccountId: split.cashAccountId,
      bankAccountId: split.bankAccountId,
    })),
  );
  await createCustomerPaymentAllocations(
    database,
    allocations.map((allocation) => ({
      customerPaymentId: reversal.id,
      salesInvoiceId: allocation.salesInvoiceId,
      amount: allocation.amount,
    })),
  );

  await writeCustomerDebit(database, {
    customerId: payment.customerId,
    amount: payment.totalAmount,
    occurredAt: reversal.paymentDate,
    referenceType: "CUSTOMER_PAYMENT_REVERSAL",
    referenceId: reversal.id,
    documentNumber: reversal.documentNumber,
    description: `Reversal of customer receipt ${payment.documentNumber}`,
    notes: input.reason.trim(),
  });

  for (const split of splits) {
    const movement = {
      accountId: (split.cashAccountId ?? split.bankAccountId) as string,
      sourceType: "CUSTOMER_RECEIPT_REVERSAL" as const,
      sourceId: reversal.id,
      amount: split.amount,
      occurredAt: reversal.paymentDate,
      documentNumber: reversal.documentNumber,
      description: `Reversal of customer receipt ${payment.documentNumber}`,
    };

    if (split.method === "CASH") await writeCashOutflow(database, movement);
    else await writeBankOutflow(database, movement);
  }

  const reversedPayment = await markCustomerPaymentReversed(
    database,
    payment.id,
    reversal.id,
  );
  if (!reversedPayment) {
    throw paymentError(
      "CUSTOMER_RECEIPT_REVERSAL_FAILED",
      "Original customer receipt could not be marked reversed.",
      500,
    );
  }

  return buildCustomerReceiptDetail(database, reversedPayment);
}

/**
 * Records the normal supplier-payment records for a purchase initial payment.
 * The caller must pass the same transaction that confirms the purchase so the
 * payment, allocation, supplier-ledger debit, and account outflows commit together.
 */
export async function recordPurchaseInitialSupplierPayment(
  database: PaymentsDatabase,
  input: PurchaseInitialSupplierPaymentInput,
): Promise<SupplierPaymentRecord> {
  validateSplits(input.splits);
  await validateAccountsAreActive(database, input.splits);

  const totalCents = input.splits.reduce(
    (total, split) => total + moneyToCents(split.amount),
    0n,
  );

  if (totalCents <= 0n) {
    throw paymentError(
      "PAYMENT_AMOUNT_INVALID",
      "Initial supplier payment must be greater than zero.",
      400,
      "initialPayment",
    );
  }

  const reservedNumber = await reserveBusinessDocumentNumberInTransaction(
    database,
    "SUPPLIER_PAYMENT",
  );
  const documentNumber = `${reservedNumber.prefix}-${reservedNumber.number}`;
  const totalAmount = centsToMoney(totalCents);

  const payment = await insertSupplierPayment(database, {
    supplierId: input.supplierId,
    documentNumber,
    paymentDate: input.paymentDate,
    totalAmount,
    status: "CONFIRMED",
    reversalOfPaymentId: null,
    reversalReason: null,
    notes: input.notes ?? `Initial payment for purchase ${input.purchaseNumber}`,
  });

  if (!payment) {
    throw paymentError(
      "SUPPLIER_PAYMENT_CREATE_FAILED",
      "Initial supplier payment could not be created.",
      500,
    );
  }

  const savedSplits = await createSupplierPaymentSplits(
    database,
    input.splits.map((split) => ({
      supplierPaymentId: payment.id,
      method: split.method,
      amount: split.amount,
      cashAccountId: split.method === "CASH" ? split.cashAccountId ?? null : null,
      bankAccountId:
        split.method === "BANK_TRANSFER" ? split.bankAccountId ?? null : null,
    })),
  );

  if (savedSplits.length !== input.splits.length) {
    throw paymentError(
      "SUPPLIER_PAYMENT_CREATE_FAILED",
      "Initial supplier payment splits could not be created.",
      500,
    );
  }

  const allocations = await createSupplierPaymentAllocations(database, [
    {
      supplierPaymentId: payment.id,
      purchaseId: input.purchaseId,
      amount: totalAmount,
    },
  ]);

  if (allocations.length !== 1) {
    throw paymentError(
      "SUPPLIER_PAYMENT_CREATE_FAILED",
      "Initial supplier payment allocation could not be created.",
      500,
    );
  }

  await writeSupplierDebit(database, {
    supplierId: input.supplierId,
    amount: totalAmount,
    occurredAt: input.paymentDate,
    referenceType: "SUPPLIER_PAYMENT",
    referenceId: payment.id,
    documentNumber,
    description: `Supplier payment ${documentNumber}`,
    notes: payment.notes,
  });

  for (const split of input.splits) {
    const movement = {
      accountId: (split.cashAccountId ?? split.bankAccountId) as string,
      sourceType: "PURCHASE_INITIAL_PAYMENT" as const,
      sourceId: payment.id,
      amount: split.amount,
      occurredAt: input.paymentDate,
      documentNumber,
      description: `Initial payment for purchase ${input.purchaseNumber}`,
    };

    if (split.method === "CASH") {
      await writeCashOutflow(database, movement);
    } else {
      await writeBankOutflow(database, movement);
    }
  }

  return payment;
}

/**
 * Records the normal customer-receipt records for a sale initial payment.
 * The caller passes the same transaction that confirms the sale so the
 * receipt, allocation, customer-ledger credit, and account inflows commit together.
 */
export async function recordSaleInitialCustomerReceipt(
  database: PaymentsDatabase,
  input: SaleInitialCustomerReceiptInput,
): Promise<CustomerPaymentRecord> {
  validateSplits(input.splits);
  await validateAccountsAreActive(database, input.splits);

  const totalCents = input.splits.reduce(
    (total, split) => total + moneyToCents(split.amount),
    0n,
  );

  if (totalCents <= 0n) {
    throw paymentError(
      "PAYMENT_AMOUNT_INVALID",
      "Initial customer payment must be greater than zero.",
      400,
      "initialPayment",
    );
  }

  const reservedNumber = await reserveBusinessDocumentNumberInTransaction(
    database,
    "CUSTOMER_RECEIPT",
  );
  const documentNumber = `${reservedNumber.prefix}-${reservedNumber.number}`;
  const totalAmount = centsToMoney(totalCents);
  const allocationInput = [{ documentId: input.saleId, amount: totalAmount }];

  // Keep the same split/allocation invariant used by normal customer receipts.
  validateAllocations(allocationInput);
  validateSplitAndAllocationTotals(input.splits, allocationInput);

  const payment = await insertCustomerPayment(database, {
    customerId: input.customerId,
    documentNumber,
    paymentDate: input.paymentDate,
    totalAmount,
    status: "CONFIRMED",
    reversalOfPaymentId: null,
    reversalReason: null,
    notes: input.notes ?? `Initial payment for sale ${input.saleNumber}`,
  });

  if (!payment) {
    throw paymentError(
      "CUSTOMER_RECEIPT_CREATE_FAILED",
      "Initial customer receipt could not be created.",
      500,
    );
  }

  const savedSplits = await createCustomerPaymentSplits(
    database,
    input.splits.map((split) => ({
      customerPaymentId: payment.id,
      method: split.method,
      amount: split.amount,
      cashAccountId: split.method === "CASH" ? split.cashAccountId ?? null : null,
      bankAccountId:
        split.method === "BANK_TRANSFER" ? split.bankAccountId ?? null : null,
    })),
  );

  if (savedSplits.length !== input.splits.length) {
    throw paymentError(
      "CUSTOMER_RECEIPT_CREATE_FAILED",
      "Initial customer receipt splits could not be created.",
      500,
    );
  }

  const allocations = await createCustomerPaymentAllocations(
    database,
    allocationInput.map((allocation) => ({
      customerPaymentId: payment.id,
      salesInvoiceId: allocation.documentId,
      amount: allocation.amount,
    })),
  );

  if (allocations.length !== 1) {
    throw paymentError(
      "CUSTOMER_RECEIPT_CREATE_FAILED",
      "Initial customer receipt allocation could not be created.",
      500,
    );
  }

  await writeCustomerCredit(database, {
    customerId: input.customerId,
    amount: totalAmount,
    occurredAt: input.paymentDate,
    referenceType: "CUSTOMER_PAYMENT",
    referenceId: payment.id,
    documentNumber,
    description: `Customer receipt ${documentNumber}`,
    notes: payment.notes,
  });

  for (const split of input.splits) {
    const movement = {
      accountId: (split.cashAccountId ?? split.bankAccountId) as string,
      sourceType: "SALE_INITIAL_PAYMENT" as const,
      sourceId: payment.id,
      amount: split.amount,
      occurredAt: input.paymentDate,
      documentNumber,
      description: `Initial payment for sale ${input.saleNumber}`,
    };

    if (split.method === "CASH") {
      await writeCashInflow(database, movement);
    } else {
      await writeBankInflow(database, movement);
    }
  }

  return payment;
}

// Supplier payment operations

/** Loads one supplier payment with its splits, allocations, supplier name, and current payable. */
async function buildSupplierPaymentDetail(
  database: PaymentsDatabase,
  payment: SupplierPaymentRecord,
): Promise<SupplierPaymentDetail> {
  const [supplier, splits, allocations, supplierBalance] = await Promise.all([
    findSupplierById(database, payment.supplierId),
    listSupplierPaymentSplits(database, payment.id),
    listSupplierPaymentAllocations(database, payment.id),
    getSupplierCurrentPayable(database, payment.supplierId),
  ]);

  if (!supplier) {
    throw paymentError("SUPPLIER_NOT_FOUND", "Supplier was not found.", 404);
  }

  const allocatedAmount = allocations.reduce(
    (total, allocation) => total + moneyToCents(allocation.amount),
    0n,
  );

  return {
    ...payment,
    supplierName: supplier.name,
    splits,
    allocations: allocations.map((allocation) => ({
      documentId: allocation.purchaseId,
      amount: allocation.amount,
    })),
    supplierPayableAmount: centsToMoney(
      moneyToCents(payment.totalAmount) - allocatedAmount,
    ),
    supplierBalance,
  };
}

/** Lists supplier payments using the approved supplier/date filters and pagination. */
export async function listSupplierPayments(
  database: PaymentsDatabase,
  query: SupplierPaymentListQuery,
): Promise<SupplierPaymentPage> {
  const [items, total] = await Promise.all([
    readSupplierPayments(database, query),
    countSupplierPayments(database, query),
  ]);

  return { items, page: query.page, pageSize: query.pageSize, total };
}

/** Creates one immutable supplier payment against real confirmed outstanding purchases. */
export async function createSupplierPayment(
  database: PaymentsDatabase,
  input: CreateSupplierPaymentInput,
): Promise<SupplierPaymentDetail> {
  const supplier = await findSupplierById(database, input.supplierId);
  if (!supplier) {
    throw paymentError("SUPPLIER_NOT_FOUND", "Supplier was not found.", 404);
  }

  const purchaseRows = await lockSupplierPaymentPurchases(
    database,
    input.allocations.map((allocation) => allocation.documentId),
  );
  const lockedSupplier = await findSupplierByIdForUpdate(database, input.supplierId);
  if (!lockedSupplier) {
    throw paymentError("SUPPLIER_NOT_FOUND", "Supplier was not found.", 404);
  }

  const documents: ResolvedAllocationDocument[] = purchaseRows.map((purchase) => ({
    documentId: purchase.id,
    partyId: purchase.supplierId,
    outstandingAmount: centsToMoney(
      moneyToCents(purchase.totalAmount)
        - moneyToCents(purchase.returnedAmount)
        - moneyToCents(purchase.allocatedAmount),
    ),
  }));

  const [currentPayable, purchaseDue] = await Promise.all([
    getSupplierCurrentPayable(database, input.supplierId),
    getSupplierOpenPurchaseDueTotal(database, input.supplierId),
  ]);
  const unallocatedPayableCents = moneyToCents(currentPayable) - moneyToCents(purchaseDue);
  const availableSupplierPayableAmount = centsToMoney(
    unallocatedPayableCents > 0n ? unallocatedPayableCents : 0n,
  );

  await validateSupplierPaymentRequest(
    database,
    input.supplierId,
    input.splits,
    input.allocations,
    documents,
    input.supplierPayableAmount,
    availableSupplierPayableAmount,
  );

  const totalAmount = centsToMoney(
    input.splits.reduce((total, split) => total + moneyToCents(split.amount), 0n),
  );
  const paymentDate = businessDateToUtc(input.paymentDate);
  const reservedNumber = await reserveBusinessDocumentNumberInTransaction(
    database,
    "SUPPLIER_PAYMENT",
  );
  const documentNumber = `${reservedNumber.prefix}-${reservedNumber.number}`;
  const payment = await insertSupplierPayment(database, {
    supplierId: input.supplierId,
    documentNumber,
    paymentDate,
    totalAmount,
    notes: input.notes?.trim() || null,
  });

  if (!payment) {
    throw paymentError("SUPPLIER_PAYMENT_CREATE_FAILED", "Supplier payment could not be created.", 500);
  }

  await createSupplierPaymentSplits(
    database,
    input.splits.map((split) => ({
      supplierPaymentId: payment.id,
      method: split.method,
      amount: split.amount,
      cashAccountId: split.method === "CASH" ? split.cashAccountId ?? null : null,
      bankAccountId: split.method === "BANK_TRANSFER" ? split.bankAccountId ?? null : null,
    })),
  );
  await createSupplierPaymentAllocations(
    database,
    input.allocations.map((allocation) => ({
      supplierPaymentId: payment.id,
      purchaseId: allocation.documentId,
      amount: allocation.amount,
    })),
  );

  await writeSupplierDebit(database, {
    supplierId: payment.supplierId,
    amount: payment.totalAmount,
    occurredAt: payment.paymentDate,
    referenceType: "SUPPLIER_PAYMENT",
    referenceId: payment.id,
    documentNumber: payment.documentNumber,
    description: `Supplier payment ${payment.documentNumber}`,
    notes: payment.notes,
  });

  for (const split of input.splits) {
    const movement = {
      accountId: (split.cashAccountId ?? split.bankAccountId) as string,
      sourceType: "SUPPLIER_PAYMENT" as const,
      sourceId: payment.id,
      amount: split.amount,
      occurredAt: payment.paymentDate,
      documentNumber: payment.documentNumber,
      description: `Supplier payment ${payment.documentNumber}`,
    };

    if (split.method === "CASH") await writeCashOutflow(database, movement);
    else await writeBankOutflow(database, movement);
  }

  return buildSupplierPaymentDetail(database, payment);
}

/** Loads one supplier payment with its immutable splits and purchase allocations. */
export async function getSupplierPayment(
  database: PaymentsDatabase,
  paymentId: string,
): Promise<SupplierPaymentDetail> {
  const payment = await findSupplierPaymentById(database, paymentId);
  if (!payment) {
    throw paymentError("SUPPLIER_PAYMENT_NOT_FOUND", "Supplier payment was not found.", 404);
  }

  return buildSupplierPaymentDetail(database, payment);
}

/** Reverses a supplier payment and restores its ledger/account effects atomically. */
export async function reverseSupplierPayment(
  database: PaymentsDatabase,
  paymentId: string,
  input: ReversePaymentInput,
): Promise<SupplierPaymentDetail> {
  const payment = await lockSupplierPayment(database, paymentId);
  if (!payment) {
    throw paymentError("SUPPLIER_PAYMENT_NOT_FOUND", "Supplier payment was not found.", 404);
  }
  if (payment.status !== "CONFIRMED" || payment.reversalOfPaymentId) {
    throw paymentError("INVALID_PAYMENT_STATUS", "Only an unreversed supplier payment can be reversed.", 409);
  }
  if (await findSupplierPaymentReversal(database, payment.id)) {
    throw paymentError("PAYMENT_ALREADY_REVERSED", "Supplier payment was already reversed.", 409);
  }

  const [splits, allocations] = await Promise.all([
    listSupplierPaymentSplits(database, payment.id),
    listSupplierPaymentAllocations(database, payment.id),
  ]);
  await lockSupplierPaymentPurchases(database, allocations.map((allocation) => allocation.purchaseId));

  const reservedNumber = await reserveBusinessDocumentNumberInTransaction(
    database,
    "SUPPLIER_PAYMENT",
  );
  const documentNumber = `${reservedNumber.prefix}-${reservedNumber.number}`;
  const reversal = await insertSupplierPayment(database, {
    supplierId: payment.supplierId,
    documentNumber,
    paymentDate: new Date(),
    totalAmount: payment.totalAmount,
    reversalOfPaymentId: payment.id,
    reversalReason: input.reason.trim(),
    notes: `Reversal of ${payment.documentNumber}`,
  });

  if (!reversal) {
    throw paymentError("SUPPLIER_PAYMENT_REVERSAL_FAILED", "Supplier payment reversal could not be created.", 500);
  }

  await createSupplierPaymentSplits(
    database,
    splits.map((split) => ({
      supplierPaymentId: reversal.id,
      method: split.method,
      amount: split.amount,
      cashAccountId: split.cashAccountId,
      bankAccountId: split.bankAccountId,
    })),
  );
  await createSupplierPaymentAllocations(
    database,
    allocations.map((allocation) => ({
      supplierPaymentId: reversal.id,
      purchaseId: allocation.purchaseId,
      amount: allocation.amount,
    })),
  );

  await writeSupplierCredit(database, {
    supplierId: payment.supplierId,
    amount: payment.totalAmount,
    occurredAt: reversal.paymentDate,
    referenceType: "SUPPLIER_PAYMENT_REVERSAL",
    referenceId: reversal.id,
    documentNumber: reversal.documentNumber,
    description: `Reversal of supplier payment ${payment.documentNumber}`,
    notes: input.reason.trim(),
  });

  for (const split of splits) {
    const movement = {
      accountId: (split.cashAccountId ?? split.bankAccountId) as string,
      sourceType: "SUPPLIER_PAYMENT_REVERSAL" as const,
      sourceId: reversal.id,
      amount: split.amount,
      occurredAt: reversal.paymentDate,
      documentNumber: reversal.documentNumber,
      description: `Reversal of supplier payment ${payment.documentNumber}`,
    };

    if (split.method === "CASH") await writeCashInflow(database, movement);
    else await writeBankInflow(database, movement);
  }

  const reversedPayment = await markSupplierPaymentReversed(database, payment.id, reversal.id);
  if (!reversedPayment) {
    throw paymentError("SUPPLIER_PAYMENT_REVERSAL_FAILED", "Original supplier payment could not be marked reversed.", 500);
  }

  return buildSupplierPaymentDetail(database, reversedPayment);
}

