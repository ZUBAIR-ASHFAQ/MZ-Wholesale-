import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";

import { createDatabaseClient } from "../../src/database/client.js";
import {
  getCashBankReport,
  getExpenseReport,
} from "../../src/modules/reports/reports.service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const shouldRun = typeof databaseUrl === "string" && databaseUrl.length > 0;
const integrationTest = shouldRun ? test : test.skip;

const fixture = {
  cashAccountId: randomUUID(),
  bankAccountId: randomUUID(),
  cashOpeningMovementId: randomUUID(),
  cashBeforeRangeMovementId: randomUUID(),
  cashInflowMovementId: randomUUID(),
  cashOutflowMovementId: randomUUID(),
  cashAfterRangeMovementId: randomUUID(),
  bankOpeningMovementId: randomUUID(),
  bankInflowMovementId: randomUUID(),
  bankOutflowMovementId: randomUUID(),
  expenseCategoryOneId: randomUUID(),
  expenseCategoryTwoId: randomUUID(),
  cashExpenseId: randomUUID(),
  cashExpenseReversalId: randomUUID(),
  bankExpenseId: randomUUID(),
  otherCategoryExpenseId: randomUUID(),
};

const uniqueSuffix = randomUUID().slice(0, 8);
const client = shouldRun
  ? createDatabaseClient(databaseUrl, {
      maximumConnections: 3,
      connectionTimeoutMilliseconds: 5_000,
      idleTimeoutMilliseconds: 5_000,
    })
  : undefined;

/** Inserts cash/bank accounts and immutable movements used by Cash/Bank Report tests. */
async function seedCashBankData(): Promise<void> {
  if (!client) return;

  await client.pool.query(
    `insert into cash_accounts (id, name, opening_balance)
     values ($1, $2, 1000.00)`,
    [fixture.cashAccountId, `Report Cash ${uniqueSuffix}`],
  );

  await client.pool.query(
    `insert into bank_accounts
       (id, bank_name, account_name, account_number, opening_balance)
     values ($1, 'Report Bank', $2, $3, 2000.00)`,
    [
      fixture.bankAccountId,
      `Report Bank Account ${uniqueSuffix}`,
      `RPT-${uniqueSuffix}`,
    ],
  );

  await client.pool.query(
    `insert into cash_bank_movements
       (id, method, cash_account_id, direction, source_type, source_id,
        amount, occurred_at, document_number, description)
     values
       ($1, 'CASH', $2, 'INFLOW', 'OPENING_BALANCE', null,
        1000.00, '2026-07-31T19:00:00Z', $3, 'Opening cash balance'),
       ($4, 'CASH', $2, 'INFLOW', 'RECONCILIATION_ADJUSTMENT', $5,
        100.00, '2026-08-02T06:00:00Z', $6, 'Before selected range'),
       ($7, 'CASH', $2, 'INFLOW', 'CUSTOMER_RECEIPT', $8,
        300.00, '2026-08-04T08:00:00Z', $9, 'Cash receipt'),
       ($10, 'CASH', $2, 'OUTFLOW', 'EXPENSE', $11,
        125.00, '2026-08-05T08:00:00Z', $12, 'Cash expense'),
       ($13, 'CASH', $2, 'INFLOW', 'CUSTOMER_RECEIPT', $14,
        999.00, '2026-08-07T08:00:00Z', $15, 'After selected range')`,
    [
      fixture.cashOpeningMovementId,
      fixture.cashAccountId,
      `OPEN-C-${uniqueSuffix}`,
      fixture.cashBeforeRangeMovementId,
      randomUUID(),
      `PRE-C-${uniqueSuffix}`,
      fixture.cashInflowMovementId,
      randomUUID(),
      `IN-C-${uniqueSuffix}`,
      fixture.cashOutflowMovementId,
      fixture.cashExpenseId,
      `OUT-C-${uniqueSuffix}`,
      fixture.cashAfterRangeMovementId,
      randomUUID(),
      `POST-C-${uniqueSuffix}`,
    ],
  );

  await client.pool.query(
    `insert into cash_bank_movements
       (id, method, bank_account_id, direction, source_type, source_id,
        amount, occurred_at, document_number, description)
     values
       ($1, 'BANK_TRANSFER', $2, 'INFLOW', 'OPENING_BALANCE', null,
        2000.00, '2026-07-31T19:00:00Z', $3, 'Opening bank balance'),
       ($4, 'BANK_TRANSFER', $2, 'INFLOW', 'CUSTOMER_RECEIPT', $5,
        500.00, '2026-08-04T09:00:00Z', $6, 'Bank receipt'),
       ($7, 'BANK_TRANSFER', $2, 'OUTFLOW', 'SUPPLIER_PAYMENT', $8,
        200.00, '2026-08-05T09:00:00Z', $9, 'Bank supplier payment')`,
    [
      fixture.bankOpeningMovementId,
      fixture.bankAccountId,
      `OPEN-B-${uniqueSuffix}`,
      fixture.bankInflowMovementId,
      randomUUID(),
      `IN-B-${uniqueSuffix}`,
      fixture.bankOutflowMovementId,
      randomUUID(),
      `OUT-B-${uniqueSuffix}`,
    ],
  );
}

/** Inserts expense categories, expenses, and a linked reversal used by Expense Report tests. */
async function seedExpenseData(): Promise<void> {
  if (!client) return;

  await client.pool.query(
    `insert into expense_categories (id, name)
     values
       ($1, $3),
       ($2, $4)`,
    [
      fixture.expenseCategoryOneId,
      fixture.expenseCategoryTwoId,
      `Report Rent ${uniqueSuffix}`,
      `Report Utilities ${uniqueSuffix}`,
    ],
  );

  await client.pool.query(
    `insert into expenses
       (id, expense_number, expense_category_id, expense_date, amount,
        payment_method, cash_account_id, note, receipt_url)
     values
       ($1, $2, $3, '2026-08-04', 125.00,
        'CASH', $4, 'Cash expense note', 'https://example.com/cash-receipt')`,
    [
      fixture.cashExpenseId,
      `EXP-C-${uniqueSuffix}`,
      fixture.expenseCategoryOneId,
      fixture.cashAccountId,
    ],
  );

  await client.pool.query(
    `insert into expenses
       (id, expense_number, expense_category_id, expense_date, amount,
        payment_method, cash_account_id, reversal_of_expense_id, reversal_reason)
     values
       ($1, $2, $3, '2026-08-05', 125.00,
        'CASH', $4, $5, 'Incorrect expense')`,
    [
      fixture.cashExpenseReversalId,
      `EXP-R-${uniqueSuffix}`,
      fixture.expenseCategoryOneId,
      fixture.cashAccountId,
      fixture.cashExpenseId,
    ],
  );

  await client.pool.query(
    `insert into expenses
       (id, expense_number, expense_category_id, expense_date, amount,
        payment_method, bank_account_id, note)
     values
       ($1, $2, $3, '2026-08-05', 300.00,
        'BANK_TRANSFER', $4, 'Bank expense note')`,
    [
      fixture.bankExpenseId,
      `EXP-B-${uniqueSuffix}`,
      fixture.expenseCategoryOneId,
      fixture.bankAccountId,
    ],
  );

  await client.pool.query(
    `insert into expenses
       (id, expense_number, expense_category_id, expense_date, amount,
        payment_method, cash_account_id)
     values
       ($1, $2, $3, '2026-08-05', 75.00,
        'CASH', $4)`,
    [
      fixture.otherCategoryExpenseId,
      `EXP-O-${uniqueSuffix}`,
      fixture.expenseCategoryTwoId,
      fixture.cashAccountId,
    ],
  );
}

/** Removes only cash/bank and expense rows created by this integration-test file. */
async function cleanupFixtures(): Promise<void> {
  if (!client) return;

  await client.pool.query(
    `delete from cash_bank_movements
     where cash_account_id = $1 or bank_account_id = $2`,
    [fixture.cashAccountId, fixture.bankAccountId],
  );
  await client.pool.query(
    `delete from expenses
     where id = any($1::uuid[])`,
    [[
      fixture.cashExpenseReversalId,
      fixture.cashExpenseId,
      fixture.bankExpenseId,
      fixture.otherCategoryExpenseId,
    ]],
  );
  await client.pool.query(
    `delete from expense_categories where id = any($1::uuid[])`,
    [[fixture.expenseCategoryOneId, fixture.expenseCategoryTwoId]],
  );
  await client.pool.query(`delete from cash_accounts where id = $1`, [fixture.cashAccountId]);
  await client.pool.query(`delete from bank_accounts where id = $1`, [fixture.bankAccountId]);
}

before(async () => {
  if (!client) return;
  await cleanupFixtures();
  await seedCashBankData();
  await seedExpenseData();
});

after(async () => {
  if (!client) return;

  try {
    await cleanupFixtures();
  } finally {
    await client.pool.end();
  }
});

integrationTest("Cash/Bank Report calculates cash opening, period movement, and closing balances", async () => {
  assert.ok(client);

  const result = await getCashBankReport(client.database, {
    startDate: "2026-08-04",
    endDate: "2026-08-05",
    accountId: fixture.cashAccountId,
  });

  assert.equal(result.accounts.length, 1);
  const account = result.accounts[0];
  assert.equal(account?.accountType, "CASH");
  assert.equal(account?.openingBalance, "1100.00");
  assert.equal(account?.inflowAmount, "300.00");
  assert.equal(account?.outflowAmount, "125.00");
  assert.equal(account?.closingBalance, "1275.00");
  assert.deepEqual(
    account?.movements.map((movement) => [movement.businessDate, movement.direction, movement.amount]),
    [
      ["2026-08-04", "INFLOW", "300.00"],
      ["2026-08-05", "OUTFLOW", "125.00"],
    ],
  );
});

integrationTest("Cash/Bank Report calculates bank balances independently from cash", async () => {
  assert.ok(client);

  const result = await getCashBankReport(client.database, {
    startDate: "2026-08-04",
    endDate: "2026-08-05",
    accountId: fixture.bankAccountId,
  });

  assert.equal(result.accounts.length, 1);
  const account = result.accounts[0];
  assert.equal(account?.accountType, "BANK");
  assert.equal(account?.openingBalance, "2000.00");
  assert.equal(account?.inflowAmount, "500.00");
  assert.equal(account?.outflowAmount, "200.00");
  assert.equal(account?.closingBalance, "2300.00");
});

integrationTest("Expense Report includes expenses and deducts linked reversals on the reversal date", async () => {
  assert.ok(client);

  const result = await getExpenseReport(client.database, {
    startDate: "2026-08-04",
    endDate: "2026-08-05",
    categoryId: fixture.expenseCategoryOneId,
  });

  assert.deepEqual(result.totals, {
    expenseAmount: "425.00",
    reversalAmount: "125.00",
    netExpenseAmount: "300.00",
  });

  const fixtureRows = result.rows.filter((row) =>
    [fixture.cashExpenseId, fixture.cashExpenseReversalId, fixture.bankExpenseId].includes(row.expenseId),
  );

  assert.deepEqual(
    fixtureRows.map((row) => [
      row.documentType,
      row.documentDate,
      row.paymentMethod,
      row.amount,
      row.reversalOfExpenseId,
    ]),
    [
      ["EXPENSE", "2026-08-04", "CASH", "125.00", null],
      ["REVERSAL", "2026-08-05", "CASH", "-125.00", fixture.cashExpenseId],
      ["EXPENSE", "2026-08-05", "BANK_TRANSFER", "300.00", null],
    ],
  );
});

integrationTest("Expense Report category and date filters keep unrelated expenses out", async () => {
  assert.ok(client);

  const categoryResult = await getExpenseReport(client.database, {
    startDate: "2026-08-05",
    endDate: "2026-08-05",
    categoryId: fixture.expenseCategoryOneId,
  });

  assert.deepEqual(categoryResult.totals, {
    expenseAmount: "300.00",
    reversalAmount: "125.00",
    netExpenseAmount: "175.00",
  });
  assert.equal(
    categoryResult.rows.some((row) => row.expenseId === fixture.otherCategoryExpenseId),
    false,
  );
  assert.equal(
    categoryResult.rows.some((row) => row.expenseId === fixture.cashExpenseId),
    false,
  );
});
