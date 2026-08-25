import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardRepositoryUrl = new URL(
  "../src/modules/dashboard/dashboard.repository.ts",
  import.meta.url,
);
const dashboardServiceUrl = new URL(
  "../src/modules/dashboard/dashboard.service.ts",
  import.meta.url,
);
const salesSchemaUrl = new URL(
  "../src/database/schema/sales.schema.ts",
  import.meta.url,
);
const purchaseSchemaUrl = new URL(
  "../src/database/schema/purchase.schema.ts",
  import.meta.url,
);
const inventorySchemaUrl = new URL(
  "../src/database/schema/inventory.schema.ts",
  import.meta.url,
);
const expenseSchemaUrl = new URL(
  "../src/database/schema/expense.schema.ts",
  import.meta.url,
);
const returnSchemaUrl = new URL(
  "../src/database/schema/return.schema.ts",
  import.meta.url,
);

/** Reads one source file used by the Dashboard performance audit. */
async function readSource(path: URL): Promise<string> {
  return readFile(path, "utf8");
}

/** Returns one named source section so a performance assertion stays focused. */
function sourceSection(source: string, start: string, end?: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing source section: ${start}`);

  if (!end) return source.slice(startIndex);

  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing source section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("Dashboard overview executes independent reads concurrently instead of serially", async () => {
  const service = await readSource(dashboardServiceUrl);
  const overview = sourceSection(
    service,
    "export async function getDashboardOverview",
    "export async function getDashboardLowStock",
  );

  assert.match(overview, /await Promise\.all\(\[/);
  assert.doesNotMatch(overview, /for\s*\(|forEach\s*\(|\.map\s*\(\s*async/);
});

test("Dashboard repository has no per-row database query loop or N+1 pattern", async () => {
  const repository = await readSource(dashboardRepositoryUrl);

  assert.doesNotMatch(repository, /for\s*\([^)]*\)\s*\{[^}]*database\./s);
  assert.doesNotMatch(repository, /forEach\s*\([^)]*database\./s);
  assert.doesNotMatch(repository, /\.map\s*\(\s*async[^)]*database\./s);
});

test("Recent sales and purchases use bounded joined queries", async () => {
  const repository = await readSource(dashboardRepositoryUrl);

  const recentSales = sourceSection(
    repository,
    "export async function getDashboardRecentSales",
    "export interface DashboardPurchaseSummary",
  );
  const recentPurchases = sourceSection(
    repository,
    "export async function getDashboardRecentPurchases",
    "export interface DashboardInventorySummary",
  );

  assert.match(recentSales, /innerJoin\(customers/);
  assert.match(recentSales, /\.limit\(limit\)/);
  assert.match(recentPurchases, /innerJoin\(suppliers/);
  assert.match(recentPurchases, /\.limit\(limit\)/);
});

test("Low-stock query is paginated and uses one joined product/inventory query plus one count", async () => {
  const repository = await readSource(dashboardRepositoryUrl);
  const lowStock = sourceSection(
    repository,
    "export async function getDashboardLowStock",
    "export interface DashboardCustomerOutstandingSummary",
  );

  assert.match(lowStock, /await Promise\.all\(\[/);
  assert.match(lowStock, /leftJoin\(inventoryBalances/);
  assert.match(lowStock, /\.limit\(DASHBOARD_LOW_STOCK_PAGE_SIZE\)/);
  assert.match(lowStock, /\.offset\(offset\)/);
  assert.match(lowStock, /count\(\)/);
});

test("Dashboard date-filtered sales and purchase queries have supporting compound indexes", async () => {
  const [salesSchema, purchaseSchema] = await Promise.all([
    readSource(salesSchemaUrl),
    readSource(purchaseSchemaUrl),
  ]);

  assert.match(
    salesSchema,
    /index\("sales_invoices_status_invoice_date_index"\)\.on\(\s*table\.status,\s*table\.invoiceDate/s,
  );
  assert.match(
    purchaseSchema,
    /index\("purchases_status_purchase_date_index"\)\.on\(\s*table\.status,\s*table\.purchaseDate/s,
  );
});

test("Dashboard joins use existing inventory and item indexes instead of adding Dashboard tables", async () => {
  const [inventorySchema, salesSchema] = await Promise.all([
    readSource(inventorySchemaUrl),
    readSource(salesSchemaUrl),
  ]);

  assert.match(
    inventorySchema,
    /uniqueIndex\("inventory_balances_product_id_unique"\)\.on\(table\.productId\)/,
  );
  assert.match(
    salesSchema,
    /index\("sales_invoice_items_sales_invoice_id_index"\)\.on\(/,
  );
});

test("Dashboard expense and sales-return date reads use existing source-table indexes", async () => {
  const [expenseSchema, returnSchema] = await Promise.all([
    readSource(expenseSchemaUrl),
    readSource(returnSchemaUrl),
  ]);

  assert.match(
    expenseSchema,
    /index\("expenses_date_index"\)\.on\(table\.expenseDate\)/,
  );
  assert.match(
    returnSchema,
    /index\("sales_returns_return_date_index"\)\.on\(table\.returnDate\)/,
  );
  assert.match(
    returnSchema,
    /index\("sales_return_items_sales_return_id_index"\)\.on\(table\.salesReturnId\)/,
  );
});

test("Dashboard performance audit does not introduce write SQL or speculative cache infrastructure", async () => {
  const [repository, service] = await Promise.all([
    readSource(dashboardRepositoryUrl),
    readSource(dashboardServiceUrl),
  ]);
  const source = `${repository}\n${service}`;

  assert.doesNotMatch(source, /\.insert\s*\(|\.update\s*\(|\.delete\s*\(/);
  assert.doesNotMatch(source, /redis|bullmq|websocket|materialized view/i);
});
