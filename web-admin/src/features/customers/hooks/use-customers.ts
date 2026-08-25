import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createCustomer,
  loadCustomer,
  loadCustomerOpenInvoices,
  loadCustomers,
  updateCustomer,
  type CreateCustomerInput,
  type CustomerListFilters,
  type CustomerOpenInvoicesFilters,
  type UpdateCustomerInput,
} from "../api/customers.api.ts";

/** Stable cache keys used by every Customer Management screen. */
export const customerQueryKeys = {
  all: ["customers"] as const,
  lists: () => ["customers", "list"] as const,
  list: (filters: CustomerListFilters) =>
    ["customers", "list", filters] as const,
  details: () => ["customers", "detail"] as const,
  detail: (customerId: string) =>
    ["customers", "detail", customerId] as const,
  openInvoicesRoot: (customerId: string) =>
    ["customers", "open-invoices", customerId] as const,
  openInvoices: (customerId: string, filters: CustomerOpenInvoicesFilters) =>
    ["customers", "open-invoices", customerId, filters] as const,
};

/** Loads one filtered and paginated customer list. */
export function useCustomers(filters: CustomerListFilters = {}) {
  return useQuery({
    queryKey: customerQueryKeys.list(filters),
    queryFn: () => loadCustomers(filters),
  });
}

/** Loads one customer profile when a customer ID is available. */
export function useCustomer(customerId: string) {
  return useQuery({
    queryKey: customerQueryKeys.detail(customerId),
    queryFn: () => loadCustomer(customerId),
    enabled: customerId.length > 0,
  });
}


/** Loads confirmed outstanding invoices for the selected customer. */
export function useCustomerOpenInvoices(
  customerId: string,
  filters: CustomerOpenInvoicesFilters = {},
) {
  return useQuery({
    queryKey: customerQueryKeys.openInvoices(customerId, filters),
    queryFn: () => loadCustomerOpenInvoices(customerId, filters),
    enabled: customerId.length > 0,
  });
}

/** Creates one customer and refreshes all cached customer lists. */
export function useCreateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCustomerInput) => createCustomer(input),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: customerQueryKeys.detail(response.data.id),
        }),
        queryClient.invalidateQueries({
          queryKey: customerQueryKeys.lists(),
        }),
      ]);
    },
  });
}

/** Contains one customer ID and the approved update fields. */
interface UpdateCustomerVariables {
  customerId: string;
  input: UpdateCustomerInput;
}

/** Updates one customer and refreshes its detail and list caches. */
export function useUpdateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ customerId, input }: UpdateCustomerVariables) =>
      updateCustomer(customerId, input),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: customerQueryKeys.detail(response.data.id),
        }),
        queryClient.invalidateQueries({
          queryKey: customerQueryKeys.lists(),
        }),
      ]);
    },
  });
}
