import { and, asc, count, desc, eq, gt, gte, isNull, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  attendanceRecords,
  cashBankMovements,
  customerLedgerEntries,
  customers,
  employeeAdvanceRecoveries,
  employeeAdvances,
  employees,
  expenses,
  inventoryBalances,
  products,
  purchases,
  payrollItems,
  payrollRuns,
  salaryPaymentAllocations,
  salaryPayments,
  salesInvoiceItems,
  salesInvoices,
  salesReturnItems,
  salesReturns,
  supplierLedgerEntries,
  suppliers,
} from "../../database/schema/index.js";

/** Restricts the Dashboard repository to read-only database operations. */
export type DashboardDatabase = Pick<NodePgDatabase, "select" | "execute">;

/** Contains the confirmed-sales totals displayed in the Dashboard overview. */
export interface DashboardSalesSummary {
  invoiceCount: number;
  totalSalesAmount: string;
}

/** Represents one recent confirmed sale displayed in the Dashboard overview. */
export interface DashboardRecentSale {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerId: string;
  customerName: string;
  totalAmount: string;
}

/** Reads confirmed sales totals for one business date. */
export async function getDashboardSalesSummary(
  database: DashboardDatabase,
  businessDate: string,
): Promise<DashboardSalesSummary> {
  const rows = await database
    .select({
      invoiceCount: count(salesInvoices.id),
      totalSalesAmount: sql<string>`coalesce(sum(${salesInvoices.totalAmount}), 0)::text`,
    })
    .from(salesInvoices)
    .where(
      and(
        eq(salesInvoices.status, "CONFIRMED"),
        eq(salesInvoices.invoiceDate, businessDate),
      ),
    );

  const row = rows[0];

  return {
    invoiceCount: Number(row?.invoiceCount ?? 0),
    totalSalesAmount: row?.totalSalesAmount ?? "0.00",
  };
}

/** Reads the latest confirmed sales for one business date. */
export async function getDashboardRecentSales(
  database: DashboardDatabase,
  businessDate: string,
  limit = 5,
): Promise<DashboardRecentSale[]> {
  const rows = await database
    .select({
      id: salesInvoices.id,
      invoiceNumber: salesInvoices.invoiceNumber,
      invoiceDate: salesInvoices.invoiceDate,
      customerId: salesInvoices.customerId,
      customerName: customers.name,
      totalAmount: salesInvoices.totalAmount,
    })
    .from(salesInvoices)
    .innerJoin(customers, eq(customers.id, salesInvoices.customerId))
    .where(
      and(
        eq(salesInvoices.status, "CONFIRMED"),
        eq(salesInvoices.invoiceDate, businessDate),
      ),
    )
    .orderBy(desc(salesInvoices.confirmedAt), desc(salesInvoices.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    invoiceNumber: row.invoiceNumber ?? "",
    invoiceDate: row.invoiceDate,
    customerId: row.customerId,
    customerName: row.customerName,
    totalAmount: row.totalAmount,
  }));
}

/** Contains the confirmed-purchase totals displayed in the Dashboard overview. */
export interface DashboardPurchaseSummary {
  purchaseCount: number;
  totalPurchaseAmount: string;
}

/** Represents one recent confirmed purchase displayed in the Dashboard overview. */
export interface DashboardRecentPurchase {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  supplierId: string;
  supplierName: string;
  totalAmount: string;
}

/** Reads confirmed purchase totals for one business date. */
export async function getDashboardPurchaseSummary(
  database: DashboardDatabase,
  businessDate: string,
): Promise<DashboardPurchaseSummary> {
  const rows = await database
    .select({
      purchaseCount: count(purchases.id),
      totalPurchaseAmount: sql<string>`coalesce(sum(${purchases.totalAmount}), 0)::text`,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.status, "CONFIRMED"),
        eq(purchases.purchaseDate, businessDate),
      ),
    );

  const row = rows[0];

  return {
    purchaseCount: Number(row?.purchaseCount ?? 0),
    totalPurchaseAmount: row?.totalPurchaseAmount ?? "0.00",
  };
}

/** Reads the latest confirmed purchases for one business date. */
export async function getDashboardRecentPurchases(
  database: DashboardDatabase,
  businessDate: string,
  limit = 5,
): Promise<DashboardRecentPurchase[]> {
  const rows = await database
    .select({
      id: purchases.id,
      purchaseNumber: purchases.purchaseNumber,
      purchaseDate: purchases.purchaseDate,
      supplierId: purchases.supplierId,
      supplierName: suppliers.name,
      totalAmount: purchases.totalAmount,
    })
    .from(purchases)
    .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .where(
      and(
        eq(purchases.status, "CONFIRMED"),
        eq(purchases.purchaseDate, businessDate),
      ),
    )
    .orderBy(desc(purchases.confirmedAt), desc(purchases.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    purchaseNumber: row.purchaseNumber ?? "",
    purchaseDate: row.purchaseDate,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    totalAmount: row.totalAmount,
  }));
}

/** Contains the stock-alert totals displayed in the Dashboard overview. */
export interface DashboardInventorySummary {
  lowStockCount: number;
  outOfStockCount: number;
}

/** Represents one product shown in the Dashboard low-stock list. */
export interface DashboardLowStockProduct {
  productId: string;
  sku: string;
  productName: string;
  reorderLevel: string;
  sellableQuantity: string;
  isOutOfStock: boolean;
}

/** Contains one fixed-size page of Dashboard low-stock products. */
export interface DashboardLowStockPage {
  page: number;
  pageSize: number;
  total: number;
  items: DashboardLowStockProduct[];
}

const DASHBOARD_LOW_STOCK_PAGE_SIZE = 20;

/** Reads low-stock and out-of-stock counts from sellable inventory only. */
export async function getDashboardInventorySummary(
  database: DashboardDatabase,
): Promise<DashboardInventorySummary> {
  const rows = await database
    .select({
      lowStockCount: sql<number>`count(*) filter (where coalesce(${inventoryBalances.sellableQuantityOnHand}, 0.000) <= ${products.reorderLevel})::int`,
      outOfStockCount: sql<number>`count(*) filter (where coalesce(${inventoryBalances.sellableQuantityOnHand}, 0.000) <= 0)::int`,
    })
    .from(products)
    .leftJoin(inventoryBalances, eq(inventoryBalances.productId, products.id));

  const row = rows[0];

  return {
    lowStockCount: Number(row?.lowStockCount ?? 0),
    outOfStockCount: Number(row?.outOfStockCount ?? 0),
  };
}

/** Reads one page of products whose sellable stock is at or below reorder level. */
export async function getDashboardLowStock(
  database: DashboardDatabase,
  page: number,
): Promise<DashboardLowStockPage> {
  const lowStockCondition = lte(
    sql`coalesce(${inventoryBalances.sellableQuantityOnHand}, 0.000)`,
    products.reorderLevel,
  );
  const offset = (page - 1) * DASHBOARD_LOW_STOCK_PAGE_SIZE;

  const [items, countRows] = await Promise.all([
    database
      .select({
        productId: products.id,
        sku: products.sku,
        productName: products.name,
        reorderLevel: products.reorderLevel,
        sellableQuantity: sql<string>`coalesce(${inventoryBalances.sellableQuantityOnHand}, 0.000)`,
        isOutOfStock: sql<boolean>`coalesce(${inventoryBalances.sellableQuantityOnHand}, 0.000) <= 0`,
      })
      .from(products)
      .leftJoin(inventoryBalances, eq(inventoryBalances.productId, products.id))
      .where(lowStockCondition)
      .orderBy(
        asc(sql`coalesce(${inventoryBalances.sellableQuantityOnHand}, 0.000)`),
        asc(products.name),
        asc(products.sku),
      )
      .limit(DASHBOARD_LOW_STOCK_PAGE_SIZE)
      .offset(offset),
    database
      .select({ total: count() })
      .from(products)
      .leftJoin(inventoryBalances, eq(inventoryBalances.productId, products.id))
      .where(lowStockCondition),
  ]);

  return {
    page,
    pageSize: DASHBOARD_LOW_STOCK_PAGE_SIZE,
    total: Number(countRows[0]?.total ?? 0),
    items: items.map((item) => ({
      productId: item.productId,
      sku: item.sku,
      productName: item.productName,
      reorderLevel: item.reorderLevel,
      sellableQuantity: item.sellableQuantity,
      isOutOfStock: item.isOutOfStock,
    })),
  };
}

/** Contains current customer-due totals calculated from immutable ledger entries. */
export interface DashboardCustomerOutstandingSummary {
  customerCount: number;
  totalOutstandingAmount: string;
}

/** Contains current supplier-payable totals calculated from immutable ledger entries. */
export interface DashboardSupplierPayableSummary {
  supplierCount: number;
  totalPayableAmount: string;
}

/** Reads positive customer dues from customer ledger debits minus credits. */
export async function getDashboardCustomerOutstandingSummary(
  database: DashboardDatabase,
): Promise<DashboardCustomerOutstandingSummary> {
  const balanceExpression = sql<string>`sum(${customerLedgerEntries.debit} - ${customerLedgerEntries.credit})`;
  const groupedBalances = database
    .select({
      customerId: customerLedgerEntries.customerId,
      outstandingAmount: balanceExpression.as("outstanding_amount"),
    })
    .from(customerLedgerEntries)
    .innerJoin(customers, eq(customers.id, customerLedgerEntries.customerId))
    .where(eq(customers.isWalkIn, false))
    .groupBy(customerLedgerEntries.customerId)
    .having(gt(balanceExpression, 0))
    .as("dashboard_customer_outstanding");

  const rows = await database
    .select({
      customerCount: count(groupedBalances.customerId),
      totalOutstandingAmount: sql<string>`coalesce(sum(${groupedBalances.outstandingAmount}), 0)::text`,
    })
    .from(groupedBalances);

  const row = rows[0];

  return {
    customerCount: Number(row?.customerCount ?? 0),
    totalOutstandingAmount: row?.totalOutstandingAmount ?? "0.00",
  };
}

/** Reads positive supplier payables from supplier ledger credits minus debits. */
export async function getDashboardSupplierPayableSummary(
  database: DashboardDatabase,
): Promise<DashboardSupplierPayableSummary> {
  const balanceExpression = sql<string>`sum(${supplierLedgerEntries.credit} - ${supplierLedgerEntries.debit})`;
  const groupedBalances = database
    .select({
      supplierId: supplierLedgerEntries.supplierId,
      payableAmount: balanceExpression.as("payable_amount"),
    })
    .from(supplierLedgerEntries)
    .groupBy(supplierLedgerEntries.supplierId)
    .having(gt(balanceExpression, 0))
    .as("dashboard_supplier_payables");

  const rows = await database
    .select({
      supplierCount: count(groupedBalances.supplierId),
      totalPayableAmount: sql<string>`coalesce(sum(${groupedBalances.payableAmount}), 0)::text`,
    })
    .from(groupedBalances);

  const row = rows[0];

  return {
    supplierCount: Number(row?.supplierCount ?? 0),
    totalPayableAmount: row?.totalPayableAmount ?? "0.00",
  };
}

/** Contains current cash and bank balances calculated from immutable movements. */
export interface DashboardCashBankSummary {
  cashBalance: string;
  bankBalance: string;
  totalBalance: string;
}

/** Contains the selected business date's expense totals after linked reversals. */
export interface DashboardExpenseSummary {
  expenseCount: number;
  expenseAmount: string;
  reversalAmount: string;
  netExpenseAmount: string;
}

/** Contains the selected business date's estimated gross-profit figures. */
export interface DashboardGrossProfitSummary {
  netSalesAmount: string;
  netCostAmount: string;
  grossProfitAmount: string;
}

/** Converts a two-decimal database money string into exact integer cents. */
function dashboardMoneyToCents(value: string): bigint {
  const [wholePart, decimalPart = ""] = value.split(".");
  return BigInt(wholePart) * 100n + BigInt(decimalPart.padEnd(2, "0").slice(0, 2));
}

/** Converts exact signed integer cents into the API's two-decimal string format. */
function dashboardCentsToMoney(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${sign}${whole}.${fraction}`;
}

/** Reads current cash and bank balances from immutable inflow/outflow movements. */
export async function getDashboardCashBankSummary(
  database: DashboardDatabase,
): Promise<DashboardCashBankSummary> {
  const rows = await database
    .select({
      cashBalance: sql<string>`coalesce(sum(case when ${cashBankMovements.method} = 'CASH' then case when ${cashBankMovements.direction} = 'INFLOW' then ${cashBankMovements.amount} else -${cashBankMovements.amount} end else 0 end), 0)::text`,
      bankBalance: sql<string>`coalesce(sum(case when ${cashBankMovements.method} = 'BANK_TRANSFER' then case when ${cashBankMovements.direction} = 'INFLOW' then ${cashBankMovements.amount} else -${cashBankMovements.amount} end else 0 end), 0)::text`,
    })
    .from(cashBankMovements);

  const cashBalance = dashboardCentsToMoney(
    dashboardMoneyToCents(rows[0]?.cashBalance ?? "0.00"),
  );
  const bankBalance = dashboardCentsToMoney(
    dashboardMoneyToCents(rows[0]?.bankBalance ?? "0.00"),
  );
  const totalBalance = dashboardCentsToMoney(
    dashboardMoneyToCents(cashBalance) + dashboardMoneyToCents(bankBalance),
  );

  return { cashBalance, bankBalance, totalBalance };
}

/** Reads one business date's immutable expenses and subtracts linked reversal rows. */
export async function getDashboardExpenseSummary(
  database: DashboardDatabase,
  businessDate: string,
): Promise<DashboardExpenseSummary> {
  const rows = await database
    .select({
      expenseCount: sql<number>`count(*) filter (where ${expenses.reversalOfExpenseId} is null)::int`,
      expenseAmount: sql<string>`coalesce(sum(case when ${expenses.reversalOfExpenseId} is null then ${expenses.amount} else 0 end), 0)::text`,
      reversalAmount: sql<string>`coalesce(sum(case when ${expenses.reversalOfExpenseId} is not null then ${expenses.amount} else 0 end), 0)::text`,
    })
    .from(expenses)
    .where(eq(expenses.expenseDate, businessDate));

  const expenseAmount = dashboardCentsToMoney(
    dashboardMoneyToCents(rows[0]?.expenseAmount ?? "0.00"),
  );
  const reversalAmount = dashboardCentsToMoney(
    dashboardMoneyToCents(rows[0]?.reversalAmount ?? "0.00"),
  );

  return {
    expenseCount: Number(rows[0]?.expenseCount ?? 0),
    expenseAmount,
    reversalAmount,
    netExpenseAmount: dashboardCentsToMoney(
      dashboardMoneyToCents(expenseAmount) - dashboardMoneyToCents(reversalAmount),
    ),
  };
}

/** Reads the exact sale cost snapshots needed for the selected date's gross-profit estimate. */
export async function getDashboardEstimatedGrossProfit(
  database: DashboardDatabase,
  businessDate: string,
): Promise<DashboardGrossProfitSummary> {
  const [saleRows, returnRows, soldCostRows, returnedCostRows] =
    await Promise.all([
      database
        .select({
          amount: sql<string>`coalesce(sum(${salesInvoices.totalAmount}), 0)::text`,
        })
        .from(salesInvoices)
        .where(
          and(
            eq(salesInvoices.status, "CONFIRMED"),
            eq(salesInvoices.invoiceDate, businessDate),
          ),
        ),
      database
        .select({
          amount: sql<string>`coalesce(sum(${salesReturns.totalAmount}), 0)::text`,
        })
        .from(salesReturns)
        .where(
          and(
            eq(salesReturns.status, "CONFIRMED"),
            eq(salesReturns.returnDate, businessDate),
          ),
        ),
      database
        .select({
          amount: sql<string>`coalesce(sum(round(${salesInvoiceItems.baseQuantity} * ${salesInvoiceItems.unitCostSnapshot}, 2)) filter (where ${salesInvoiceItems.unitCostSnapshot} is not null), 0)::text`,
        })
        .from(salesInvoiceItems)
        .innerJoin(
          salesInvoices,
          eq(salesInvoices.id, salesInvoiceItems.salesInvoiceId),
        )
        .where(
          and(
            eq(salesInvoices.status, "CONFIRMED"),
            eq(salesInvoices.invoiceDate, businessDate),
          ),
        ),
      database
        .select({
          amount: sql<string>`coalesce(sum(round(${salesReturnItems.baseQuantity} * ${salesReturnItems.unitCostSnapshot}, 2)), 0)::text`,
        })
        .from(salesReturnItems)
        .innerJoin(
          salesReturns,
          eq(salesReturns.id, salesReturnItems.salesReturnId),
        )
        .where(
          and(
            eq(salesReturns.status, "CONFIRMED"),
            eq(salesReturns.returnDate, businessDate),
          ),
        ),
    ]);

  const salesCents = dashboardMoneyToCents(saleRows[0]?.amount ?? "0.00");
  const returnCents = dashboardMoneyToCents(returnRows[0]?.amount ?? "0.00");
  const soldCostCents = dashboardMoneyToCents(soldCostRows[0]?.amount ?? "0.00");
  const returnedCostCents = dashboardMoneyToCents(returnedCostRows[0]?.amount ?? "0.00");
  const netSalesCents = salesCents - returnCents;
  const netCostCents = soldCostCents - returnedCostCents;

  return {
    netSalesAmount: dashboardCentsToMoney(netSalesCents),
    netCostAmount: dashboardCentsToMoney(netCostCents),
    grossProfitAmount: dashboardCentsToMoney(netSalesCents - netCostCents),
  };
}

/** Contains Employee Management values displayed on the Dashboard overview. */
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

/** Reads current Employee Management Dashboard metrics from immutable source records. */
export async function getDashboardEmployeeSummary(
  database: DashboardDatabase,
  businessDate: string,
): Promise<DashboardEmployeeSummary> {
  const monthStart = `${businessDate.slice(0, 7)}-01`;
  const [
    activeRows,
    attendanceRows,
    payrollRows,
    salaryDueRows,
    salaryPaidRows,
    advanceRows,
    recoveryRows,
  ] = await Promise.all([
    database
      .select({ total: count(employees.id) })
      .from(employees)
      .where(eq(employees.isActive, true)),
    database
      .select({
        recordedCount: count(attendanceRecords.id),
        presentCount: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'PRESENT')::int`,
        absentCount: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'ABSENT')::int`,
        halfDayCount: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'HALF_DAY')::int`,
        leaveCount: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'LEAVE')::int`,
        holidayCount: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'HOLIDAY')::int`,
        weeklyOffCount: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'WEEKLY_OFF')::int`,
      })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.attendanceDate, businessDate)),
    database
      .select({
        payrollRunCount: count(payrollRuns.id),
        netAmount: sql<string>`coalesce(sum(${payrollRuns.netTotal}), 0)::text`,
      })
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.status, "CONFIRMED"),
          gte(payrollRuns.periodEnd, monthStart),
          lte(payrollRuns.periodEnd, businessDate),
        ),
      ),
    database
      .select({
        amount: sql<string>`coalesce(sum(${payrollItems.initialDueAmount}), 0)::text`,
      })
      .from(payrollItems)
      .innerJoin(payrollRuns, eq(payrollRuns.id, payrollItems.payrollRunId))
      .where(eq(payrollRuns.status, "CONFIRMED")),
    database
      .select({
        currentPaidAmount: sql<string>`coalesce(sum(${salaryPaymentAllocations.amount}), 0)::text`,
        monthPaidAmount: sql<string>`coalesce(sum(${salaryPaymentAllocations.amount}) filter (where ${salaryPayments.paymentDate} >= ${monthStart} and ${salaryPayments.paymentDate} <= ${businessDate}), 0)::text`,
      })
      .from(salaryPaymentAllocations)
      .innerJoin(
        salaryPayments,
        eq(salaryPayments.id, salaryPaymentAllocations.salaryPaymentId),
      )
      .where(
        and(
          eq(salaryPayments.status, "CONFIRMED"),
          isNull(salaryPayments.reversalOfPaymentId),
        ),
      ),
    database
      .select({
        amount: sql<string>`coalesce(sum(${employeeAdvances.originalAmount}), 0)::text`,
      })
      .from(employeeAdvances),
    database
      .select({
        amount: sql<string>`coalesce(sum(${employeeAdvanceRecoveries.amount}), 0)::text`,
      })
      .from(employeeAdvanceRecoveries),
  ]);

  const salaryPayableCents =
    dashboardMoneyToCents(salaryDueRows[0]?.amount ?? "0.00") -
    dashboardMoneyToCents(salaryPaidRows[0]?.currentPaidAmount ?? "0.00");
  const advanceOutstandingCents =
    dashboardMoneyToCents(advanceRows[0]?.amount ?? "0.00") -
    dashboardMoneyToCents(recoveryRows[0]?.amount ?? "0.00");

  return {
    activeEmployeeCount: Number(activeRows[0]?.total ?? 0),
    attendanceRecordedCount: Number(attendanceRows[0]?.recordedCount ?? 0),
    presentCount: Number(attendanceRows[0]?.presentCount ?? 0),
    absentCount: Number(attendanceRows[0]?.absentCount ?? 0),
    halfDayCount: Number(attendanceRows[0]?.halfDayCount ?? 0),
    leaveCount: Number(attendanceRows[0]?.leaveCount ?? 0),
    holidayCount: Number(attendanceRows[0]?.holidayCount ?? 0),
    weeklyOffCount: Number(attendanceRows[0]?.weeklyOffCount ?? 0),
    currentMonthPayrollRunCount: Number(payrollRows[0]?.payrollRunCount ?? 0),
    currentMonthPayrollAmount: dashboardCentsToMoney(
      dashboardMoneyToCents(payrollRows[0]?.netAmount ?? "0.00"),
    ),
    salaryPaidAmount: dashboardCentsToMoney(
      dashboardMoneyToCents(salaryPaidRows[0]?.monthPaidAmount ?? "0.00"),
    ),
    salaryPayableAmount: dashboardCentsToMoney(salaryPayableCents),
    advanceOutstandingAmount: dashboardCentsToMoney(advanceOutstandingCents),
  };
}
