import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repositoryPath = new URL(
  "../src/modules/reports/reports.repository.ts",
  import.meta.url,
);
const servicePath = new URL(
  "../src/modules/reports/reports.service.ts",
  import.meta.url,
);
const routesPath = new URL(
  "../src/modules/reports/reports.routes.ts",
  import.meta.url,
);

/** Reads one Reports production source file for business-rule audit checks. */
async function readSource(path: URL): Promise<string> {
  return readFile(path, "utf8");
}

test("reports remain read-only and expose exactly twelve GET endpoints", async () => {
  const [repository, routes] = await Promise.all([
    readSource(repositoryPath),
    readSource(routesPath),
  ]);

  assert.equal((routes.match(/app\.get\(/g) ?? []).length, 12);
  assert.equal(/app\.(post|put|patch|delete)\(/.test(routes), false);
  assert.equal(/\.(insert|update|delete)\(/.test(repository), false);
});

test("sales and purchase reports use confirmed documents and return dates", async () => {
  const repository = await readSource(repositoryPath);

  assert.match(repository, /eq\(salesInvoices\.status, "CONFIRMED"\)/);
  assert.match(repository, /eq\(salesReturns\.status, "CONFIRMED"\)/);
  assert.match(repository, /salesReturns\.returnDate/);
  assert.match(repository, /eq\(purchases\.status, "CONFIRMED"\)/);
  assert.match(repository, /eq\(purchaseReturns\.status, "CONFIRMED"\)/);
  assert.match(repository, /purchaseReturns\.returnDate/);
});

test("inventory and cash movement dates use Asia Karachi business time", async () => {
  const repository = await readSource(repositoryPath);

  const karachiReferences = repository.match(/Asia\/Karachi/g) ?? [];
  assert.ok(karachiReferences.length >= 4);
  assert.match(repository, /stockMovements\.occurredAt/);
  assert.match(repository, /cashBankMovements\.occurredAt/);
});

test("customer and supplier balances use ledger source of truth", async () => {
  const repository = await readSource(repositoryPath);

  assert.match(repository, /customerLedgerEntries\.debit/);
  assert.match(repository, /customerLedgerEntries\.credit/);
  assert.match(repository, /eq\(customers\.isWalkIn, false\)/);
  assert.match(repository, /supplierLedgerEntries\.credit/);
  assert.match(repository, /supplierLedgerEntries\.debit/);
});

test("expense reversals and profit calculations keep immutable correction semantics", async () => {
  const service = await readSource(servicePath);

  assert.match(service, /reversalOfExpenseId/);
  assert.match(service, /expenseReversalCents/);
  assert.match(service, /unitCostSnapshot/);
  assert.equal(/weightedAverageCost/.test(service), false);
});
