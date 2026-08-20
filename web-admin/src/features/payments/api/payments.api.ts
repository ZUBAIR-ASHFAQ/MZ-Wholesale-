import { requestApi } from "../../../lib/api-client.ts";
import type { ApiSuccess } from "../../../lib/api-types.ts";

export interface CashAccount {
  id: string;
  name: string;
  openingBalance: string;
  balance: string;
  isActive: boolean;
  createdAt: string;
}

export interface BankAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  openingBalance: string;
  balance: string;
  isActive: boolean;
  createdAt: string;
}

export interface PaymentAccounts {
  cashAccounts: CashAccount[];
  bankAccounts: BankAccount[];
}

export interface DailyCashSummaryFilters {
  cashAccountId: string;
  date: string;
}

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

/** Loads the expected cash position for one account and business date. */
export function loadDailyCashSummary(
  filters: DailyCashSummaryFilters,
): Promise<ApiSuccess<DailyCashSummary>> {
  const params = new URLSearchParams({
    cashAccountId: filters.cashAccountId,
    date: filters.date,
  });

  return requestApi<ApiSuccess<DailyCashSummary>>(
    `/payments/daily-cash-summary?${params.toString()}`,
  );
}

export interface CreateCashAccountInput {
  name: string;
  openingBalance: string;
}

export interface UpdateCashAccountInput {
  name?: string;
  isActive?: boolean;
}

export interface CreateBankAccountInput {
  bankName: string;
  accountName: string;
  accountNumber: string;
  openingBalance: string;
}

export interface UpdateBankAccountInput {
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  isActive?: boolean;
}

export interface MovementFilters {
  accountType?: "CASH" | "BANK";
  accountId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface CashBankMovement {
  id: string;
  occurredAt: string;
  accountType: "CASH" | "BANK";
  accountId: string;
  accountName: string;
  direction: "INFLOW" | "OUTFLOW";
  method: "CASH" | "BANK_TRANSFER";
  sourceType: string;
  sourceId: string | null;
  documentNumber: string | null;
  amount: string;
  description: string | null;
}

export interface CashBankMovementPage {
  items: CashBankMovement[];
  page: number;
  pageSize: number;
  total: number;
}

/** Adds one optional text filter to an API query string. */
function addTextFilter(
  params: URLSearchParams,
  name: string,
  value: string | undefined,
): void {
  const trimmedValue = value?.trim();

  if (trimmedValue) {
    params.set(name, trimmedValue);
  }
}

/** Adds page values to an API query string when supplied. */
function addPagination(
  params: URLSearchParams,
  filters: { page?: number; pageSize?: number },
): void {
  if (filters.page !== undefined) params.set("page", String(filters.page));
  if (filters.pageSize !== undefined) params.set("pageSize", String(filters.pageSize));
}

/** Converts URL parameters into an optional query-string suffix. */
function createQueryString(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Builds the approved cash and bank movement history query. */
function buildMovementQuery(filters: MovementFilters): string {
  const params = new URLSearchParams();
  addTextFilter(params, "accountType", filters.accountType);
  addTextFilter(params, "accountId", filters.accountId);
  addTextFilter(params, "startDate", filters.startDate);
  addTextFilter(params, "endDate", filters.endDate);
  addPagination(params, filters);
  return createQueryString(params);
}

/** Loads all cash and bank accounts with calculated balances. */
export function loadPaymentAccounts(): Promise<ApiSuccess<PaymentAccounts>> {
  return requestApi<ApiSuccess<PaymentAccounts>>("/payments/accounts", {
    cache: "no-store",
  });
}

/** Creates one cash account and protects its opening movement from duplicate retries. */
export function createCashAccount(
  input: CreateCashAccountInput,
): Promise<ApiSuccess<CashAccount>> {
  return requestApi<ApiSuccess<CashAccount>>("/payments/cash-accounts", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(input),
  });
}

/** Updates one cash account without changing its opening balance. */
export function updateCashAccount(
  accountId: string,
  input: UpdateCashAccountInput,
): Promise<ApiSuccess<CashAccount>> {
  return requestApi<ApiSuccess<CashAccount>>(`/payments/cash-accounts/${accountId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** Creates one bank account and protects its opening movement from duplicate retries. */
export function createBankAccount(
  input: CreateBankAccountInput,
): Promise<ApiSuccess<BankAccount>> {
  return requestApi<ApiSuccess<BankAccount>>("/payments/bank-accounts", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(input),
  });
}

/** Updates one bank account without changing its opening balance. */
export function updateBankAccount(
  accountId: string,
  input: UpdateBankAccountInput,
): Promise<ApiSuccess<BankAccount>> {
  return requestApi<ApiSuccess<BankAccount>>(`/payments/bank-accounts/${accountId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** Loads immutable cash and bank movement history. */
export function loadCashBankMovements(
  filters: MovementFilters = {},
): Promise<ApiSuccess<CashBankMovementPage>> {
  return requestApi<ApiSuccess<CashBankMovementPage>>(
    `/payments/cash-bank-movements${buildMovementQuery(filters)}`,
  );
}

export type PaymentMethod = "CASH" | "BANK_TRANSFER";
export type PaymentStatus = "CONFIRMED" | "REVERSED";

export interface PaymentSplitInput {
  method: PaymentMethod;
  amount: string;
  cashAccountId?: string;
  bankAccountId?: string;
}

export interface PaymentAllocationInput {
  documentId: string;
  amount: string;
}

export interface PaymentSplit {
  id: string;
  method: PaymentMethod;
  amount: string;
  cashAccountId: string | null;
  bankAccountId: string | null;
  accountName?: string;
}

export interface PaymentAllocation {
  id: string;
  documentId: string;
  documentNumber?: string;
  documentDate?: string;
  amount: string;
}

export interface CustomerReceiptFilters {
  customerId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateCustomerReceiptInput {
  customerId: string;
  paymentDate: string;
  splits: PaymentSplitInput[];
  allocations: PaymentAllocationInput[];
  customerDueAmount?: string;
  notes?: string | null;
}

export interface CustomerReceipt {
  id: string;
  customerId: string;
  customerName?: string;
  documentNumber: string;
  paymentDate: string;
  totalAmount: string;
  status: PaymentStatus;
  reversalOfPaymentId: string | null;
  reversalReason: string | null;
  notes: string | null;
  createdAt: string;
  splits?: PaymentSplit[];
  allocations?: PaymentAllocation[];
  customerDueAmount?: string;
  customerBalance?: string;
}

export interface CustomerReceiptPage {
  items: CustomerReceipt[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SupplierPaymentFilters {
  supplierId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateSupplierPaymentInput {
  supplierId: string;
  paymentDate: string;
  splits: PaymentSplitInput[];
  allocations: PaymentAllocationInput[];
  supplierPayableAmount?: string;
  notes?: string | null;
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  supplierName?: string;
  documentNumber: string;
  paymentDate: string;
  totalAmount: string;
  status: PaymentStatus;
  reversalOfPaymentId: string | null;
  reversalReason: string | null;
  notes: string | null;
  createdAt: string;
  splits?: PaymentSplit[];
  allocations?: PaymentAllocation[];
  supplierPayableAmount?: string;
  supplierBalance?: string;
}

export interface SupplierPaymentPage {
  items: SupplierPayment[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ReversePaymentInput {
  reason: string;
}

/** Builds the approved customer-receipt list query string. */
function buildCustomerReceiptQuery(filters: CustomerReceiptFilters): string {
  const params = new URLSearchParams();
  addTextFilter(params, "customerId", filters.customerId);
  addTextFilter(params, "startDate", filters.startDate);
  addTextFilter(params, "endDate", filters.endDate);
  addPagination(params, filters);
  return createQueryString(params);
}

/** Builds the approved supplier-payment list query string. */
function buildSupplierPaymentQuery(filters: SupplierPaymentFilters): string {
  const params = new URLSearchParams();
  addTextFilter(params, "supplierId", filters.supplierId);
  addTextFilter(params, "startDate", filters.startDate);
  addTextFilter(params, "endDate", filters.endDate);
  addPagination(params, filters);
  return createQueryString(params);
}

/** Loads the paginated customer receipt list. */
export function loadCustomerReceipts(
  filters: CustomerReceiptFilters = {},
): Promise<ApiSuccess<CustomerReceiptPage>> {
  return requestApi<ApiSuccess<CustomerReceiptPage>>(
    `/payments/customer-receipts${buildCustomerReceiptQuery(filters)}`,
  );
}

/** Creates one customer receipt with an explicit idempotency key. */
export function createCustomerReceipt(
  input: CreateCustomerReceiptInput,
  idempotencyKey: string,
): Promise<ApiSuccess<CustomerReceipt>> {
  return requestApi<ApiSuccess<CustomerReceipt>>("/payments/customer-receipts", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}

/** Loads one customer receipt with its splits and allocations. */
export function loadCustomerReceipt(
  receiptId: string,
): Promise<ApiSuccess<CustomerReceipt>> {
  return requestApi<ApiSuccess<CustomerReceipt>>(
    `/payments/customer-receipts/${receiptId}`,
  );
}

/** Reverses one customer receipt with a new idempotency key. */
export function reverseCustomerReceipt(
  receiptId: string,
  input: ReversePaymentInput,
  idempotencyKey: string,
): Promise<ApiSuccess<CustomerReceipt>> {
  return requestApi<ApiSuccess<CustomerReceipt>>(
    `/payments/customer-receipts/${receiptId}/reverse`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input),
    },
  );
}

/** Loads the paginated supplier payment list. */
export function loadSupplierPayments(
  filters: SupplierPaymentFilters = {},
): Promise<ApiSuccess<SupplierPaymentPage>> {
  return requestApi<ApiSuccess<SupplierPaymentPage>>(
    `/payments/supplier-payments${buildSupplierPaymentQuery(filters)}`,
  );
}

/** Creates one supplier payment with an explicit idempotency key. */
export function createSupplierPayment(
  input: CreateSupplierPaymentInput,
  idempotencyKey: string,
): Promise<ApiSuccess<SupplierPayment>> {
  return requestApi<ApiSuccess<SupplierPayment>>("/payments/supplier-payments", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}

/** Loads one supplier payment with its splits and allocations. */
export function loadSupplierPayment(
  paymentId: string,
): Promise<ApiSuccess<SupplierPayment>> {
  return requestApi<ApiSuccess<SupplierPayment>>(
    `/payments/supplier-payments/${paymentId}`,
  );
}

/** Reverses one supplier payment with a new idempotency key. */
export function reverseSupplierPayment(
  paymentId: string,
  input: ReversePaymentInput,
  idempotencyKey: string,
): Promise<ApiSuccess<SupplierPayment>> {
  return requestApi<ApiSuccess<SupplierPayment>>(
    `/payments/supplier-payments/${paymentId}/reverse`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input),
    },
  );
}

export interface TransferFilters {
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateTransferInput {
  sourceAccountType: "CASH" | "BANK";
  sourceAccountId: string;
  destinationAccountType: "CASH" | "BANK";
  destinationAccountId: string;
  amount: string;
  transferDate: string;
  notes?: string | null;
}

export interface CashBankTransfer {
  id: string;
  transferDate: string;
  amount: string;
  sourceMethod: "CASH" | "BANK_TRANSFER";
  sourceCashAccountId: string | null;
  sourceBankAccountId: string | null;
  destinationMethod: "CASH" | "BANK_TRANSFER";
  destinationCashAccountId: string | null;
  destinationBankAccountId: string | null;
  sourceAccountName?: string;
  destinationAccountName?: string;
  notes: string | null;
  createdAt: string;
}

export interface CashBankTransferPage {
  items: CashBankTransfer[];
  page: number;
  pageSize: number;
  total: number;
}

/** Builds the approved transfer-history query string. */
function buildTransferQuery(filters: TransferFilters): string {
  const params = new URLSearchParams();
  addTextFilter(params, "startDate", filters.startDate);
  addTextFilter(params, "endDate", filters.endDate);
  addPagination(params, filters);
  return createQueryString(params);
}

/** Loads immutable internal account transfers. */
export function loadTransfers(
  filters: TransferFilters = {},
): Promise<ApiSuccess<CashBankTransferPage>> {
  return requestApi<ApiSuccess<CashBankTransferPage>>(
    `/payments/transfers${buildTransferQuery(filters)}`,
  );
}

/** Loads one immutable internal transfer. */
export function loadTransfer(
  transferId: string,
): Promise<ApiSuccess<CashBankTransfer>> {
  return requestApi<ApiSuccess<CashBankTransfer>>(`/payments/transfers/${transferId}`);
}

/** Creates one idempotent transfer between two money accounts. */
export function createTransfer(
  input: CreateTransferInput,
): Promise<ApiSuccess<CashBankTransfer>> {
  return requestApi<ApiSuccess<CashBankTransfer>>("/payments/transfers", {
    method: "POST",
    headers: { "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify(input),
  });
}

export interface ReconciliationFilters {
  status?: "DRAFT" | "CONFIRMED";
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateCashReconciliationInput {
  cashAccountId: string;
  reconciliationDate: string;
  countedAmount: string;
  notes?: string | null;
}

export interface UpdateCashReconciliationInput {
  countedAmount?: string;
  notes?: string | null;
}

export interface CashReconciliation {
  id: string;
  cashAccountId: string;
  cashAccountName?: string;
  reconciliationDate: string;
  systemBalance: string;
  countedAmount: string;
  differenceAmount: string;
  status: "DRAFT" | "CONFIRMED";
  notes: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export interface CashReconciliationPage {
  items: CashReconciliation[];
  page: number;
  pageSize: number;
  total: number;
}

/** Builds the approved cash-reconciliation history query. */
function buildReconciliationQuery(filters: ReconciliationFilters): string {
  const params = new URLSearchParams();
  addTextFilter(params, "status", filters.status);
  addTextFilter(params, "startDate", filters.startDate);
  addTextFilter(params, "endDate", filters.endDate);
  addPagination(params, filters);
  return createQueryString(params);
}

/** Loads draft and confirmed cash reconciliations. */
export function loadCashReconciliations(
  filters: ReconciliationFilters = {},
): Promise<ApiSuccess<CashReconciliationPage>> {
  return requestApi<ApiSuccess<CashReconciliationPage>>(
    `/payments/cash-reconciliations${buildReconciliationQuery(filters)}`,
  );
}

/** Creates one editable draft cash reconciliation. */
export function createCashReconciliation(
  input: CreateCashReconciliationInput,
): Promise<ApiSuccess<CashReconciliation>> {
  return requestApi<ApiSuccess<CashReconciliation>>("/payments/cash-reconciliations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Updates counted cash or notes on one draft reconciliation. */
export function updateCashReconciliation(
  reconciliationId: string,
  input: UpdateCashReconciliationInput,
): Promise<ApiSuccess<CashReconciliation>> {
  return requestApi<ApiSuccess<CashReconciliation>>(
    `/payments/cash-reconciliations/${reconciliationId}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

/** Confirms one draft reconciliation with idempotency protection. */
export function confirmCashReconciliation(
  reconciliationId: string,
): Promise<ApiSuccess<CashReconciliation>> {
  return requestApi<ApiSuccess<CashReconciliation>>(
    `/payments/cash-reconciliations/${reconciliationId}/confirm`,
    { method: "POST", headers: { "idempotency-key": crypto.randomUUID() } },
  );
}
