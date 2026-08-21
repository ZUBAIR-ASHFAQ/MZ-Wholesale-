import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

type Route = readonly [method: string, path: string];

const modulesRoot = new URL("../src/modules/", import.meta.url);
const appUrl = new URL("../src/app.ts", import.meta.url);

const expectedRoutes: Record<string, readonly Route[]> = {
  "business-settings": [
    ["GET", "/business-settings"],
    ["PATCH", "/business-settings"],
  ],
  auth: [
    ["POST", "/auth/login"],
    ["POST", "/auth/refresh"],
    ["POST", "/auth/logout"],
    ["GET", "/auth/me"],
    ["GET", "/auth/sessions"],
    ["DELETE", "/auth/sessions/:id"],
    ["POST", "/auth/logout-all"],
    ["POST", "/auth/change-password"],
  ],
  products: [
    ["GET", "/products"],
    ["POST", "/products"],
    ["GET", "/products/:id"],
    ["PATCH", "/products/:id"],
    ["GET", "/product-categories"],
    ["POST", "/product-categories"],
    ["PATCH", "/product-categories/:id"],
    ["GET", "/brands"],
    ["POST", "/brands"],
    ["PATCH", "/brands/:id"],
  ],
  customers: [
    ["GET", "/customers"],
    ["POST", "/customers"],
    ["GET", "/customers/:id"],
    ["PATCH", "/customers/:id"],
    ["GET", "/customers/:customerId/open-invoices"],
  ],
  suppliers: [
    ["GET", "/suppliers"],
    ["POST", "/suppliers"],
    ["GET", "/suppliers/:id"],
    ["PATCH", "/suppliers/:id"],
    ["GET", "/suppliers/:supplierId/open-purchases"],
  ],
  employees: [
    ["GET", "/salary-payments"],
    ["POST", "/salary-payments"],
    ["GET", "/salary-payments/:id"],
    ["POST", "/salary-payments/:id/reverse"],
    ["GET", "/payroll-runs"],
    ["POST", "/payroll-runs"],
    ["GET", "/payroll-runs/:id"],
    ["PATCH", "/payroll-runs/:id"],
    ["POST", "/payroll-runs/:id/confirm"],
    ["GET", "/leave-types"],
    ["POST", "/leave-types"],
    ["PATCH", "/leave-types/:id"],
    ["GET", "/employee-leaves"],
    ["POST", "/employee-leaves"],
    ["PATCH", "/employee-leaves/:id"],
    ["GET", "/employee-advances"],
    ["POST", "/employee-advances"],
    ["POST", "/employee-advances/:id/recover"],
    ["GET", "/employees"],
    ["POST", "/employees"],
    ["POST", "/employees/attendance"],
    ["POST", "/employees/attendance/bulk"],
    ["GET", "/employees/:id/attendance"],
    ["GET", "/employees/:id"],
    ["PATCH", "/employees/:id"],
  ],
  inventory: [
    ["GET", "/inventory/stock"],
    ["GET", "/inventory/products/:productId/movements"],
    ["POST", "/inventory/opening-stock"],
    ["POST", "/inventory/adjustments"],
    ["GET", "/inventory/counts"],
    ["POST", "/inventory/counts"],
    ["GET", "/inventory/counts/:id"],
    ["PATCH", "/inventory/counts/:id"],
    ["POST", "/inventory/counts/:id/confirm"],
  ],
  ledgers: [
    ["GET", "/ledgers/customers/:customerId"],
    ["GET", "/ledgers/suppliers/:supplierId"],
    ["GET", "/ledgers/customer-outstanding"],
    ["GET", "/ledgers/supplier-payables"],
  ],
  payments: [
    ["GET", "/payments/accounts"],
    ["POST", "/payments/cash-accounts"],
    ["PATCH", "/payments/cash-accounts/:id"],
    ["POST", "/payments/bank-accounts"],
    ["PATCH", "/payments/bank-accounts/:id"],
    ["GET", "/payments/customer-receipts"],
    ["POST", "/payments/customer-receipts"],
    ["GET", "/payments/customer-receipts/:id"],
    ["POST", "/payments/customer-receipts/:id/reverse"],
    ["GET", "/payments/supplier-payments"],
    ["POST", "/payments/supplier-payments"],
    ["GET", "/payments/supplier-payments/:id"],
    ["POST", "/payments/supplier-payments/:id/reverse"],
    ["GET", "/payments/daily-cash-summary"],
    ["GET", "/payments/cash-bank-movements"],
    ["GET", "/payments/transfers"],
    ["POST", "/payments/transfers"],
    ["GET", "/payments/transfers/:id"],
    ["GET", "/payments/cash-reconciliations"],
    ["POST", "/payments/cash-reconciliations"],
    ["PATCH", "/payments/cash-reconciliations/:id"],
    ["POST", "/payments/cash-reconciliations/:id/confirm"],
  ],
  purchases: [
    ["GET", "/purchases"],
    ["POST", "/purchases"],
    ["GET", "/purchases/:id"],
    ["PATCH", "/purchases/:id/draft"],
    ["POST", "/purchases/:id/confirm"],
    ["POST", "/purchases/:id/cancel"],
  ],
  sales: [
    ["GET", "/sales"],
    ["POST", "/sales"],
    ["GET", "/sales/:id"],
    ["PATCH", "/sales/:id/draft"],
    ["POST", "/sales/:id/confirm"],
    ["POST", "/sales/:id/cancel"],
  ],
  returns: [
    ["GET", "/sales-returns"],
    ["POST", "/sales-returns"],
    ["GET", "/sales-returns/:id"],
    ["GET", "/purchase-returns"],
    ["POST", "/purchase-returns"],
    ["GET", "/purchase-returns/:id"],
  ],
  expenses: [
    ["GET", "/expense-categories"],
    ["POST", "/expense-categories"],
    ["PATCH", "/expense-categories/:id"],
    ["GET", "/expenses"],
    ["POST", "/expenses"],
    ["GET", "/expenses/:id"],
    ["POST", "/expenses/:id/reverse"],
  ],
  reports: [
    ["GET", "/reports/sales"],
    ["GET", "/reports/purchases"],
    ["GET", "/reports/inventory"],
    ["GET", "/reports/inventory-valuation"],
    ["GET", "/reports/customers/aging"],
    ["GET", "/reports/suppliers/aging"],
    ["GET", "/reports/customers/outstanding"],
    ["GET", "/reports/suppliers/payable"],
    ["GET", "/reports/cash-bank"],
    ["GET", "/reports/expenses"],
    ["GET", "/reports/profit-summary"],
    ["GET", "/reports/product-profit"],
    ["GET", "/reports/employees/register"],
    ["GET", "/reports/employees/attendance"],
    ["GET", "/reports/employees/payroll"],
    ["GET", "/reports/employees/salary-payable"],
    ["GET", "/reports/employees/advance-outstanding"],
    ["GET", "/reports/employees/labor-cost"],
  ],
  dashboard: [
    ["GET", "/dashboard/overview"],
    ["GET", "/dashboard/low-stock"],
  ],
  system: [
    ["GET", "/system/import-templates/:type"],
    ["POST", "/system/imports/:type"],
    ["GET", "/system/imports"],
    ["GET", "/system/imports/:id"],
    ["POST", "/system/imports/:id/confirm"],
    ["GET", "/system/audit-logs"],
    ["GET", "/system/exports/:type"],
  ],
};

/** Reads the route declarations from one module route file. */
async function readModuleRoutes(moduleName: string): Promise<Route[]> {
  const source = await readFile(
    new URL(`${moduleName}/${moduleName}.routes.ts`, modulesRoot),
    "utf8",
  );

  const routes: Route[] = [];
  const routePattern = /app\.(get|post|patch|put|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g;

  for (const match of source.matchAll(routePattern)) {
    routes.push([match[1].toUpperCase(), match[2]]);
  }

  return routes;
}

/** Sorts routes so declaration order does not affect the contract audit. */
function sortRoutes(routes: readonly Route[]): Route[] {
  return [...routes].sort(([methodA, pathA], [methodB, pathB]) =>
    `${pathA}:${methodA}`.localeCompare(`${pathB}:${methodB}`),
  );
}

for (const [moduleName, expected] of Object.entries(expectedRoutes)) {
  test(`${moduleName} exposes exactly the approved routes`, async () => {
    const actual = await readModuleRoutes(moduleName);
    assert.deepEqual(sortRoutes(actual), sortRoutes(expected));
  });
}

test("the API exposes the approved public /health readiness route", async () => {
  const source = await readFile(appUrl, "utf8");

  assert.match(source, /app\.get\(\s*["'`]\/health["'`]/);
  assert.match(source, /Public|public/);
});

test("business modules avoid DELETE or PUT except the approved Auth session revoke", async () => {
  for (const moduleName of Object.keys(expectedRoutes)) {
    const routes = await readModuleRoutes(moduleName);

    if (moduleName === "auth") {
      const destructiveRoutes = routes.filter(
        ([method]) => method === "DELETE" || method === "PUT",
      );
      assert.deepEqual(destructiveRoutes, [["DELETE", "/auth/sessions/:id"]]);
      continue;
    }

    assert.equal(
      routes.some(([method]) => method === "DELETE" || method === "PUT"),
      false,
    );
  }
});

test("ledger APIs remain read-only", async () => {
  const routes = await readModuleRoutes("ledgers");
  assert.equal(routes.every(([method]) => method === "GET"), true);
});

test("reports and dashboard remain read-only", async () => {
  for (const moduleName of ["reports", "dashboard"]) {
    const routes = await readModuleRoutes(moduleName);
    assert.equal(routes.every(([method]) => method === "GET"), true);
  }
});

test("System exposes no public database restore route", async () => {
  const routes = await readModuleRoutes("system");
  assert.equal(routes.some(([, path]) => path.toLowerCase().includes("restore")), false);
});

test("master-data modules use PATCH/deactivation instead of DELETE", async () => {
  for (const moduleName of [
    "business-settings",
    "products",
    "customers",
    "suppliers",
    "expenses",
    "employees",
  ]) {
    const routes = await readModuleRoutes(moduleName);
    assert.equal(routes.some(([method]) => method === "DELETE"), false);
  }
});

test("financial mutation route files require authenticated private route configuration", async () => {
  for (const moduleName of [
    "inventory",
    "payments",
    "purchases",
    "sales",
    "returns",
    "expenses",
    "system",
  ]) {
    const source = await readFile(
      new URL(`${moduleName}/${moduleName}.routes.ts`, modulesRoot),
      "utf8",
    );

    assert.match(source, /authenticate|privateRoute|privateMutationRoute|privateReadRoute/);
  }
});
