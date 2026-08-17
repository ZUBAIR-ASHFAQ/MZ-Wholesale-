import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/** Reads one project source file used by the System import confirmation audit. */
async function readSource(path: URL): Promise<string> {
  return readFile(path, "utf8");
}

test("import confirmation route requires authentication and Idempotency-Key", async () => {
  const routes = await readSource(
    new URL("../src/modules/system/system.routes.ts", import.meta.url),
  );

  assert.match(routes, /app\.post\(\s*"\/system\/imports\/:id\/confirm"/);
  assert.match(routes, /preHandler:\s*app\.authenticate/);
  assert.match(routes, /security:\s*openApiMutationSecurity/);
  assert.match(routes, /parseSystemValue\(systemIdempotencyHeadersSchema, request\.headers\)/);
  assert.match(routes, /executeIdempotentMutation\(/);
  assert.match(routes, /confirmImport\(transaction, params\.id\)/);
});

test("confirmation dispatcher supports every approved import type", async () => {
  const service = await readSource(
    new URL("../src/modules/system/system.service.ts", import.meta.url),
  );

  assert.match(service, /job\.type === "products"[\s\S]*confirmProductImport/);
  assert.match(service, /job\.type === "customers" \|\| job\.type === "suppliers"[\s\S]*confirmPartyImport/);
  assert.match(service, /job\.type === "opening-stock"[\s\S]*confirmOpeningStockImport/);
  assert.match(service, /job\.type === "opening-balances"[\s\S]*confirmOpeningBalanceImport/);
});

test("all confirmation workflows require a VALIDATED job and saved validated rows", async () => {
  const service = await readSource(
    new URL("../src/modules/system/system.service.ts", import.meta.url),
  );

  const validatedChecks = service.match(/job\.status !== "VALIDATED"/g) ?? [];
  const missingDataChecks = service.match(/IMPORT_VALIDATION_DATA_MISSING/g) ?? [];

  assert.ok(validatedChecks.length >= 4, "every confirmation workflow must require VALIDATED status");
  assert.ok(missingDataChecks.length >= 4, "every confirmation workflow must require saved validated rows");
  assert.match(service, /IMPORT_JOB_NOT_VALIDATED/);
  assert.match(service, /This import job has already been imported/);
});

test("confirmation revalidates current data before claiming and writing", async () => {
  const service = await readSource(
    new URL("../src/modules/system/system.service.ts", import.meta.url),
  );

  assert.match(service, /collectProductImportErrors\(database, parsed\)[\s\S]*claimValidatedProductImport/);
  assert.match(service, /collectCustomerImportErrors\(database, parsed\)[\s\S]*claimValidatedPartyImport/);
  assert.match(service, /collectSupplierImportErrors\(database, parsed\)[\s\S]*claimValidatedPartyImport/);
  assert.match(service, /collectOpeningStockImportErrors\(database, parsed\)[\s\S]*claimValidatedOpeningStockImport/);
  assert.match(service, /collectOpeningBalanceImportErrors\(database, parsed\)[\s\S]*claimValidatedOpeningBalanceImport/);
  assert.match(service, /IMPORT_VALIDATION_FAILED/);
});

test("validated import jobs are atomically claimed only once", async () => {
  const repository = await readSource(
    new URL("../src/modules/system/system.repository.ts", import.meta.url),
  );

  for (const claimName of [
    "claimValidatedProductImport",
    "claimValidatedPartyImport",
    "claimValidatedOpeningStockImport",
    "claimValidatedOpeningBalanceImport",
  ]) {
    const start = repository.indexOf(`export async function ${claimName}`);
    assert.notEqual(start, -1, `${claimName} must exist`);
    const next = repository.indexOf("export async function", start + 30);
    const block = repository.slice(start, next === -1 ? repository.length : next);

    assert.match(block, /eq\(importJobs\.status, "VALIDATED"\)/);
    assert.match(block, /status:\s*"IMPORTED"/);
    assert.match(block, /\.returning\(\)/);
  }
});

test("product confirmation creates products and units before completing the job", async () => {
  const service = await readSource(
    new URL("../src/modules/system/system.service.ts", import.meta.url),
  );

  const start = service.indexOf("export async function confirmProductImport");
  const end = service.indexOf("interface PartyImportValidationError", start);
  const block = service.slice(start, end);

  assert.match(block, /createImportedProduct\(database/);
  assert.match(block, /createImportedProductUnits\(/);
  assert.match(block, /isActive:\s*true/);
  assert.match(block, /updateImportJobStatus\(database, importJobId, \{[\s\S]*status:\s*"IMPORTED"[\s\S]*importedRows:\s*rows\.length/);
});

test("customer and supplier confirmation creates active master records", async () => {
  const service = await readSource(
    new URL("../src/modules/system/system.service.ts", import.meta.url),
  );

  const start = service.indexOf("export async function confirmPartyImport");
  const end = service.indexOf("export interface OpeningStockImportConfirmationResult", start);
  const block = service.slice(start, end);

  assert.match(block, /createImportedCustomer\(database/);
  assert.match(block, /isWalkIn:\s*false/);
  assert.match(block, /createImportedSupplier\(database/);
  assert.match(block, /isActive:\s*true/);
  assert.match(block, /status:\s*"IMPORTED"/);
});

test("opening-stock confirmation reuses Inventory movement rules instead of direct balance edits", async () => {
  const service = await readSource(
    new URL("../src/modules/system/system.service.ts", import.meta.url),
  );
  const inventory = await readSource(
    new URL("../src/modules/inventory/inventory.service.ts", import.meta.url),
  );

  const start = service.indexOf("export async function confirmOpeningStockImport");
  const end = service.indexOf("export interface OpeningBalanceImportConfirmationResult", start);
  const block = service.slice(start, end);

  assert.match(block, /recordOpeningStockItem\(database, item, "Opening stock import"\)/);
  assert.doesNotMatch(block, /\.insert\(inventoryBalances\)|\.update\(inventoryBalances\)/);
  assert.match(inventory, /export async function recordOpeningStockItem/);
  assert.match(inventory, /OPENING_STOCK/);
});

test("opening-balance confirmation writes immutable ledger opening entries", async () => {
  const service = await readSource(
    new URL("../src/modules/system/system.service.ts", import.meta.url),
  );

  const start = service.indexOf("export async function confirmOpeningBalanceImport");
  const end = service.indexOf("export async function confirmImport", start);
  const block = service.slice(start, end);

  assert.match(block, /writeCustomerDebit\(database/);
  assert.match(block, /writeSupplierCredit\(database/);
  assert.match(block, /referenceType:\s*"OPENING_BALANCE"/);
  assert.match(block, /if \(Number\(amount\) === 0\) \{\s*continue;/);
  assert.doesNotMatch(block, /\.update\(customers\)|\.update\(suppliers\)/);
});

test("confirmation business writes share the idempotency PostgreSQL transaction", async () => {
  const routes = await readSource(
    new URL("../src/modules/system/system.routes.ts", import.meta.url),
  );
  const helper = await readSource(
    new URL("../src/shared/http/idempotency.ts", import.meta.url),
  );

  assert.match(helper, /database\.transaction\(async \(transaction\) =>/);
  assert.match(helper, /const response = await operation\(tx\)/);
  assert.match(routes, /confirmImport\(transaction, params\.id\)/);
  assert.match(helper, /responseBody:\s*response\.body/);
  assert.match(helper, /status:\s*"COMPLETED"/);
});

test("a failed confirmation cannot leave a successful idempotency response", async () => {
  const helper = await readSource(
    new URL("../src/shared/http/idempotency.ts", import.meta.url),
  );

  const operationIndex = helper.indexOf("const response = await operation(tx)");
  const completedIndex = helper.indexOf('status: "COMPLETED"', operationIndex);

  assert.ok(operationIndex >= 0);
  assert.ok(completedIndex > operationIndex, "idempotency is completed only after business work succeeds");
  assert.match(helper, /return database\.transaction/);
});
