import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/** Reads one project source file used by the final System route audit. */
async function readSource(path: URL): Promise<string> {
  return readFile(path, "utf8");
}

test("System exposes exactly the seven approved Module 15 routes", async () => {
  const routes = await readSource(
    new URL("../src/modules/system/system.routes.ts", import.meta.url),
  );

  const routePaths = [
    "/system/import-templates/:type",
    "/system/imports/:type",
    "/system/imports",
    "/system/imports/:id",
    "/system/imports/:id/confirm",
    "/system/audit-logs",
    "/system/exports/:type",
  ];

  assert.equal((routes.match(/app\.get\(/g) ?? []).length, 5);
  assert.equal((routes.match(/app\.post\(/g) ?? []).length, 2);
  assert.equal(/app\.(put|patch|delete)\(/.test(routes), false);

  for (const routePath of routePaths) {
    assert.ok(routes.includes(`"${routePath}"`), `${routePath} must exist`);
  }

  assert.equal(/\/system\/restore/.test(routes), false);
});

test("all System routes require the active admin session", async () => {
  const routes = await readSource(
    new URL("../src/modules/system/system.routes.ts", import.meta.url),
  );

  assert.equal((routes.match(/preHandler:\s*app\.authenticate/g) ?? []).length, 7);
});

test("both System POST routes document mutation security", async () => {
  const routes = await readSource(
    new URL("../src/modules/system/system.routes.ts", import.meta.url),
  );

  const mutationSecurityUses = routes.match(/security:\s*openApiMutationSecurity/g) ?? [];
  assert.equal(mutationSecurityUses.length, 2);
});

test("import validation requires Idempotency-Key and hashes the uploaded file", async () => {
  const routes = await readSource(
    new URL("../src/modules/system/system.routes.ts", import.meta.url),
  );

  assert.match(routes, /parseSystemValue\(systemIdempotencyHeadersSchema, request\.headers\)/);
  assert.match(routes, /createImportFileHash\(file\.content\)/);
  assert.match(routes, /importType:\s*params\.type/);
  assert.match(routes, /fileName:\s*file\.fileName/);
  assert.match(routes, /fileHash/);
  assert.match(routes, /validateImportFile\(transaction, params\.type, parsed\)/);
});

test("export route maps invalid type or filters to the approved export error", async () => {
  const routes = await readSource(
    new URL("../src/modules/system/system.routes.ts", import.meta.url),
  );

  assert.match(routes, /"EXPORT_FILTER_INVALID"/);
  assert.match(routes, /systemExportTypeParamsSchema/);
  assert.match(routes, /systemExportQuerySchema/);
});

test("System route handlers stay HTTP-focused and delegate business work", async () => {
  const routes = await readSource(
    new URL("../src/modules/system/system.routes.ts", import.meta.url),
  );

  assert.equal(/drizzle-orm/.test(routes), false);
  assert.equal(/\.select\(|\.insert\(|\.delete\(/.test(routes), false);
  assert.match(routes, /getImportTemplate\(/);
  assert.match(routes, /validateImportFile\(/);
  assert.match(routes, /listSystemImports\(/);
  assert.match(routes, /getSystemImport\(/);
  assert.match(routes, /confirmImport\(/);
  assert.match(routes, /listSystemAuditLogs\(/);
  assert.match(routes, /getSystemExportSource\(/);
});
