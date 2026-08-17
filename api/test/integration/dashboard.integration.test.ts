import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";

import { createDatabaseClient } from "../../src/database/client.js";
import {
  getDashboardLowStock,
  getDashboardOverview,
} from "../../src/modules/dashboard/dashboard.service.js";
import {
  getCashBankReport,
  getCustomerOutstandingReport,
  getExpenseReport,
  getInventoryReport,
  getProfitSummaryReport,
  getPurchasesReport,
  getSalesReport,
  getSupplierPayableReport,
} from "../../src/modules/reports/reports.service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const shouldRun = typeof databaseUrl === "string" && databaseUrl.length > 0;
const integrationTest = shouldRun ? test : test.skip;
const businessDate = "2099-12-14";

const fixture = {
  categoryId: randomUUID(),
  normalProductId: randomUUID(),
  lowProductId: randomUUID(),
  outProductId: randomUUID(),
  normalUnitId: randomUUID(),
  lowUnitId: randomUUID(),
  outUnitId: randomUUID(),
  normalBalanceId: randomUUID(),
  lowBalanceId: randomUUID(),
  outBalanceId: randomUUID(),
  customerId: randomUUID(),
  supplierId: randomUUID(),
  confirmedSaleId: randomUUID(),
  confirmedSaleItemId: randomUUID(),
  draftSaleId: randomUUID(),
  confirmedPurchaseId: randomUUID(),
  confirmedPurchaseItemId: randomUUID(),
  draftPurchaseId: randomUUID(),
  cashAccountId: randomUUID(),
  bankAccountId: randomUUID(),
  cashInflowMovementId: randomUUID(),
  cashOutflowMovementId: randomUUID(),
  bankInflowMovementId: randomUUID(),
  bankOutflowMovementId: randomUUID(),
  expenseCategoryId: randomUUID(),
  expenseId: randomUUID(),
  expenseReversalId: randomUUID(),
};

const uniqueSuffix = randomUUID().slice(0, 8);
const client = shouldRun
  ? createDatabaseClient(databaseUrl, {
      maximumConnections: 3,
      connectionTimeoutMilliseconds: 5_000,
      idleTimeoutMilliseconds: 5_000,
    })
  : undefined;


/** Converts an API money string into exact integer cents for reconciliation assertions. */
function moneyToCents(value: string): bigint {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [wholePart, decimalPart = ""] = unsigned.split(".");
  const cents =
    BigInt(wholePart) * 100n + BigInt(decimalPart.padEnd(2, "0").slice(0, 2));
  return negative ? -cents : cents;
}

/** Inserts products, stock balances, customer, and supplier master data for Dashboard tests. */
async function seedMasterAndInventoryData(): Promise<void> {
  if (!client) return;

  await client.pool.query(
    `insert into product_categories (id, name)
     values ($1, $2)`,
    [fixture.categoryId, `Dashboard Category ${uniqueSuffix}`],
  );

  await client.pool.query(
    `insert into products (id, sku, name, category_id, reorder_level)
     values
       ($1, $2, 'Dashboard Normal Product', $7, 5.000),
       ($3, $4, 'Dashboard Low Product', $7, 5.000),
       ($5, $6, 'Dashboard Out Product', $7, 2.000)`,
    [
      fixture.normalProductId,
      `DASH-N-${uniqueSuffix}`,
      fixture.lowProductId,
      `DASH-L-${uniqueSuffix}`,
      fixture.outProductId,
      `DASH-O-${uniqueSuffix}`,
      fixture.categoryId,
    ],
  );

  await client.pool.query(
    `insert into product_units
       (id, product_id, unit_name, conversion_to_base, is_base_unit)
     values
       ($1, $2, 'Each', 1.000, true),
       ($3, $4, 'Each', 1.000, true),
       ($5, $6, 'Each', 1.000, true)`,
    [
      fixture.normalUnitId,
      fixture.normalProductId,
      fixture.lowUnitId,
      fixture.lowProductId,
      fixture.outUnitId,
      fixture.outProductId,
    ],
  );

  await client.pool.query(
    `insert into inventory_balances
       (id, product_id, sellable_quantity_on_hand, damaged_quantity_on_hand,
        expired_quantity_on_hand, weighted_average_cost)
     values
       ($1, $2, 20.000, 0.000, 0.000, 80.00),
       ($3, $4, 4.000, 10.000, 8.000, 50.00),
       ($5, $6, 0.000, 7.000, 6.000, 25.00)`,
    [
      fixture.normalBalanceId,
      fixture.normalProductId,
      fixture.lowBalanceId,
      fixture.lowProductId,
      fixture.outBalanceId,
      fixture.outProductId,
    ],
  );

  await client.pool.query(
    `insert into customers (id, code, name)
     values ($1, $2, 'Dashboard Customer')`,
    [fixture.customerId, `DASH-C-${uniqueSuffix}`],
  );

  await client.pool.query(
    `insert into suppliers (id, code, name)
     values ($1, $2, 'Dashboard Supplier')`,
    [fixture.supplierId, `DASH-S-${uniqueSuffix}`],
  );
}

/** Inserts confirmed and draft sales/purchases so Dashboard status filtering is tested with real rows. */
async function seedSalesAndPurchases(): Promise<void> {
  if (!client) return;

  await client.pool.query(
    `insert into sales_invoices
       (id, invoice_number, customer_id, invoice_date, status,
        subtotal_amount, total_amount, initial_paid_amount, initial_due_amount, confirmed_at)
     values
       ($1, $2, $3, $4, 'CONFIRMED', 200.00, 200.00, 0.00, 200.00, now()),
       ($5, null, $3, $4, 'DRAFT', 999.00, 999.00, 0.00, 999.00, null)`,
    [
      fixture.confirmedSaleId,
      `DASH-SI-${uniqueSuffix}`,
      fixture.customerId,
      businessDate,
      fixture.draftSaleId,
    ],
  );

  await client.pool.query(
    `insert into sales_invoice_items
       (id, sales_invoice_id, product_id, product_unit_id,
        product_sku_snapshot, product_name_snapshot, unit_name_snapshot,
        conversion_to_base_snapshot, quantity, base_quantity,
        manual_unit_price, item_discount_amount, line_total, unit_cost_snapshot)
     values
       ($1, $2, $3, $4, $5, 'Dashboard Normal Product', 'Each',
        1.000, 1.000, 1.000, 200.00, 0.00, 200.00, 80.00)`,
    [
      fixture.confirmedSaleItemId,
      fixture.confirmedSaleId,
      fixture.normalProductId,
      fixture.normalUnitId,
      `DASH-N-${uniqueSuffix}`,
    ],
  );

  await client.pool.query(
    `insert into purchases
       (id, purchase_number, supplier_id, purchase_date, status,
        subtotal_amount, total_amount, initial_paid_amount, initial_due_amount, confirmed_at)
     values
       ($1, $2, $3, $4, 'CONFIRMED', 150.00, 150.00, 0.00, 150.00, now()),
       ($5, null, $3, $4, 'DRAFT', 999.00, 999.00, 0.00, 999.00, null)`,
    [
      fixture.confirmedPurchaseId,
      `DASH-PI-${uniqueSuffix}`,
      fixture.supplierId,
      businessDate,
      fixture.draftPurchaseId,
    ],
  );

  await client.pool.query(
    `insert into purchase_items
       (id, purchase_id, product_id, product_unit_id,
        product_sku_snapshot, product_name_snapshot, unit_name_snapshot,
        conversion_to_base_snapshot, quantity, base_quantity, unit_cost,
        item_discount_amount, line_total, allocated_extra_cost, landed_unit_cost)
     values
       ($1, $2, $3, $4, $5, 'Dashboard Normal Product', 'Each',
        1.000, 1.000, 1.000, 150.00, 0.00, 150.00, 0.00, 150.00)`,
    [
      fixture.confirmedPurchaseItemId,
      fixture.confirmedPurchaseId,
      fixture.normalProductId,
      fixture.normalUnitId,
      `DASH-N-${uniqueSuffix}`,
    ],
  );
}

/** Inserts immutable ledger entries used by Dashboard customer-due and supplier-payable summaries. */
async function seedLedgerData(): Promise<void> {
  if (!client) return;

  await client.pool.query(
    `insert into customer_ledger_entries
       (customer_id, occurred_at, reference_type, reference_id, debit, credit)
     values
       ($1, now(), 'SALE', $2, 500.00, 0.00),
       ($1, now(), 'PAYMENT', $3, 0.00, 200.00)`,
    [fixture.customerId, fixture.confirmedSaleId, randomUUID()],
  );

  await client.pool.query(
    `insert into supplier_ledger_entries
       (supplier_id, occurred_at, reference_type, reference_id, debit, credit)
     values
       ($1, now(), 'PURCHASE', $2, 0.00, 600.00),
       ($1, now(), 'PAYMENT', $3, 200.00, 0.00)`,
    [fixture.supplierId, fixture.confirmedPurchaseId, randomUUID()],
  );
}

/** Inserts cash/bank movements and an expense plus reversal for Dashboard financial summaries. */
async function seedMoneyAndExpenseData(): Promise<void> {
  if (!client) return;

  await client.pool.query(
    `insert into cash_accounts (id, name, opening_balance)
     values ($1, $2, 0.00)`,
    [fixture.cashAccountId, `Dashboard Cash ${uniqueSuffix}`],
  );

  await client.pool.query(
    `insert into bank_accounts
       (id, bank_name, account_name, account_number, opening_balance)
     values ($1, 'Dashboard Bank', $2, $3, 0.00)`,
    [
      fixture.bankAccountId,
      `Dashboard Account ${uniqueSuffix}`,
      `DASH-${uniqueSuffix}`,
    ],
  );

  await client.pool.query(
    `insert into cash_bank_movements
       (id, method, cash_account_id, direction, source_type, source_id,
        amount, occurred_at, document_number, description)
     values
       ($1, 'CASH', $2, 'INFLOW', 'CUSTOMER_RECEIPT', $3,
        500.00, '2099-12-14T06:00:00Z', $4, 'Dashboard cash inflow'),
       ($5, 'CASH', $2, 'OUTFLOW', 'SUPPLIER_PAYMENT', $6,
        100.00, '2099-12-14T07:00:00Z', $7, 'Dashboard cash outflow')`,
    [
      fixture.cashInflowMovementId,
      fixture.cashAccountId,
      randomUUID(),
      `DASH-C-IN-${uniqueSuffix}`,
      fixture.cashOutflowMovementId,
      randomUUID(),
      `DASH-C-OUT-${uniqueSuffix}`,
    ],
  );

  await client.pool.query(
    `insert into cash_bank_movements
       (id, method, bank_account_id, direction, source_type, source_id,
        amount, occurred_at, document_number, description)
     values
       ($1, 'BANK_TRANSFER', $2, 'INFLOW', 'CUSTOMER_RECEIPT', $3,
        700.00, '2099-12-14T08:00:00Z', $4, 'Dashboard bank inflow'),
       ($5, 'BANK_TRANSFER', $2, 'OUTFLOW', 'SUPPLIER_PAYMENT', $6,
        200.00, '2099-12-14T09:00:00Z', $7, 'Dashboard bank outflow')`,
    [
      fixture.bankInflowMovementId,
      fixture.bankAccountId,
      randomUUID(),
      `DASH-B-IN-${uniqueSuffix}`,
      fixture.bankOutflowMovementId,
      randomUUID(),
      `DASH-B-OUT-${uniqueSuffix}`,
    ],
  );

  await client.pool.query(
    `insert into expense_categories (id, name)
     values ($1, $2)`,
    [fixture.expenseCategoryId, `Dashboard Expense ${uniqueSuffix}`],
  );

  await client.pool.query(
    `insert into expenses
       (id, expense_number, expense_category_id, expense_date, amount,
        payment_method, cash_account_id)
     values
       ($1, $2, $3, $4, 50.00, 'CASH', $5)`,
    [
      fixture.expenseId,
      `DASH-EXP-${uniqueSuffix}`,
      fixture.expenseCategoryId,
      businessDate,
      fixture.cashAccountId,
    ],
  );

  await client.pool.query(
    `insert into expenses
       (id, expense_number, expense_category_id, expense_date, amount,
        payment_method, cash_account_id, reversal_of_expense_id, reversal_reason)
     values
       ($1, $2, $3, $4, 20.00, 'CASH', $5, $6, 'Dashboard test reversal')`,
    [
      fixture.expenseReversalId,
      `DASH-EXPR-${uniqueSuffix}`,
      fixture.expenseCategoryId,
      businessDate,
      fixture.cashAccountId,
      fixture.expenseId,
    ],
  );
}

/** Removes only the rows created by this Dashboard integration-test file. */
async function cleanupFixtures(): Promise<void> {
  if (!client) return;

  await client.pool.query(
    `delete from expenses where id = any($1::uuid[])`,
    [[fixture.expenseReversalId, fixture.expenseId]],
  );
  await client.pool.query(
    `delete from expense_categories where id = $1`,
    [fixture.expenseCategoryId],
  );
  await client.pool.query(
    `delete from cash_bank_movements
     where id = any($1::uuid[])`,
    [[
      fixture.cashInflowMovementId,
      fixture.cashOutflowMovementId,
      fixture.bankInflowMovementId,
      fixture.bankOutflowMovementId,
    ]],
  );
  await client.pool.query(`delete from cash_accounts where id = $1`, [fixture.cashAccountId]);
  await client.pool.query(`delete from bank_accounts where id = $1`, [fixture.bankAccountId]);
  await client.pool.query(`delete from customer_ledger_entries where customer_id = $1`, [fixture.customerId]);
  await client.pool.query(`delete from supplier_ledger_entries where supplier_id = $1`, [fixture.supplierId]);
  await client.pool.query(`delete from sales_invoice_items where sales_invoice_id = $1`, [fixture.confirmedSaleId]);
  await client.pool.query(
    `delete from sales_invoices where id = any($1::uuid[])`,
    [[fixture.confirmedSaleId, fixture.draftSaleId]],
  );
  await client.pool.query(`delete from purchase_items where purchase_id = $1`, [fixture.confirmedPurchaseId]);
  await client.pool.query(
    `delete from purchases where id = any($1::uuid[])`,
    [[fixture.confirmedPurchaseId, fixture.draftPurchaseId]],
  );
  await client.pool.query(
    `delete from inventory_balances where product_id = any($1::uuid[])`,
    [[fixture.normalProductId, fixture.lowProductId, fixture.outProductId]],
  );
  await client.pool.query(
    `delete from product_units where product_id = any($1::uuid[])`,
    [[fixture.normalProductId, fixture.lowProductId, fixture.outProductId]],
  );
  await client.pool.query(
    `delete from products where id = any($1::uuid[])`,
    [[fixture.normalProductId, fixture.lowProductId, fixture.outProductId]],
  );
  await client.pool.query(`delete from product_categories where id = $1`, [fixture.categoryId]);
  await client.pool.query(`delete from customers where id = $1`, [fixture.customerId]);
  await client.pool.query(`delete from suppliers where id = $1`, [fixture.supplierId]);
}

before(async () => {
  if (!client) return;

  await cleanupFixtures();
  await seedMasterAndInventoryData();
  await seedSalesAndPurchases();
  await seedLedgerData();
  await seedMoneyAndExpenseData();
});

after(async () => {
  if (!client) return;

  try {
    await cleanupFixtures();
  } finally {
    await client.pool.end();
  }
});

integrationTest("Dashboard overview aggregates the real Module 1-13 source tables", async () => {
  assert.ok(client);

  const result = await getDashboardOverview(client.database, { date: businessDate });

  assert.equal(result.businessDate, businessDate);
  assert.deepEqual(result.sales, {
    invoiceCount: 1,
    totalSalesAmount: "200.00",
  });
  assert.deepEqual(result.purchases, {
    purchaseCount: 1,
    totalPurchaseAmount: "150.00",
  });
  assert.deepEqual(result.inventory, {
    lowStockCount: 2,
    outOfStockCount: 1,
  });
  assert.deepEqual(result.customerOutstanding, {
    customerCount: 1,
    totalOutstandingAmount: "300.00",
  });
  assert.deepEqual(result.supplierPayable, {
    supplierCount: 1,
    totalPayableAmount: "400.00",
  });
  assert.deepEqual(result.cashBank, {
    cashBalance: "400.00",
    bankBalance: "500.00",
    totalBalance: "900.00",
  });
  assert.deepEqual(result.expenses, {
    expenseCount: 1,
    expenseAmount: "50.00",
    reversalAmount: "20.00",
    netExpenseAmount: "30.00",
  });
  assert.deepEqual(result.estimatedGrossProfit, {
    netSalesAmount: "200.00",
    netCostAmount: "80.00",
    grossProfitAmount: "120.00",
  });

  assert.deepEqual(
    result.recentSales.map((sale) => [sale.id, sale.invoiceNumber, sale.totalAmount]),
    [[fixture.confirmedSaleId, `DASH-SI-${uniqueSuffix}`, "200.00"]],
  );
  assert.deepEqual(
    result.recentPurchases.map((purchase) => [
      purchase.id,
      purchase.purchaseNumber,
      purchase.totalAmount,
    ]),
    [[fixture.confirmedPurchaseId, `DASH-PI-${uniqueSuffix}`, "150.00"]],
  );
});

integrationTest("Dashboard totals reconcile with the matching Reports calculations", async () => {
  assert.ok(client);

  const [
    dashboard,
    salesReport,
    purchasesReport,
    customerOutstandingReport,
    supplierPayableReport,
    cashBankReport,
    expenseReport,
    profitReport,
    inventoryReport,
  ] = await Promise.all([
    getDashboardOverview(client.database, { date: businessDate }),
    getSalesReport(client.database, {
      startDate: businessDate,
      endDate: businessDate,
    }),
    getPurchasesReport(client.database, {
      startDate: businessDate,
      endDate: businessDate,
    }),
    getCustomerOutstandingReport(client.database, { page: 1, pageSize: 100 }),
    getSupplierPayableReport(client.database, { page: 1, pageSize: 100 }),
    getCashBankReport(client.database, {
      startDate: "1900-01-01",
      endDate: "9999-12-31",
    }),
    getExpenseReport(client.database, {
      startDate: businessDate,
      endDate: businessDate,
    }),
    getProfitSummaryReport(client.database, {
      startDate: businessDate,
      endDate: businessDate,
    }),
    getInventoryReport(client.database, {
      startDate: businessDate,
      endDate: businessDate,
      lowStock: true,
    }),
  ]);

  assert.equal(dashboard.sales.totalSalesAmount, salesReport.totals.salesAmount);
  assert.equal(
    dashboard.purchases.totalPurchaseAmount,
    purchasesReport.totals.purchasesAmount,
  );

  assert.equal(
    dashboard.customerOutstanding.customerCount,
    customerOutstandingReport.total,
  );
  assert.equal(
    moneyToCents(dashboard.customerOutstanding.totalOutstandingAmount),
    customerOutstandingReport.items.reduce(
      (sum, item) => sum + moneyToCents(item.outstandingAmount),
      0n,
    ),
  );

  assert.equal(
    dashboard.supplierPayable.supplierCount,
    supplierPayableReport.total,
  );
  assert.equal(
    moneyToCents(dashboard.supplierPayable.totalPayableAmount),
    supplierPayableReport.items.reduce(
      (sum, item) => sum + moneyToCents(item.payableAmount),
      0n,
    ),
  );

  assert.equal(
    dashboard.expenses.expenseAmount,
    expenseReport.totals.expenseAmount,
  );
  assert.equal(
    dashboard.expenses.reversalAmount,
    expenseReport.totals.reversalAmount,
  );
  assert.equal(
    dashboard.expenses.netExpenseAmount,
    expenseReport.totals.netExpenseAmount,
  );

  assert.equal(
    dashboard.estimatedGrossProfit.netSalesAmount,
    profitReport.netSalesAmount,
  );
  assert.equal(
    dashboard.estimatedGrossProfit.netCostAmount,
    profitReport.netCostAmount,
  );
  assert.equal(
    dashboard.estimatedGrossProfit.grossProfitAmount,
    profitReport.grossProfitAmount,
  );

  const reportCashBalance = cashBankReport.accounts
    .filter((account) => account.accountType === "CASH")
    .reduce((sum, account) => sum + moneyToCents(account.closingBalance), 0n);
  const reportBankBalance = cashBankReport.accounts
    .filter((account) => account.accountType === "BANK")
    .reduce((sum, account) => sum + moneyToCents(account.closingBalance), 0n);

  assert.equal(moneyToCents(dashboard.cashBank.cashBalance), reportCashBalance);
  assert.equal(moneyToCents(dashboard.cashBank.bankBalance), reportBankBalance);
  assert.equal(
    moneyToCents(dashboard.cashBank.totalBalance),
    reportCashBalance + reportBankBalance,
  );

  assert.deepEqual(
    dashboard.lowStock.items.map((item) => item.productId).sort(),
    inventoryReport.stock.map((item) => item.productId).sort(),
  );
});

integrationTest("Dashboard low-stock uses sellable quantity and includes low/out-of-stock products", async () => {
  assert.ok(client);

  const result = await getDashboardLowStock(client.database, { page: 1 });

  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 20);
  assert.equal(result.total, 2);
  assert.deepEqual(
    result.items.map((item) => [item.productId, item.sellableQuantity, item.isOutOfStock]),
    [
      [fixture.outProductId, "0.000", true],
      [fixture.lowProductId, "4.000", false],
    ],
  );
  assert.equal(result.items.some((item) => item.productId === fixture.normalProductId), false);
});

integrationTest("Dashboard overview returns safe zero values for an empty business date", async () => {
  assert.ok(client);

  const result = await getDashboardOverview(client.database, { date: "2099-12-15" });

  assert.deepEqual(result.sales, {
    invoiceCount: 0,
    totalSalesAmount: "0.00",
  });
  assert.deepEqual(result.purchases, {
    purchaseCount: 0,
    totalPurchaseAmount: "0.00",
  });
  assert.deepEqual(result.expenses, {
    expenseCount: 0,
    expenseAmount: "0.00",
    reversalAmount: "0.00",
    netExpenseAmount: "0.00",
  });
  assert.deepEqual(result.estimatedGrossProfit, {
    netSalesAmount: "0.00",
    netCostAmount: "0.00",
    grossProfitAmount: "0.00",
  });
  assert.deepEqual(result.recentSales, []);
  assert.deepEqual(result.recentPurchases, []);
});
