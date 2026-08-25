import { useQuery } from "@tanstack/react-query";

import {
  loadCustomerOutstanding,
  loadCustomerStatement,
  loadSupplierPayables,
  loadSupplierStatement,
  type LedgerStatementFilters,
  type OutstandingListFilters,
} from "../api/ledgers.api.ts";

export const ledgerQueryKeys = {
  all: ["ledgers"] as const,
  customerStatements: () => ["ledgers", "customer-statements"] as const,
  customerStatement: (
    customerId: string,
    filters: LedgerStatementFilters,
  ) => ["ledgers", "customer-statements", customerId, filters] as const,
  supplierStatements: () => ["ledgers", "supplier-statements"] as const,
  supplierStatement: (
    supplierId: string,
    filters: LedgerStatementFilters,
  ) => ["ledgers", "supplier-statements", supplierId, filters] as const,
  customerOutstanding: (filters: OutstandingListFilters) =>
    ["ledgers", "customer-outstanding", filters] as const,
  supplierPayables: (filters: OutstandingListFilters) =>
    ["ledgers", "supplier-payables", filters] as const,
};

/** Provides the customer statement. */
export function useCustomerStatement(
  customerId: string,
  filters: LedgerStatementFilters = {},
) {
  return useQuery({
    queryKey: ledgerQueryKeys.customerStatement(customerId, filters),
    queryFn: () => loadCustomerStatement(customerId, filters),
    enabled: customerId.length > 0,
  });
}

/** Provides the supplier statement. */
export function useSupplierStatement(
  supplierId: string,
  filters: LedgerStatementFilters = {},
) {
  return useQuery({
    queryKey: ledgerQueryKeys.supplierStatement(supplierId, filters),
    queryFn: () => loadSupplierStatement(supplierId, filters),
    enabled: supplierId.length > 0,
  });
}

/** Provides the customer outstanding. */
export function useCustomerOutstanding(
  filters: OutstandingListFilters = {},
) {
  return useQuery({
    queryKey: ledgerQueryKeys.customerOutstanding(filters),
    queryFn: () => loadCustomerOutstanding(filters),
  });
}

/** Provides the supplier payables. */
export function useSupplierPayables(
  filters: OutstandingListFilters = {},
) {
  return useQuery({
    queryKey: ledgerQueryKeys.supplierPayables(filters),
    queryFn: () => loadSupplierPayables(filters),
  });
}
