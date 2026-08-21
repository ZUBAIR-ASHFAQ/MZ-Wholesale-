import { requestApi } from "../../../lib/api-client.ts";
import type { ApiSuccess } from "../../../lib/api-types.ts";

/** Optional filter accepted by GET /dashboard/overview. */
export interface DashboardOverviewFilters {
  date?: string;
}

/** Confirmed sales totals displayed on the Dashboard. */
export interface DashboardSalesSummary {
  invoiceCount: number;
  totalSalesAmount: string;
}

/** Confirmed purchase totals displayed on the Dashboard. */
export interface DashboardPurchaseSummary {
  purchaseCount: number;
  totalPurchaseAmount: string;
}

/** Current inventory alert totals displayed on the Dashboard. */
export interface DashboardInventorySummary {
  lowStockCount: number;
  outOfStockCount: number;
}

/** Current customer outstanding totals calculated from ledger entries. */
export interface DashboardCustomerOutstandingSummary {
  customerCount: number;
  totalOutstandingAmount: string;
}

/** Current supplier payable totals calculated from ledger entries. */
export interface DashboardSupplierPayableSummary {
  supplierCount: number;
  totalPayableAmount: string;
}

/** Current cash and bank balances calculated from immutable movements. */
export interface DashboardCashBankSummary {
  cashBalance: string;
  bankBalance: string;
  totalBalance: string;
}

/** Expense totals for the selected business date. */
export interface DashboardExpenseSummary {
  expenseCount: number;
  expenseAmount: string;
  reversalAmount: string;
  netExpenseAmount: string;
}

/** Estimated gross-profit values based on immutable sale cost snapshots. */
export interface DashboardGrossProfitSummary {
  netSalesAmount: string;
  netCostAmount: string;
  grossProfitAmount: string;
}

/** Employee Management totals displayed on the Dashboard. */
export interface DashboardEmployeeSummary {
  activeEmployeeCount: number;
  attendanceRecordedCount: number;
  presentCount: number;
  absentCount: number;
  halfDayCount: number;
  leaveCount: number;
  holidayCount: number;
  weeklyOffCount: number;
  currentMonthPayrollRunCount: number;
  currentMonthPayrollAmount: string;
  salaryPaidAmount: string;
  salaryPayableAmount: string;
  advanceOutstandingAmount: string;
}

/** One recent confirmed sale shown on the Dashboard. */
export interface DashboardRecentSale {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerId: string;
  customerName: string;
  totalAmount: string;
}

/** One recent confirmed purchase shown on the Dashboard. */
export interface DashboardRecentPurchase {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  supplierId: string;
  supplierName: string;
  totalAmount: string;
}

/** One product whose sellable stock is at or below its reorder level. */
export interface DashboardLowStockProduct {
  productId: string;
  sku: string;
  productName: string;
  reorderLevel: string;
  sellableQuantity: string;
  isOutOfStock: boolean;
}

/** One paginated page of Dashboard low-stock products. */
export interface DashboardLowStockPage {
  page: number;
  pageSize: number;
  total: number;
  items: DashboardLowStockProduct[];
}

/** Complete read-only data returned by GET /dashboard/overview. */
export interface DashboardOverview {
  businessDate: string;
  sales: DashboardSalesSummary;
  purchases: DashboardPurchaseSummary;
  inventory: DashboardInventorySummary;
  customerOutstanding: DashboardCustomerOutstandingSummary;
  supplierPayable: DashboardSupplierPayableSummary;
  cashBank: DashboardCashBankSummary;
  expenses: DashboardExpenseSummary;
  estimatedGrossProfit: DashboardGrossProfitSummary;
  employees: DashboardEmployeeSummary;
  recentSales: DashboardRecentSale[];
  recentPurchases: DashboardRecentPurchase[];
  lowStock: DashboardLowStockPage;
}

/** Adds one query value only when it has been provided. */
function appendQueryValue(
  params: URLSearchParams,
  key: string,
  value: string | number | undefined,
): void {
  if (value !== undefined && value !== "") {
    params.set(key, String(value));
  }
}

/** Builds a request path with a query string only when filters exist. */
function withQuery(path: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** Loads the complete Dashboard overview for the optional business date. */
export async function loadDashboardOverview(
  filters: DashboardOverviewFilters = {},
): Promise<DashboardOverview> {
  const params = new URLSearchParams();
  appendQueryValue(params, "date", filters.date);

  const response = await requestApi<ApiSuccess<DashboardOverview>>(
    withQuery("/dashboard/overview", params),
  );

  return response.data;
}
