import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/** Reads one System source file used by the import-validation acceptance tests. */
async function readSystemSource(fileName: string): Promise<string> {
  return readFile(new URL(`../src/modules/system/${fileName}`, import.meta.url), "utf8");
}

test("System accepts only the five approved import types", async () => {
  const schema = await readSystemSource("system.schema.ts");

  for (const type of [
    "products",
    "customers",
    "suppliers",
    "opening-stock",
    "opening-balances",
  ]) {
    assert.ok(schema.includes(`"${type}"`), `${type} must be an approved import type`);
  }

  assert.match(schema, /systemImportTypeSchema\s*=\s*z\.enum\(/);
});

test("import upload rejects unsupported type and unsafe file input", async () => {
  const routes = await readSystemSource("system.routes.ts");

  assert.match(routes, /"UNSUPPORTED_IMPORT_TYPE"/);
  assert.match(routes, /"INVALID_FILE_FORMAT"/);
  assert.match(routes, /MAX_IMPORT_FILE_BYTES\s*=\s*5\s*\*\s*1024\s*\*\s*1024/);
  assert.match(routes, /Only CSV import files are supported/);
  assert.match(routes, /The import file must be 5 MB or smaller/);
  assert.match(routes, /request\.isMultipart\(\)/);
});

test("CSV parser validates headers and malformed rows before business validation", async () => {
  const service = await readSystemSource("system.service.ts");

  assert.match(service, /CSV column names cannot be blank/);
  assert.match(service, /CSV column names must be unique/);
  assert.match(service, /contains an unclosed quoted value/);
  assert.match(service, /has \$\{row\.length\} columns; \$\{headers\.length\} are required/);
  assert.match(service, /The uploaded CSV file is empty/);
});

test("product validation covers required columns and core product rules", async () => {
  const service = await readSystemSource("system.service.ts");

  for (const code of [
    "MISSING_COLUMN",
    "UNSUPPORTED_COLUMN",
    "DUPLICATE_SKU",
    "DUPLICATE_BARCODE",
    "INVALID_REORDER_LEVEL",
    "INVALID_UNIT_CONVERSION",
    "INVALID_BASE_UNIT_COUNT",
    "INVALID_BASE_UNIT_CONVERSION",
    "DUPLICATE_PRODUCT_UNIT",
    "CATEGORY_NOT_FOUND",
    "CATEGORY_INACTIVE",
    "BRAND_NOT_FOUND",
    "BRAND_INACTIVE",
  ]) {
    assert.ok(service.includes(`"${code}"`), `${code} must be enforced for product imports`);
  }
});

test("customer validation covers identity, contact and credit rules", async () => {
  const service = await readSystemSource("system.service.ts");

  for (const code of [
    "DUPLICATE_CUSTOMER_CODE",
    "SYSTEM_CUSTOMER_PROTECTED",
    "INVALID_PHONE",
    "INVALID_EMAIL",
    "INVALID_CREDIT_LIMIT",
  ]) {
    assert.ok(service.includes(`"${code}"`), `${code} must be enforced for customer imports`);
  }

  assert.match(service, /Customer name is required/);
});

test("supplier validation covers identity and contact rules", async () => {
  const service = await readSystemSource("system.service.ts");

  assert.match(service, /DUPLICATE_SUPPLIER_CODE/);
  assert.match(service, /Supplier name is required/);
  assert.match(service, /INVALID_PHONE/);
  assert.match(service, /INVALID_EMAIL/);
});

test("opening stock validation protects inventory invariants", async () => {
  const service = await readSystemSource("system.service.ts");

  for (const code of [
    "PRODUCT_NOT_FOUND",
    "PRODUCT_INACTIVE",
    "INVALID_STOCK_CONDITION",
    "INVALID_QUANTITY",
    "INVALID_UNIT_COST",
    "DUPLICATE_OPENING_STOCK_ROW",
    "OPENING_STOCK_LOCKED",
  ]) {
    assert.ok(service.includes(`"${code}"`), `${code} must be enforced for opening-stock imports`);
  }

  assert.match(service, /SELLABLE/);
  assert.match(service, /DAMAGED/);
  assert.match(service, /EXPIRED/);
});

test("opening balance validation protects ledger setup rules", async () => {
  const service = await readSystemSource("system.service.ts");

  for (const code of [
    "INVALID_PARTY_TYPE",
    "INVALID_OPENING_BALANCE",
    "DUPLICATE_OPENING_BALANCE_ROW",
    "OPENING_IMPORT_LOCKED",
    "CUSTOMER_NOT_FOUND",
    "SUPPLIER_NOT_FOUND",
    "OPENING_BALANCE_EXISTS",
    "SYSTEM_CUSTOMER_PROTECTED",
  ]) {
    assert.ok(service.includes(`"${code}"`), `${code} must be enforced for opening-balance imports`);
  }

  assert.match(service, /Party type must be CUSTOMER or SUPPLIER/);
});

test("customer and supplier import contracts exclude removed Tax ID", async () => {
  const service = await readSystemSource("system.service.ts");
  const templatesStart = service.indexOf("const importTemplateColumns");
  const templatesEnd = service.indexOf("/** Builds a header-only CSV template", templatesStart);
  const templates = service.slice(templatesStart, templatesEnd);

  const customerStart = templates.indexOf("customers: [");
  const supplierStart = templates.indexOf("suppliers: [");
  const openingStockStart = templates.indexOf('"opening-stock": [');
  const customerTemplate = templates.slice(customerStart, supplierStart);
  const supplierTemplate = templates.slice(supplierStart, openingStockStart);

  assert.doesNotMatch(customerTemplate, /"taxId"/);
  assert.doesNotMatch(supplierTemplate, /"taxId"/);
});

test("validation persists row-level errors and uses VALIDATED or FAILED status", async () => {
  const service = await readSystemSource("system.service.ts");

  assert.match(service, /errors\.length === 0 \? "VALIDATED" : "FAILED"/);
  assert.match(service, /createImportJobErrors\(/);
  assert.match(service, /rowNumber:\s*error\.rowNumber/);
  assert.match(service, /columnName:\s*error\.columnName/);
  assert.match(service, /errorCode:\s*error\.errorCode/);
  assert.match(service, /message:\s*error\.message/);
  assert.match(service, /rawRow:\s*error\.rawRow/);
});

test("validation-only upload does not commit operational business records", async () => {
  const service = await readSystemSource("system.service.ts");
  const start = service.indexOf("export async function validateImportFile");
  assert.notEqual(start, -1);

  const validationFunction = service.slice(start, service.indexOf("\n}", start) + 2);

  assert.match(validationFunction, /validateProductImport/);
  assert.match(validationFunction, /validateCustomerImport/);
  assert.match(validationFunction, /validateSupplierImport/);
  assert.match(validationFunction, /validateOpeningStockImport/);
  assert.match(validationFunction, /validateOpeningBalanceImport/);
  assert.equal(/confirmImport|createImported|recordOpeningStockItem|writeCustomerDebit|writeSupplierCredit/.test(validationFunction), false);
});

test("validation results retain the approved normalized rows only for successful confirmation", async () => {
  const service = await readSystemSource("system.service.ts");

  const snapshots = service.match(/validatedData:\s*status === "VALIDATED" \? parsed\.rows : null/g) ?? [];
  assert.ok(snapshots.length >= 4, "successful validators must persist their normalized confirmation snapshot");
});
