import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";

import { createDatabaseClient } from "../../src/database/client.js";
import {
  getExpenseReport,
  getProductProfitReport,
  getProfitSummaryReport,
  getSalesReport,
} from "../../src/modules/reports/reports.service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const shouldRun = typeof databaseUrl === "string" && databaseUrl.length > 0;
const integrationTest = shouldRun ? test : test.skip;

const fixture = {
  categoryId: randomUUID(),
  productOneId: randomUUID(),
  productTwoId: randomUUID(),
  productOneUnitId: randomUUID(),
  productTwoUnitId: randomUUID(),
  customerId: randomUUID(),
  saleId: randomUUID(),
  saleItemOneId: randomUUID(),
  saleItemTwoId: randomUUID(),
  returnId: randomUUID(),
  returnItemId: randomUUID(),
  cashAccountId: randomUUID(),
  expenseCategoryId: randomUUID(),
  expenseOneId: randomUUID(),
  expenseOneReversalId: randomUUID(),
  expenseTwoId: randomUUID(),
};

const uniqueSuffix = randomUUID().slice(0, 8);
const client = shouldRun
  ? createDatabaseClient(databaseUrl, {
      maximumConnections: 3,
      connectionTimeoutMilliseconds: 5_000,
      idleTimeoutMilliseconds: 5_000,
    })
  : undefined;

/** Inserts the products and customer required by the profit report fixtures. */
async function seedMasterData(): Promise<void> {
  if (!client) return;

  await client.pool.query(
    `insert into product_categories (id, name)
     values ($1, $2)`,
    [fixture.categoryId, `Profit Category ${uniqueSuffix}`],
  );

  await client.pool.query(
    `insert into products (id, sku, name, category_id)
     values
       ($1, $2, 'Profit Product One', $3),
       ($4, $5, 'Profit Product Two', $3)`,
    [
      fixture.productOneId,
      `PROFIT-P1-${uniqueSuffix}`,
      fixture.categoryId,
      fixture.productTwoId,
      `PROFIT-P2-${uniqueSuffix}`,
    ],
  );

  await client.pool.query(
    `insert into product_units
       (id, product_id, unit_name, conversion_to_base, is_base_unit)
     values
       ($1, $2, 'Each', 1.000, true),
       ($3, $4, 'Each', 1.000, true)`,
    [
      fixture.productOneUnitId,
      fixture.productOneId,
      fixture.productTwoUnitId,
      fixture.productTwoId,
    ],
  );

  await client.pool.query(
    `insert into customers (id, code, name)
     values ($1, $2, 'Profit Report Customer')`,
    [fixture.customerId, `PROFIT-C-${uniqueSuffix}`],
  );
}

/** Inserts one confirmed sale and one later return with immutable cost snapshots. */
async function seedSalesAndReturn(): Promise<void> {
  if (!client) return;

  await client.pool.query(
    `insert into sales_invoices
       (id, invoice_number, customer_id, invoice_date, status,
        invoice_discount_amount, subtotal_amount, total_amount,
        initial_paid_amount, initial_due_amount, confirmed_at)
     values
       ($1, $2, $3, '2099-10-02', 'CONFIRMED',
        40.00, 400.00, 360.00, 0.00, 360.00, now())`,
    [fixture.saleId, `PROFIT-SI-${uniqueSuffix}`, fixture.customerId],
  );

  await client.pool.query(
    `insert into sales_invoice_items
       (id, sales_invoice_id, product_id, product_unit_id,
        product_sku_snapshot, product_name_snapshot, unit_name_snapshot,
        conversion_to_base_snapshot, quantity, base_quantity,
        manual_unit_price, item_discount_amount, line_total, unit_cost_snapshot)
     values
       ($1, $2, $3, $4, $5, 'Profit Product One Snapshot', 'Each',
        1.000, 1.000, 1.000, 100.00, 0.00, 100.00, 50.00),
       ($6, $2, $7, $8, $9, 'Profit Product Two Snapshot', 'Each',
        1.000, 3.000, 3.000, 100.00, 0.00, 300.00, 60.00)`,
    [
      fixture.saleItemOneId,
      fixture.saleId,
      fixture.productOneId,
      fixture.productOneUnitId,
      `PROFIT-SNAP-P1-${uniqueSuffix}`,
      fixture.saleItemTwoId,
      fixture.productTwoId,
      fixture.productTwoUnitId,
      `PROFIT-SNAP-P2-${uniqueSuffix}`,
    ],
  );

  await client.pool.query(
    `insert into sales_returns
       (id, return_number, original_sale_id, customer_id, return_date,
        reason, refund_mode, total_amount)
     values
       ($1, $2, $3, $4, '2099-10-03',
        'Profit integration return', 'DUE_REDUCTION', 20.00)`,
    [
      fixture.returnId,
      `PROFIT-SR-${uniqueSuffix}`,
      fixture.saleId,
      fixture.customerId,
    ],
  );

  await client.pool.query(
    `insert into sales_return_items
       (id, sales_return_id, original_sale_item_id, product_id, product_unit_id,
        product_sku_snapshot, product_name_snapshot, unit_name_snapshot,
        conversion_to_base_snapshot, quantity, base_quantity,
        unit_price_snapshot, unit_cost_snapshot, stock_condition, line_total)
     values
       ($1, $2, $3, $4, $5, $6, 'Profit Product One Snapshot', 'Each',
        1.000, 0.200, 0.200, 100.00, 50.00, 'GOOD', 20.00)`,
    [
      fixture.returnItemId,
      fixture.returnId,
      fixture.saleItemOneId,
      fixture.productOneId,
      fixture.productOneUnitId,
      `PROFIT-SNAP-P1-${uniqueSuffix}`,
    ],
  );
}

/** Inserts expenses and a full linked reversal used by Profit Summary. */
async function seedExpenses(): Promise<void> {
  if (!client) return;

  await client.pool.query(
    `insert into cash_accounts (id, name, opening_balance)
     values ($1, $2, 0.00)`,
    [fixture.cashAccountId, `Profit Cash ${uniqueSuffix}`],
  );

  await client.pool.query(
    `insert into expense_categories (id, name)
     values ($1, $2)`,
    [fixture.expenseCategoryId, `Profit Expense ${uniqueSuffix}`],
  );

  await client.pool.query(
    `insert into expenses
       (id, expense_number, expense_category_id, expense_date, amount,
        payment_method, cash_account_id)
     values
       ($1, $2, $3, '2099-10-02', 30.00, 'CASH', $4),
       ($5, $6, $3, '2099-10-02', 25.00, 'CASH', $4)`,
    [
      fixture.expenseOneId,
      `PROFIT-EXP-1-${uniqueSuffix}`,
      fixture.expenseCategoryId,
      fixture.cashAccountId,
      fixture.expenseTwoId,
      `PROFIT-EXP-2-${uniqueSuffix}`,
    ],
  );

  await client.pool.query(
    `insert into expenses
       (id, expense_number, expense_category_id, expense_date, amount,
        payment_method, cash_account_id, reversal_of_expense_id, reversal_reason)
     values
       ($1, $2, $3, '2099-10-03', 30.00,
        'CASH', $4, $5, 'Profit integration reversal')`,
    [
      fixture.expenseOneReversalId,
      `PROFIT-EXP-R-${uniqueSuffix}`,
      fixture.expenseCategoryId,
      fixture.cashAccountId,
      fixture.expenseOneId,
    ],
  );
}

/** Removes only rows created by this integration-test file in foreign-key-safe order. */
async function cleanupFixtures(): Promise<void> {
  if (!client) return;

  await client.pool.query("delete from expenses where id = $1", [fixture.expenseOneReversalId]);
  await client.pool.query(
    "delete from expenses where id = any($1::uuid[])",
    [[fixture.expenseOneId, fixture.expenseTwoId]],
  );
  await client.pool.query("delete from expense_categories where id = $1", [fixture.expenseCategoryId]);
  await client.pool.query("delete from cash_accounts where id = $1", [fixture.cashAccountId]);

  await client.pool.query("delete from sales_return_items where id = $1", [fixture.returnItemId]);
  await client.pool.query("delete from sales_returns where id = $1", [fixture.returnId]);
  await client.pool.query(
    "delete from sales_invoice_items where id = any($1::uuid[])",
    [[fixture.saleItemOneId, fixture.saleItemTwoId]],
  );
  await client.pool.query("delete from sales_invoices where id = $1", [fixture.saleId]);
  await client.pool.query(
    "delete from product_units where id = any($1::uuid[])",
    [[fixture.productOneUnitId, fixture.productTwoUnitId]],
  );
  await client.pool.query(
    "delete from products where id = any($1::uuid[])",
    [[fixture.productOneId, fixture.productTwoId]],
  );
  await client.pool.query("delete from customers where id = $1", [fixture.customerId]);
  await client.pool.query("delete from product_categories where id = $1", [fixture.categoryId]);
}

before(async () => {
  if (!client) return;
  await cleanupFixtures();
  await seedMasterData();
  await seedSalesAndReturn();
  await seedExpenses();
});

after(async () => {
  if (!client) return;

  try {
    await cleanupFixtures();
  } finally {
    await client.pool.end();
  }
});

integrationTest("Profit Summary uses immutable sale/return costs and subtracts net expenses", async () => {
  assert.ok(client);

  const result = await getProfitSummaryReport(client.database, {
    startDate: "2099-10-02",
    endDate: "2099-10-03",
  });

  assert.deepEqual(result, {
    salesAmount: "360.00",
    salesReturnAmount: "20.00",
    netSalesAmount: "340.00",
    costOfGoodsSoldAmount: "230.00",
    returnedCostAmount: "10.00",
    netCostAmount: "220.00",
    grossProfitAmount: "120.00",
    expenseAmount: "55.00",
    expenseReversalAmount: "30.00",
    netExpenseAmount: "25.00",
    estimatedProfitAmount: "95.00",
  });
});

integrationTest("Product Profit aggregates sales, returns, quantities, cost, and estimated profit per product", async () => {
  assert.ok(client);

  const result = await getProductProfitReport(client.database, {
    startDate: "2099-10-02",
    endDate: "2099-10-03",
    page: 1,
    pageSize: 20,
  });

  assert.equal(result.total, 2);
  assert.equal(result.items.length, 2);

  const productOne = result.items.find((item) => item.productId === fixture.productOneId);
  assert.deepEqual(productOne, {
    productId: fixture.productOneId,
    productSku: `PROFIT-SNAP-P1-${uniqueSuffix}`,
    productName: "Profit Product One Snapshot",
    soldBaseQuantity: "1.000",
    returnedBaseQuantity: "0.200",
    netBaseQuantity: "0.800",
    salesAmount: "90.00",
    returnAmount: "20.00",
    netSalesAmount: "70.00",
    costOfGoodsSoldAmount: "50.00",
    returnedCostAmount: "10.00",
    netCostAmount: "40.00",
    estimatedProfitAmount: "30.00",
  });

  const productTwo = result.items.find((item) => item.productId === fixture.productTwoId);
  assert.equal(productTwo?.salesAmount, "270.00");
  assert.equal(productTwo?.costOfGoodsSoldAmount, "180.00");
  assert.equal(productTwo?.estimatedProfitAmount, "90.00");
});

integrationTest("Product Profit product filter keeps full-invoice discount allocation", async () => {
  assert.ok(client);

  const result = await getProductProfitReport(client.database, {
    startDate: "2099-10-02",
    endDate: "2099-10-03",
    productId: fixture.productOneId,
    page: 1,
    pageSize: 20,
  });

  assert.equal(result.total, 1);
  assert.equal(result.items[0]?.salesAmount, "90.00");
  assert.equal(result.items[0]?.returnAmount, "20.00");
  assert.equal(result.items[0]?.estimatedProfitAmount, "30.00");
});

integrationTest("Product Profit reports a return on its return date using the original cost snapshot", async () => {
  assert.ok(client);

  const result = await getProductProfitReport(client.database, {
    startDate: "2099-10-03",
    endDate: "2099-10-03",
    productId: fixture.productOneId,
    page: 1,
    pageSize: 20,
  });

  assert.equal(result.total, 1);
  assert.deepEqual(result.items[0], {
    productId: fixture.productOneId,
    productSku: `PROFIT-SNAP-P1-${uniqueSuffix}`,
    productName: "Profit Product One Snapshot",
    soldBaseQuantity: "0.000",
    returnedBaseQuantity: "0.200",
    netBaseQuantity: "-0.200",
    salesAmount: "0.00",
    returnAmount: "20.00",
    netSalesAmount: "-20.00",
    costOfGoodsSoldAmount: "0.00",
    returnedCostAmount: "10.00",
    netCostAmount: "-10.00",
    estimatedProfitAmount: "-10.00",
  });
});

integrationTest("Product Profit pagination returns stable page metadata", async () => {
  assert.ok(client);

  const result = await getProductProfitReport(client.database, {
    startDate: "2099-10-02",
    endDate: "2099-10-03",
    page: 2,
    pageSize: 1,
  });

  assert.equal(result.total, 2);
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 1);
  assert.equal(result.items.length, 1);
});

integrationTest("Profit Summary reconciles with Sales and Expense Reports for the same period", async () => {
  assert.ok(client);

  const query = {
    startDate: "2099-10-02",
    endDate: "2099-10-03",
  };

  const [profit, sales, expenses] = await Promise.all([
    getProfitSummaryReport(client.database, query),
    getSalesReport(client.database, query),
    getExpenseReport(client.database, query),
  ]);

  assert.equal(profit.salesAmount, sales.totals.salesAmount);
  assert.equal(profit.salesReturnAmount, sales.totals.returnAmount);
  assert.equal(profit.netSalesAmount, sales.totals.netSalesAmount);
  assert.equal(profit.expenseAmount, expenses.totals.expenseAmount);
  assert.equal(profit.expenseReversalAmount, expenses.totals.reversalAmount);
  assert.equal(profit.netExpenseAmount, expenses.totals.netExpenseAmount);
});

integrationTest("Product Profit totals reconcile with Profit Summary sales and cost values", async () => {
  assert.ok(client);

  const query = {
    startDate: "2099-10-02",
    endDate: "2099-10-03",
  };

  const [profit, productProfit] = await Promise.all([
    getProfitSummaryReport(client.database, query),
    getProductProfitReport(client.database, {
      ...query,
      page: 1,
      pageSize: 100,
    }),
  ]);

  const toCents = (value: string): bigint => {
    const negative = value.startsWith("-");
    const [whole = "0", fraction = ""] = value.replace("-", "").split(".");
    const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
    return negative ? -cents : cents;
  };

  const sum = (field: "netSalesAmount" | "netCostAmount" | "estimatedProfitAmount") =>
    productProfit.items.reduce((total, item) => total + toCents(item[field]), 0n);

  assert.equal(sum("netSalesAmount"), toCents(profit.netSalesAmount));
  assert.equal(sum("netCostAmount"), toCents(profit.netCostAmount));
  assert.equal(sum("estimatedProfitAmount"), toCents(profit.grossProfitAmount));
});
