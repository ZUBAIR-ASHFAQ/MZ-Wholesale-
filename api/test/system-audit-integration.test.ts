import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/** Reads one source file used by this static architecture/acceptance audit. */
async function readSource(relativePath: string): Promise<string> {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("audit schema supports failed login events without inventing an admin identity", async () => {
  const schema = await readSource("src/database/schema/system.schema.ts");
  const migration = await readSource("drizzle/0019_module_15_failed_login_audit.sql");

  assert.match(schema, /adminUserId: uuid\("admin_user_id"\),/);
  assert.doesNotMatch(schema, /adminUserId: uuid\("admin_user_id"\)\.notNull\(\)/);
  assert.match(migration, /alter column "admin_user_id" drop not null/i);
});

test("auth audit never stores password or token material", async () => {
  const source = await readSource("src/modules/auth/auth.routes.ts");

  assert.match(source, /"LOGIN_SUCCEEDED"/);
  assert.match(source, /"LOGIN_FAILED"/);
  assert.match(source, /"LOGOUT"/);
  assert.match(source, /"PASSWORD_CHANGED"/);
  const auditCalls = source
    .split("\n")
    .filter((line) => line.includes("await auditAuth(request"))
    .join("\n");
  assert.doesNotMatch(
    auditCalls,
    /currentPassword|newPassword|confirmPassword|accessToken|refreshToken|csrfToken/i,
  );
});

test("important master-data and inventory mutations are connected to audit writes", async () => {
  const sources = await Promise.all([
    readSource("src/modules/business-settings/business-settings.routes.ts"),
    readSource("src/modules/products/products.routes.ts"),
    readSource("src/modules/customers/customers.routes.ts"),
    readSource("src/modules/suppliers/suppliers.routes.ts"),
    readSource("src/modules/inventory/inventory.routes.ts"),
  ]);
  const source = sources.join("\n");

  for (const action of [
    "BUSINESS_SETTINGS_SAVED",
    "PRODUCT_CREATED",
    "PRODUCT_UPDATED",
    "CUSTOMER_CREATED",
    "CUSTOMER_UPDATED",
    "SUPPLIER_CREATED",
    "SUPPLIER_UPDATED",
    "OPENING_STOCK_RECORDED",
    "INVENTORY_ADJUSTMENT_CREATED",
    "STOCK_COUNT_CONFIRMED",
  ]) {
    assert.match(source, new RegExp(`"${action}"`));
  }
});

test("important financial mutations are connected to audit writes", async () => {
  const sources = await Promise.all([
    readSource("src/modules/payments/payments.routes.ts"),
    readSource("src/modules/purchases/purchases.routes.ts"),
    readSource("src/modules/sales/sales.routes.ts"),
    readSource("src/modules/returns/returns.routes.ts"),
    readSource("src/modules/expenses/expenses.routes.ts"),
  ]);
  const source = sources.join("\n");

  for (const action of [
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
    assert.match(source, new RegExp(`"${action}"`));
  }
});

test("normal Reports and Dashboard viewing remains unaudited", async () => {
  const reports = await readSource("src/modules/reports/reports.routes.ts");
  const dashboard = await readSource("src/modules/dashboard/dashboard.routes.ts");

  assert.doesNotMatch(reports, /recordAuditLog|auditMutation/);
  assert.doesNotMatch(dashboard, /recordAuditLog|auditMutation/);
});
