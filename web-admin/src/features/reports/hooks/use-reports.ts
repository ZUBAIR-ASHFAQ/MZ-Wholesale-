import { useQuery } from "@tanstack/react-query";

import {
  loadCashBankReport,
  loadCustomerAgingReport,
  loadCustomerOutstandingReport,
  loadExpenseReport,
  loadInventoryReport,
  loadInventoryValuationReport,
  loadProductProfitReport,
  loadProfitSummaryReport,
  loadPurchasesReport,
  loadSalesReport,
  loadSupplierAgingReport,
  loadSupplierPayableReport,
  type CashBankReportFilters,
  type CustomerAgingReportFilters,
  type CustomerOutstandingReportFilters,
  type ExpenseReportFilters,
  type InventoryReportFilters,
  type InventoryValuationReportFilters,
  type ProductProfitReportFilters,
  type ProfitSummaryReportFilters,
  type PurchasesReportFilters,
  type SalesReportFilters,
  type SupplierAgingReportFilters,
  type SupplierPayableReportFilters,
} from "../api/reports.api.ts";

/** Stable cache keys used by every Reports screen. */
export const reportQueryKeys = {
  all: ["reports"] as const,
  sales: (filters: SalesReportFilters) =>
    ["reports", "sales", filters] as const,
  purchases: (filters: PurchasesReportFilters) =>
    ["reports", "purchases", filters] as const,
  inventory: (filters: InventoryReportFilters) =>
    ["reports", "inventory", filters] as const,
  inventoryValuation: (filters: InventoryValuationReportFilters) =>
    ["reports", "inventory-valuation", filters] as const,
  customerAging: (filters: CustomerAgingReportFilters) =>
    ["reports", "customers", "aging", filters] as const,
  customerOutstanding: (filters: CustomerOutstandingReportFilters) =>
    ["reports", "customers", "outstanding", filters] as const,
  supplierAging: (filters: SupplierAgingReportFilters) =>
    ["reports", "suppliers", "aging", filters] as const,
  supplierPayable: (filters: SupplierPayableReportFilters) =>
    ["reports", "suppliers", "payable", filters] as const,
  cashBank: (filters: CashBankReportFilters) =>
    ["reports", "cash-bank", filters] as const,
  expenses: (filters: ExpenseReportFilters) =>
    ["reports", "expenses", filters] as const,
  profitSummary: (filters: ProfitSummaryReportFilters) =>
    ["reports", "profit-summary", filters] as const,
  productProfit: (filters: ProductProfitReportFilters) =>
    ["reports", "product-profit", filters] as const,
};

/** Loads the Sales Report for the selected filters. */
export function useSalesReport(filters: SalesReportFilters) {
  return useQuery({
    queryKey: reportQueryKeys.sales(filters),
    queryFn: () => loadSalesReport(filters),
  });
}

/** Loads the Purchase Report for the selected filters. */
export function usePurchasesReport(filters: PurchasesReportFilters) {
  return useQuery({
    queryKey: reportQueryKeys.purchases(filters),
    queryFn: () => loadPurchasesReport(filters),
  });
}

/** Loads current stock and movement history for the selected Inventory Report filters. */
export function useInventoryReport(filters: InventoryReportFilters) {
  return useQuery({
    queryKey: reportQueryKeys.inventory(filters),
    queryFn: () => loadInventoryReport(filters),
  });
}

/** Loads the paginated Inventory Valuation Report for the selected filters. */
export function useInventoryValuationReport(
  filters: InventoryValuationReportFilters = {},
) {
  return useQuery({
    queryKey: reportQueryKeys.inventoryValuation(filters),
    queryFn: () => loadInventoryValuationReport(filters),
  });
}

/** Loads the paginated Customer Aging Report for the selected as-of date. */
export function useCustomerAgingReport(filters: CustomerAgingReportFilters) {
  return useQuery({
    queryKey: reportQueryKeys.customerAging(filters),
    queryFn: () => loadCustomerAgingReport(filters),
  });
}

/** Loads the paginated Supplier Aging Report for the selected as-of date. */
export function useSupplierAgingReport(filters: SupplierAgingReportFilters) {
  return useQuery({
    queryKey: reportQueryKeys.supplierAging(filters),
    queryFn: () => loadSupplierAgingReport(filters),
  });
}

/** Loads the paginated Customer Outstanding Report. */
export function useCustomerOutstandingReport(
  filters: CustomerOutstandingReportFilters = {},
) {
  return useQuery({
    queryKey: reportQueryKeys.customerOutstanding(filters),
    queryFn: () => loadCustomerOutstandingReport(filters),
  });
}

/** Loads the paginated Supplier Payable Report. */
export function useSupplierPayableReport(
  filters: SupplierPayableReportFilters = {},
) {
  return useQuery({
    queryKey: reportQueryKeys.supplierPayable(filters),
    queryFn: () => loadSupplierPayableReport(filters),
  });
}

/** Loads the Cash/Bank Report for the selected date range and optional account. */
export function useCashBankReport(filters: CashBankReportFilters) {
  return useQuery({
    queryKey: reportQueryKeys.cashBank(filters),
    queryFn: () => loadCashBankReport(filters),
  });
}

/** Loads the Expense Report for the selected date range and optional category. */
export function useExpenseReport(filters: ExpenseReportFilters) {
  return useQuery({
    queryKey: reportQueryKeys.expenses(filters),
    queryFn: () => loadExpenseReport(filters),
  });
}

/** Loads the estimated Profit Summary Report for the selected date range. */
export function useProfitSummaryReport(filters: ProfitSummaryReportFilters) {
  return useQuery({
    queryKey: reportQueryKeys.profitSummary(filters),
    queryFn: () => loadProfitSummaryReport(filters),
  });
}

/** Loads the paginated Product Profit Report for the selected filters. */
export function useProductProfitReport(filters: ProductProfitReportFilters) {
  return useQuery({
    queryKey: reportQueryKeys.productProfit(filters),
    queryFn: () => loadProductProfitReport(filters),
  });
}
