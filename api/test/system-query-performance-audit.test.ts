import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repositoryUrl = new URL(
  "../src/modules/system/system.repository.ts",
  import.meta.url,
);
const serviceUrl = new URL(
  "../src/modules/system/system.service.ts",
  import.meta.url,
);
const systemSchemaUrl = new URL(
  "../src/database/schema/system.schema.ts",
  import.meta.url,
);

/** Reads one source file used by the System performance audit. */
async function readSource(path: URL): Promise<string> {
  return readFile(path, "utf8");
}

/** Returns one named source section so each audit stays focused. */
function sourceSection(source: string, start: string, end?: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing source section: ${start}`);

  if (!end) return source.slice(startIndex);

  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing source section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("import history loads page rows and total count concurrently", async () => {
  const repository = await readSource(repositoryUrl);
  const section = sourceSection(
    repository,
    "export async function listImportJobs",
    "export async function listAuditLogs",
  );

  assert.match(section, /const \[items, totalRows\] = await Promise\.all\(\[/);
  assert.match(section, /\.limit\(query\.pageSize\)/);
  assert.match(section, /\.offset\(offset\)/);
});

test("audit history loads page rows and total count concurrently", async () => {
  const repository = await readSource(repositoryUrl);
  const section = sourceSection(
    repository,
    "export async function listAuditLogs",
    "export async function updateImportJobStatus",
  );

  assert.match(section, /const \[items, totalRows\] = await Promise\.all\(\[/);
  assert.match(section, /\.limit\(query\.pageSize\)/);
  assert.match(section, /\.offset\(offset\)/);
});

test("row-level import validation errors are inserted in one batch", async () => {
  const repository = await readSource(repositoryUrl);
  const section = sourceSection(
    repository,
    "export async function createImportJobErrors",
    "export async function getImportJobErrors",
  );

  assert.match(section, /database\.insert\(importJobErrors\)\.values\(errors\)/);
  assert.doesNotMatch(section, /for\s*\(|forEach\s*\(|\.map\s*\(\s*async/);
});

test("import validation reference data uses set-based reads rather than per-row queries", async () => {
  const repository = await readSource(repositoryUrl);
  const validationReferences = sourceSection(
    repository,
    "export async function getProductImportReferenceData",
  );

  assert.match(validationReferences, /await Promise\.all\(\[/);
  assert.doesNotMatch(validationReferences, /for\s*\([^)]*\)\s*\{[^}]*database\./s);
  assert.doesNotMatch(validationReferences, /\.map\s*\(\s*async[^)]*database\./s);
});

test("opening-data reference reads group repeated movement and ledger party IDs in SQL", async () => {
  const repository = await readSource(repositoryUrl);

  const stock = sourceSection(
    repository,
    "export async function getOpeningStockImportReferenceData",
    "export async function getOpeningBalanceImportReferenceData",
  );
  const balances = sourceSection(
    repository,
    "export async function getOpeningBalanceImportReferenceData",
  );

  assert.match(stock, /\.groupBy\(stockMovements\.productId\)/);
  assert.match(balances, /\.groupBy\(customerLedgerEntries\.customerId\)/);
  assert.match(balances, /\.groupBy\(supplierLedgerEntries\.supplierId\)/);
});

test("multi-page exports fetch remaining independent pages concurrently after page one", async () => {
  const service = await readSource(serviceUrl);

  for (const [start, end] of [
    ["async function getAllCustomerOutstandingRows", "async function getAllSupplierPayableRows"],
    ["async function getAllSupplierPayableRows", "async function getAllProductProfitRows"],
    ["async function getAllProductProfitRows", "export async function getSystemExportSource"],
  ] as const) {
    const section = sourceSection(service, start, end);
    assert.match(section, /Math\.ceil\(first\.total \/ EXPORT_PAGE_SIZE\)/);
    assert.match(section, /await Promise\.all\(/);
    assert.doesNotMatch(section, /for \(let page = 2;[\s\S]*await get/);
  }
});

test("large exports stay bounded by report pagination and do not introduce queues or caches", async () => {
  const service = await readSource(serviceUrl);

  assert.match(service, /const EXPORT_PAGE_SIZE = 100;/);
  assert.doesNotMatch(service, /redis|bullmq|websocket|worker_threads|materialized view/i);
});

test("System list queries have supporting import and audit indexes", async () => {
  const schema = await readSource(systemSchemaUrl);

  assert.match(schema, /index\("import_jobs_type_status_index"\)\.on\(table\.type, table\.status\)/);
  assert.match(schema, /index\("import_jobs_started_at_index"\)\.on\(table\.startedAt\)/);
  assert.match(schema, /index\("import_job_errors_job_row_index"\)\.on\(/);
  assert.match(schema, /index\("audit_logs_created_at_index"\)\.on\(table\.createdAt\)/);
  assert.match(schema, /index\("audit_logs_action_created_at_index"\)\.on\(table\.action, table\.createdAt\)/);
  assert.match(schema, /index\("audit_logs_entity_created_at_index"\)\.on\(table\.entity, table\.createdAt\)/);
});
