import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DashboardOverview } from "./api/dashboard.api.ts";

const mockUseDashboardOverview = vi.fn();

vi.mock("./hooks/use-dashboard.ts", () => ({
  useDashboardOverview: mockUseDashboardOverview,
}));

import { DashboardPage } from "./pages/dashboard-page.tsx";

/** Creates a complete Dashboard response that individual tests can override. */
function createOverview(
  overrides: Partial<DashboardOverview> = {},
): DashboardOverview {
  return {
    businessDate: "2026-08-08",
    sales: {
      invoiceCount: 0,
      totalSalesAmount: "0.00",
    },
    purchases: {
      purchaseCount: 0,
      totalPurchaseAmount: "0.00",
    },
    inventory: {
      lowStockCount: 0,
      outOfStockCount: 0,
    },
    customerOutstanding: {
      customerCount: 0,
      totalOutstandingAmount: "0.00",
    },
    supplierPayable: {
      supplierCount: 0,
      totalPayableAmount: "0.00",
    },
    cashBank: {
      cashBalance: "0.00",
      bankBalance: "0.00",
      totalBalance: "0.00",
    },
    expenses: {
      expenseCount: 0,
      expenseAmount: "0.00",
      reversalAmount: "0.00",
      netExpenseAmount: "0.00",
    },
    estimatedGrossProfit: {
      netSalesAmount: "0.00",
      netCostAmount: "0.00",
      grossProfitAmount: "0.00",
    },
    employees: {
      activeEmployeeCount: 0,
      attendanceRecordedCount: 0,
      presentCount: 0,
      absentCount: 0,
      halfDayCount: 0,
      leaveCount: 0,
      holidayCount: 0,
      weeklyOffCount: 0,
      currentMonthPayrollRunCount: 0,
      currentMonthPayrollAmount: "0.00",
      salaryPaidAmount: "0.00",
      salaryPayableAmount: "0.00",
      advanceOutstandingAmount: "0.00",
    },
    recentSales: [],
    recentPurchases: [],
    lowStock: {
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
    },
    ...overrides,
  };
}

/** Renders the Dashboard page with the current mocked query state. */
function renderDashboard(): string {
  return renderToStaticMarkup(<DashboardPage />);
}

describe("DashboardPage", () => {
  beforeEach(() => {
    mockUseDashboardOverview.mockReset();
  });

  it("shows a loading state while the overview is loading", () => {
    mockUseDashboardOverview.mockReturnValue({
      data: undefined,
      isError: false,
      isPending: true,
    });

    expect(renderDashboard()).toContain("Loading dashboard...");
  });

  it("shows a readable error state when the overview request fails", () => {
    mockUseDashboardOverview.mockReturnValue({
      data: undefined,
      isError: true,
      isPending: false,
    });

    expect(renderDashboard()).toContain("Could not load the dashboard.");
  });

  it("shows safe zero totals and empty states when there is no activity", () => {
    mockUseDashboardOverview.mockReturnValue({
      data: createOverview(),
      isError: false,
      isPending: false,
    });

    const html = renderDashboard();

    expect(html).toContain("Business date: 2026-08-08");
    expect(html).toContain("PKR 0.00");
    expect(html).toContain("No low-stock products.");
    expect(html).toContain("No confirmed sales for this date.");
    expect(html).toContain("No confirmed purchases for this date.");
  });

  it("renders summary values, recent records, and stock alerts returned by the API", () => {
    mockUseDashboardOverview.mockReturnValue({
      data: createOverview({
        sales: {
          invoiceCount: 2,
          totalSalesAmount: "2500.00",
        },
        purchases: {
          purchaseCount: 1,
          totalPurchaseAmount: "1000.00",
        },
        inventory: {
          lowStockCount: 2,
          outOfStockCount: 1,
        },
        customerOutstanding: {
          customerCount: 1,
          totalOutstandingAmount: "300.00",
        },
        supplierPayable: {
          supplierCount: 1,
          totalPayableAmount: "500.00",
        },
        cashBank: {
          cashBalance: "700.00",
          bankBalance: "900.00",
          totalBalance: "1600.00",
        },
        expenses: {
          expenseCount: 1,
          expenseAmount: "100.00",
          reversalAmount: "0.00",
          netExpenseAmount: "100.00",
        },
        estimatedGrossProfit: {
          netSalesAmount: "2500.00",
          netCostAmount: "1500.00",
          grossProfitAmount: "1000.00",
        },
        employees: {
          activeEmployeeCount: 4,
          attendanceRecordedCount: 4,
          presentCount: 3,
          absentCount: 1,
          halfDayCount: 0,
          leaveCount: 0,
          holidayCount: 0,
          weeklyOffCount: 0,
          currentMonthPayrollRunCount: 1,
          currentMonthPayrollAmount: "4000.00",
          salaryPaidAmount: "2500.00",
          salaryPayableAmount: "1500.00",
          advanceOutstandingAmount: "700.00",
        },
        recentSales: [
          {
            id: "sale-1",
            invoiceNumber: "SALE-0001",
            invoiceDate: "2026-08-08",
            customerId: "customer-1",
            customerName: "Alpha Traders",
            totalAmount: "2500.00",
          },
        ],
        recentPurchases: [
          {
            id: "purchase-1",
            purchaseNumber: "PUR-0001",
            purchaseDate: "2026-08-08",
            supplierId: "supplier-1",
            supplierName: "Prime Supplier",
            totalAmount: "1000.00",
          },
        ],
        lowStock: {
          page: 1,
          pageSize: 20,
          total: 2,
          items: [
            {
              productId: "product-1",
              sku: "SKU-LOW",
              productName: "Low Stock Product",
              reorderLevel: "5.000",
              sellableQuantity: "3.000",
              isOutOfStock: false,
            },
            {
              productId: "product-2",
              sku: "SKU-OUT",
              productName: "Out Of Stock Product",
              reorderLevel: "2.000",
              sellableQuantity: "0.000",
              isOutOfStock: true,
            },
          ],
        },
      }),
      isError: false,
      isPending: false,
    });

    const html = renderDashboard();

    expect(html).toContain("PKR 2500.00");
    expect(html).toContain("2 confirmed invoices");
    expect(html).toContain("PKR 1000.00");
    expect(html).toContain("Alpha Traders");
    expect(html).toContain("SALE-0001");
    expect(html).toContain("Prime Supplier");
    expect(html).toContain("PUR-0001");
    expect(html).toContain("Low Stock Product");
    expect(html).toContain("Low stock");
    expect(html).toContain("Out Of Stock Product");
    expect(html).toContain("Out of stock");
    expect(html).toContain("4");
    expect(html).toContain("3 present");
    expect(html).toContain("PKR 4,000.00");
    expect(html).toContain("PKR 1,500.00");
    expect(html).toContain("PKR 700.00");
  });

  it("requests the default Dashboard overview without inventing a business date", () => {
    mockUseDashboardOverview.mockReturnValue({
      data: createOverview(),
      isError: false,
      isPending: false,
    });

    renderDashboard();

    expect(mockUseDashboardOverview).toHaveBeenCalledWith({ date: undefined });
  });
});
