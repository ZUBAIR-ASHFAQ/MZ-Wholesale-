import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/** Reads one project source file for cross-module acceptance checks. */
async function source(relativePath: string): Promise<string> {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("all business modules are registered in the approved dependency order", async () => {
  const app = await source("src/app.ts");
  const order = [
    "businessSettingsModule",
    "productsModule",
    "customersModule",
    "suppliersModule",
    "employeesModule",
    "inventoryModule",
    "ledgersModule",
    "paymentsModule",
    "purchasesModule",
    "salesModule",
    "returnsModule",
    "expensesModule",
    "reportsModule",
    "dashboardModule",
    "systemModule",
  ];

  let previous = -1;
  for (const moduleName of order) {
    const position = app.indexOf(`await app.register(${moduleName})`);
    assert.ok(position > previous, `${moduleName} must be registered in dependency order`);
    previous = position;
  }
});

test("purchase confirmation connects document, inventory, supplier ledger, and initial payment", async () => {
  const purchases = await source("src/modules/purchases/purchases.service.ts");

  assert.match(purchases, /recordPurchaseStockIn\(transaction/);
  assert.match(purchases, /writeSupplierCredit\(transaction/);
  assert.match(purchases, /recordPurchaseInitialSupplierPayment\(transaction/);
  assert.match(purchases, /markPurchaseConfirmed\(\s*transaction/);
});

test("sale confirmation connects document, inventory, customer ledger, and initial receipt", async () => {
  const sales = await source("src/modules/sales/sales.service.ts");

  assert.match(sales, /recordSaleStockOut\(transaction/);
  assert.match(sales, /writeCustomerDebit\(transaction/);
  assert.match(sales, /recordSaleInitialCustomerReceipt\(transaction/);
  assert.match(sales, /markSaleConfirmed\(transaction/);
  assert.match(sales, /Walk-in Customer/i);
});

test("payment workflows connect allocations, ledgers, and immutable cash-bank movements", async () => {
  const payments = await source("src/modules/payments/payments.service.ts");

  assert.match(payments, /createCustomerPaymentAllocations/);
  assert.match(payments, /createSupplierPaymentAllocations/);
  assert.match(payments, /writeCustomerCredit\(database/);
  assert.match(payments, /writeSupplierDebit\(database/);
  assert.match(payments, /createCashBankMovement/);
  assert.match(payments, /writeCashInflow/);
  assert.match(payments, /writeBankOutflow/);
});

test("returns connect original documents, stock, ledgers, and cash-bank settlement", async () => {
  const returns = await source("src/modules/returns/returns.service.ts");

  assert.match(returns, /recordSalesReturnStockIn/);
  assert.match(returns, /recordPurchaseReturnStockOut/);
  assert.match(returns, /writeCustomerCredit/);
  assert.match(returns, /writeSupplierDebit/);
  assert.match(returns, /writeCashOutflow/);
  assert.match(returns, /writeBankOutflow/);
  assert.match(returns, /cannot reduce the supplier payable below zero/i);
});

test("expenses use payment account movements instead of maintaining a second cash balance", async () => {
  const expenses = await source("src/modules/expenses/expenses.service.ts");

  assert.match(expenses, /writeCashOutflow/);
  assert.match(expenses, /writeBankOutflow/);
  assert.match(expenses, /writeCashInflow/);
  assert.match(expenses, /writeBankInflow/);
  assert.match(expenses, /reserveBusinessDocumentNumberInTransaction/);
});

test("reports and dashboard remain read-only consumers of operational modules", async () => {
  const reportsRepository = await source("src/modules/reports/reports.repository.ts");
  const dashboardRepository = await source("src/modules/dashboard/dashboard.repository.ts");

  for (const repository of [reportsRepository, dashboardRepository]) {
    assert.doesNotMatch(repository, /\.insert\s*\(/);
    assert.doesNotMatch(repository, /\.update\s*\(/);
    assert.doesNotMatch(repository, /\.delete\s*\(/);
  }
});

test("System opening imports reuse Inventory and Ledger business writers", async () => {
  const system = await source("src/modules/system/system.service.ts");

  assert.match(system, /recordOpeningStockItem/);
  assert.match(system, /writeCustomerDebit/);
  assert.match(system, /writeSupplierCredit/);
  assert.match(system, /referenceType:\s*"OPENING_BALANCE"/);
});

test("System exports reuse Reports as the single report calculation source", async () => {
  const system = await source("src/modules/system/system.service.ts");

  for (const functionName of [
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
    assert.match(system, new RegExp(`\\b${functionName}\\b`));
  }
});

test("Dashboard has no downstream business dependency", async () => {
  const app = await source("src/app.ts");
  const system = await source("src/modules/system/system.service.ts");
  const reports = await source("src/modules/reports/reports.service.ts");

  assert.match(app, /await app\.register\(dashboardModule\)/);
  assert.doesNotMatch(system, /modules\/dashboard|\.\.\/dashboard/);
  assert.doesNotMatch(reports, /modules\/dashboard|\.\.\/dashboard/);
});

test("the Reports source consumed by Dashboard/System contains no escaped-newline parser corruption", async () => {
  const reports = await source("src/modules/reports/reports.service.ts");

  assert.doesNotMatch(reports, /\\n\\n\/\*\*/);
  assert.match(reports, /export interface ProfitSummaryReportResult/);
});
