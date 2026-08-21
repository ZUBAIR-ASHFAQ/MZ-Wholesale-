import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const schemaDirectory = new URL("../src/database/schema/", import.meta.url);
const drizzleDirectory = new URL("../drizzle/", import.meta.url);
const journalUrl = new URL("../drizzle/meta/_journal.json", import.meta.url);

/** Reads one UTF-8 project file used by the database audit. */
async function readSource(url: URL): Promise<string> {
  return readFile(url, "utf8");
}

/** Returns sorted file names from one directory. */
async function listNames(url: URL): Promise<string[]> {
  return (await readdir(url)).sort();
}

/** Loads every Drizzle business schema into one searchable string. */
async function readAllSchemas(): Promise<string> {
  const files = (await listNames(schemaDirectory)).filter((name) =>
    name.endsWith(".schema.ts"),
  );

  const sources = await Promise.all(
    files.map((name) => readSource(new URL(`../src/database/schema/${name}`, import.meta.url))),
  );

  return sources.join("\n");
}

test("database keeps the approved schema-file set", async () => {
  assert.deepEqual(await listNames(schemaDirectory), [
    "auth.schema.ts",
    "business-settings.schema.ts",
    "customer.schema.ts",
    "employee.schema.ts",
    "expense.schema.ts",
    "index.ts",
    "inventory.schema.ts",
    "ledger.schema.ts",
    "payment.schema.ts",
    "product.schema.ts",
    "purchase.schema.ts",
    "return.schema.ts",
    "sales.schema.ts",
    "supplier.schema.ts",
    "system.schema.ts",
  ]);
});

test("all database table primary keys use UUIDs", async () => {
  const schemas = await readAllSchemas();
  const tables = [...schemas.matchAll(/pgTable\(\s*["'][^"']+["']/g)];
  const uuidPrimaryKeys = [...schemas.matchAll(/id:\s*uuid\(["']id["']\)\.defaultRandom\(\)\.primaryKey\(\)/g)];

  assert.equal(uuidPrimaryKeys.length, tables.length);
});

test("money, quantity, and internal inventory cost fields use the approved numeric precision", async () => {
  const schemas = await readAllSchemas();

  const numericDeclarations = [...schemas.matchAll(/numeric\([\s\S]*?\}\)/g)].map(
    (match) => match[0],
  );

  assert.ok(numericDeclarations.length > 0);

  for (const declaration of numericDeclarations) {
    if (/precision:\s*30/.test(declaration)) {
      assert.match(declaration, /scale:\s*14/);
    } else {
      assert.match(declaration, /precision:\s*14/);
      assert.match(declaration, /scale:\s*(2|3)/);
    }
  }

  const highPrecisionCosts = numericDeclarations.filter((declaration) =>
    /precision:\s*30/.test(declaration),
  );
  assert.equal(highPrecisionCosts.length, 8);
  for (const declaration of highPrecisionCosts) {
    assert.match(
      declaration,
      /weighted_average_cost|damaged_weighted_average_cost|expired_weighted_average_cost|landed_unit_cost|unit_cost_snapshot|unit_cost/,
    );
  }

  const quantityLike = numericDeclarations.filter((declaration) =>
    /quantity|conversion_to_base|reorder_level/i.test(declaration),
  );
  for (const declaration of quantityLike) {
    assert.match(declaration, /scale:\s*3/);
  }
});

test("document sequences contain exactly the seven approved document types", async () => {
  const source = await readSource(
    new URL("../src/modules/business-settings/business-settings.schema.ts", import.meta.url),
  );

  for (const value of [
    "SALE",
    "PURCHASE",
    "CUSTOMER_RECEIPT",
    "SUPPLIER_PAYMENT",
    "SALES_RETURN",
    "PURCHASE_RETURN",
    "EXPENSE",
  ]) {
    assert.match(source, new RegExp(`"${value}"`));
  }

  assert.doesNotMatch(source, /"PAYMENT"/);
  assert.doesNotMatch(source, /"RETURN"/);
});

test("customer and supplier balances remain ledger-derived", async () => {
  const customer = await readSource(
    new URL("../src/database/schema/customer.schema.ts", import.meta.url),
  );
  const supplier = await readSource(
    new URL("../src/database/schema/supplier.schema.ts", import.meta.url),
  );
  const ledger = await readSource(
    new URL("../src/database/schema/ledger.schema.ts", import.meta.url),
  );

  assert.doesNotMatch(customer, /currentBalance|current_balance|openingBalance|opening_balance/);
  assert.doesNotMatch(supplier, /currentPayable|current_payable|openingBalance|opening_balance/);
  assert.match(ledger, /customer_ledger_one_opening_balance_unique/);
  assert.match(ledger, /supplier_ledger_one_opening_balance_unique/);
  assert.match(ledger, /customer_ledger_source_unique/);
  assert.match(ledger, /supplier_ledger_source_unique/);
});

test("inventory keeps condition-separated balances and immutable movement source links", async () => {
  const inventory = await readSource(
    new URL("../src/database/schema/inventory.schema.ts", import.meta.url),
  );

  assert.match(inventory, /sellableQuantityOnHand/);
  assert.match(inventory, /damagedQuantityOnHand/);
  assert.match(inventory, /expiredQuantityOnHand/);
  assert.match(inventory, /weightedAverageCost/);
  assert.match(inventory, /stock_movements_source_pair_check/);
  assert.match(inventory, /stock_movements_quantity_positive_check/);
  assert.match(inventory, /inventory_balances_product_id_unique/);
});

test("purchase, sale, and return items keep direct product and product-unit UUID relationships", async () => {
  for (const file of ["purchase.schema.ts", "sales.schema.ts", "return.schema.ts"]) {
    const source = await readSource(
      new URL(`../src/database/schema/${file}`, import.meta.url),
    );

    assert.match(source, /productId:\s*uuid\("product_id"\)\.notNull\(\)/);
    assert.match(source, /productUnitId:\s*uuid\("product_unit_id"\)\.notNull\(\)/);
    assert.match(source, /foreignColumns:\s*\[products\.id\]/);
    assert.match(source, /foreignColumns:\s*\[productUnits\.id\]/);
  }
});

test("cash and bank records enforce exactly one account matching the method", async () => {
  const payments = await readSource(
    new URL("../src/database/schema/payment.schema.ts", import.meta.url),
  );
  const returns = await readSource(
    new URL("../src/database/schema/return.schema.ts", import.meta.url),
  );
  const expenses = await readSource(
    new URL("../src/database/schema/expense.schema.ts", import.meta.url),
  );

  for (const checkName of [
    "customer_payment_splits_account_check",
    "supplier_payment_splits_account_check",
    "cash_bank_movements_account_check",
    "cash_bank_transfers_source_account_check",
    "cash_bank_transfers_destination_account_check",
  ]) {
    assert.match(payments, new RegExp(checkName));
  }

  assert.match(returns, /sales_returns_refund_account_check/);
  assert.match(expenses, /expenses_account_check/);
});

test("payment allocations keep direct invoice and purchase foreign keys", async () => {
  const payments = await readSource(
    new URL("../src/database/schema/payment.schema.ts", import.meta.url),
  );

  assert.match(payments, /salesInvoiceId:\s*uuid\("sales_invoice_id"\)/);
  assert.match(payments, /references\(\(\) => salesInvoices\.id\)/);
  assert.match(payments, /supplier_payment_allocations_purchase_id_purchases_id_fk/);
});

test("idempotency, import jobs, audit logs, and row errors are persisted", async () => {
  const system = await readSource(
    new URL("../src/database/schema/system.schema.ts", import.meta.url),
  );

  assert.match(system, /idempotency_requests/);
  assert.match(system, /requestHash/);
  assert.match(system, /responseStatus/);
  assert.match(system, /responseBody/);
  assert.match(system, /expiresAt/);
  assert.match(system, /import_jobs/);
  assert.match(system, /validatedData/);
  assert.match(system, /import_job_errors/);
  assert.match(system, /rawRow/);
  assert.match(system, /audit_logs/);
  assert.match(system, /requestId/);
  assert.match(system, /beforeData/);
  assert.match(system, /afterData/);
});

test("database schema contains no excluded version-one business areas", async () => {
  const schemas = (await readAllSchemas()).toLowerCase();

  for (const excluded of [
    "delivery_routes",
    "drivers",
    "vehicles",
    "warehouses",
    "roles",
    "permissions",
    "crm_leads",
    "cheques",
  ]) {
    assert.doesNotMatch(schemas, new RegExp(`pgTable\\(\\s*["']${excluded}["']`));
  }
});

test("migration journal and SQL files contain the complete current chain", async () => {
  const sqlFiles = (await listNames(drizzleDirectory)).filter((name) =>
    /^\d{4}_.+\.sql$/.test(name),
  );
  const journal = JSON.parse(await readSource(journalUrl)) as {
    entries: Array<{ idx: number; tag: string }>;
  };

  assert.equal(sqlFiles.length, 26);
  assert.equal(journal.entries.length, 26);

  for (let index = 0; index < 26; index += 1) {
    const prefix = String(index).padStart(4, "0");
    assert.equal(sqlFiles[index]?.startsWith(prefix), true);
    assert.equal(journal.entries[index]?.idx, index);
    assert.equal(journal.entries[index]?.tag, sqlFiles[index]?.replace(/\.sql$/, ""));
  }
});

test("migration documentation lists the complete current migration chain", async () => {
  const readme = await readSource(new URL("../drizzle/README.md", import.meta.url));

  for (let index = 0; index < 26; index += 1) {
    const prefix = String(index).padStart(4, "0");
    assert.equal(readme.includes("`" + prefix + "_"), true);
  }

  assert.doesNotMatch(readme, /Module 12 work in progress/i);
});
