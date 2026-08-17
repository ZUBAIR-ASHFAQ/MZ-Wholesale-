import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/** Reads one project source file for the Module 15 audit-log acceptance checks. */
async function readSource(relativePath: string): Promise<string> {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

/** Counts exact action literals so important mutations are not accidentally audited twice. */
function countAction(source: string, action: string): number {
  return source.split(`"${action}"`).length - 1;
}

test("audit log stores the complete approved request and change context", async () => {
  const schema = await readSource("src/database/schema/system.schema.ts");
  const service = await readSource("src/modules/system/system.service.ts");

  for (const field of [
    "adminUserId",
    "requestId",
    "ipAddress",
    "device",
    "action",
    "entity",
    "beforeData",
    "afterData",
    "createdAt",
  ]) {
    assert.match(schema, new RegExp(field));
  }

  assert.match(service, /await createAuditLog\(database,/);
  assert.match(service, /adminUserId: context\.adminUserId/);
  assert.match(service, /requestId: context\.requestId/);
  assert.match(service, /ipAddress: context\.ipAddress/);
  assert.match(service, /device: context\.device/);
  assert.match(service, /beforeData,/);
  assert.match(service, /afterData,/);
});

test("important auth events are audited once without password or token material", async () => {
  const source = await readSource("src/modules/auth/auth.routes.ts");

  for (const action of [
    "LOGIN_SUCCEEDED",
    "LOGIN_FAILED",
    "LOGOUT",
    "PASSWORD_CHANGED",
  ]) {
    assert.equal(countAction(source, action), 1, `${action} should be wired once`);
  }

  const auditCalls = source
    .split("\n")
    .filter((line) => line.includes("await auditAuth(request"))
    .join("\n");
  assert.doesNotMatch(auditCalls, /currentPassword|newPassword|confirmPassword|accessToken|refreshToken|csrfToken/i);
});

test("important business mutations remain wired to audit logging", async () => {
  const paths = [
    "src/modules/business-settings/business-settings.routes.ts",
    "src/modules/products/products.routes.ts",
    "src/modules/customers/customers.routes.ts",
    "src/modules/suppliers/suppliers.routes.ts",
    "src/modules/inventory/inventory.routes.ts",
    "src/modules/payments/payments.routes.ts",
    "src/modules/purchases/purchases.routes.ts",
    "src/modules/sales/sales.routes.ts",
    "src/modules/returns/returns.routes.ts",
    "src/modules/expenses/expenses.routes.ts",
  ];
  const source = (await Promise.all(paths.map(readSource))).join("\n");

  for (const action of [
    "BUSINESS_SETTINGS_SAVED",
    "PRODUCT_CREATED",
    "CUSTOMER_CREATED",
    "SUPPLIER_CREATED",
    "OPENING_STOCK_RECORDED",
    "INVENTORY_ADJUSTMENT_CREATED",
    "STOCK_COUNT_CONFIRMED",
    "CUSTOMER_RECEIPT_CREATED",
    "CUSTOMER_RECEIPT_REVERSED",
    "SUPPLIER_PAYMENT_CREATED",
    "SUPPLIER_PAYMENT_REVERSED",
    "CASH_BANK_TRANSFER_CREATED",
    "CASH_RECONCILIATION_CONFIRMED",
    "PURCHASE_CONFIRMED",
    "SALE_CONFIRMED",
    "SALES_RETURN_CREATED",
    "PURCHASE_RETURN_CREATED",
    "EXPENSE_CREATED",
    "EXPENSE_REVERSED",
  ]) {
    assert.match(source, new RegExp(`"${action}"`), `${action} should be audited`);
  }
});

test("import validation and confirmation are audited inside idempotent callbacks", async () => {
  const source = await readSource("src/modules/system/system.routes.ts");

  assert.equal(countAction(source, "IMPORT_VALIDATED"), 1);
  assert.equal(countAction(source, "IMPORT_VALIDATION_FAILED"), 1);
  assert.equal(countAction(source, "IMPORT_CONFIRMED"), 1);

  assert.match(source, /fileName: result\.job\.fileName/);
  assert.match(source, /errorRows: result\.job\.errorRows/);
  assert.match(source, /importedRows: result\.job\.importedRows/);

  const validationCallback = source.indexOf("const result = await validateImportFile(transaction");
  const validationAudit = source.indexOf('"IMPORT_VALIDATED"', validationCallback);
  const validationReply = source.indexOf("reply.status(response.statusCode)", validationCallback);
  assert.ok(validationCallback >= 0 && validationAudit > validationCallback && validationAudit < validationReply);

  const confirmCallback = source.indexOf("const result = await confirmImport(transaction");
  const confirmAudit = source.indexOf('"IMPORT_CONFIRMED"', confirmCallback);
  const confirmReply = source.indexOf("reply.status(response.statusCode)", confirmCallback);
  assert.ok(confirmCallback >= 0 && confirmAudit > confirmCallback && confirmAudit < confirmReply);
});

test("normal report, dashboard, audit-list and import-history GETs do not create audit rows", async () => {
  const reports = await readSource("src/modules/reports/reports.routes.ts");
  const dashboard = await readSource("src/modules/dashboard/dashboard.routes.ts");
  const system = await readSource("src/modules/system/system.routes.ts");

  assert.doesNotMatch(reports, /recordAuditLog|auditMutation/);
  assert.doesNotMatch(dashboard, /recordAuditLog|auditMutation/);

  const readOnlyHandlers = ["handleListImports", "handleGetImport", "handleAuditLogs", "handleExport", "handleImportTemplate"];
  for (const handler of readOnlyHandlers) {
    const start = system.indexOf(`function ${handler}`);
    assert.ok(start >= 0, `${handler} should exist`);
    const next = system.indexOf("\n  /**", start + 1);
    const body = system.slice(start, next >= 0 ? next : undefined);
    assert.doesNotMatch(body, /recordAuditLog\(/, `${handler} should remain read-only without audit noise`);
  }
});
