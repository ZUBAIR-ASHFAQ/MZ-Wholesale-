import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createSupplier,
  loadSupplier,
  loadSupplierOpenPurchases,
  loadSuppliers,
  updateSupplier,
  type CreateSupplierInput,
  type SupplierListFilters,
  type SupplierOpenPurchasesFilters,
  type UpdateSupplierInput,
} from "../api/suppliers.api.ts";

/** Stable cache keys used by every Supplier Management screen. */
export const supplierQueryKeys = {
  all: ["suppliers"] as const,
  lists: () => ["suppliers", "list"] as const,
  list: (filters: SupplierListFilters) =>
    ["suppliers", "list", filters] as const,
  details: () => ["suppliers", "detail"] as const,
  detail: (supplierId: string) =>
    ["suppliers", "detail", supplierId] as const,
  openPurchasesRoot: (supplierId: string) =>
    ["suppliers", "open-purchases", supplierId] as const,
  openPurchases: (supplierId: string, filters: SupplierOpenPurchasesFilters) =>
    ["suppliers", "open-purchases", supplierId, filters] as const,
};

/** Loads one filtered and paginated supplier list. */
export function useSuppliers(filters: SupplierListFilters = {}) {
  return useQuery({
    queryKey: supplierQueryKeys.list(filters),
    queryFn: () => loadSuppliers(filters),
  });
}

/** Loads one supplier profile when a supplier ID is available. */
export function useSupplier(supplierId: string) {
  return useQuery({
    queryKey: supplierQueryKeys.detail(supplierId),
    queryFn: () => loadSupplier(supplierId),
    enabled: supplierId.length > 0,
  });
}

/** Loads confirmed outstanding purchases for the selected supplier. */
export function useSupplierOpenPurchases(
  supplierId: string,
  filters: SupplierOpenPurchasesFilters = {},
) {
  return useQuery({
    queryKey: supplierQueryKeys.openPurchases(supplierId, filters),
    queryFn: () => loadSupplierOpenPurchases(supplierId, filters),
    enabled: supplierId.length > 0,
  });
}

/** Creates one supplier and refreshes all cached supplier lists. */
export function useCreateSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSupplierInput) => createSupplier(input),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: supplierQueryKeys.detail(response.data.id),
        }),
        queryClient.invalidateQueries({
          queryKey: supplierQueryKeys.lists(),
        }),
      ]);
    },
  });
}

/** Contains one supplier ID and the approved update fields. */
interface UpdateSupplierVariables {
  supplierId: string;
  input: UpdateSupplierInput;
}

/** Updates one supplier and refreshes its detail and list caches. */
export function useUpdateSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ supplierId, input }: UpdateSupplierVariables) =>
      updateSupplier(supplierId, input),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: supplierQueryKeys.detail(response.data.id),
        }),
        queryClient.invalidateQueries({
          queryKey: supplierQueryKeys.lists(),
        }),
      ]);
    },
  });
}
