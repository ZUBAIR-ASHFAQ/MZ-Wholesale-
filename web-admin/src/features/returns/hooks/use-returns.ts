import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { customerQueryKeys } from "../../customers/hooks/use-customers.ts";
import { inventoryQueryKeys } from "../../inventory/hooks/use-inventory.ts";
import { ledgerQueryKeys } from "../../ledgers/hooks/use-ledgers.ts";
import { paymentQueryKeys } from "../../payments/hooks/use-payments.ts";
import { purchaseQueryKeys } from "../../purchases/hooks/use-purchases.ts";
import { saleQueryKeys } from "../../sales/hooks/use-sales.ts";
import { supplierQueryKeys } from "../../suppliers/hooks/use-suppliers.ts";
import {
  createPurchaseReturn,
  createSalesReturn,
  loadPurchaseReturn,
  loadPurchaseReturns,
  loadSalesReturn,
  loadSalesReturns,
  type CreatePurchaseReturnInput,
  type CreateSalesReturnInput,
  type PurchaseReturnListFilters,
  type SalesReturnListFilters,
} from "../api/returns.api.ts";

/** Stable cache keys used by every Returns screen. */
export const returnQueryKeys = {
  all: ["returns"] as const,
  salesLists: () => ["returns", "sales", "list"] as const,
  salesList: (filters: SalesReturnListFilters) =>
    ["returns", "sales", "list", filters] as const,
  salesDetails: () => ["returns", "sales", "detail"] as const,
  salesDetail: (salesReturnId: string) =>
    ["returns", "sales", "detail", salesReturnId] as const,
  purchaseLists: () => ["returns", "purchase", "list"] as const,
  purchaseList: (filters: PurchaseReturnListFilters) =>
    ["returns", "purchase", "list", filters] as const,
  purchaseDetails: () => ["returns", "purchase", "detail"] as const,
  purchaseDetail: (purchaseReturnId: string) =>
    ["returns", "purchase", "detail", purchaseReturnId] as const,
};

/** Loads one filtered and paginated Sales Return list. */
export function useSalesReturns(filters: SalesReturnListFilters = {}) {
  return useQuery({
    queryKey: returnQueryKeys.salesList(filters),
    queryFn: () => loadSalesReturns(filters),
  });
}

/** Loads one Sales Return detail when its ID is available. */
export function useSalesReturn(salesReturnId: string) {
  return useQuery({
    queryKey: returnQueryKeys.salesDetail(salesReturnId),
    queryFn: () => loadSalesReturn(salesReturnId),
    enabled: salesReturnId.length > 0,
  });
}

/** Loads one filtered and paginated Purchase Return list. */
export function usePurchaseReturns(filters: PurchaseReturnListFilters = {}) {
  return useQuery({
    queryKey: returnQueryKeys.purchaseList(filters),
    queryFn: () => loadPurchaseReturns(filters),
  });
}

/** Loads one Purchase Return detail when its ID is available. */
export function usePurchaseReturn(purchaseReturnId: string) {
  return useQuery({
    queryKey: returnQueryKeys.purchaseDetail(purchaseReturnId),
    queryFn: () => loadPurchaseReturn(purchaseReturnId),
    enabled: purchaseReturnId.length > 0,
  });
}

interface CreateSalesReturnVariables {
  input: CreateSalesReturnInput;
  idempotencyKey: string;
}

/** Creates one Sales Return and refreshes every feature changed by its confirmation. */
export function useCreateSalesReturn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ input, idempotencyKey }: CreateSalesReturnVariables) =>
      createSalesReturn(input, idempotencyKey),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: returnQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: saleQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: customerQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ledgerQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: paymentQueryKeys.all }),
      ]);
    },
  });
}

interface CreatePurchaseReturnVariables {
  input: CreatePurchaseReturnInput;
  idempotencyKey: string;
}

/** Creates one Purchase Return and refreshes every feature changed by its confirmation. */
export function useCreatePurchaseReturn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ input, idempotencyKey }: CreatePurchaseReturnVariables) =>
      createPurchaseReturn(input, idempotencyKey),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: returnQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: purchaseQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: supplierQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ledgerQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: paymentQueryKeys.all }),
      ]);
    },
  });
}
