import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readProjectFile(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("ledger routes expose only the four approved read operations", async () => {
  const routes = await readProjectFile("../src/modules/ledgers/ledgers.routes.ts");

  assert.match(routes, /"\/ledgers\/customers\/:customerId"/);
  assert.match(routes, /"\/ledgers\/suppliers\/:supplierId"/);
  assert.match(routes, /"\/ledgers\/customer-outstanding"/);
  assert.match(routes, /"\/ledgers\/supplier-payables"/);
  assert.equal([...routes.matchAll(/app\.get\(/g)].length, 4);
  assert.doesNotMatch(routes, /app\.(?:post|patch|delete)\(/);
});

test("ledger statements include party details running balances and pagination", async () => {
  const service = await readProjectFile("../src/modules/ledgers/ledgers.service.ts");
  const repository = await readProjectFile("../src/modules/ledgers/ledgers.repository.ts");

  assert.match(service, /customer:\s*\{/);
  assert.match(service, /supplier:\s*\{/);
  assert.match(service, /runningBalance:/);
  assert.match(service, /moneyToCents/);
  assert.match(repository, /periodEffect:/);
  assert.match(repository, /over \(order by/);
  assert.match(repository, /page: query\.page/);
  assert.match(repository, /pageSize: query\.pageSize/);
});

test("customer statement service returns a complete safe-money response", async () => {
  const service = await readProjectFile("../src/modules/ledgers/ledgers.service.ts");

  assert.match(service, /export async function getCustomerStatement/);
  assert.match(service, /CUSTOMER_NOT_FOUND/);
  assert.match(service, /dateFrom: query\.startDate \?\? null/);
  assert.match(service, /dateTo: query\.endDate \?\? null/);
  assert.match(service, /totalDebitCents = moneyToCents\(statement\.totalDebit\)/);
  assert.match(service, /totalCreditCents = moneyToCents\(statement\.totalCredit\)/);
  assert.match(service, /closingBalance: centsToMoney\(openingCents \+ totalDebitCents - totalCreditCents\)/);
  assert.match(service, /runningBalance: centsToMoney\(openingCents \+ moneyToCents\(periodEffect\)\)/);
  assert.doesNotMatch(service, /getCustomerStatement[\s\S]*?Number\(statement\./);
});

test("supplier statement service returns a complete safe-money response", async () => {
  const service = await readProjectFile("../src/modules/ledgers/ledgers.service.ts");

  assert.match(service, /export async function getSupplierStatement/);
  assert.match(service, /SUPPLIER_NOT_FOUND/);
  assert.match(service, /dateFrom: query\.startDate \?\? null/);
  assert.match(service, /dateTo: query\.endDate \?\? null/);
  assert.match(service, /totalDebitCents = moneyToCents\(statement\.totalDebit\)/);
  assert.match(service, /totalCreditCents = moneyToCents\(statement\.totalCredit\)/);
  assert.match(service, /closingBalance: centsToMoney\(openingCents \+ totalCreditCents - totalDebitCents\)/);
  assert.match(service, /runningBalance: centsToMoney\(openingCents \+ moneyToCents\(periodEffect\)\)/);
  assert.doesNotMatch(service, /getSupplierStatement[\s\S]*?Number\(statement\./);
});

test("outstanding and payable lists use separate list and count queries", async () => {
  const repository = await readProjectFile("../src/modules/ledgers/ledgers.repository.ts");

  assert.match(repository, /as\("customer_outstanding"\)/);
  assert.match(repository, /as\("supplier_payables"\)/);
  assert.match(repository, /export async function countCustomerOutstanding/);
  assert.match(repository, /export async function countSupplierPayables/);
  assert.match(repository, /readCustomerOutstandingPage/);
  assert.match(repository, /readSupplierPayablesPage/);
  assert.match(repository, /return \{ items, page: query\.page, pageSize: query\.pageSize, total \}/);
});

test("ledger write operations remain internal and direction-specific", async () => {
  const service = await readProjectFile("../src/modules/ledgers/ledgers.service.ts");
  const repository = await readProjectFile("../src/modules/ledgers/ledgers.repository.ts");
  const routes = await readProjectFile("../src/modules/ledgers/ledgers.routes.ts");

  for (const functionName of [
    "writeCustomerDebit",
    "writeCustomerCredit",
    "writeSupplierDebit",
    "writeSupplierCredit",
  ]) {
    assert.match(service, new RegExp(`export function ${functionName}\\b`));
    assert.doesNotMatch(routes, new RegExp(functionName));
  }

  assert.match(repository, /export async function findCustomerEntryBySource/);
  assert.match(repository, /export async function findSupplierEntryBySource/);
  assert.match(service, /DUPLICATE_LEDGER_SOURCE/);
  assert.match(service, /CUSTOMER_NOT_FOUND/);
  assert.match(service, /SUPPLIER_NOT_FOUND/);
  assert.match(service, /INVALID_LEDGER_AMOUNT/);
  assert.match(service, /INVALID_LEDGER_SOURCE/);
});


test("ledger schema enforces immutable one-sided entries and duplicate-source protection", async () => {
  const schema = await readProjectFile("../src/database/schema/ledger.schema.ts");
  const migration = await readProjectFile("../drizzle/0009_module_7_ledgers.sql");

  assert.match(schema, /customer_ledger_amount_check/);
  assert.match(schema, /supplier_ledger_amount_check/);
  assert.match(schema, /customer_ledger_one_opening_balance_unique/);
  assert.match(schema, /supplier_ledger_one_opening_balance_unique/);
  assert.match(schema, /customer_ledger_source_unique/);
  assert.match(schema, /supplier_ledger_source_unique/);
  assert.match(schema, /documentNumber: varchar/);
  assert.match(schema, /description: varchar/);
  assert.doesNotMatch(schema, /updatedAt|deletedAt/);

  assert.match(migration, /customer_ledger_source_unique/);
  assert.match(migration, /supplier_ledger_source_unique/);
  assert.match(migration, /numeric\(14,2\)/);
});

test("ledger request schemas enforce UUID date pagination and strict query rules", async () => {
  const schema = await readProjectFile("../src/modules/ledgers/ledgers.schema.ts");
  const routes = await readProjectFile("../src/modules/ledgers/ledgers.routes.ts");

  assert.match(schema, /customerStatementParamsSchema/);
  assert.match(schema, /supplierStatementParamsSchema/);
  assert.match(schema, /ledgerStatementQuerySchema/);
  assert.match(schema, /outstandingListQuerySchema/);
  assert.match(schema, /\.uuid\(/);
  assert.match(schema, /\.date\(/);
  assert.match(schema, /\.max\(100\)/);
  assert.match(schema, /Start date must not be after end date/);
  assert.match(schema, /\.strict\(\)/);
  assert.match(schema, /\.trim\(\)\.min\(1\)\.max\(200\)/);

  assert.match(routes, /ledgerStatementQuerySchema\.parse\(request\.query\)/);
  assert.match(routes, /outstandingListQuerySchema\.parse\(request\.query\)/);
});

test("ledger repository keeps read queries small and purpose-specific", async () => {
  const repository = await readProjectFile("../src/modules/ledgers/ledgers.repository.ts");

  for (const functionName of [
    "findCustomerById",
    "findSupplierById",
    "listCustomerStatementEntries",
    "countCustomerStatementEntries",
    "sumCustomerBalanceBeforeDate",
    "listSupplierStatementEntries",
    "countSupplierStatementEntries",
    "sumSupplierBalanceBeforeDate",
    "readCustomerCurrentDue",
    "readSupplierCurrentPayable",
    "listCustomerOutstanding",
    "countCustomerOutstanding",
    "listSupplierPayables",
    "countSupplierPayables",
  ]) {
    assert.match(repository, new RegExp(`export async function ${functionName}\\b`));
  }

  assert.match(repository, /occurredAt\), asc\(customerLedgerEntries\.createdAt\), asc\(customerLedgerEntries\.id\)/);
  assert.match(repository, /occurredAt\), asc\(supplierLedgerEntries\.createdAt\), asc\(supplierLedgerEntries\.id\)/);
  assert.match(repository, /coalesce\(sum\(/);
  assert.match(repository, /return rows\[0\]\?\.total \?\? 0/);
  assert.doesNotMatch(repository, /FastifyRequest|FastifyReply/);
});


test("outstanding and payable services return professional filtered paginated contracts", async () => {
  const repository = await readProjectFile("../src/modules/ledgers/ledgers.repository.ts");
  const service = await readProjectFile("../src/modules/ledgers/ledgers.service.ts");

  assert.match(repository, /customerCode: customers\.code/);
  assert.match(repository, /customerName: customers\.name/);
  assert.match(repository, /outstandingAmount: balanceExpression/);
  assert.match(repository, /eq\(customers\.isWalkIn, false\)/);
  assert.match(repository, /having\(gt\(balanceExpression, "0"\)\)/);
  assert.match(repository, /supplierCode: suppliers\.code/);
  assert.match(repository, /supplierName: suppliers\.name/);
  assert.match(repository, /payableAmount: balanceExpression/);
  assert.match(service, /export async function getCustomerOutstanding/);
  assert.match(service, /outstandingAmount: centsToMoney\(moneyToCents\(item\.outstandingAmount\)\)/);
  assert.match(service, /export async function getSupplierPayables/);
  assert.match(service, /payableAmount: centsToMoney\(moneyToCents\(item\.payableAmount\)\)/);
});


test("ledger routes stay authenticated thin and service-driven", async () => {
  const routes = await readProjectFile("../src/modules/ledgers/ledgers.routes.ts");

  assert.match(routes, /function privateReadRoute\(app: FastifyInstance, summary: string\)/);
  assert.match(routes, /preHandler: app\.authenticate/);
  assert.equal([...routes.matchAll(/privateReadRoute\(app,/g)].length, 4);
  assert.equal([...routes.matchAll(/createDataResponse\(/g)].length, 4);
  assert.match(routes, /getCustomerStatement\(app\.db/);
  assert.match(routes, /getSupplierStatement\(app\.db/);
  assert.match(routes, /getCustomerOutstanding\(app\.db/);
  assert.match(routes, /getSupplierPayables\(app\.db/);
  assert.doesNotMatch(routes, /drizzle|select\(|insert\(|update\(|delete\(/);
});

test("ledger frontend API and hooks keep reads simple and filter-aware", async () => {
  const api = await readProjectFile(
    "../../web-admin/src/features/ledgers/api/ledgers.api.ts",
  );
  const hooks = await readProjectFile(
    "../../web-admin/src/features/ledgers/hooks/use-ledgers.ts",
  );

  for (const functionName of [
    "loadCustomerStatement",
    "loadSupplierStatement",
    "loadCustomerOutstanding",
    "loadSupplierPayables",
  ]) {
    assert.match(api, new RegExp(`export function ${functionName}\\b`));
  }

  assert.match(api, /\/ledgers\/customers\/\$\{customerId\}/);
  assert.match(api, /\/ledgers\/suppliers\/\$\{supplierId\}/);
  assert.match(api, /\/ledgers\/customer-outstanding/);
  assert.match(api, /\/ledgers\/supplier-payables/);
  assert.match(api, /startDate/);
  assert.match(api, /endDate/);
  assert.match(api, /search/);
  assert.match(api, /pageSize/);

  assert.match(hooks, /export const ledgerQueryKeys/);
  assert.match(hooks, /customerStatement: \(/);
  assert.match(hooks, /supplierStatement: \(/);
  assert.match(hooks, /customerOutstanding: \(/);
  assert.match(hooks, /supplierPayables: \(/);
  assert.match(hooks, /enabled: customerId\.length > 0/);
  assert.match(hooks, /enabled: supplierId\.length > 0/);
  assert.doesNotMatch(hooks, /useMutation/);
  assert.doesNotMatch(api, /method:\s*["'](?:POST|PATCH|PUT|DELETE)/);
});

test("ledger frontend pages stay read-only and use shared feature hooks", async () => {
  const customerStatement = await readProjectFile(
    "../../web-admin/src/features/ledgers/pages/customer-statement-page.tsx",
  );
  const supplierStatement = await readProjectFile(
    "../../web-admin/src/features/ledgers/pages/supplier-statement-page.tsx",
  );
  const customerOutstanding = await readProjectFile(
    "../../web-admin/src/features/ledgers/pages/customer-outstanding-page.tsx",
  );
  const supplierPayables = await readProjectFile(
    "../../web-admin/src/features/ledgers/pages/supplier-payables-page.tsx",
  );
  const router = await readProjectFile(
    "../../web-admin/src/app/router.tsx",
  );

  assert.match(customerStatement, /useCustomerStatement/);
  assert.match(customerStatement, /LedgerSummary/);
  assert.match(customerStatement, /LedgerStatementTable/);
  assert.match(supplierStatement, /useSupplierStatement/);
  assert.match(supplierStatement, /LedgerSummary/);
  assert.match(supplierStatement, /LedgerStatementTable/);
  assert.match(customerOutstanding, /useCustomerOutstanding/);
  assert.match(supplierPayables, /useSupplierPayables/);

  for (const page of [
    customerStatement,
    supplierStatement,
    customerOutstanding,
    supplierPayables,
  ]) {
    assert.doesNotMatch(page, /requestApi|fetch\(|useMutation/);
  }

  assert.match(router, /path: "\/ledgers\/customer-outstanding"/);
  assert.match(router, /path: "\/ledgers\/supplier-payables"/);
  assert.match(router, /path: "\/ledgers\/customers\/\$customerId"/);
  assert.match(router, /path: "\/ledgers\/suppliers\/\$supplierId"/);
});

test("ledger PostgreSQL integration tests cover constraints relations and balance direction", async () => {
  const integration = await readProjectFile("integration/database.integration.test.ts");

  assert.match(integration, /supplier ledger rejects an entry with both debit and credit/);
  assert.match(integration, /ledger entries reject zero debit and zero credit/);
  assert.match(integration, /normal ledger sources require a source id/);
  assert.match(integration, /opening balance entries reject a source id/);
  assert.match(integration, /duplicate customer source entries are rejected/);
  assert.match(integration, /supplier opening balance is unique/);
  assert.match(integration, /ledger foreign keys reject unknown customer and supplier ids/);
  assert.match(integration, /customer and supplier balances follow the approved debit credit direction/);
  assert.match(integration, /23503/);
  assert.match(integration, /23505/);
  assert.match(integration, /23514/);
});


test("ledger repository keeps money calculations out of JavaScript Number arithmetic", async () => {
  const source = await readFile(new URL("../src/modules/ledgers/ledgers.repository.ts", import.meta.url), "utf8");

  assert.match(source, /function moneyToCents/);
  assert.match(source, /function centsToMoney/);
  assert.doesNotMatch(source, /Number\(openingBalance\)/);
  assert.doesNotMatch(source, /Number\(period\.(?:debit|credit)\)/);
  assert.doesNotMatch(source, /Number\(value \?\? 0\)\.toFixed/);
});


/** Verifies ledger business-date filters use the approved Asia/Karachi reporting timezone. */
test("ledger date filters use Asia/Karachi business dates", async () => {
  const repository = await readProjectFile("../src/modules/ledgers/ledgers.repository.ts");

  assert.equal(
    [...repository.matchAll(/timezone\('Asia\/Karachi', \${customerLedgerEntries\.occurredAt}\)::date/g)].length,
    3,
  );
  assert.equal(
    [...repository.matchAll(/timezone\('Asia\/Karachi', \${supplierLedgerEntries\.occurredAt}\)::date/g)].length,
    3,
  );
  assert.doesNotMatch(repository, /occurredAt} >= \${query\.startDate}::date/);
  assert.doesNotMatch(repository, /occurredAt} < \${startDate}::date/);
});
