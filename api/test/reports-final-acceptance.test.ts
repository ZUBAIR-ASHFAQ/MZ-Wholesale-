import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const backendDirectory = new URL("../src/modules/reports/", import.meta.url);
const frontendReportsDirectory = new URL(
  "../../web-admin/src/features/reports/",
  import.meta.url,
);
const frontendPagesDirectory = new URL(
  "../../web-admin/src/features/reports/pages/",
  import.meta.url,
);

/** Reads one UTF-8 source file used by the final Reports acceptance audit. */
async function readSource(path: URL): Promise<string> {
  return readFile(path, "utf8");
}

/** Returns sorted names from one audited directory. */
async function listNames(path: URL): Promise<string[]> {
  return (await readdir(path)).sort();
}

/** Returns every quoted /reports path found in source code. */
function reportPaths(source: string): string[] {
  return [...source.matchAll(/["'`](\/reports\/[^"'`?${}]+)["'`]/g)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));
}

const expectedReportPaths = [
  "/reports/cash-bank",
  "/reports/customers/outstanding",
  "/reports/employees/advance-outstanding",
  "/reports/employees/attendance",
  "/reports/employees/labor-cost",
  "/reports/employees/payroll",
  "/reports/employees/register",
  "/reports/employees/salary-payable",
  "/reports/expenses",
  "/reports/inventory",
  "/reports/inventory-valuation",
  "/reports/customers/aging",
  "/reports/product-profit",
  "/reports/profit-summary",
  "/reports/purchases",
  "/reports/sales",
  "/reports/suppliers/payable",
  "/reports/suppliers/aging",
].sort();

const expectedPageFiles = [
  "attendance-summary-report-page.tsx",
  "cash-bank-report-page.tsx",
  "customer-aging-report-page.tsx",
  "customer-outstanding-report-page.tsx",
  "employee-advance-outstanding-report-page.tsx",
  "employee-register-report-page.tsx",
  "expense-report-page.tsx",
  "inventory-report-page.tsx",
  "inventory-valuation-report-page.tsx",
  "labor-cost-summary-report-page.tsx",
  "payroll-register-report-page.tsx",
  "product-profit-report-page.tsx",
  "profit-summary-report-page.tsx",
  "purchases-report-page.tsx",
  "salary-payable-report-page.tsx",
  "sales-report-page.tsx",
  "supplier-aging-report-page.tsx",
  "supplier-payable-report-page.tsx",
];

test("final acceptance keeps the approved Reports production structure", async () => {
  assert.deepEqual(await listNames(backendDirectory), [
    "index.ts",
    "reports.repository.ts",
    "reports.routes.ts",
    "reports.schema.ts",
    "reports.service.ts",
  ]);
  assert.deepEqual(await listNames(frontendReportsDirectory), [
    "api",
    "components",
    "hooks",
    "pages",
  ]);
  assert.deepEqual(await listNames(frontendPagesDirectory), expectedPageFiles);
});

test("final acceptance exposes exactly the eighteen approved authenticated GET routes", async () => {
  const routes = await readSource(
    new URL("../src/modules/reports/reports.routes.ts", import.meta.url),
  );
  const paths = reportPaths(routes).sort();

  assert.equal((routes.match(/app\.get\(/g) ?? []).length, 18);
  assert.equal(/app\.(post|put|patch|delete)\(/.test(routes), false);
  assert.equal((routes.match(/privateReportRoute\(app,/g) ?? []).length, 18);
  assert.deepEqual(paths, expectedReportPaths);
  assert.match(routes, /app\.authenticate/);
  assert.match(routes, /INVALID_DATE_RANGE/);
  assert.match(routes, /INVALID_REPORT_FILTER/);
});

test("final acceptance keeps Reports repository read-only and historical rules intact", async () => {
  const [repository, service] = await Promise.all([
    readSource(new URL("../src/modules/reports/reports.repository.ts", import.meta.url)),
    readSource(new URL("../src/modules/reports/reports.service.ts", import.meta.url)),
  ]);

  assert.equal(/\.(insert|update|delete)\(/.test(repository), false);
  assert.match(repository, /eq\(salesInvoices\.status, "CONFIRMED"\)/);
  assert.match(repository, /eq\(purchases\.status, "CONFIRMED"\)/);
  assert.match(repository, /eq\(salesReturns\.status, "CONFIRMED"\)/);
  assert.match(repository, /eq\(purchaseReturns\.status, "CONFIRMED"\)/);
  assert.match(repository, /customerLedgerEntries/);
  assert.match(repository, /supplierLedgerEntries/);
  assert.match(repository, /cashBankMovements/);
  assert.match(repository, /expenseCategories/);
  assert.ok((repository.match(/Asia\/Karachi/g) ?? []).length >= 4);
  assert.match(service, /unitCostSnapshot/);
  assert.match(service, /reversalOfExpenseId/);
  assert.equal(/weightedAverageCost/.test(service), false);
});

test("final acceptance keeps all eighteen frontend API loaders and TanStack query hooks", async () => {
  const [api, hooks] = await Promise.all([
    readSource(
      new URL(
        "../../web-admin/src/features/reports/api/reports.api.ts",
        import.meta.url,
      ),
    ),
    readSource(
      new URL(
        "../../web-admin/src/features/reports/hooks/use-reports.ts",
        import.meta.url,
      ),
    ),
  ]);

  const loaders = [
    "loadSalesReport",
    "loadPurchasesReport",
    "loadInventoryReport",
    "loadInventoryValuationReport",
    "loadCustomerAgingReport",
    "loadSupplierAgingReport",
    "loadCustomerOutstandingReport",
    "loadSupplierPayableReport",
    "loadCashBankReport",
    "loadExpenseReport",
    "loadProfitSummaryReport",
    "loadProductProfitReport",
    "loadEmployeeRegisterReport",
    "loadAttendanceSummaryReport",
    "loadPayrollRegisterReport",
    "loadSalaryPayableReport",
    "loadEmployeeAdvanceOutstandingReport",
    "loadLaborCostSummaryReport",
  ];
  const queryHooks = [
    "useSalesReport",
    "usePurchasesReport",
    "useInventoryReport",
    "useInventoryValuationReport",
    "useCustomerAgingReport",
    "useSupplierAgingReport",
    "useCustomerOutstandingReport",
    "useSupplierPayableReport",
    "useCashBankReport",
    "useExpenseReport",
    "useProfitSummaryReport",
    "useProductProfitReport",
    "useEmployeeRegisterReport",
    "useAttendanceSummaryReport",
    "usePayrollRegisterReport",
    "useSalaryPayableReport",
    "useEmployeeAdvanceOutstandingReport",
    "useLaborCostSummaryReport",
  ];

  for (const loader of loaders) {
    assert.match(api, new RegExp(`export function ${loader}\\(`));
  }
  for (const hook of queryHooks) {
    assert.match(hooks, new RegExp(`export function ${hook}\\(`));
  }

  assert.equal((hooks.match(/return useQuery\(/g) ?? []).length, 18);
  assert.equal(/useMutation/.test(hooks), false);
  for (const path of expectedReportPaths) {
    assert.ok(api.includes(`\`${path}\${`), `${path} loader must call the approved endpoint`);
  }

  const profitPage = await readSource(
    new URL(
      "../../web-admin/src/features/reports/pages/profit-summary-report-page.tsx",
      import.meta.url,
    ),
  );
  assert.match(api, /export interface ProfitSummaryReport[\s\S]*laborCostAmount: string;/);
  assert.match(profitPage, /report\.laborCostAmount/);
});

test("final acceptance registers every report page in router and sidebar navigation", async () => {
  const [router, layout] = await Promise.all([
    readSource(new URL("../../web-admin/src/app/router.tsx", import.meta.url)),
    readSource(
      new URL("../../web-admin/src/app/layouts/app-layout.tsx", import.meta.url),
    ),
  ]);

  for (const path of expectedReportPaths) {
    assert.match(router, new RegExp(`path: ["']${path.replace("/", "\\/")}["']`));
    assert.match(layout, new RegExp(`to=["']${path.replace("/", "\\/")}["']`));
  }

  assert.match(layout, /Reports/);
  assert.match(layout, /reportsActive/);
});

test("final acceptance keeps report display dates aligned to Asia Karachi", async () => {
  const pageFiles = await listNames(frontendPagesDirectory);
  const pageSources = await Promise.all(
    pageFiles.map((file) =>
      readSource(
        new URL(`../../web-admin/src/features/reports/pages/${file}`, import.meta.url),
      ),
    ),
  );
  const combined = pageSources.join("\n");

  assert.ok((combined.match(/Asia\/Karachi/g) ?? []).length >= 3);
});
