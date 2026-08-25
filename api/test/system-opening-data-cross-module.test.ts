import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/** Reads one source file used by the opening-data cross-module audit. */
async function readSource(path: URL): Promise<string> {
  return readFile(path, "utf8");
}

test("System product confirmation writes the same product tables read by Product Management", async () => {
  const systemRepository = await readSource(
    new URL("../src/modules/system/system.repository.ts", import.meta.url),
  );
  const productsRepository = await readSource(
    new URL("../src/modules/products/products.repository.ts", import.meta.url),
  );

  assert.match(systemRepository, /database\.insert\(products\)/);
  assert.match(systemRepository, /database\.insert\(productUnits\)/);
  assert.match(productsRepository, /\.from\(products\)/);
  assert.match(productsRepository, /productUnits/);
});

test("opening-stock confirmation delegates to Inventory movement and balance rules", async () => {
  const systemService = await readSource(
    new URL("../src/modules/system/system.service.ts", import.meta.url),
  );
  const inventoryService = await readSource(
    new URL("../src/modules/inventory/inventory.service.ts", import.meta.url),
  );

  assert.match(systemService, /recordOpeningStockItem\(database, item, "Opening stock import"\)/);
  assert.match(inventoryService, /export async function recordOpeningStockItem/);
  assert.match(inventoryService, /createStockMovement/);
  assert.match(inventoryService, /getOrCreateLockedBalance|updateInventoryBalance/);
});

test("opening-balance confirmation delegates to immutable Ledger writers", async () => {
  const systemService = await readSource(
    new URL("../src/modules/system/system.service.ts", import.meta.url),
  );
  const ledgerService = await readSource(
    new URL("../src/modules/ledgers/ledgers.service.ts", import.meta.url),
  );

  assert.match(systemService, /writeCustomerDebit\(database/);
  assert.match(systemService, /writeSupplierCredit\(database/);
  assert.match(systemService, /referenceType:\s*"OPENING_BALANCE"/);
  assert.match(ledgerService, /createCustomerLedgerEntry/);
  assert.match(ledgerService, /createSupplierLedgerEntry/);
});

test("opening balances remain calculated from ledger entries rather than master balance fields", async () => {
  const ledgersRepository = await readSource(
    new URL("../src/modules/ledgers/ledgers.repository.ts", import.meta.url),
  );
  const customerSchema = await readSource(
    new URL("../src/database/schema/customer.schema.ts", import.meta.url),
  );
  const supplierSchema = await readSource(
    new URL("../src/database/schema/supplier.schema.ts", import.meta.url),
  );

  assert.match(ledgersRepository, /readCustomerCurrentDue/);
  assert.match(ledgersRepository, /readSupplierCurrentPayable/);
  assert.match(ledgersRepository, /customerLedgerEntries/);
  assert.match(ledgersRepository, /supplierLedgerEntries/);
  assert.doesNotMatch(customerSchema, /currentBalance|current_balance/);
  assert.doesNotMatch(supplierSchema, /currentPayable|current_payable/);
});
