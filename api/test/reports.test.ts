import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  cashBankReportQuerySchema,
  customerAgingReportQuerySchema,
  customerOutstandingReportQuerySchema,
  expenseReportQuerySchema,
  inventoryReportQuerySchema,
  inventoryValuationReportQuerySchema,
  productProfitReportQuerySchema,
  profitSummaryReportQuerySchema,
  purchasesReportQuerySchema,
  salesReportQuerySchema,
  supplierAgingReportQuerySchema,
  supplierPayableReportQuerySchema,
} from "../src/modules/reports/reports.schema.js";

const customerId = "00000000-0000-4000-8000-000000000301";
const supplierId = "00000000-0000-4000-8000-000000000302";
const productId = "00000000-0000-4000-8000-000000000303";
const accountId = "00000000-0000-4000-8000-000000000304";
const categoryId = "00000000-0000-4000-8000-000000000305";

const reportsSchemaPath = new URL(
  "../src/modules/reports/reports.schema.ts",
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
const reportsRoutesPath = new URL(
  "../src/modules/reports/reports.routes.ts",
  import.meta.url,
);
const reportsModulePath = new URL(
  "../src/modules/reports/index.ts",
  import.meta.url,
);
const appPath = new URL("../src/app.ts", import.meta.url);

/** Reads one Reports source file for focused architecture and read-only checks. */
async function readSource(path: URL): Promise<string> {
  return readFile(path, "utf8");
}

/** Builds the common valid report date range used by schema tests. */
function validDateRange() {
  return {
    startDate: "2026-08-01",
    endDate: "2026-08-08",
  };
}

test("sales report schema accepts only its approved filters", () => {
  assert.equal(
    salesReportQuerySchema.safeParse({
      ...validDateRange(),
      customerId,
      productId,
    }).success,
    true,
  );
  assert.equal(
    salesReportQuerySchema.safeParse({
      ...validDateRange(),
      supplierId,
    }).success,
    false,
  );
});

test("purchase report schema accepts supplier and product filters", () => {
  assert.equal(
    purchasesReportQuerySchema.safeParse({
      ...validDateRange(),
      supplierId,
      productId,
    }).success,
    true,
  );
});

test("inventory report schema converts lowStock query strings to booleans", () => {
  const lowStock = inventoryReportQuerySchema.safeParse({
    ...validDateRange(),
    productId,
    lowStock: "true",
  });
  const allStock = inventoryReportQuerySchema.safeParse({
    ...validDateRange(),
    lowStock: "false",
  });

  assert.equal(lowStock.success, true);
  assert.equal(allStock.success, true);
  if (lowStock.success) assert.equal(lowStock.data.lowStock, true);
  if (allStock.success) assert.equal(allStock.data.lowStock, false);
  assert.equal(
    inventoryReportQuerySchema.safeParse({
      ...validDateRange(),
      lowStock: "yes",
    }).success,
    false,
  );
});

test("inventory valuation report accepts only approved filters and pagination", () => {
  const result = inventoryValuationReportQuerySchema.safeParse({
    search: "Rice",
    categoryId,
    active: "false",
    page: "2",
    pageSize: "50",
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.active, false);
    assert.equal(result.data.page, 2);
    assert.equal(result.data.pageSize, 50);
  }

  assert.equal(
    inventoryValuationReportQuerySchema.safeParse({
      active: "yes",
    }).success,
    false,
  );
  assert.equal(
    inventoryValuationReportQuerySchema.safeParse({
      page: 1,
      pageSize: 101,
    }).success,
    false,
  );
  assert.equal(
    inventoryValuationReportQuerySchema.safeParse({
      unknownFilter: "not-allowed",
    }).success,
    false,
  );
});

test("customer aging report validates as-of date and defaults pagination", () => {
  const result = customerAgingReportQuerySchema.safeParse({
    asOfDate: "2026-08-10",
    search: "Ali",
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.page, 1);
    assert.equal(result.data.pageSize, 20);
  }
  assert.equal(
    customerAgingReportQuerySchema.safeParse({ asOfDate: "2026-02-30" })
      .success,
    false,
  );
  assert.equal(
    customerAgingReportQuerySchema.safeParse({
      asOfDate: "2026-08-10",
      customerId,
    }).success,
    false,
  );
});

test("supplier aging report validates as-of date and defaults pagination", () => {
  const result = supplierAgingReportQuerySchema.safeParse({
    asOfDate: "2026-08-10",
    search: "Supplier",
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.page, 1);
    assert.equal(result.data.pageSize, 20);
  }
  assert.equal(
    supplierAgingReportQuerySchema.safeParse({ asOfDate: "2026-02-30" })
      .success,
    false,
  );
  assert.equal(
    supplierAgingReportQuerySchema.safeParse({
      asOfDate: "2026-08-10",
      supplierId,
    }).success,
    false,
  );
});

test("customer outstanding report applies pagination defaults and page-size cap", () => {
  const defaults = customerOutstandingReportQuerySchema.safeParse({});

  assert.equal(defaults.success, true);
  if (defaults.success) {
    assert.equal(defaults.data.page, 1);
    assert.equal(defaults.data.pageSize, 20);
  }
  assert.equal(
    customerOutstandingReportQuerySchema.safeParse({ page: 1, pageSize: 101 }).success,
    false,
  );
});

test("supplier payable report accepts search and pagination", () => {
  const result = supplierPayableReportQuerySchema.safeParse({
    search: "Supplier A",
    page: "2",
    pageSize: "50",
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.page, 2);
    assert.equal(result.data.pageSize, 50);
  }
});

test("cash bank report accepts only account and date filters", () => {
  assert.equal(
    cashBankReportQuerySchema.safeParse({
      ...validDateRange(),
      accountId,
    }).success,
    true,
  );
  assert.equal(
    cashBankReportQuerySchema.safeParse({
      ...validDateRange(),
      categoryId,
    }).success,
    false,
  );
});

test("expense report accepts category and date filters", () => {
  assert.equal(
    expenseReportQuerySchema.safeParse({
      ...validDateRange(),
      categoryId,
    }).success,
    true,
  );
});

test("profit summary accepts only a valid date range", () => {
  assert.equal(
    profitSummaryReportQuerySchema.safeParse(validDateRange()).success,
    true,
  );
  assert.equal(
    profitSummaryReportQuerySchema.safeParse({
      ...validDateRange(),
      productId,
    }).success,
    false,
  );
});

test("product profit accepts product filter and capped pagination", () => {
  assert.equal(
    productProfitReportQuerySchema.safeParse({
      ...validDateRange(),
      productId,
      page: 1,
      pageSize: 100,
    }).success,
    true,
  );
  assert.equal(
    productProfitReportQuerySchema.safeParse({
      ...validDateRange(),
      page: 1,
      pageSize: 101,
    }).success,
    false,
  );
});

test("all date-based report schemas reject reversed and impossible dates", () => {
  const dateSchemas = [
    salesReportQuerySchema,
    purchasesReportQuerySchema,
    inventoryReportQuerySchema,
    cashBankReportQuerySchema,
    expenseReportQuerySchema,
    profitSummaryReportQuerySchema,
    productProfitReportQuerySchema,
  ];

  for (const schema of dateSchemas) {
    assert.equal(
      schema.safeParse({ startDate: "2026-08-10", endDate: "2026-08-08" }).success,
      false,
    );
    assert.equal(
      schema.safeParse({ startDate: "2026-02-30", endDate: "2026-03-01" }).success,
      false,
    );
  }
});

test("report schemas reject malformed UUID filters", () => {
  assert.equal(
    salesReportQuerySchema.safeParse({
      ...validDateRange(),
      customerId: "not-a-uuid",
    }).success,
    false,
  );
  assert.equal(
    purchasesReportQuerySchema.safeParse({
      ...validDateRange(),
      supplierId: "not-a-uuid",
    }).success,
    false,
  );
  assert.equal(
    productProfitReportQuerySchema.safeParse({
      ...validDateRange(),
      productId: "not-a-uuid",
    }).success,
    false,
  );
});

test("report schemas stay strict and reject unapproved query fields", () => {
  assert.equal(
    salesReportQuerySchema.safeParse({
      ...validDateRange(),
      status: "CONFIRMED",
    }).success,
    false,
  );
  assert.equal(
    customerOutstandingReportQuerySchema.safeParse({
      page: 1,
      pageSize: 20,
      customerId,
    }).success,
    false,
  );
});

test("reports repository remains read-only", async () => {
  const source = await readSource(reportsRepositoryPath);

  assert.doesNotMatch(source, /\.insert\s*\(/);
  assert.doesNotMatch(source, /\.update\s*\(/);
  assert.doesNotMatch(source, /\.delete\s*\(/);
  assert.doesNotMatch(source, /\bINSERT\s+INTO\b/i);
  assert.doesNotMatch(source, /\bUPDATE\s+[a-z_]+\s+SET\b/i);
  assert.doesNotMatch(source, /\bDELETE\s+FROM\b/i);
});

test("sales purchase and return sources are limited to confirmed documents", async () => {
  const source = await readSource(reportsRepositoryPath);

  assert.match(source, /eq\(salesInvoices\.status, "CONFIRMED"\)/);
  assert.match(source, /eq\(salesReturns\.status, "CONFIRMED"\)/);
  assert.match(source, /eq\(purchases\.status, "CONFIRMED"\)/);
  assert.match(source, /eq\(purchaseReturns\.status, "CONFIRMED"\)/);
});

test("report service uses immutable cost snapshots for estimated profit", async () => {
  const source = await readSource(reportsServicePath);

  assert.match(source, /unitCostSnapshot/);
  assert.match(source, /calculateCostCents/);
  assert.doesNotMatch(source, /weightedAverageCost.*getProfitSummaryReport/s);
});

test("report service exposes the baseline reports plus production report additions", async () => {
  const source = await readSource(reportsServicePath);
  const methodNames = [
    "getSalesReport",
    "getPurchasesReport",
    "getInventoryReport",
    "getInventoryValuationReport",
    "getCustomerAgingReport",
    "getCustomerOutstandingReport",
    "getSupplierPayableReport",
    "getCashBankReport",
    "getExpenseReport",
    "getProfitSummaryReport",
    "getProductProfitReport",
  ];

  for (const methodName of methodNames) {
    assert.match(source, new RegExp(`${methodName}\\s*\\(`));
  }
});

test("report service validates known entity filters", async () => {
  const source = await readSource(reportsServicePath);

  assert.match(source, /reportCustomerExists/);
  assert.match(source, /reportSupplierExists/);
  assert.match(source, /reportProductExists/);
  assert.match(source, /reportProductCategoryExists/);
  assert.match(source, /reportAccountExists/);
  assert.match(source, /reportExpenseCategoryExists/);
  assert.match(source, /INVALID_REPORT_FILTER/);
});

test("inventory valuation service maps approved filters and stays read-only", async () => {
  const source = await readSource(reportsServicePath);

  assert.match(source, /getInventoryValuationReport/);
  assert.match(source, /listInventoryValuation/);
  assert.match(source, /isActive:\s*query\.active/);
  assert.match(source, /validateInventoryValuationFilters/);
  assert.match(source, /reportProductCategoryExists/);
  assert.doesNotMatch(source, /getInventoryValuationReport[\s\S]*?\.insert\s*\(/);
});

test("reports routes register exactly twelve authenticated GET endpoints", async () => {
  const source = await readSource(reportsRoutesPath);
  const routeRegistrations = source.match(/app\.get\s*\(/g) ?? [];
  const approvedPaths = [
    "/reports/sales",
    "/reports/purchases",
    "/reports/inventory",
    "/reports/inventory-valuation",
    "/reports/customers/aging",
    "/reports/suppliers/aging",
    "/reports/customers/outstanding",
    "/reports/suppliers/payable",
    "/reports/cash-bank",
    "/reports/expenses",
    "/reports/profit-summary",
    "/reports/product-profit",
  ];

  assert.equal(routeRegistrations.length, 12);
  assert.match(source, /preHandler: app\.authenticate/);
  for (const path of approvedPaths) assert.match(source, new RegExp(`"${path}"`));
  assert.doesNotMatch(source, /app\.(post|put|patch|delete)\s*\(/);
});

test("routes map validation failures to the stable report error codes", async () => {
  const source = await readSource(reportsRoutesPath);

  assert.match(source, /INVALID_DATE_RANGE/);
  assert.match(source, /INVALID_REPORT_FILTER/);
  assert.match(source, /The report date range is invalid\./);
  assert.match(source, /The report contains an invalid filter\./);
});

test("reports module has the approved five production files and is registered once", async () => {
  const moduleSource = await readSource(reportsModulePath);
  const appSource = await readSource(appPath);
  const schemaSource = await readSource(reportsSchemaPath);

  assert.match(moduleSource, /registerReportRoutes/);
  assert.match(moduleSource, /reportsModule/);
  assert.equal((appSource.match(/reportsModule/g) ?? []).length, 2);
  assert.match(appSource, /await app\.register\(reportsModule\)/);
  assert.match(schemaSource, /pageSizeSchema.*max\(100\)/s);
});


test("reports routes expose the authenticated inventory valuation endpoint", async () => {
  const source = await readSource(reportsRoutesPath);

  assert.match(
    source,
    /app\.get\(\s*["'`]\/reports\/inventory-valuation["'`]/,
  );
  assert.match(
    source,
    /parseReportQuery\(inventoryValuationReportQuerySchema, request\.query\)/,
  );
  assert.match(
    source,
    /reportsService\.getInventoryValuationReport\(query\)/,
  );
  assert.match(
    source,
    /privateReportRoute\(app, ["'`]Inventory valuation report["'`]\)/,
  );
});


test("customer aging schema accepts only approved filters", async () => {
  const source = await readSource(reportsSchemaPath);
  const start = source.indexOf("export const customerAgingReportQuerySchema");
  const end = source.indexOf(
    "export const customerOutstandingReportQuerySchema",
    start,
  );
  const agingSchemaSource = source.slice(start, end);

  assert.ok(start >= 0);
  assert.match(agingSchemaSource, /asOfDate:\s*dateSchema/);
  assert.match(agingSchemaSource, /search:\s*searchSchema\.optional\(\)/);
  assert.match(agingSchemaSource, /page:\s*pageSchema/);
  assert.match(agingSchemaSource, /pageSize:\s*pageSizeSchema/);
  assert.match(agingSchemaSource, /\.strict\(\)/);
});

test("customer aging service returns repository rows totals and page metadata", async () => {
  const source = await readSource(reportsServicePath);
  const start = source.indexOf("export async function getCustomerAgingReport");
  const end = source.indexOf("export interface CustomerOutstandingReportResult", start);
  const agingServiceSource = source.slice(start, end);

  assert.ok(start >= 0);
  assert.match(agingServiceSource, /listCustomerAging\(database, query\)/);
  assert.match(agingServiceSource, /items:\s*sourcePage\.items/);
  assert.match(agingServiceSource, /totals:\s*sourcePage\.totals/);
  assert.match(agingServiceSource, /page:\s*query\.page/);
  assert.match(agingServiceSource, /pageSize:\s*query\.pageSize/);
  assert.match(agingServiceSource, /total:\s*sourcePage\.total/);
  assert.doesNotMatch(agingServiceSource, /\.(insert|update|delete)\s*\(/);
});

test("reports routes expose the authenticated customer aging endpoint", async () => {
  const source = await readSource(reportsRoutesPath);

  assert.match(source, /app\.get\(\s*["'`]\/reports\/customers\/aging["'`]/);
  assert.match(
    source,
    /parseReportQuery\(customerAgingReportQuerySchema, request\.query\)/,
  );
  assert.match(source, /reportsService\.getCustomerAgingReport\(query\)/);
  assert.match(
    source,
    /privateReportRoute\(app, ["'`]Customer aging report["'`]\)/,
  );
});

test("supplier aging schema accepts only approved filters", async () => {
  const source = await readSource(reportsSchemaPath);
  const start = source.indexOf("export const supplierAgingReportQuerySchema");
  const end = source.indexOf(
    "export const customerOutstandingReportQuerySchema",
    start,
  );
  const agingSchemaSource = source.slice(start, end);

  assert.ok(start >= 0);
  assert.match(agingSchemaSource, /asOfDate:\s*dateSchema/);
  assert.match(agingSchemaSource, /search:\s*searchSchema\.optional\(\)/);
  assert.match(agingSchemaSource, /page:\s*pageSchema/);
  assert.match(agingSchemaSource, /pageSize:\s*pageSizeSchema/);
  assert.match(agingSchemaSource, /\.strict\(\)/);
});

test("supplier aging service returns repository rows totals and page metadata", async () => {
  const source = await readSource(reportsServicePath);
  const start = source.indexOf("export async function getSupplierAgingReport");
  const end = source.indexOf("export interface CustomerOutstandingReportResult", start);
  const agingServiceSource = source.slice(start, end);

  assert.ok(start >= 0);
  assert.match(agingServiceSource, /listSupplierAging\(database, query\)/);
  assert.match(agingServiceSource, /items:\s*sourcePage\.items/);
  assert.match(agingServiceSource, /totals:\s*sourcePage\.totals/);
  assert.match(agingServiceSource, /page:\s*query\.page/);
  assert.match(agingServiceSource, /pageSize:\s*query\.pageSize/);
  assert.match(agingServiceSource, /total:\s*sourcePage\.total/);
  assert.doesNotMatch(agingServiceSource, /\.(insert|update|delete)\s*\(/);
});

test("reports routes expose the authenticated supplier aging endpoint", async () => {
  const source = await readSource(reportsRoutesPath);

  assert.match(source, /app\.get\(\s*["'`]\/reports\/suppliers\/aging["'`]/);
  assert.match(
    source,
    /parseReportQuery\(supplierAgingReportQuerySchema, request\.query\)/,
  );
  assert.match(source, /reportsService\.getSupplierAgingReport\(query\)/);
  assert.match(
    source,
    /privateReportRoute\(app, ["'`]Supplier aging report["'`]\)/,
  );
});

test("inventory valuation repository values each stock condition at its own weighted-average cost", async () => {
  const source = await readSource(reportsRepositoryPath);

  assert.match(
    source,
    /sellableValue:[\s\S]*?sellableQuantityOnHand[\s\S]*?weightedAverageCost/,
  );
  assert.match(
    source,
    /damagedValue:[\s\S]*?damagedQuantityOnHand[\s\S]*?damagedWeightedAverageCost/,
  );
  assert.match(
    source,
    /expiredValue:[\s\S]*?expiredQuantityOnHand[\s\S]*?expiredWeightedAverageCost/,
  );
  assert.match(
    source,
    /totalValue:[\s\S]*?sellableQuantityOnHand[\s\S]*?weightedAverageCost[\s\S]*?damagedQuantityOnHand[\s\S]*?damagedWeightedAverageCost[\s\S]*?expiredQuantityOnHand[\s\S]*?expiredWeightedAverageCost/,
  );
});

test("inventory valuation repository keeps products with no balance row as zero stock", async () => {
  const source = await readSource(reportsRepositoryPath);

  assert.match(
    source,
    /leftJoin\(inventoryBalances,\s*eq\(inventoryBalances\.productId, products\.id\)\)/,
  );
  assert.match(source, /coalesce\([^)]*sellableQuantityOnHand[^)]*,\s*0\.000\)/);
  assert.match(source, /coalesce\([^)]*damagedQuantityOnHand[^)]*,\s*0\.000\)/);
  assert.match(source, /coalesce\([^)]*expiredQuantityOnHand[^)]*,\s*0\.000\)/);
  assert.match(source, /coalesce\([^)]*weightedAverageCost[^)]*,\s*0\.00\)/);
  assert.match(source, /coalesce\([^)]*damagedWeightedAverageCost[^)]*,\s*0\.00\)/);
  assert.match(source, /coalesce\([^)]*expiredWeightedAverageCost[^)]*,\s*0\.00\)/);
});

test("inventory valuation repository totals are calculated across the full filtered result", async () => {
  const source = await readSource(reportsRepositoryPath);
  const totalsStart = source.indexOf("async function readInventoryValuationTotals");
  const totalsEnd = source.indexOf("export async function listInventoryValuation", totalsStart);
  const totalsSource = source.slice(totalsStart, totalsEnd);

  assert.ok(totalsStart >= 0);
  assert.ok(totalsEnd > totalsStart);
  assert.match(totalsSource, /total:\s*count\(\)/);
  assert.match(totalsSource, /sum\(/);
  assert.doesNotMatch(totalsSource, /\.limit\s*\(/);
  assert.doesNotMatch(totalsSource, /\.offset\s*\(/);
});

test("inventory valuation row query paginates while totals query remains separate", async () => {
  const source = await readSource(reportsRepositoryPath);
  const rowsStart = source.indexOf("async function listInventoryValuationRows");
  const rowsEnd = source.indexOf("async function readInventoryValuationTotals", rowsStart);
  const rowsSource = source.slice(rowsStart, rowsEnd);

  assert.match(rowsSource, /\.limit\(query\.pageSize\)/);
  assert.match(rowsSource, /\.offset\(getReportOffset\(query\)\)/);
  assert.match(source, /Promise\.all\(\[[\s\S]*?listInventoryValuationRows[\s\S]*?readInventoryValuationTotals/);
});

test("inventory valuation repository applies search category and active filters", async () => {
  const source = await readSource(reportsRepositoryPath);

  assert.match(source, /ilike\(products\.sku, search\)/);
  assert.match(source, /ilike\(products\.name, search\)/);
  assert.match(source, /ilike\(products\.barcode, search\)/);
  assert.match(source, /eq\(products\.categoryId, query\.categoryId\)/);
  assert.match(source, /eq\(products\.isActive, query\.isActive\)/);
});

test("inventory valuation response keeps quantity and money values as decimal strings", async () => {
  const repositorySource = await readSource(reportsRepositoryPath);
  const serviceSource = await readSource(reportsServicePath);

  assert.match(repositorySource, /sellableQuantity:\s*sql<string>/);
  assert.match(repositorySource, /damagedQuantity:\s*sql<string>/);
  assert.match(repositorySource, /expiredQuantity:\s*sql<string>/);
  assert.match(repositorySource, /weightedAverageCost:\s*sql<string>/);
  assert.match(repositorySource, /sellableValue:\s*sql<string>/);
  assert.match(repositorySource, /totalValue:\s*sql<string>/);
  assert.match(serviceSource, /items:\s*sourcePage\.items/);
  assert.match(serviceSource, /totals:\s*sourcePage\.totals/);
});

test("inventory valuation service returns page metadata from the validated query", async () => {
  const source = await readSource(reportsServicePath);
  const start = source.indexOf("export async function getInventoryValuationReport");
  const end = source.indexOf("export interface CustomerOutstandingReportResult", start);
  const valuationSource = source.slice(start, end);

  assert.match(valuationSource, /page:\s*query\.page/);
  assert.match(valuationSource, /pageSize:\s*query\.pageSize/);
  assert.match(valuationSource, /total:\s*sourcePage\.total/);
});

test("inventory valuation endpoint is authenticated and read-only", async () => {
  const source = await readSource(reportsRoutesPath);
  const start = source.indexOf('"/reports/inventory-valuation"');
  const nextRoute = source.indexOf("app.get", start + 1);
  const routeSource = source.slice(start, nextRoute === -1 ? undefined : nextRoute);

  assert.ok(start >= 0);
  assert.match(routeSource, /preHandler:\s*app\.authenticate/);
  assert.match(routeSource, /getInventoryValuationReport/);
  assert.doesNotMatch(routeSource, /app\.(post|put|patch|delete)\s*\(/);
});

test("supplier aging repository uses confirmed purchases, payments, and returns through the as-of date", async () => {
  const source = await readSource(reportsRepositoryPath);
  const start = source.indexOf("function supplierAgingAllocationTotals");
  const agingRepositorySource = source.slice(start);

  assert.ok(start >= 0);
  assert.match(agingRepositorySource, /supplierPaymentAllocations\.purchaseId/);
  assert.match(agingRepositorySource, /eq\(supplierPayments\.status, ["'`]CONFIRMED["'`]\)/);
  assert.match(agingRepositorySource, /isNull\(supplierPayments\.reversalOfPaymentId\)/);
  assert.match(agingRepositorySource, /lte\(paymentBusinessDate, query\.asOfDate\)/);
  assert.match(agingRepositorySource, /purchaseReturns\.originalPurchaseId/);
  assert.match(agingRepositorySource, /eq\(purchaseReturns\.status, ["'`]CONFIRMED["'`]\)/);
  assert.match(agingRepositorySource, /lte\(purchaseReturns\.returnDate, query\.asOfDate\)/);
  assert.match(agingRepositorySource, /eq\(purchases\.status, ["'`]CONFIRMED["'`]\)/);
  assert.match(agingRepositorySource, /lte\(purchases\.purchaseDate, query\.asOfDate\)/);
});

test("supplier aging repository subtracts allocations and returns exactly once from purchase total", async () => {
  const source = await readSource(reportsRepositoryPath);
  const start = source.indexOf("function supplierAgingOutstandingPurchases");
  const end = source.indexOf("function supplierAgingGroupedSuppliers", start);
  const outstandingSource = source.slice(start, end);

  assert.ok(start >= 0);
  assert.match(outstandingSource, /purchases\.totalAmount/);
  assert.match(outstandingSource, /allocations\.allocatedAmount/);
  assert.match(outstandingSource, /returns\.returnedAmount/);
  assert.match(outstandingSource, /greatest\([\s\S]*?- coalesce\([\s\S]*?- coalesce\([\s\S]*?0[\s\S]*?\)/);
  assert.match(outstandingSource, /gt\(outstandingAmount, ["'`]0["'`]\)/);
});

test("supplier aging repository groups payables into approved aging buckets and full filtered totals", async () => {
  const source = await readSource(reportsRepositoryPath);
  const start = source.indexOf("function supplierAgingGroupedSuppliers");
  const agingRepositorySource = source.slice(start);

  assert.ok(start >= 0);
  assert.match(agingRepositorySource, /between 0 and 30/);
  assert.match(agingRepositorySource, /between 31 and 60/);
  assert.match(agingRepositorySource, /between 61 and 90/);
  assert.match(agingRepositorySource, /> 90/);
  assert.match(agingRepositorySource, /totalPayable/);
  assert.match(agingRepositorySource, /\.limit\(query\.pageSize\)/);
  assert.match(agingRepositorySource, /\.offset\(getReportOffset\(query\)\)/);
  assert.match(agingRepositorySource, /readSupplierAgingTotals/);
  assert.match(agingRepositorySource, /listSupplierAgingRows\(database, query\)/);
  assert.match(agingRepositorySource, /readSupplierAgingTotals\(database, query\)/);
  assert.doesNotMatch(agingRepositorySource, /\.(insert|update|delete)\s*\(/);
});

test("supplier aging repository supports supplier code name and phone search", async () => {
  const source = await readSource(reportsRepositoryPath);
  const start = source.indexOf("function supplierAgingOutstandingPurchases");
  const end = source.indexOf("function supplierAgingGroupedSuppliers", start);
  const outstandingSource = source.slice(start, end);

  assert.ok(start >= 0);
  assert.match(outstandingSource, /ilike\(suppliers\.code/);
  assert.match(outstandingSource, /ilike\(suppliers\.name/);
  assert.match(outstandingSource, /ilike\(suppliers\.phone/);
});

