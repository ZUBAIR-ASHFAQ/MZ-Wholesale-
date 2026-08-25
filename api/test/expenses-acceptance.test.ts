import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const moduleDirectory = new URL("../src/modules/expenses/", import.meta.url);
const routesPath = new URL("../src/modules/expenses/expenses.routes.ts", import.meta.url);
const servicePath = new URL("../src/modules/expenses/expenses.service.ts", import.meta.url);
const repositoryPath = new URL("../src/modules/expenses/expenses.repository.ts", import.meta.url);
const schemaPath = new URL("../src/modules/expenses/expenses.schema.ts", import.meta.url);
const databaseSchemaPath = new URL("../src/database/schema/expense.schema.ts", import.meta.url);
const paymentSchemaPath = new URL("../src/database/schema/payment.schema.ts", import.meta.url);
const appPath = new URL("../src/app.ts", import.meta.url);
const expenseMigrationPath = new URL("../drizzle/0014_module_12_expense_management.sql", import.meta.url);
const movementMigrationPath = new URL("../drizzle/0015_module_12_expense_movement_sources.sql", import.meta.url);
const frontendApiPath = new URL(
  "../../web-admin/src/features/expenses/api/expenses.api.ts",
  import.meta.url,
);
const frontendHooksPath = new URL(
  "../../web-admin/src/features/expenses/hooks/use-expenses.ts",
  import.meta.url,
);
const frontendRouterPath = new URL(
  "../../web-admin/src/app/router.tsx",
  import.meta.url,
);
const frontendLayoutPath = new URL(
  "../../web-admin/src/app/layouts/app-layout.tsx",
  import.meta.url,
);

/** Reads one source file used by the final Module 12 acceptance checks. */
async function readSource(path: URL): Promise<string> {
  return readFile(path, "utf8");
}

test("Module 12 keeps exactly the required five backend production files", async () => {
  const files = (await readdir(moduleDirectory)).sort();

  assert.deepEqual(files, [
    "expenses.repository.ts",
    "expenses.routes.ts",
    "expenses.schema.ts",
    "expenses.service.ts",
    "index.ts",
  ]);
});

test("Module 12 exposes exactly the seven approved authenticated routes", async () => {
  const routes = await readSource(routesPath);
  const routeCalls = routes.match(/app\.(get|post|patch)\(/g) ?? [];

  assert.equal(routeCalls.length, 7);
  assert.match(routes, /preHandler: app\.authenticate/);
  assert.match(routes, /"\/expense-categories"/);
  assert.match(routes, /"\/expense-categories\/:id"/);
  assert.match(routes, /"\/expenses"/);
  assert.match(routes, /"\/expenses\/:id"/);
  assert.match(routes, /"\/expenses\/:id\/reverse"/);
  assert.doesNotMatch(routes, /app\.(delete|put)\(/);
});

test("Expense financial mutations use idempotency and caller-owned transactions", async () => {
  const routes = await readSource(routesPath);
  const service = await readSource(servicePath);

  assert.match(routes, /executeIdempotentMutation/);
  assert.match(routes, /request\.headers\["idempotency-key"\]/);
  assert.match(routes, /createExpenseInTransaction/);
  assert.match(routes, /reverseExpenseInTransaction/);
  assert.match(service, /reserveBusinessDocumentNumberInTransaction\([\s\S]*?"EXPENSE"/);
});

test("Expense creation and reversal use immutable matching account movements", async () => {
  const service = await readSource(servicePath);
  const paymentSchema = await readSource(paymentSchemaPath);

  assert.match(service, /sourceType: "EXPENSE" as const/);
  assert.match(service, /sourceType: "EXPENSE_REVERSAL" as const/);
  assert.match(service, /writeCashOutflow/);
  assert.match(service, /writeBankOutflow/);
  assert.match(service, /writeCashInflow/);
  assert.match(service, /writeBankInflow/);
  assert.match(paymentSchema, /"EXPENSE"/);
  assert.match(paymentSchema, /"EXPENSE_REVERSAL"/);
});

test("Expense reversal locks the original and stores one linked correction", async () => {
  const service = await readSource(servicePath);
  const repository = await readSource(repositoryPath);
  const databaseSchema = await readSource(databaseSchemaPath);

  assert.match(service, /lockExpenseForReversal/);
  assert.match(service, /findExpenseReversal/);
  assert.match(service, /reversalOfExpenseId: originalExpense\.id/);
  assert.match(service, /EXPENSE_ALREADY_REVERSED/);
  assert.match(repository, /\.for\("update"\)/);
  assert.match(databaseSchema, /reversalOfExpenseId/);
});

test("Expense validation enforces approved amount date method account and note rules", async () => {
  const schema = await readSource(schemaPath);

  assert.match(schema, /z\.enum\(\["CASH", "BANK_TRANSFER"\]\)/);
  assert.match(schema, /Amount must be greater than zero/);
  assert.match(schema, /Date must be a valid calendar date/);
  assert.match(schema, /Note must be 500 characters or fewer/);
  assert.match(schema, /cashAccountId/);
  assert.match(schema, /bankAccountId/);
});

test("Expense database migrations create the approved tables and movement sources", async () => {
  const expenseMigration = await readSource(expenseMigrationPath);
  const movementMigration = await readSource(movementMigrationPath);

  assert.match(expenseMigration, /CREATE TABLE IF NOT EXISTS "expense_categories"/i);
  assert.match(expenseMigration, /CREATE TABLE IF NOT EXISTS "expenses"/i);
  assert.match(expenseMigration, /numeric\(14, 2\)/i);
  assert.match(expenseMigration, /reversal_of_expense_id/i);
  assert.match(movementMigration, /ADD VALUE IF NOT EXISTS 'EXPENSE'/);
  assert.match(movementMigration, /ADD VALUE IF NOT EXISTS 'EXPENSE_REVERSAL'/);
});

test("Expense module is registered after Payments in the Fastify application", async () => {
  const app = await readSource(appPath);
  const paymentsIndex = app.indexOf("await app.register(paymentsModule)");
  const expensesIndex = app.indexOf("await app.register(expensesModule)");

  assert.notEqual(paymentsIndex, -1);
  assert.notEqual(expensesIndex, -1);
  assert.ok(paymentsIndex < expensesIndex);
});

test("React admin exposes Expense API hooks routes and navigation", async () => {
  const api = await readSource(frontendApiPath);
  const hooks = await readSource(frontendHooksPath);
  const router = await readSource(frontendRouterPath);
  const layout = await readSource(frontendLayoutPath);

  assert.match(api, /"Idempotency-Key": idempotencyKey/);
  assert.match(api, /\/expenses\/${expenseId}\/reverse/);
  assert.match(hooks, /useExpenseCategories/);
  assert.match(hooks, /useCreateExpense/);
  assert.match(hooks, /useReverseExpense/);
  assert.match(router, /path: "\/expenses"/);
  assert.match(router, /path: "\/expenses\/new"/);
  assert.match(router, /path: "\/expenses\/categories"/);
  assert.match(router, /path: "\/expenses\/\$expenseId"/);
  assert.match(layout, /to="\/expenses"/);
});

test("Expense reads expose reversal state and financial writes are logged", async () => {
  const repository = await readSource(repositoryPath);
  const routes = await readSource(routesPath);

  assert.match(repository, /reversedByExpenseId/);
  assert.match(routes, /"Expense created\."/);
  assert.match(routes, /"Expense reversed\."/);
});
