import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { inventoryQueryKeys } from "../../inventory/hooks/use-inventory.ts";
import { ledgerQueryKeys } from "../../ledgers/hooks/use-ledgers.ts";
import { paymentQueryKeys } from "../../payments/hooks/use-payments.ts";
import { supplierQueryKeys } from "../../suppliers/hooks/use-suppliers.ts";
import {
  cancelPurchase,
  confirmPurchase,
  createPurchase,
  loadPurchase,
  loadPurchases,
  updatePurchaseDraft,
  type CancelPurchaseInput,
  type ConfirmPurchaseInput,
  type CreatePurchaseInput,
  type PurchaseListFilters,
  type UpdatePurchaseDraftInput,
} from "../api/purchases.api.ts";

/** Stable cache keys used by every Purchase Management screen. */
export const purchaseQueryKeys = {
  all: ["purchases"] as const,
  lists: () => ["purchases", "list"] as const,
  list: (filters: PurchaseListFilters) => ["purchases", "list", filters] as const,
  details: () => ["purchases", "detail"] as const,
  detail: (purchaseId: string) => ["purchases", "detail", purchaseId] as const,
};

/** Loads one filtered and paginated purchase list. */
export function usePurchases(filters: PurchaseListFilters = {}) {
  return useQuery({
    queryKey: purchaseQueryKeys.list(filters),
    queryFn: () => loadPurchases(filters),
  });
}

/** Loads one purchase detail when a purchase ID is available. */
export function usePurchase(purchaseId: string) {
  return useQuery({
    queryKey: purchaseQueryKeys.detail(purchaseId),
    queryFn: () => loadPurchase(purchaseId),
    enabled: purchaseId.length > 0,
  });
}

/** Refreshes the data affected when a purchase becomes confirmed. */
async function invalidateConfirmedPurchaseData(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: purchaseQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: supplierQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: ledgerQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: paymentQueryKeys.all }),
  ]);
}

interface CreatePurchaseVariables {
  input: CreatePurchaseInput;
  idempotencyKey?: string;
}

/** Creates a draft or confirmed purchase and refreshes affected feature data. */
export function useCreatePurchase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ input, idempotencyKey }: CreatePurchaseVariables) =>
      createPurchase(input, idempotencyKey),
    onSuccess: async (response) => {
      if (response.data.purchase.status === "CONFIRMED") {
        await invalidateConfirmedPurchaseData(queryClient);
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: purchaseQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: supplierQueryKeys.all }),
      ]);
    },
  });
}

interface UpdatePurchaseDraftVariables {
  purchaseId: string;
  input: UpdatePurchaseDraftInput;
}

/** Updates one draft and refreshes its list/detail and supplier information. */
export function useUpdatePurchaseDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ purchaseId, input }: UpdatePurchaseDraftVariables) =>
      updatePurchaseDraft(purchaseId, input),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: purchaseQueryKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: purchaseQueryKeys.detail(response.data.purchase.id),
        }),
        queryClient.invalidateQueries({ queryKey: supplierQueryKeys.all }),
      ]);
    },
  });
}

interface ConfirmPurchaseVariables {
  purchaseId: string;
  input: ConfirmPurchaseInput;
  idempotencyKey: string;
}

/** Confirms one saved draft and refreshes stock, ledgers, payments, and suppliers. */
export function useConfirmPurchase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ purchaseId, input, idempotencyKey }: ConfirmPurchaseVariables) =>
      confirmPurchase(purchaseId, input, idempotencyKey),
    onSuccess: async () => {
      await invalidateConfirmedPurchaseData(queryClient);
    },
  });
}

interface CancelPurchaseVariables {
  purchaseId: string;
  input: CancelPurchaseInput;
}

/** Cancels one draft and refreshes Purchase and Supplier views. */
export function useCancelPurchase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ purchaseId, input }: CancelPurchaseVariables) =>
      cancelPurchase(purchaseId, input),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: purchaseQueryKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: purchaseQueryKeys.detail(response.data.purchase.id),
        }),
        queryClient.invalidateQueries({ queryKey: supplierQueryKeys.all }),
      ]);
    },
  });
}
