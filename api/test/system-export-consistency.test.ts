import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/** Reads one source file used by the Module 15 export consistency audit. */
async function readSource(relativePath: string): Promise<string> {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

/** Returns the source slice for one function so checks stay focused on that workflow. */
function functionBlock(source: string, functionName: string, nextMarker: string): string {
  const start = source.indexOf(`function ${functionName}`);
  assert.ok(start >= 0, `${functionName} should exist`);
  const end = source.indexOf(nextMarker, start + 1);
  return source.slice(start, end >= 0 ? end : undefined);
}

test("exports reuse the approved Reports services as their single business-data source", async () => {
  const source = await readSource("src/modules/system/system.service.ts");

  for (const reportLoader of [
    "getSalesReport",
    "getPurchasesReport",
    "getInventoryReport",
    "getCustomerOutstandingReport",
    "getSupplierPayableReport",
    "getCashBankReport",
    "getExpenseReport",
    "getProfitSummaryReport",
    "getProductProfitReport",
  ]) {
    assert.match(source, new RegExp(`\\b${reportLoader}\\b`));
  }

  const exportSource = source.slice(
    source.indexOf("export async function getSystemExportSource"),
    source.indexOf("export interface SystemExportFile"),
  );

  assert.match(exportSource, /getSalesReport\(database, parsed\)/);
  assert.match(exportSource, /getPurchasesReport\(database, parsed\)/);
  assert.match(exportSource, /getInventoryReport\(database, parsed\)/);
  assert.match(exportSource, /getCashBankReport\(database, parsed\)/);
  assert.match(exportSource, /getExpenseReport\(database, parsed\)/);
  assert.match(exportSource, /getProfitSummaryReport\(database, parsed\)/);
  assert.doesNotMatch(exportSource, /from\(salesInvoices|from\(purchases|from\(stockMovements|from\(expenses/);
});

test("every export validates filters with the matching Reports schema", async () => {
  const source = await readSource("src/modules/system/system.service.ts");
  const exportSource = source.slice(
    source.indexOf("export async function getSystemExportSource"),
    source.indexOf("export interface SystemExportFile"),
  );

  const schemas = [
    "salesReportQuerySchema",
    "purchasesReportQuerySchema",
    "inventoryReportQuerySchema",
    "customerOutstandingReportQuerySchema",
    "supplierPayableReportQuerySchema",
    "cashBankReportQuerySchema",
    "expenseReportQuerySchema",
    "profitSummaryReportQuerySchema",
    "productProfitReportQuerySchema",
  ];

  for (const schema of schemas) {
    assert.match(exportSource, new RegExp(`${schema}\\.parse\\(`));
  }
});

test("paginated Reports exports load all matching rows instead of only the first page", async () => {
  const source = await readSource("src/modules/system/system.service.ts");

  for (const helper of [
    "getAllCustomerOutstandingRows",
    "getAllSupplierPayableRows",
    "getAllProductProfitRows",
  ]) {
    const start = source.indexOf(`async function ${helper}`);
    assert.ok(start >= 0, `${helper} should exist`);
    const end = source.indexOf("\n/**", start + 1);
    const block = source.slice(start, end >= 0 ? end : undefined);

    assert.match(block, /page: 1/);
    assert.match(block, /pageSize: EXPORT_PAGE_SIZE/);
    assert.match(block, /for \(let page = 2; items\.length < first\.total; page \+= 1\)/);
    assert.match(block, /items\.push\(\.\.\.next\.items\)/);
  }
});

test("CSV Excel and PDF format the exact same export source table", async () => {
  const source = await readSource("src/modules/system/system.service.ts");

  const csv = functionBlock(
    source,
    "buildSystemCsvExport",
    "/** Converts an unknown report value into a safe Excel cell value. */",
  );
  const excel = functionBlock(
    source,
    "buildSystemExcelExport",
    "/** Converts one report value into readable text without changing decimal strings. */",
  );
  const pdf = functionBlock(
    source,
    "buildSystemPdfExport",
    "/** Returns one import job together with its saved row-level validation errors. */",
  );

  assert.match(csv, /const table = getSystemExportTable\(source\)/);
  assert.match(excel, /const table = getSystemExportTable\(source\)/);
  assert.match(pdf, /const table = getSystemExportTable\(source\)/);

  // Formatters must not call Reports again or recalculate operational totals independently.
  for (const block of [csv, excel, pdf]) {
    assert.doesNotMatch(block, /getSalesReport|getPurchasesReport|getProfitSummaryReport|getProductProfitReport/);
    assert.doesNotMatch(block, /salesAmount\s*[+\-*/]=|netSalesAmount\s*[+\-*/]=|estimatedProfitAmount\s*[+\-*/]=/);
  }
});

test("export table preserves report totals returns reversals and historical values instead of replacing them", async () => {
  const source = await readSource("src/modules/system/system.service.ts");
  const tableBlock = source.slice(
    source.indexOf("function getSystemExportTable"),
    source.indexOf("/** Escapes one value according to the CSV format"),
  );

  assert.match(tableBlock, /rows\.push\(\{ documentType: "TOTALS", \.\.\.\(data\.totals \?\? \{\}\) \}\)/);
  assert.match(tableBlock, /"returnAmount"/);
  assert.match(tableBlock, /"netSalesAmount"/);
  assert.match(tableBlock, /"returnAmount"/);
  assert.match(tableBlock, /"netPurchasesAmount"/);
  assert.match(tableBlock, /"reversalAmount"/);
  assert.match(tableBlock, /"netExpenseAmount"/);
  assert.match(tableBlock, /"costOfGoodsSoldAmount"/);
  assert.match(tableBlock, /"returnedCostAmount"/);
  assert.match(tableBlock, /"laborCostAmount"/);
  assert.match(tableBlock, /"estimatedProfitAmount"/);
});

test("the export route loads one source then chooses only the requested file formatter", async () => {
  const routes = await readSource("src/modules/system/system.routes.ts");
  const start = routes.indexOf("async function handleExport");
  assert.ok(start >= 0);
  const end = routes.indexOf("\n  /** Returns one import job", start);
  const block = routes.slice(start, end);

  assert.equal((block.match(/getSystemExportSource\(/g) ?? []).length, 1);
  assert.match(block, /if \(query\.format === "xlsx"\)/);
  assert.match(block, /buildSystemExcelExport\(source\)/);
  assert.match(block, /else if \(query\.format === "pdf"\)/);
  assert.match(block, /buildSystemPdfExport\(source\)/);
  assert.match(block, /buildSystemCsvExport\(source\)/);
  assert.match(block, /Content-Disposition/);
});

test("System exports support exactly the approved report data sets and formats", async () => {
  const schema = await readSource("src/modules/system/system.schema.ts");

  for (const type of [
    "sales",
    "purchases",
    "inventory",
    "customer-outstanding",
    "supplier-payable",
    "cash-bank",
    "expenses",
    "profit-summary",
    "product-profit",
  ]) {
    assert.ok(schema.includes(`"${type}"`), `${type} should be an approved export type`);
  }

  assert.match(schema, /z\.enum\(\["csv", "xlsx", "pdf"\]\)\.default\("csv"\)/);
});
