import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { customerQueryKeys } from "../../customers/hooks/use-customers.ts";
import { inventoryQueryKeys } from "../../inventory/hooks/use-inventory.ts";
import { ledgerQueryKeys } from "../../ledgers/hooks/use-ledgers.ts";
import { paymentQueryKeys } from "../../payments/hooks/use-payments.ts";
import {
  cancelSale,
  confirmSale,
  createSale,
  loadSale,
  loadSales,
  updateSaleDraft,
  type CancelSaleInput,
  type ConfirmSaleInput,
  type CreateSaleInput,
  type SaleListFilters,
  type UpdateSaleDraftInput,
} from "../api/sales.api.ts";

/** Stable cache keys used by every Counter Sales screen. */
export const saleQueryKeys = {
  all: ["sales"] as const,
  lists: () => ["sales", "list"] as const,
  list: (filters: SaleListFilters) => ["sales", "list", filters] as const,
  details: () => ["sales", "detail"] as const,
  detail: (saleId: string) => ["sales", "detail", saleId] as const,
};

/** Loads one filtered and paginated sale list. */
export function useSales(filters: SaleListFilters = {}) {
  return useQuery({
    queryKey: saleQueryKeys.list(filters),
    queryFn: () => loadSales(filters),
  });
}

/** Loads one sale detail when a sale ID is available. */
export function useSale(saleId: string) {
  return useQuery({
    queryKey: saleQueryKeys.detail(saleId),
    queryFn: () => loadSale(saleId),
    enabled: saleId.length > 0,
  });
}

/** Refreshes all data changed by a confirmed sale. */
async function invalidateConfirmedSaleData(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: saleQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: customerQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: ledgerQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: paymentQueryKeys.all }),
  ]);
}

interface CreateSaleVariables {
  input: CreateSaleInput;
  idempotencyKey?: string;
}

/** Creates a sale and refreshes all features affected by immediate confirmation. */
export function useCreateSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ input, idempotencyKey }: CreateSaleVariables) =>
      createSale(input, idempotencyKey),
    onSuccess: async (response) => {
      if (response.data.sale.status === "CONFIRMED") {
        await invalidateConfirmedSaleData(queryClient);
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: saleQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: customerQueryKeys.all }),
      ]);
    },
  });
}

interface UpdateSaleDraftVariables {
  saleId: string;
  input: UpdateSaleDraftInput;
}

/** Updates one DRAFT/HELD sale and refreshes its list, detail, and customer data. */
export function useUpdateSaleDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ saleId, input }: UpdateSaleDraftVariables) =>
      updateSaleDraft(saleId, input),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: saleQueryKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: saleQueryKeys.detail(response.data.sale.id),
        }),
        queryClient.invalidateQueries({ queryKey: customerQueryKeys.all }),
      ]);
    },
  });
}

interface ConfirmSaleVariables {
  saleId: string;
  input: ConfirmSaleInput;
  idempotencyKey: string;
}

/** Confirms one saved sale and refreshes stock, ledgers, payments, and customers. */
export function useConfirmSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ saleId, input, idempotencyKey }: ConfirmSaleVariables) =>
      confirmSale(saleId, input, idempotencyKey),
    onSuccess: async () => {
      await invalidateConfirmedSaleData(queryClient);
    },
  });
}

interface CancelSaleVariables {
  saleId: string;
  input: CancelSaleInput;
}

/** Cancels one draft and refreshes the Sales and Customer views. */
export function useCancelSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ saleId, input }: CancelSaleVariables) =>
      cancelSale(saleId, input),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: saleQueryKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: saleQueryKeys.detail(response.data.id),
        }),
        queryClient.invalidateQueries({ queryKey: customerQueryKeys.all }),
      ]);
    },
  });
}
