import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  confirmStockCount,
  createInventoryAdjustment,
  createOpeningStock,
  createStockCount,
  loadInventoryStock,
  loadProductMovements,
  loadStockCount,
  loadStockCounts,
  updateStockCount,
  type CreateInventoryAdjustmentInput,
  type CreateOpeningStockInput,
  type CreateStockCountInput,
  type InventoryStockFilters,
  type ProductMovementFilters,
  type StockCountListFilters,
  type UpdateStockCountInput,
} from "../api/inventory.api.ts";

/** Central query keys used by the Inventory feature. */
export const inventoryQueryKeys = {
  all: ["inventory"] as const,
  stock: (filters: InventoryStockFilters) =>
    ["inventory", "stock", filters] as const,
  movements: (productId: string, filters: ProductMovementFilters) =>
    ["inventory", "product", productId, "movements", filters] as const,
  counts: (filters: StockCountListFilters) =>
    ["inventory", "counts", filters] as const,
  countDetail: (stockCountId: string) =>
    ["inventory", "counts", stockCountId] as const,
};

/** Loads current inventory stock. */
export function useInventoryStock(filters: InventoryStockFilters = {}) {
  return useQuery({
    queryKey: inventoryQueryKeys.stock(filters),
    queryFn: () => loadInventoryStock(filters),
  });
}

/** Loads one product's stock movement history. */
export function useProductMovements(
  productId: string,
  filters: ProductMovementFilters = {},
) {
  return useQuery({
    queryKey: inventoryQueryKeys.movements(productId, filters),
    queryFn: () => loadProductMovements(productId, filters),
    enabled: productId.length > 0,
  });
}

/** Creates opening stock and refreshes inventory queries. */
export function useCreateOpeningStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateOpeningStockInput) => createOpeningStock(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.all });
    },
  });
}

/** Creates one adjustment and refreshes inventory queries. */
export function useCreateInventoryAdjustment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateInventoryAdjustmentInput) =>
      createInventoryAdjustment(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.all });
    },
  });
}

/** Loads stock-count headers. */
export function useStockCounts(filters: StockCountListFilters = {}) {
  return useQuery({
    queryKey: inventoryQueryKeys.counts(filters),
    queryFn: () => loadStockCounts(filters),
  });
}

/** Loads one stock count with its items. */
export function useStockCount(stockCountId: string) {
  return useQuery({
    queryKey: inventoryQueryKeys.countDetail(stockCountId),
    queryFn: () => loadStockCount(stockCountId),
    enabled: stockCountId.length > 0,
  });
}

/** Creates a draft count and refreshes count lists. */
export function useCreateStockCount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateStockCountInput) => createStockCount(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["inventory", "counts"],
      });
    },
  });
}

interface UpdateStockCountVariables {
  stockCountId: string;
  input: UpdateStockCountInput;
}

/** Updates a draft count and refreshes its cached data. */
export function useUpdateStockCount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ stockCountId, input }: UpdateStockCountVariables) =>
      updateStockCount(stockCountId, input),
    onSuccess: async (_response, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: inventoryQueryKeys.countDetail(variables.stockCountId),
        }),
        queryClient.invalidateQueries({ queryKey: ["inventory", "counts"] }),
      ]);
    },
  });
}

/** Confirms a draft count and refreshes all affected inventory data. */
export function useConfirmStockCount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (stockCountId: string) => confirmStockCount(stockCountId),
    onSuccess: async (_response, stockCountId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.all }),
        queryClient.invalidateQueries({
          queryKey: inventoryQueryKeys.countDetail(stockCountId),
        }),
      ]);
    },
  });
}
