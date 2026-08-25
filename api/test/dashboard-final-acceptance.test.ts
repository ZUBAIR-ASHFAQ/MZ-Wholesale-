import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const backendDirectory = new URL("../src/modules/dashboard/", import.meta.url);
const frontendDirectory = new URL(
  "../../web-admin/src/features/dashboard/",
  import.meta.url,
);

/** Reads one UTF-8 source file used by the Dashboard final acceptance audit. */
async function readSource(path: URL): Promise<string> {
  return readFile(path, "utf8");
}

/** Returns sorted names from one audited directory. */
async function listNames(path: URL): Promise<string[]> {
  return (await readdir(path)).sort();
}

test("final acceptance keeps the approved five-file Dashboard backend structure", async () => {
  assert.deepEqual(await listNames(backendDirectory), [
    "dashboard.repository.ts",
    "dashboard.routes.ts",
    "dashboard.schema.ts",
    "dashboard.service.ts",
    "index.ts",
  ]);

  const frontendEntries = await listNames(frontendDirectory);
  for (const directory of ["api", "components", "hooks", "pages"]) {
    assert.ok(frontendEntries.includes(directory), `${directory} must exist`);
  }
});

test("final acceptance exposes exactly the two approved authenticated GET routes", async () => {
  const routes = await readSource(
    new URL("../src/modules/dashboard/dashboard.routes.ts", import.meta.url),
  );

  assert.equal((routes.match(/app\.get\(/g) ?? []).length, 2);
  assert.equal(/app\.(post|put|patch|delete)\(/.test(routes), false);
  assert.match(routes, /"\/dashboard\/overview"/);
  assert.match(routes, /"\/dashboard\/low-stock"/);
  assert.equal((routes.match(/privateDashboardRoute\(app,/g) ?? []).length, 2);
  assert.match(routes, /app\.authenticate/);
});

test("final acceptance keeps Dashboard repository read-only and uses approved source rules", async () => {
  const repository = await readSource(
    new URL("../src/modules/dashboard/dashboard.repository.ts", import.meta.url),
  );

  assert.equal(/\.(insert|update|delete)\(/.test(repository), false);
  assert.match(repository, /eq\(salesInvoices\.status, "CONFIRMED"\)/);
  assert.match(repository, /eq\(purchases\.status, "CONFIRMED"\)/);
  assert.match(repository, /eq\(salesReturns\.status, "CONFIRMED"\)/);
  assert.match(repository, /customerLedgerEntries\.debit/);
  assert.match(repository, /customerLedgerEntries\.credit/);
  assert.match(repository, /supplierLedgerEntries\.credit/);
  assert.match(repository, /supplierLedgerEntries\.debit/);
  assert.match(repository, /inventoryBalances\.sellableQuantityOnHand/);
  assert.match(repository, /products\.reorderLevel/);
  assert.match(repository, /cashBankMovements/);
  assert.match(repository, /reversalOfExpenseId/);
  assert.match(repository, /unitCostSnapshot/);
});

test("final acceptance keeps Dashboard service as simple read-only orchestration", async () => {
  const service = await readSource(
    new URL("../src/modules/dashboard/dashboard.service.ts", import.meta.url),
  );

  assert.match(service, /Asia\/Karachi/);
  assert.match(service, /Promise\.all\(/);
  assert.match(service, /getDashboardOverview/);
  assert.match(service, /getDashboardLowStock/);
  assert.equal(/\.(insert|update|delete)\(/.test(service), false);
});

test("final acceptance keeps Dashboard validation limited to optional date and positive page", async () => {
  const schema = await readSource(
    new URL("../src/modules/dashboard/dashboard.schema.ts", import.meta.url),
  );

  assert.match(schema, /date: dateSchema\.optional\(\)/);
  assert.match(schema, /z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.default\(1\)/);
  assert.ok((schema.match(/\.strict\(\)/g) ?? []).length >= 2);
});

test("final acceptance keeps frontend API, hooks, page, route, and navigation connected", async () => {
  const [api, hooks, page, router, layout] = await Promise.all([
    readSource(
      new URL(
        "../../web-admin/src/features/dashboard/api/dashboard.api.ts",
        import.meta.url,
      ),
    ),
    readSource(
      new URL(
        "../../web-admin/src/features/dashboard/hooks/use-dashboard.ts",
        import.meta.url,
      ),
    ),
    readSource(
      new URL(
        "../../web-admin/src/features/dashboard/pages/dashboard-page.tsx",
        import.meta.url,
      ),
    ),
    readSource(new URL("../../web-admin/src/app/router.tsx", import.meta.url)),
    readSource(
      new URL("../../web-admin/src/app/layouts/app-layout.tsx", import.meta.url),
    ),
  ]);

  assert.match(api, /loadDashboardOverview/);
  assert.match(api, /loadDashboardLowStock/);
  assert.match(api, /\/dashboard\/overview/);
  assert.match(api, /\/dashboard\/low-stock/);
  assert.match(hooks, /useDashboardOverview/);
  assert.match(hooks, /useDashboardLowStock/);
  assert.equal(/useMutation/.test(hooks), false);
  assert.match(page, /DashboardSummaryCards/);
  assert.match(page, /DashboardLowStockTable/);
  assert.match(page, /DashboardRecentSales/);
  assert.match(page, /DashboardRecentPurchases/);
  assert.match(router, /path: ["']\/dashboard["']/);
  assert.match(layout, /to=["']\/dashboard["']/);
});

test("final acceptance adds no Dashboard database schema or migration", async () => {
  const schemaIndex = await readSource(
    new URL("../src/database/schema/index.ts", import.meta.url),
  );
  const drizzleDirectory = new URL("../drizzle/", import.meta.url);
  const migrations = (await readdir(drizzleDirectory)).join("\n");

  assert.equal(/dashboard/i.test(schemaIndex), false);
  assert.equal(/dashboard/i.test(migrations), false);
});
