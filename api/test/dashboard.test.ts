import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  dashboardLowStockQuerySchema,
  dashboardOverviewQuerySchema,
} from "../src/modules/dashboard/dashboard.schema.js";

const dashboardRepositoryPath = new URL(
  "../src/modules/dashboard/dashboard.repository.ts",
  import.meta.url,
);
const dashboardServicePath = new URL(
  "../src/modules/dashboard/dashboard.service.ts",
  import.meta.url,
);
const dashboardRoutesPath = new URL(
  "../src/modules/dashboard/dashboard.routes.ts",
  import.meta.url,
);
const dashboardModulePath = new URL(
  "../src/modules/dashboard/index.ts",
  import.meta.url,
);
const appPath = new URL("../src/app.ts", import.meta.url);

/** Reads one Dashboard source file for focused business-rule and architecture checks. */
async function readSource(path: URL): Promise<string> {
  return readFile(path, "utf8");
}

test("dashboard overview schema accepts no date or one valid business date", () => {
  assert.equal(dashboardOverviewQuerySchema.safeParse({}).success, true);
  assert.equal(
    dashboardOverviewQuerySchema.safeParse({ date: "2026-08-08" }).success,
    true,
  );
});

test("dashboard overview schema rejects malformed and impossible dates", () => {
  assert.equal(
    dashboardOverviewQuerySchema.safeParse({ date: "08-08-2026" }).success,
    false,
  );
  assert.equal(
    dashboardOverviewQuerySchema.safeParse({ date: "2026-02-30" }).success,
    false,
  );
});

test("dashboard overview schema stays strict and rejects unapproved filters", () => {
  assert.equal(
    dashboardOverviewQuerySchema.safeParse({
      date: "2026-08-08",
      customerId: "00000000-0000-4000-8000-000000000001",
    }).success,
    false,
  );
});

test("dashboard low-stock schema defaults page to one and coerces query strings", () => {
  const defaultPage = dashboardLowStockQuerySchema.safeParse({});
  const stringPage = dashboardLowStockQuerySchema.safeParse({ page: "3" });

  assert.equal(defaultPage.success, true);
  assert.equal(stringPage.success, true);

  if (defaultPage.success) {
    assert.equal(defaultPage.data.page, 1);
  }

  if (stringPage.success) {
    assert.equal(stringPage.data.page, 3);
  }
});

test("dashboard low-stock schema rejects zero, negative, decimal, and unknown fields", () => {
  assert.equal(dashboardLowStockQuerySchema.safeParse({ page: 0 }).success, false);
  assert.equal(dashboardLowStockQuerySchema.safeParse({ page: -1 }).success, false);
  assert.equal(dashboardLowStockQuerySchema.safeParse({ page: 1.5 }).success, false);
  assert.equal(
    dashboardLowStockQuerySchema.safeParse({ page: 1, pageSize: 100 }).success,
    false,
  );
});

test("dashboard repository is explicitly restricted to read-only database methods", async () => {
  const source = await readSource(dashboardRepositoryPath);

  assert.match(source, /Pick<NodePgDatabase, "select" \| "execute">/);
  assert.doesNotMatch(source, /database\.insert\(/);
  assert.doesNotMatch(source, /database\.update\(/);
  assert.doesNotMatch(source, /database\.delete\(/);
});

test("dashboard sales and purchases read only confirmed records for the selected date", async () => {
  const source = await readSource(dashboardRepositoryPath);

  assert.match(source, /getDashboardSalesSummary/);
  assert.match(source, /eq\(salesInvoices\.status, "CONFIRMED"\)/);
  assert.match(source, /eq\(salesInvoices\.invoiceDate, businessDate\)/);
  assert.match(source, /getDashboardPurchaseSummary/);
  assert.match(source, /eq\(purchases\.status, "CONFIRMED"\)/);
  assert.match(source, /eq\(purchases\.purchaseDate, businessDate\)/);
});

test("dashboard recent records are also limited to confirmed sales and purchases", async () => {
  const source = await readSource(dashboardRepositoryPath);

  const salesSection = source.slice(
    source.indexOf("export async function getDashboardRecentSales"),
    source.indexOf("export interface DashboardPurchaseSummary"),
  );
  const purchasesSection = source.slice(
    source.indexOf("export async function getDashboardRecentPurchases"),
    source.indexOf("export interface DashboardInventorySummary"),
  );

  assert.match(salesSection, /eq\(salesInvoices\.status, "CONFIRMED"\)/);
  assert.match(salesSection, /\.limit\(limit\)/);
  assert.match(purchasesSection, /eq\(purchases\.status, "CONFIRMED"\)/);
  assert.match(purchasesSection, /\.limit\(limit\)/);
});

test("dashboard low-stock logic uses sellable stock at or below product reorder level", async () => {
  const source = await readSource(dashboardRepositoryPath);

  assert.match(source, /inventoryBalances\.sellableQuantityOnHand/);
  assert.match(source, /products\.reorderLevel/);
  assert.match(
    source,
    /lte\([\s\S]*inventoryBalances\.sellableQuantityOnHand[\s\S]*products\.reorderLevel/,
  );
  assert.doesNotMatch(
    source,
    /lte\([\s\S]{0,160}inventoryBalances\.(damagedQuantityOnHand|expiredQuantityOnHand)/,
  );
});

test("dashboard customer outstanding and supplier payable are calculated from ledger entries", async () => {
  const source = await readSource(dashboardRepositoryPath);

  assert.match(
    source,
    /sum\(\$\{customerLedgerEntries\.debit\} - \$\{customerLedgerEntries\.credit\}\)/,
  );
  assert.match(
    source,
    /sum\(\$\{supplierLedgerEntries\.credit\} - \$\{supplierLedgerEntries\.debit\}\)/,
  );
  assert.match(source, /\.having\(gt\(balanceExpression, 0\)\)/);
});

test("dashboard expense summary accounts for immutable reversal rows", async () => {
  const source = await readSource(dashboardRepositoryPath);

  const expenseSection = source.slice(
    source.indexOf("export async function getDashboardExpenseSummary"),
    source.indexOf("export async function getDashboardEstimatedGrossProfit"),
  );

  assert.match(expenseSection, /expenses\.reversalOfExpenseId/);
  assert.match(expenseSection, /expenses\.expenseDate, businessDate/);
  assert.match(expenseSection, /expenseAmount/);
  assert.match(expenseSection, /reversalAmount/);
  assert.match(expenseSection, /netExpenseAmount/);
});

test("dashboard estimated gross profit uses confirmed sale and return cost snapshots", async () => {
  const source = await readSource(dashboardRepositoryPath);

  const profitSection = source.slice(
    source.indexOf("export async function getDashboardEstimatedGrossProfit"),
  );

  assert.match(profitSection, /salesInvoiceItems\.unitCostSnapshot/);
  assert.match(profitSection, /salesReturnItems\.unitCostSnapshot/);
  assert.match(profitSection, /eq\(salesInvoices\.status, "CONFIRMED"\)/);
  assert.match(profitSection, /eq\(salesReturns\.status, "CONFIRMED"\)/);
  assert.match(profitSection, /netSalesCents = salesCents - returnCents/);
  assert.match(profitSection, /netCostCents = soldCostCents - returnedCostCents/);
});

test("dashboard money calculations avoid JavaScript floating-point arithmetic", async () => {
  const source = await readSource(dashboardRepositoryPath);

  assert.match(source, /function dashboardMoneyToCents/);
  assert.match(source, /BigInt\(/);
  assert.match(source, /function dashboardCentsToMoney/);
  assert.doesNotMatch(source, /parseFloat\(/);
});

test("dashboard service combines all approved overview sections and requests first low-stock page", async () => {
  const source = await readSource(dashboardServicePath);

  assert.match(source, /getDashboardSalesSummary/);
  assert.match(source, /getDashboardPurchaseSummary/);
  assert.match(source, /getDashboardInventorySummary/);
  assert.match(source, /getDashboardCustomerOutstandingSummary/);
  assert.match(source, /getDashboardSupplierPayableSummary/);
  assert.match(source, /getDashboardCashBankSummary/);
  assert.match(source, /getDashboardExpenseSummary/);
  assert.match(source, /getDashboardEstimatedGrossProfit/);
  assert.match(source, /getDashboardRecentSales/);
  assert.match(source, /getDashboardRecentPurchases/);
  assert.match(source, /readDashboardLowStock\(database, 1\)/);
  assert.match(source, /Promise\.all\(/);
});

test("dashboard service uses Asia Karachi when overview date is omitted", async () => {
  const source = await readSource(dashboardServicePath);

  assert.match(source, /timeZone: "Asia\/Karachi"/);
  assert.match(source, /const businessDate = query\.date \?\? currentKarachiDate\(\)/);
});

test("dashboard repository returns safe zero defaults when aggregate rows are empty", async () => {
  const source = await readSource(dashboardRepositoryPath);

  assert.match(source, /row\?\.invoiceCount \?\? 0/);
  assert.match(source, /row\?\.totalSalesAmount \?\? "0\.00"/);
  assert.match(source, /row\?\.purchaseCount \?\? 0/);
  assert.match(source, /row\?\.totalPurchaseAmount \?\? "0\.00"/);
  assert.match(source, /row\?\.lowStockCount \?\? 0/);
  assert.match(source, /row\?\.outOfStockCount \?\? 0/);
});

test("dashboard routes expose exactly the two approved authenticated GET endpoints", async () => {
  const source = await readSource(dashboardRoutesPath);

  const routeMatches = source.match(/app\.get\(/g) ?? [];
  assert.equal(routeMatches.length, 2);
  assert.match(source, /"\/dashboard\/overview"/);
  assert.match(source, /"\/dashboard\/low-stock"/);
  assert.match(source, /preHandler: app\.authenticate/);
  assert.doesNotMatch(source, /app\.(post|patch|put|delete)\(/);
});

test("dashboard routes keep validation and response wrapping outside business queries", async () => {
  const source = await readSource(dashboardRoutesPath);

  assert.match(source, /parseDashboardQuery/);
  assert.match(source, /"VALIDATION_ERROR"/);
  assert.match(source, /getDashboardOverview\(app\.db, query\)/);
  assert.match(source, /getDashboardLowStock\(app\.db, query\)/);
  assert.match(source, /createDataResponse\(result\)/);
  assert.doesNotMatch(source, /drizzle-orm/);
});

test("dashboard module and application registration stay simple", async () => {
  const [moduleSource, appSource] = await Promise.all([
    readSource(dashboardModulePath),
    readSource(appPath),
  ]);

  assert.match(moduleSource, /registerDashboardRoutes/);
  assert.match(moduleSource, /export const dashboardModule/);
  assert.match(appSource, /import \{ dashboardModule \}/);
  assert.match(appSource, /await app\.register\(dashboardModule\)/);
});
