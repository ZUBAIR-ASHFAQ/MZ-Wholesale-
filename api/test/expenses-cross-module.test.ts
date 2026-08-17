import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expenseServicePath = new URL(
  "../src/modules/expenses/expenses.service.ts",
  import.meta.url,
);
const expenseRoutesPath = new URL(
  "../src/modules/expenses/expenses.routes.ts",
  import.meta.url,
);
const paymentSchemaPath = new URL(
  "../src/database/schema/payment.schema.ts",
  import.meta.url,
);
const businessSettingsSchemaPath = new URL(
  "../src/modules/business-settings/business-settings.schema.ts",
  import.meta.url,
);
const appPath = new URL("../src/app.ts", import.meta.url);
const movementMigrationPath = new URL(
  "../drizzle/0015_module_12_expense_movement_sources.sql",
  import.meta.url,
);

/** Reads one backend source file for cross-module contract checks. */
async function readSource(path: URL): Promise<string> {
  return readFile(path, "utf8");
}

test("Expense creation reuses the shared business document sequence", async () => {
  const service = await readSource(expenseServicePath);
  const settingsSchema = await readSource(businessSettingsSchemaPath);

  assert.match(settingsSchema, /"EXPENSE"/);
  assert.match(service, /reserveBusinessDocumentNumberInTransaction/);
  assert.match(service, /reserveBusinessDocumentNumberInTransaction\(\s*database,\s*"EXPENSE"/s);
});

test("Expense account movements reuse the Payments module writers", async () => {
  const service = await readSource(expenseServicePath);

  assert.match(service, /from "\.\.\/payments\/index\.js"/);
  assert.match(service, /writeCashOutflow/);
  assert.match(service, /writeBankOutflow/);
  assert.match(service, /writeCashInflow/);
  assert.match(service, /writeBankInflow/);
  assert.doesNotMatch(service, /insert\(cashBankMovements\)/);
});

test("Payment movement sources include Expense creation and reversal", async () => {
  const paymentSchema = await readSource(paymentSchemaPath);
  const migration = await readSource(movementMigrationPath);

  assert.match(paymentSchema, /"EXPENSE"/);
  assert.match(paymentSchema, /"EXPENSE_REVERSAL"/);
  assert.match(migration, /ADD VALUE IF NOT EXISTS 'EXPENSE'/);
  assert.match(migration, /ADD VALUE IF NOT EXISTS 'EXPENSE_REVERSAL'/);
});

test("Expense financial routes stay inside the shared idempotency transaction", async () => {
  const routes = await readSource(expenseRoutesPath);

  assert.match(routes, /executeIdempotentMutation/);
  assert.match(routes, /createExpenseInTransaction/);
  assert.match(routes, /reverseExpenseInTransaction/);
  assert.doesNotMatch(routes, /\bcreateExpense\(app\.db/);
  assert.doesNotMatch(routes, /\breverseExpense\(app\.db/);
});

test("Expense module is registered after Payments in the Fastify app", async () => {
  const app = await readSource(appPath);
  const paymentsRegistration = app.indexOf("await app.register(paymentsModule)");
  const expensesRegistration = app.indexOf("await app.register(expensesModule)");

  assert.notEqual(paymentsRegistration, -1);
  assert.notEqual(expensesRegistration, -1);
  assert.ok(paymentsRegistration < expensesRegistration);
});
