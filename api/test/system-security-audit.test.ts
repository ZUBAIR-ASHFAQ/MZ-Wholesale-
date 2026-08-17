import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/** Reads one source file used by the Module 15 security audit. */
async function readSource(path: URL): Promise<string> {
  return readFile(path, "utf8");
}

test("all System routes remain authenticated and there is no restore API", async () => {
  const routes = await readSource(
    new URL("../src/modules/system/system.routes.ts", import.meta.url),
  );

  assert.equal((routes.match(/preHandler:\s*app\.authenticate/g) ?? []).length, 7);
  assert.equal(/\/system\/restore/i.test(routes), false);
  assert.equal(/app\.(put|patch|delete)\(/.test(routes), false);
});

test("import upload enforces one CSV file, strict size limits and safe filenames", async () => {
  const routes = await readSource(
    new URL("../src/modules/system/system.routes.ts", import.meta.url),
  );
  const service = await readSource(
    new URL("../src/modules/system/system.service.ts", import.meta.url),
  );

  assert.match(routes, /MAX_IMPORT_FILE_BYTES = 5 \* 1024 \* 1024/);
  assert.match(routes, /files:\s*1/);
  assert.match(routes, /fields:\s*0/);
  assert.match(routes, /parts:\s*1/);
  assert.match(routes, /CSV_MIME_TYPES\.has/);
  assert.match(routes, /sanitizeImportFileName\(part\.filename\)/);
  assert.ok(routes.includes('fileName.replace(/\\\\/g, "/")'));
  assert.match(service, /fileName\.toLowerCase\(\)\.endsWith\("\.csv"\)/);
  assert.match(service, /content\.includes\(0\)/);
});

test("System financial/data confirmation requires bounded idempotency keys", async () => {
  const routes = await readSource(
    new URL("../src/modules/system/system.routes.ts", import.meta.url),
  );
  const schema = await readSource(
    new URL("../src/modules/system/system.schema.ts", import.meta.url),
  );

  assert.match(routes, /systemIdempotencyHeadersSchema/);
  assert.match(routes, /executeIdempotentMutation\(/);
  assert.match(routes, /createImportFileHash\(file\.content\)/);
  assert.match(schema, /max\(200, "Idempotency-Key must be 200 characters or fewer\."\)/);
});

test("export filters are strict and CSV neutralizes spreadsheet formulas", async () => {
  const schema = await readSource(
    new URL("../src/modules/system/system.schema.ts", import.meta.url),
  );
  const service = await readSource(
    new URL("../src/modules/system/system.service.ts", import.meta.url),
  );

  assert.match(schema, /systemExportQuerySchema[\s\S]*?\.strict\(\)/);
  assert.match(schema, /z\.enum\(\["csv", "xlsx", "pdf"\]\)/);
  assert.match(service, /sanitizeSpreadsheetText/);
  assert.match(service, /\^\[=\+@-\]/);
  assert.match(service, /isSignedNumber/);
});

test("audit persistence centrally redacts secret-like fields", async () => {
  const service = await readSource(
    new URL("../src/modules/system/system.service.ts", import.meta.url),
  );

  assert.match(service, /sensitiveAuditKeyPattern/);
  assert.match(service, /password\|token\|secret\|cookie\|authorization\|csrf/i);
  assert.match(service, /"\[REDACTED\]"/);
  assert.match(service, /beforeData:\s*sanitizeAuditValue\(beforeData\)/);
  assert.match(service, /afterData:\s*sanitizeAuditValue\(afterData\)/);
});

test("deployment restore remains explicit, encrypted and server-side only", async () => {
  const backup = await readSource(
    new URL("../../deployment/backup-postgres.sh", import.meta.url),
  );
  const restore = await readSource(
    new URL("../../deployment/restore-postgres.sh", import.meta.url),
  );
  const verify = await readSource(
    new URL("../../deployment/verify-backup-restore.sh", import.meta.url),
  );

  assert.match(backup, /-aes-256-cbc/);
  assert.match(backup, /-pbkdf2/);
  assert.match(backup, /BACKUP_REMOTE_TARGET/);
  assert.match(restore, /ALLOW_DATABASE_RESTORE:-.*!= "yes"/);
  assert.match(restore, /RESTORE_DATABASE_URL/);
  assert.match(verify, /DATABASE_URL.*RESTORE_DATABASE_URL.*different databases/);
});

test("idempotency replay does not create duplicate business audit rows", async () => {
  const helper = await readSource(
    new URL("../src/shared/http/idempotency.ts", import.meta.url),
  );
  const inventory = await readSource(
    new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url),
  );
  const payments = await readSource(
    new URL("../src/modules/payments/payments.routes.ts", import.meta.url),
  );
  const purchases = await readSource(
    new URL("../src/modules/purchases/purchases.routes.ts", import.meta.url),
  );
  const sales = await readSource(
    new URL("../src/modules/sales/sales.routes.ts", import.meta.url),
  );
  const returns = await readSource(
    new URL("../src/modules/returns/returns.routes.ts", import.meta.url),
  );
  const expenses = await readSource(
    new URL("../src/modules/expenses/expenses.routes.ts", import.meta.url),
  );
  const system = await readSource(
    new URL("../src/modules/system/system.routes.ts", import.meta.url),
  );

  assert.match(helper, /replayed:\s*true/);
  assert.match(helper, /replayed:\s*false/);
  assert.match(inventory, /if \(!response\.replayed\)/);
  assert.match(purchases, /if \(!response\.replayed\)/);
  assert.match(sales, /if \(!response\.replayed\)/);
  assert.match(returns, /if \(!response\.replayed\)/);
  assert.match(payments, /return response\.replayed/);
  assert.match(payments, /if \(!replayed\)/);
  assert.match(expenses, /return response\.replayed/);
  assert.match(expenses, /if \(!replayed\)/);

  // System import audit writes stay inside the idempotent operation itself,
  // so a replay returns before those audit writes are reached.
  assert.match(system, /executeIdempotentMutation\([\s\S]*?recordAuditLog\(\s*transaction/);
});
