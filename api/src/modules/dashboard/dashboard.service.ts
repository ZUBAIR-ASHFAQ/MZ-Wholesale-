import type {
  DashboardLowStockQuery,
  DashboardOverviewQuery,
} from "./dashboard.schema.js";
import {
  getDashboardCashBankSummary,
  getDashboardCustomerOutstandingSummary,
  getDashboardEstimatedGrossProfit,
  getDashboardExpenseSummary,
  getDashboardEmployeeSummary,
  getDashboardInventorySummary,
  getDashboardLowStock as readDashboardLowStock,
  getDashboardPurchaseSummary,
  getDashboardRecentPurchases,
  getDashboardRecentSales,
  getDashboardSalesSummary,
  getDashboardSupplierPayableSummary,
  type DashboardCashBankSummary,
  type DashboardCustomerOutstandingSummary,
  type DashboardDatabase,
  type DashboardEmployeeSummary,
  type DashboardExpenseSummary,
  type DashboardGrossProfitSummary,
  type DashboardInventorySummary,
  type DashboardLowStockPage,
  type DashboardPurchaseSummary,
  type DashboardRecentPurchase,
  type DashboardRecentSale,
  type DashboardSalesSummary,
  type DashboardSupplierPayableSummary,
} from "./dashboard.repository.js";

const DASHBOARD_RECENT_RECORD_LIMIT = 5;

/** Contains all read-only data needed by the Dashboard overview screen. */
export interface DashboardOverviewResult {
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

/** Returns today's date in the fixed Asia/Karachi business timezone. */
function currentKarachiDate(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Dashboard business date could not be created.");
  }

  return `${year}-${month}-${day}`;
}

/** Loads every read-only value required by the Dashboard overview. */
export async function getDashboardOverview(
  database: DashboardDatabase,
  query: DashboardOverviewQuery,
): Promise<DashboardOverviewResult> {
  const businessDate = query.date ?? currentKarachiDate();

  const [
    sales,
    purchases,
    inventory,
    customerOutstanding,
    supplierPayable,
    cashBank,
    expenses,
    estimatedGrossProfit,
    employees,
    recentSales,
    recentPurchases,
    lowStock,
  ] = await Promise.all([
    getDashboardSalesSummary(database, businessDate),
    getDashboardPurchaseSummary(database, businessDate),
    getDashboardInventorySummary(database),
    getDashboardCustomerOutstandingSummary(database),
    getDashboardSupplierPayableSummary(database),
    getDashboardCashBankSummary(database),
    getDashboardExpenseSummary(database, businessDate),
    getDashboardEstimatedGrossProfit(database, businessDate),
    getDashboardEmployeeSummary(database, businessDate),
    getDashboardRecentSales(database, businessDate, DASHBOARD_RECENT_RECORD_LIMIT),
    getDashboardRecentPurchases(
      database,
      businessDate,
      DASHBOARD_RECENT_RECORD_LIMIT,
    ),
    readDashboardLowStock(database, 1),
  ]);

  return {
    businessDate,
    sales,
    purchases,
    inventory,
    customerOutstanding,
    supplierPayable,
    cashBank,
    expenses,
    estimatedGrossProfit,
    employees,
    recentSales,
    recentPurchases,
    lowStock,
  };
}

/** Loads one read-only page of products whose sellable stock is low. */
export async function getDashboardLowStock(
  database: DashboardDatabase,
  query: DashboardLowStockQuery,
): Promise<DashboardLowStockPage> {
  return readDashboardLowStock(database, query.page);
}
