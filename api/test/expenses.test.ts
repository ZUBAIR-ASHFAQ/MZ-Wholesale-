import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createExpenseCategorySchema,
  createExpenseSchema,
  listExpensesQuerySchema,
  reverseExpenseSchema,
  updateExpenseCategorySchema,
} from "../src/modules/expenses/expenses.schema.js";

const expenseCategoryId = "00000000-0000-4000-8000-000000000201";
const cashAccountId = "00000000-0000-4000-8000-000000000202";
const bankAccountId = "00000000-0000-4000-8000-000000000203";

const expensesServicePath = new URL(
  "../src/modules/expenses/expenses.service.ts",
  import.meta.url,
);
const expensesRepositoryPath = new URL(
  "../src/modules/expenses/expenses.repository.ts",
  import.meta.url,
);
const expensesRoutesPath = new URL(
  "../src/modules/expenses/expenses.routes.ts",
  import.meta.url,
);
const expensesModulePath = new URL(
  "../src/modules/expenses/index.ts",
  import.meta.url,
);

/** Reads one Expense source file for focused module contract checks. */
async function readSource(path: URL): Promise<string> {
  return readFile(path, "utf8");
}

/** Builds one valid cash expense request used by schema tests. */
function validCashExpense() {
  return {
    expenseCategoryId,
    expenseDate: "2026-08-08",
    amount: "1250.00",
    paymentMethod: "CASH" as const,
    cashAccountId,
    note: "Electricity bill",
    receiptUrl: "https://example.com/receipts/expense-1.pdf",
  };
}

/** Builds one valid bank expense request used by schema tests. */
function validBankExpense() {
  return {
    expenseCategoryId,
    expenseDate: "2026-08-08",
    amount: "2500.50",
    paymentMethod: "BANK_TRANSFER" as const,
    bankAccountId,
  };
}

test("expense category schemas accept create and update requests", () => {
  assert.equal(
    createExpenseCategorySchema.safeParse({ name: "Electricity" }).success,
    true,
  );
  assert.equal(
    updateExpenseCategorySchema.safeParse({
      name: "Utilities",
      isActive: false,
    }).success,
    true,
  );
});

test("expense category update rejects an empty update", () => {
  assert.equal(updateExpenseCategorySchema.safeParse({}).success, false);
});

test("cash expense requires only a cash account", () => {
  assert.equal(createExpenseSchema.safeParse(validCashExpense()).success, true);
  assert.equal(
    createExpenseSchema.safeParse({
      ...validCashExpense(),
      bankAccountId,
    }).success,
    false,
  );
  assert.equal(
    createExpenseSchema.safeParse({
      ...validCashExpense(),
      cashAccountId: undefined,
    }).success,
    false,
  );
});

test("bank expense requires only a bank account", () => {
  assert.equal(createExpenseSchema.safeParse(validBankExpense()).success, true);
  assert.equal(
    createExpenseSchema.safeParse({
      ...validBankExpense(),
      cashAccountId,
    }).success,
    false,
  );
  assert.equal(
    createExpenseSchema.safeParse({
      ...validBankExpense(),
      bankAccountId: undefined,
    }).success,
    false,
  );
});

test("expense schema rejects zero amount and invalid calendar dates", () => {
  assert.equal(
    createExpenseSchema.safeParse({
      ...validCashExpense(),
      amount: "0.00",
    }).success,
    false,
  );
  assert.equal(
    createExpenseSchema.safeParse({
      ...validCashExpense(),
      expenseDate: "2026-02-30",
    }).success,
    false,
  );
});

test("expense list schema rejects reversed date ranges", () => {
  assert.equal(
    listExpensesQuerySchema.safeParse({
      startDate: "2026-08-10",
      endDate: "2026-08-08",
    }).success,
    false,
  );
});

test("expense reversal requires a non-blank reason", () => {
  assert.equal(
    reverseExpenseSchema.safeParse({ reason: "Duplicate expense" }).success,
    true,
  );
  assert.equal(reverseExpenseSchema.safeParse({ reason: "   " }).success, false);
});

test("expense service validates active category and matching active account", async () => {
  const source = await readSource(expensesServicePath);

  assert.match(source, /requireActiveExpenseCategory/);
  assert.match(source, /EXPENSE_CATEGORY_NOT_FOUND/);
  assert.match(source, /EXPENSE_CATEGORY_INACTIVE/);
  assert.match(source, /requireActiveExpenseAccount/);
  assert.match(source, /ACCOUNT_NOT_FOUND/);
  assert.match(source, /ACCOUNT_INACTIVE/);
  assert.match(source, /findCashAccountById/);
  assert.match(source, /findBankAccountById/);
});

test("expense creation reserves a document number and writes one matching outflow", async () => {
  const source = await readSource(expensesServicePath);
  const creationSection = source.slice(
    source.indexOf("export async function createExpenseInTransaction"),
    source.indexOf("export async function reverseExpenseInTransaction"),
  );

  assert.match(creationSection, /requireActiveExpenseCategory/);
  assert.match(creationSection, /requireActiveExpenseAccount/);
  assert.match(creationSection, /reserveExpenseNumberInTransaction/);
  assert.match(creationSection, /insertExpense/);
  assert.match(creationSection, /writeExpenseOutflow/);
  assert.match(source, /sourceType: "EXPENSE" as const/);
  assert.match(source, /writeCashOutflow/);
  assert.match(source, /writeBankOutflow/);
});

test("expense reversal locks the original and creates a linked opposite movement", async () => {
  const source = await readSource(expensesServicePath);
  const reversalSection = source.slice(
    source.indexOf("export async function reverseExpenseInTransaction"),
  );

  assert.match(reversalSection, /lockExpenseForReversal/);
  assert.match(reversalSection, /EXPENSE_NOT_FOUND/);
  assert.match(reversalSection, /EXPENSE_ALREADY_REVERSED/);
  assert.match(reversalSection, /findExpenseReversal/);
  assert.match(reversalSection, /reversalOfExpenseId: originalExpense\.id/);
  assert.match(reversalSection, /writeExpenseReversalInflow/);
  assert.match(source, /sourceType: "EXPENSE_REVERSAL" as const/);
  assert.match(source, /writeCashInflow/);
  assert.match(source, /writeBankInflow/);
});

test("expense repository locks reversal rows and uses only approved list filters", async () => {
  const source = await readSource(expensesRepositoryPath);

  assert.match(source, /export async function lockExpenseForReversal/);
  assert.match(source, /\.for\("update"\)/);
  assert.match(source, /eq\(expenses\.expenseCategoryId, query\.categoryId\)/);
  assert.match(source, /gte\(expenses\.expenseDate, query\.startDate\)/);
  assert.match(source, /lte\(expenses\.expenseDate, query\.endDate\)/);
  assert.match(source, /\.limit\(query\.pageSize\)/);
  assert.match(source, /\.offset\(offset\)/);
});

test("expense financial routes use the shared idempotency helper", async () => {
  const source = await readSource(expensesRoutesPath);

  assert.match(source, /executeIdempotentMutation/);
  assert.match(source, /handleCreateExpense/);
  assert.match(source, /createExpenseInTransaction/);
  assert.match(source, /handleReverseExpense/);
  assert.match(source, /reverseExpenseInTransaction/);
});

test("expense routes expose exactly the approved seven endpoints", async () => {
  const source = await readSource(expensesRoutesPath);

  const routeMatches = source.match(/app\.(get|post|patch)\(/g) ?? [];
  assert.equal(routeMatches.length, 7);
  assert.match(source, /"\/expense-categories"/);
  assert.match(source, /"\/expense-categories\/:id"/);
  assert.match(source, /"\/expenses"/);
  assert.match(source, /"\/expenses\/:id"/);
  assert.match(source, /"\/expenses\/:id\/reverse"/);
  assert.doesNotMatch(source, /app\.(delete|put)\(/);
});

test("expense module keeps the required five-file registration pattern", async () => {
  const source = await readSource(expensesModulePath);

  assert.match(source, /registerExpenseRoutes/);
  assert.match(source, /export const expensesModule/);
});


test("expense reads expose whether an original expense was reversed", async () => {
  const source = await readSource(expensesRepositoryPath);

  assert.match(source, /reversedByExpenseId/);
  assert.match(source, /reversal_of_expense_id/);
  assert.match(source, /reversed_expense/);
});

test("expense financial writes create structured audit logs only during execution", async () => {
  const source = await readSource(expensesRoutesPath);

  assert.match(source, /request\.log\.info/);
  assert.match(source, /"Expense created\."/);
  assert.match(source, /"Expense reversed\."/);
  assert.match(source, /expenseNumber/);
  assert.match(source, /reversalExpenseNumber/);
});
