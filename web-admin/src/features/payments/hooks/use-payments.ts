import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createBankAccount,
  createCashAccount,
  confirmCashReconciliation,
  createCashReconciliation,
  createCustomerReceipt,
  createSupplierPayment,
  createTransfer,
  loadCashBankMovements,
  loadDailyCashSummary,
  loadCashReconciliations,
  loadCustomerReceipt,
  loadCustomerReceipts,
  loadPaymentAccounts,
  loadSupplierPayment,
  loadSupplierPayments,
  loadTransfer,
  loadTransfers,
  reverseCustomerReceipt,
  reverseSupplierPayment,
  updateBankAccount,
  updateCashReconciliation,
  updateCashAccount,
  type CreateBankAccountInput,
  type CreateCashReconciliationInput,
  type CreateCashAccountInput,
  type CreateCustomerReceiptInput,
  type CreateSupplierPaymentInput,
  type CreateTransferInput,
  type CustomerReceiptFilters,
  type DailyCashSummaryFilters,
  type MovementFilters,
  type ReconciliationFilters,
  type ReversePaymentInput,
  type SupplierPaymentFilters,
  type TransferFilters,
  type UpdateBankAccountInput,
  type UpdateCashReconciliationInput,
  type UpdateCashAccountInput,
} from "../api/payments.api.ts";
import { customerQueryKeys } from "../../customers/hooks/use-customers.ts";
import { ledgerQueryKeys } from "../../ledgers/hooks/use-ledgers.ts";
import { supplierQueryKeys } from "../../suppliers/hooks/use-suppliers.ts";

/** Central query keys used by the Payments feature. */
export const paymentQueryKeys = {
  all: ["payments"] as const,
  accounts: ["payments", "accounts"] as const,
  dailyCashSummary: (filters: DailyCashSummaryFilters) =>
    ["payments", "daily-cash-summary", filters] as const,
  movements: (filters: MovementFilters) => ["payments", "movements", filters] as const,
  transfers: (filters: TransferFilters) => ["payments", "transfers", filters] as const,
  transfer: (transferId: string) => ["payments", "transfers", transferId] as const,
  reconciliations: (filters: ReconciliationFilters) => ["payments", "cash-reconciliations", filters] as const,
  customerReceipts: () => ["payments", "customer-receipts"] as const,
  customerReceiptList: (filters: CustomerReceiptFilters) =>
    ["payments", "customer-receipts", "list", filters] as const,
  customerReceipt: (receiptId: string) =>
    ["payments", "customer-receipts", "detail", receiptId] as const,
  supplierPayments: () => ["payments", "supplier-payments"] as const,
  supplierPaymentList: (filters: SupplierPaymentFilters) =>
    ["payments", "supplier-payments", "list", filters] as const,
  supplierPayment: (paymentId: string) =>
    ["payments", "supplier-payments", "detail", paymentId] as const,
};

/** Loads the read-only daily cash summary when both required filters are available. */
export function useDailyCashSummary(filters: DailyCashSummaryFilters) {
  return useQuery({
    queryKey: paymentQueryKeys.dailyCashSummary(filters),
    queryFn: () => loadDailyCashSummary(filters),
    enabled: filters.cashAccountId.length > 0 && filters.date.length > 0,
  });
}

/** Loads all cash and bank accounts. */
export function usePaymentAccounts() {
  return useQuery({
    queryKey: paymentQueryKeys.accounts,
    queryFn: loadPaymentAccounts,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

/** Creates one cash account and refreshes account data. */
export function useCreateCashAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCashAccountInput) => createCashAccount(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: paymentQueryKeys.all });
    },
  });
}

interface UpdateCashAccountVariables {
  accountId: string;
  input: UpdateCashAccountInput;
}

/** Updates one cash account and refreshes account data. */
export function useUpdateCashAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ accountId, input }: UpdateCashAccountVariables) =>
      updateCashAccount(accountId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: paymentQueryKeys.all });
    },
  });
}

/** Creates one bank account and refreshes account data. */
export function useCreateBankAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBankAccountInput) => createBankAccount(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: paymentQueryKeys.all });
    },
  });
}

interface UpdateBankAccountVariables {
  accountId: string;
  input: UpdateBankAccountInput;
}

/** Updates one bank account and refreshes account data. */
export function useUpdateBankAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ accountId, input }: UpdateBankAccountVariables) =>
      updateBankAccount(accountId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: paymentQueryKeys.all });
    },
  });
}

/** Loads immutable cash and bank movement history. */
export function useCashBankMovements(filters: MovementFilters = {}) {
  return useQuery({
    queryKey: paymentQueryKeys.movements(filters),
    queryFn: () => loadCashBankMovements(filters),
  });
}

/** Loads immutable internal transfer history. */
export function useTransfers(filters: TransferFilters = {}) {
  return useQuery({
    queryKey: paymentQueryKeys.transfers(filters),
    queryFn: () => loadTransfers(filters),
  });
}

/** Loads one immutable internal transfer. */
export function useTransfer(transferId: string) {
  return useQuery({
    queryKey: paymentQueryKeys.transfer(transferId),
    queryFn: () => loadTransfer(transferId),
    enabled: transferId.length > 0,
  });
}

/** Creates one transfer and refreshes all payment account data. */
export function useCreateTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTransferInput) => createTransfer(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: paymentQueryKeys.all });
    },
  });
}

/** Loads draft and confirmed cash reconciliation history. */
export function useCashReconciliations(filters: ReconciliationFilters = {}) {
  return useQuery({
    queryKey: paymentQueryKeys.reconciliations(filters),
    queryFn: () => loadCashReconciliations(filters),
  });
}

/** Creates one draft cash reconciliation and refreshes payment data. */
export function useCreateCashReconciliation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCashReconciliationInput) => createCashReconciliation(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: paymentQueryKeys.all });
    },
  });
}

interface UpdateCashReconciliationVariables {
  reconciliationId: string;
  input: UpdateCashReconciliationInput;
}

/** Updates one draft cash reconciliation and refreshes payment data. */
export function useUpdateCashReconciliation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reconciliationId, input }: UpdateCashReconciliationVariables) =>
      updateCashReconciliation(reconciliationId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: paymentQueryKeys.all });
    },
  });
}

/** Confirms one draft reconciliation and refreshes balances and movements. */
export function useConfirmCashReconciliation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reconciliationId: string) => confirmCashReconciliation(reconciliationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: paymentQueryKeys.all });
    },
  });
}

// Customer receipt operations

/** Loads the paginated customer receipt list with the approved filters. */
export function useCustomerReceipts(filters: CustomerReceiptFilters = {}) {
  return useQuery({
    queryKey: paymentQueryKeys.customerReceiptList(filters),
    queryFn: () => loadCustomerReceipts(filters),
  });
}

/** Loads one customer receipt when a receipt ID is available. */
export function useCustomerReceipt(receiptId: string) {
  return useQuery({
    queryKey: paymentQueryKeys.customerReceipt(receiptId),
    queryFn: () => loadCustomerReceipt(receiptId),
    enabled: receiptId.length > 0,
  });
}

interface CreateCustomerReceiptVariables {
  input: CreateCustomerReceiptInput;
  idempotencyKey: string;
}

/** Creates one customer receipt and refreshes affected balances and statements. */
export function useCreateCustomerReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ input, idempotencyKey }: CreateCustomerReceiptVariables) =>
      createCustomerReceipt(input, idempotencyKey),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: paymentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ledgerQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: customerQueryKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: customerQueryKeys.detail(response.data.customerId),
        }),
        queryClient.invalidateQueries({
          queryKey: customerQueryKeys.openInvoicesRoot(response.data.customerId),
        }),
      ]);
    },
  });
}

interface ReverseCustomerReceiptVariables {
  receiptId: string;
  input: ReversePaymentInput;
  idempotencyKey: string;
}

/** Reverses one customer receipt and refreshes all affected financial views. */
export function useReverseCustomerReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      receiptId,
      input,
      idempotencyKey,
    }: ReverseCustomerReceiptVariables) =>
      reverseCustomerReceipt(receiptId, input, idempotencyKey),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: paymentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ledgerQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: customerQueryKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: customerQueryKeys.detail(response.data.customerId),
        }),
        queryClient.invalidateQueries({
          queryKey: customerQueryKeys.openInvoicesRoot(response.data.customerId),
        }),
      ]);
    },
  });
}

// Supplier payment operations

/** Loads the paginated supplier payment list with the approved filters. */
export function useSupplierPayments(filters: SupplierPaymentFilters = {}) {
  return useQuery({
    queryKey: paymentQueryKeys.supplierPaymentList(filters),
    queryFn: () => loadSupplierPayments(filters),
  });
}

/** Loads one supplier payment when a payment ID is available. */
export function useSupplierPayment(paymentId: string) {
  return useQuery({
    queryKey: paymentQueryKeys.supplierPayment(paymentId),
    queryFn: () => loadSupplierPayment(paymentId),
    enabled: paymentId.length > 0,
  });
}

interface CreateSupplierPaymentVariables {
  input: CreateSupplierPaymentInput;
  idempotencyKey: string;
}

/** Creates one supplier payment and refreshes affected balances and statements. */
export function useCreateSupplierPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ input, idempotencyKey }: CreateSupplierPaymentVariables) =>
      createSupplierPayment(input, idempotencyKey),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: paymentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ledgerQueryKeys.all }),
        queryClient.invalidateQueries({
          queryKey: supplierQueryKeys.detail(response.data.supplierId),
        }),
        queryClient.invalidateQueries({ queryKey: supplierQueryKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: supplierQueryKeys.openPurchasesRoot(response.data.supplierId),
        }),
      ]);
    },
  });
}

interface ReverseSupplierPaymentVariables {
  paymentId: string;
  input: ReversePaymentInput;
  idempotencyKey: string;
}

/** Reverses one supplier payment and refreshes all affected financial views. */
export function useReverseSupplierPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      paymentId,
      input,
      idempotencyKey,
    }: ReverseSupplierPaymentVariables) =>
      reverseSupplierPayment(paymentId, input, idempotencyKey),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: paymentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ledgerQueryKeys.all }),
        queryClient.invalidateQueries({
          queryKey: supplierQueryKeys.detail(response.data.supplierId),
        }),
        queryClient.invalidateQueries({ queryKey: supplierQueryKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: supplierQueryKeys.openPurchasesRoot(response.data.supplierId),
        }),
      ]);
    },
  });
}

