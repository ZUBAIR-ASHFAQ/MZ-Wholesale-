import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardRepositoryPath = new URL(
  "../src/modules/dashboard/dashboard.repository.ts",
  import.meta.url,
);
const reportsRepositoryPath = new URL(
  "../src/modules/reports/reports.repository.ts",
  import.meta.url,
);
const reportsServicePath = new URL(
  "../src/modules/reports/reports.service.ts",
  import.meta.url,
);
const inventoryRepositoryPath = new URL(
  "../src/modules/inventory/inventory.repository.ts",
  import.meta.url,
);

/** Reads one production source file used by the cross-module Dashboard audit. */
async function readSource(path: URL): Promise<string> {
  return readFile(path, "utf8");
}

/** Returns one named source section so assertions stay focused on one calculation. */
function sourceSection(source: string, start: string, end?: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing source section: ${start}`);

  if (!end) return source.slice(startIndex);

  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing source section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("Dashboard and Reports use confirmed sales and purchases as their source truth", async () => {
  const [dashboard, reports] = await Promise.all([
    readSource(dashboardRepositoryPath),
    readSource(reportsRepositoryPath),
  ]);

  assert.match(dashboard, /eq\(salesInvoices\.status, "CONFIRMED"\)/);
  assert.match(dashboard, /eq\(purchases\.status, "CONFIRMED"\)/);
  assert.match(reports, /eq\(salesInvoices\.status, "CONFIRMED"\)/);
  assert.match(reports, /eq\(purchases\.status, "CONFIRMED"\)/);
});

test("Dashboard customer and supplier totals use the same ledger formulas as Reports", async () => {
  const [dashboard, reports] = await Promise.all([
    readSource(dashboardRepositoryPath),
    readSource(reportsRepositoryPath),
  ]);

  assert.match(
    dashboard,
    /sum\(\$\{customerLedgerEntries\.debit\} - \$\{customerLedgerEntries\.credit\}\)/,
  );
  assert.match(
    reports,
    /sum\(\$\{customerLedgerEntries\.debit\} - \$\{customerLedgerEntries\.credit\}\)/,
  );
  assert.match(dashboard, /eq\(customers\.isWalkIn, false\)/);
  assert.match(reports, /eq\(customers\.isWalkIn, false\)/);

  assert.match(
    dashboard,
    /sum\(\$\{supplierLedgerEntries\.credit\} - \$\{supplierLedgerEntries\.debit\}\)/,
  );
  assert.match(
    reports,
    /sum\(\$\{supplierLedgerEntries\.credit\} - \$\{supplierLedgerEntries\.debit\}\)/,
  );
});

test("Dashboard low-stock rule matches Inventory and uses sellable stock only", async () => {
  const [dashboard, inventory] = await Promise.all([
    readSource(dashboardRepositoryPath),
    readSource(inventoryRepositoryPath),
  ]);

  const dashboardLowStock = sourceSection(
    dashboard,
    "export async function getDashboardLowStock",
    "export interface DashboardCustomerOutstandingSummary",
  );
  const inventoryFilters = sourceSection(
    inventory,
    "function buildInventoryFilters",
    "function inventoryStockSelection",
  );

  assert.match(dashboardLowStock, /inventoryBalances\.sellableQuantityOnHand/);
  assert.match(dashboardLowStock, /products\.reorderLevel/);
  assert.doesNotMatch(
    dashboardLowStock,
    /inventoryBalances\.(damagedQuantityOnHand|expiredQuantityOnHand)/,
  );

  assert.match(inventoryFilters, /inventoryBalances\.sellableQuantityOnHand/);
  assert.match(inventoryFilters, /products\.reorderLevel/);
});

test("Dashboard expense totals follow the same immutable reversal rule as Reports", async () => {
  const [dashboard, reports] = await Promise.all([
    readSource(dashboardRepositoryPath),
    readSource(reportsServicePath),
  ]);

  const dashboardExpenses = sourceSection(
    dashboard,
    "export async function getDashboardExpenseSummary",
    "export async function getDashboardEstimatedGrossProfit",
  );
  const reportExpenses = sourceSection(
    reports,
    "export async function getExpenseReport",
    "export interface ProfitSummaryReportResult",
  );

  assert.match(dashboardExpenses, /expenses\.reversalOfExpenseId/);
  assert.match(dashboardExpenses, /expenseAmount/);
  assert.match(dashboardExpenses, /reversalAmount/);
  assert.match(dashboardExpenses, /netExpenseAmount/);

  assert.match(reportExpenses, /row\.reversalOfExpenseId/);
  assert.match(reportExpenses, /expenseCents - reversalCents/);
});

test("Dashboard gross profit follows the Reports sale-return cost snapshot model", async () => {
  const [dashboard, reports] = await Promise.all([
    readSource(dashboardRepositoryPath),
    readSource(reportsServicePath),
  ]);

  const dashboardProfit = sourceSection(
    dashboard,
    "export async function getDashboardEstimatedGrossProfit",
  );
  const reportProfit = sourceSection(
    reports,
    "export async function getProfitSummaryReport",
    "export interface ProductProfitReportRow",
  );

  assert.match(dashboardProfit, /salesInvoiceItems\.unitCostSnapshot/);
  assert.match(dashboardProfit, /salesReturnItems\.unitCostSnapshot/);
  assert.match(dashboardProfit, /netSalesCents = salesCents - returnCents/);
  assert.match(dashboardProfit, /netCostCents = soldCostCents - returnedCostCents/);

  assert.match(reportProfit, /row\.unitCostSnapshot/);
  assert.match(reportProfit, /netSalesCents = salesCents - salesReturnCents/);
  assert.match(reportProfit, /netCostCents = soldCostCents - returnedCostCents/);
  assert.match(reportProfit, /grossProfitCents = netSalesCents - netCostCents/);
});

test("Dashboard cash and bank totals are derived only from immutable account movements", async () => {
  const dashboard = await readSource(dashboardRepositoryPath);
  const cashBank = sourceSection(
    dashboard,
    "export async function getDashboardCashBankSummary",
    "export async function getDashboardExpenseSummary",
  );

  assert.match(cashBank, /cashBankMovements\.method/);
  assert.match(cashBank, /cashBankMovements\.direction/);
  assert.match(cashBank, /cashBankMovements\.amount/);
  assert.doesNotMatch(cashBank, /cashAccounts\.openingBalance/);
  assert.doesNotMatch(cashBank, /bankAccounts\.openingBalance/);
});
