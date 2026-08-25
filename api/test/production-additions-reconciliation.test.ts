import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/** Reads one source file used by the production-additions reconciliation audit. */
async function source(relativePath: string): Promise<string> {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("inventory valuation uses current quantities and weighted-average cost without writes", async () => {
  const repository = await source("src/modules/reports/reports.repository.ts");

  assert.match(repository, /listInventoryValuation/);
  assert.match(repository, /sellableQuantityOnHand/);
  assert.match(repository, /damagedQuantityOnHand/);
  assert.match(repository, /expiredQuantityOnHand/);
  assert.match(repository, /weightedAverageCost/);
  assert.match(repository, /sellableValue/);
  assert.match(repository, /damagedValue/);
  assert.match(repository, /expiredValue/);
  assert.match(repository, /totalValue/);
  assert.doesNotMatch(repository, /\.(?:insert|update|delete)\(/);
});

/** Verifies aging arithmetic converts text aggregate aliases back to numeric before subtraction. */
test("customer and supplier aging subtract numeric allocation and return totals", async () => {
  const repository = await source("src/modules/reports/reports.repository.ts");

  const customerStart = repository.indexOf("function customerAgingOutstandingInvoices");
  const customerEnd = repository.indexOf("function customerAgingGroupedInvoices", customerStart);
  const customerSource = repository.slice(customerStart, customerEnd);
  assert.match(customerSource, /allocations\.allocatedAmount}::numeric/);
  assert.match(customerSource, /returns\.returnedAmount}::numeric/);

  const supplierStart = repository.indexOf("function supplierAgingOutstandingPurchases");
  const supplierEnd = repository.indexOf("function supplierAgingGroupedSuppliers", supplierStart);
  const supplierSource = repository.slice(supplierStart, supplierEnd);
  assert.match(supplierSource, /allocations\.allocatedAmount}::numeric/);
  assert.match(supplierSource, /returns\.returnedAmount}::numeric/);
});

/** Verifies aging subqueries expose only one id column and aggregate text aliases as numeric. */
test("customer and supplier aging avoid ambiguous id columns and text sums", async () => {
  const repository = await source("src/modules/reports/reports.repository.ts");

  const customerStart = repository.indexOf("function customerAgingOutstandingInvoices");
  const customerEnd = repository.indexOf("function customerAgingGroupedInvoices", customerStart);
  const customerSource = repository.slice(customerStart, customerEnd);
  assert.doesNotMatch(customerSource, /salesInvoiceId:\s*salesInvoices\.id/);
  assert.match(customerSource, /customerId:\s*customers\.id/);

  const supplierStart = repository.indexOf("function supplierAgingOutstandingPurchases");
  const supplierEnd = repository.indexOf("function supplierAgingGroupedSuppliers", supplierStart);
  const supplierSource = repository.slice(supplierStart, supplierEnd);
  assert.doesNotMatch(supplierSource, /purchaseId:\s*purchases\.id/);
  assert.match(supplierSource, /supplierId:\s*suppliers\.id/);

  const supplierTotalsStart = repository.indexOf("async function readSupplierAgingTotals");
  const supplierTotalsEnd = repository.indexOf("export async function listSupplierAging", supplierTotalsStart);
  const supplierTotalsSource = repository.slice(supplierTotalsStart, supplierTotalsEnd);
  assert.match(supplierTotalsSource, /grouped\.bucket0To30}::numeric/);
  assert.match(supplierTotalsSource, /grouped\.bucket31To60}::numeric/);
  assert.match(supplierTotalsSource, /grouped\.bucket61To90}::numeric/);
  assert.match(supplierTotalsSource, /grouped\.bucket90Plus}::numeric/);
  assert.match(supplierTotalsSource, /grouped\.totalPayable}::numeric/);
});
test("customer aging subtracts valid allocations and sales returns and excludes walk-in customer", async () => {
  const repository = await source("src/modules/reports/reports.repository.ts");

  assert.match(repository, /customerAgingAllocationTotals/);
  assert.match(repository, /customerAgingReturnTotals/);
  assert.match(repository, /eq\(salesReturns\.status, "CONFIRMED"\)/);
  assert.match(repository, /eq\(customers\.isWalkIn, false\)/);
  assert.match(repository, /bucket0To30/);
  assert.match(repository, /bucket31To60/);
  assert.match(repository, /bucket61To90/);
  assert.match(repository, /bucket90Plus/);
  assert.match(repository, /totalOutstanding/);
});

/** Verifies Customer Aging totals cast grouped text decimals back to numeric before PostgreSQL SUM. */
test("customer aging totals aggregate numeric values instead of calling sum(text)", async () => {
  const repository = await source("src/modules/reports/reports.repository.ts");
  const start = repository.indexOf("async function readCustomerAgingTotals");
  const end = repository.indexOf("export async function listCustomerAging", start);
  const totalsSource = repository.slice(start, end);

  assert.ok(start >= 0);
  assert.ok(end > start);
  for (const field of [
    "bucket0To30",
    "bucket31To60",
    "bucket61To90",
    "bucket90Plus",
    "totalOutstanding",
  ]) {
    assert.match(
      totalsSource,
      new RegExp(`sum\\(\\$\\{grouped\\.${field}\\}::numeric\\)`),
      `${field} must be numeric before SUM`,
    );
  }
});

test("customer aging keeps an original receipt until its reversal business date", async () => {
  const repository = await source("src/modules/reports/reports.repository.ts");
  const start = repository.indexOf("function customerAgingAllocationTotals");
  const end = repository.indexOf("function customerAgingReturnTotals", start);
  const customerAgingAllocationSource = repository.slice(start, end);

  assert.match(customerAgingAllocationSource, /isNull\(customerPayments\.reversalOfPaymentId\)/);
  assert.match(customerAgingAllocationSource, /reversalExistsByAsOfDate/);
  assert.match(customerAgingAllocationSource, /reversal\.reversal_of_payment_id/);
  assert.match(customerAgingAllocationSource, /reversal\.payment_date/);
  assert.match(customerAgingAllocationSource, /query\.asOfDate/);
  assert.match(customerAgingAllocationSource, /sql`not \(\$\{reversalExistsByAsOfDate\}\)`/);
  assert.doesNotMatch(
    customerAgingAllocationSource,
    /eq\(customerPayments\.status, "CONFIRMED"\)/,
  );
});

test("supplier aging subtracts valid allocations and purchase returns", async () => {
  const repository = await source("src/modules/reports/reports.repository.ts");

  assert.match(repository, /supplierAgingAllocationTotals/);
  assert.match(repository, /supplierAgingReturnTotals/);
  assert.match(repository, /eq\(purchaseReturns\.status, "CONFIRMED"\)/);
  assert.match(repository, /bucket0To30/);
  assert.match(repository, /bucket31To60/);
  assert.match(repository, /bucket61To90/);
  assert.match(repository, /bucket90Plus/);
  assert.match(repository, /totalPayable/);
});

/** Verifies Supplier Aging totals cast grouped text decimals back to numeric before PostgreSQL SUM. */
test("supplier aging totals aggregate numeric values instead of calling sum(text)", async () => {
  const repository = await source("src/modules/reports/reports.repository.ts");
  const start = repository.indexOf("async function readSupplierAgingTotals");
  const end = repository.indexOf("export async function listSupplierAging", start);
  const totalsSource = repository.slice(start, end);

  assert.ok(start >= 0);
  assert.ok(end > start);
  for (const field of [
    "bucket0To30",
    "bucket31To60",
    "bucket61To90",
    "bucket90Plus",
    "totalPayable",
  ]) {
    assert.match(
      totalsSource,
      new RegExp(`sum\\(\\$\\{grouped\\.${field}\\}::numeric\\)`),
      `${field} must be numeric before SUM`,
    );
  }
});

test("supplier aging keeps an original payment until its reversal business date", async () => {
  const repository = await source("src/modules/reports/reports.repository.ts");
  const start = repository.indexOf("function supplierAgingAllocationTotals");
  const end = repository.indexOf("function supplierAgingReturnTotals", start);
  const supplierAgingAllocationSource = repository.slice(start, end);

  assert.match(supplierAgingAllocationSource, /isNull\(supplierPayments\.reversalOfPaymentId\)/);
  assert.match(supplierAgingAllocationSource, /reversalExistsByAsOfDate/);
  assert.match(supplierAgingAllocationSource, /reversal\.reversal_of_payment_id/);
  assert.match(supplierAgingAllocationSource, /reversal\.payment_date/);
  assert.match(supplierAgingAllocationSource, /query\.asOfDate/);
  assert.match(supplierAgingAllocationSource, /sql`not \(\$\{reversalExistsByAsOfDate\}\)`/);
  assert.doesNotMatch(
    supplierAgingAllocationSource,
    /eq\(supplierPayments\.status, "CONFIRMED"\)/,
  );
});

test("daily cash summary reconciles opening plus inflows minus outflows", async () => {
  const [service, repository] = await Promise.all([
    source("src/modules/payments/payments.service.ts"),
    source("src/modules/payments/payments.repository.ts"),
  ]);

  assert.match(service, /getDailyCashSummary/);
  assert.match(service, /getCashBalanceBeforeDate/);
  assert.match(service, /sumCashMovementsForDate/);
  assert.match(service, /findCashReconciliationForDate/);
  assert.match(
    service,
    /moneyToCents\(opening\)[\s\S]*\+ moneyToCents\(movements\.inflows\)[\s\S]*- moneyToCents\(movements\.outflows\)/,
  );
  assert.match(service, /countedAmount: reconciliation\?\.countedAmount \?\? null/);
  assert.match(service, /difference: reconciliation\?\.differenceAmount \?\? null/);
  for (const functionName of [
    "getCashBalanceBeforeDate",
    "sumCashMovementsForDate",
    "findCashReconciliationForDate",
  ]) {
    const start = repository.indexOf(`export async function ${functionName}`);
    assert.ok(start >= 0, `${functionName} must exist`);
    const next = repository.indexOf("export async function", start + 1);
    const body = repository.slice(start, next >= 0 ? next : repository.length);
    assert.match(body, /\.select\(/);
    assert.doesNotMatch(body, /\.(?:insert|update|delete)\(/);
  }
});

test("production report and cash-summary routes stay authenticated and read-only", async () => {
  const [reportsRoutes, paymentsRoutes] = await Promise.all([
    source("src/modules/reports/reports.routes.ts"),
    source("src/modules/payments/payments.routes.ts"),
  ]);

  for (const path of [
    "/reports/inventory-valuation",
    "/reports/customers/aging",
    "/reports/suppliers/aging",
  ]) {
    assert.ok(reportsRoutes.includes(`"${path}"`), `${path} must be registered`);
  }
  assert.ok(
    paymentsRoutes.includes('"/payments/daily-cash-summary"'),
    "daily cash summary route must be registered",
  );
  assert.match(reportsRoutes, /app\.authenticate/);
  assert.match(paymentsRoutes, /app\.authenticate/);
});

/** Verifies customer aging applies receipts and returns only when they exist by the requested as-of date. */
test("customer aging keeps payment and return effects inside the historical as-of boundary", async () => {
  const repository = await source("src/modules/reports/reports.repository.ts");

  const allocationStart = repository.indexOf("function customerAgingAllocationTotals");
  const allocationEnd = repository.indexOf("function customerAgingReturnTotals", allocationStart);
  const allocationSource = repository.slice(allocationStart, allocationEnd);

  assert.match(allocationSource, /lte\(paymentBusinessDate, query\.asOfDate\)/);
  assert.match(
    allocationSource,
    /reversal\.payment_date[\s\S]*<= \$\{query\.asOfDate\}/,
  );

  const returnStart = allocationEnd;
  const returnEnd = repository.indexOf("function customerAgingOutstandingInvoices", returnStart);
  const returnSource = repository.slice(returnStart, returnEnd);

  assert.match(returnSource, /eq\(salesReturns\.status, "CONFIRMED"\)/);
  assert.match(returnSource, /eq\(salesReturns\.refundMode, "DUE_REDUCTION"\)/);
  assert.match(returnSource, /lte\(salesReturns\.returnDate, query\.asOfDate\)/);

  const invoiceStart = returnEnd;
  const invoiceEnd = repository.indexOf("function customerAgingGroupedCustomers", invoiceStart);
  const invoiceSource = repository.slice(invoiceStart, invoiceEnd);

  assert.match(invoiceSource, /eq\(salesInvoices\.status, "CONFIRMED"\)/);
  assert.match(invoiceSource, /lte\(salesInvoices\.invoiceDate, query\.asOfDate\)/);
});

/** Verifies supplier aging applies payments and returns only when they exist by the requested as-of date. */
test("supplier aging keeps payment and return effects inside the historical as-of boundary", async () => {
  const repository = await source("src/modules/reports/reports.repository.ts");

  const allocationStart = repository.indexOf("function supplierAgingAllocationTotals");
  const allocationEnd = repository.indexOf("function supplierAgingReturnTotals", allocationStart);
  const allocationSource = repository.slice(allocationStart, allocationEnd);

  assert.match(allocationSource, /lte\(paymentBusinessDate, query\.asOfDate\)/);
  assert.match(
    allocationSource,
    /reversal\.payment_date[\s\S]*<= \$\{query\.asOfDate\}/,
  );

  const returnStart = allocationEnd;
  const returnEnd = repository.indexOf("function supplierAgingOutstandingPurchases", returnStart);
  const returnSource = repository.slice(returnStart, returnEnd);

  assert.match(returnSource, /eq\(purchaseReturns\.status, "CONFIRMED"\)/);
  assert.match(returnSource, /lte\(purchaseReturns\.returnDate, query\.asOfDate\)/);

  const purchaseStart = returnEnd;
  const purchaseEnd = repository.indexOf("function supplierAgingGroupedSuppliers", purchaseStart);
  const purchaseSource = repository.slice(purchaseStart, purchaseEnd);

  assert.match(purchaseSource, /eq\(purchases\.status, "CONFIRMED"\)/);
  assert.match(purchaseSource, /lte\(purchases\.purchaseDate, query\.asOfDate\)/);
});

/** Verifies a cash-count difference is posted on its business date even when confirmation happens later. */
test("cash reconciliation adjustment stays on the reconciliation business date", async () => {
  const service = await source("src/modules/payments/payments.service.ts");
  const start = service.indexOf("export async function confirmCashReconciliation");
  const end = service.indexOf("export async function", start + 1);
  const confirmationSource = service.slice(start, end >= 0 ? end : service.length);

  assert.match(confirmationSource, /occurredAt: reconciliation\.reconciliationDate/);
  assert.doesNotMatch(confirmationSource, /occurredAt: confirmedAt/);
  assert.match(confirmationSource, /confirmedAt/);
});
