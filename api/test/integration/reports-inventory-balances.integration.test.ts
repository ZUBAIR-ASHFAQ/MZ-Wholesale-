import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";

import { createDatabaseClient } from "../../src/database/client.js";
import {
  getCustomerOutstandingReport,
  getInventoryReport,
  getSupplierPayableReport,
} from "../../src/modules/reports/reports.service.js";
import {
  getCustomerOutstanding,
  getSupplierPayables,
} from "../../src/modules/ledgers/ledgers.service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const shouldRun = typeof databaseUrl === "string" && databaseUrl.length > 0;
const integrationTest = shouldRun ? test : test.skip;

const fixture = {
  categoryId: randomUUID(),
  productOneId: randomUUID(),
  productTwoId: randomUUID(),
  productOneUnitId: randomUUID(),
  productTwoUnitId: randomUUID(),
  inventoryBalanceOneId: randomUUID(),
  inventoryBalanceTwoId: randomUUID(),
  movementBeforeRangeId: randomUUID(),
  movementOneId: randomUUID(),
  movementTwoId: randomUUID(),
  movementAfterRangeId: randomUUID(),
  customerOneId: randomUUID(),
  customerTwoId: randomUUID(),
  customerThreeId: randomUUID(),
  supplierOneId: randomUUID(),
  supplierTwoId: randomUUID(),
  supplierThreeId: randomUUID(),
};

const uniqueSuffix = randomUUID().slice(0, 8);
const client = shouldRun
  ? createDatabaseClient(databaseUrl, {
      maximumConnections: 3,
      connectionTimeoutMilliseconds: 5_000,
      idleTimeoutMilliseconds: 5_000,
    })
  : undefined;

/** Inserts products, stock balances, and stock movements used by Inventory Report tests. */
async function seedInventoryData(): Promise<void> {
  if (!client) return;

  await client.pool.query(
    `insert into product_categories (id, name)
     values ($1, $2)`,
    [fixture.categoryId, `Inventory Report Category ${uniqueSuffix}`],
  );

  await client.pool.query(
    `insert into products (id, sku, name, category_id, reorder_level)
     values
       ($1, $2, 'Inventory Report Product One', $5, 10.000),
       ($3, $4, 'Inventory Report Product Two', $5, 5.000)`,
    [
      fixture.productOneId,
      `INV-R1-${uniqueSuffix}`,
      fixture.productTwoId,
      `INV-R2-${uniqueSuffix}`,
      fixture.categoryId,
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
    `insert into inventory_balances
       (id, product_id, sellable_quantity_on_hand, damaged_quantity_on_hand,
        expired_quantity_on_hand, weighted_average_cost)
     values
       ($1, $2, 8.000, 2.000, 1.000, 45.50),
       ($3, $4, 20.000, 0.000, 3.000, 60.25)`,
    [
      fixture.inventoryBalanceOneId,
      fixture.productOneId,
      fixture.inventoryBalanceTwoId,
      fixture.productTwoId,
    ],
  );

  await client.pool.query(
    `insert into stock_movements
       (id, product_id, movement_type, stock_condition, direction, quantity,
        unit_cost, source_type, source_id, reason, occurred_at)
     values
       ($1, $5, 'OPENING_STOCK', 'SELLABLE', 'IN', 12.000, 40.00, 'TEST', $9, 'Before range', '2026-08-01T06:00:00Z'),
       ($2, $5, 'SALE', 'SELLABLE', 'OUT', 4.000, 45.50, 'TEST', $10, 'In range sale', '2026-08-04T08:00:00Z'),
       ($3, $6, 'ADJUSTMENT', 'EXPIRED', 'IN', 3.000, 60.25, 'TEST', $11, 'In range expiry', '2026-08-05T08:00:00Z'),
       ($4, $6, 'PURCHASE', 'SELLABLE', 'IN', 5.000, 60.25, 'TEST', $12, 'After range', '2026-08-09T08:00:00Z')`,
    [
      fixture.movementBeforeRangeId,
      fixture.movementOneId,
      fixture.movementTwoId,
      fixture.movementAfterRangeId,
      fixture.productOneId,
      fixture.productTwoId,
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ],
  );
}

/** Inserts customer and supplier ledger balances used by outstanding/payable tests. */
async function seedLedgerData(): Promise<void> {
  if (!client) return;

  await client.pool.query(
    `insert into customers (id, code, name, phone)
     values
       ($1, $4, 'Alpha Outstanding Customer', '0300-1111111'),
       ($2, $5, 'Zero Outstanding Customer', '0300-2222222'),
       ($3, $6, 'Zeta Outstanding Customer', '0300-3333333')`,
    [
      fixture.customerOneId,
      fixture.customerTwoId,
      fixture.customerThreeId,
      `OUT-C1-${uniqueSuffix}`,
      `OUT-C2-${uniqueSuffix}`,
      `OUT-C3-${uniqueSuffix}`,
    ],
  );

  await client.pool.query(
    `insert into customer_ledger_entries
       (customer_id, occurred_at, reference_type, reference_id, debit, credit)
     values
       ($1, now(), 'SALE', $4, 500.00, 0.00),
       ($1, now(), 'PAYMENT', $5, 0.00, 125.00),
       ($2, now(), 'SALE', $6, 200.00, 0.00),
       ($2, now(), 'PAYMENT', $7, 0.00, 200.00),
       ($3, now(), 'SALE', $8, 700.00, 0.00)`,
    [
      fixture.customerOneId,
      fixture.customerTwoId,
      fixture.customerThreeId,
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ],
  );

  await client.pool.query(
    `insert into suppliers (id, code, name, phone)
     values
       ($1, $4, 'Alpha Payable Supplier', '0311-1111111'),
       ($2, $5, 'Zero Payable Supplier', '0311-2222222'),
       ($3, $6, 'Zeta Payable Supplier', '0311-3333333')`,
    [
      fixture.supplierOneId,
      fixture.supplierTwoId,
      fixture.supplierThreeId,
      `PAY-S1-${uniqueSuffix}`,
      `PAY-S2-${uniqueSuffix}`,
      `PAY-S3-${uniqueSuffix}`,
    ],
  );

  await client.pool.query(
    `insert into supplier_ledger_entries
       (supplier_id, occurred_at, reference_type, reference_id, debit, credit)
     values
       ($1, now(), 'PURCHASE', $4, 0.00, 600.00),
       ($1, now(), 'PAYMENT', $5, 150.00, 0.00),
       ($2, now(), 'PURCHASE', $6, 0.00, 300.00),
       ($2, now(), 'PAYMENT', $7, 300.00, 0.00),
       ($3, now(), 'PURCHASE', $8, 0.00, 800.00)`,
    [
      fixture.supplierOneId,
      fixture.supplierTwoId,
      fixture.supplierThreeId,
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ],
  );
}

/** Removes only rows created by this integration-test file. */
async function cleanupFixtures(): Promise<void> {
  if (!client) return;

  await client.pool.query(
    `delete from customer_ledger_entries where customer_id = any($1::uuid[])`,
    [[fixture.customerOneId, fixture.customerTwoId, fixture.customerThreeId]],
  );
  await client.pool.query(
    `delete from supplier_ledger_entries where supplier_id = any($1::uuid[])`,
    [[fixture.supplierOneId, fixture.supplierTwoId, fixture.supplierThreeId]],
  );
  await client.pool.query(
    `delete from stock_movements where product_id = any($1::uuid[])`,
    [[fixture.productOneId, fixture.productTwoId]],
  );
  await client.pool.query(
    `delete from inventory_balances where product_id = any($1::uuid[])`,
    [[fixture.productOneId, fixture.productTwoId]],
  );
  await client.pool.query(
    `delete from product_units where product_id = any($1::uuid[])`,
    [[fixture.productOneId, fixture.productTwoId]],
  );
  await client.pool.query(
    `delete from products where id = any($1::uuid[])`,
    [[fixture.productOneId, fixture.productTwoId]],
  );
  await client.pool.query(`delete from product_categories where id = $1`, [fixture.categoryId]);
  await client.pool.query(
    `delete from customers where id = any($1::uuid[])`,
    [[fixture.customerOneId, fixture.customerTwoId, fixture.customerThreeId]],
  );
  await client.pool.query(
    `delete from suppliers where id = any($1::uuid[])`,
    [[fixture.supplierOneId, fixture.supplierTwoId, fixture.supplierThreeId]],
  );
}

before(async () => {
  if (!client) return;
  await cleanupFixtures();
  await seedInventoryData();
  await seedLedgerData();
});

after(async () => {
  if (!client) return;

  try {
    await cleanupFixtures();
  } finally {
    await client.pool.end();
  }
});

integrationTest("Inventory Report returns current balances and only movements inside the date range", async () => {
  assert.ok(client);

  const result = await getInventoryReport(client.database, {
    startDate: "2026-08-04",
    endDate: "2026-08-05",
  });

  const fixtureStock = result.stock.filter((row) =>
    [fixture.productOneId, fixture.productTwoId].includes(row.productId),
  );
  const fixtureMovements = result.movements.filter((row) =>
    [fixture.productOneId, fixture.productTwoId].includes(row.productId),
  );

  assert.deepEqual(
    fixtureStock.map((row) => [
      row.productName,
      row.sellableQuantity,
      row.damagedQuantity,
      row.expiredQuantity,
      row.weightedAverageCost,
      row.isLowStock,
    ]),
    [
      ["Inventory Report Product One", "8.000", "2.000", "1.000", "45.50", true],
      ["Inventory Report Product Two", "20.000", "0.000", "3.000", "60.25", false],
    ],
  );
  assert.deepEqual(
    fixtureMovements.map((row) => [row.movementType, row.stockCondition, row.direction, row.quantity]),
    [
      ["SALE", "SELLABLE", "OUT", "4.000"],
      ["ADJUSTMENT", "EXPIRED", "IN", "3.000"],
    ],
  );
});

integrationTest("Inventory Report lowStock filter uses sellable quantity against reorder level", async () => {
  assert.ok(client);

  const result = await getInventoryReport(client.database, {
    startDate: "2026-08-04",
    endDate: "2026-08-05",
    lowStock: true,
  });

  const fixtureRows = result.stock.filter((row) =>
    [fixture.productOneId, fixture.productTwoId].includes(row.productId),
  );
  assert.deepEqual(fixtureRows.map((row) => row.productId), [fixture.productOneId]);
  assert.equal(fixtureRows[0]?.isLowStock, true);
});

integrationTest("Inventory Report product filter limits both stock and movement rows", async () => {
  assert.ok(client);

  const result = await getInventoryReport(client.database, {
    startDate: "2026-08-04",
    endDate: "2026-08-05",
    productId: fixture.productTwoId,
  });

  assert.deepEqual(result.stock.map((row) => row.productId), [fixture.productTwoId]);
  assert.deepEqual(result.movements.map((row) => row.productId), [fixture.productTwoId]);
});

integrationTest("Customer Outstanding Report calculates current positive balances and orders largest first", async () => {
  assert.ok(client);

  const result = await getCustomerOutstandingReport(client.database, {
    page: 1,
    pageSize: 100,
  });
  const fixtureRows = result.items.filter((row) =>
    [fixture.customerOneId, fixture.customerTwoId, fixture.customerThreeId].includes(row.customerId),
  );

  assert.deepEqual(
    fixtureRows.map((row) => [row.customerName, row.outstandingAmount]),
    [
      ["Zeta Outstanding Customer", "700.00"],
      ["Alpha Outstanding Customer", "375.00"],
    ],
  );
  assert.equal(fixtureRows.some((row) => row.customerId === fixture.customerTwoId), false);
});

integrationTest("Customer Outstanding Report search and pagination use the approved filters", async () => {
  assert.ok(client);

  const searched = await getCustomerOutstandingReport(client.database, {
    search: `OUT-C1-${uniqueSuffix}`,
    page: 1,
    pageSize: 20,
  });
  assert.equal(searched.items.length, 1);
  assert.equal(searched.items[0]?.customerId, fixture.customerOneId);
  assert.equal(searched.items[0]?.outstandingAmount, "375.00");

  const paged = await getCustomerOutstandingReport(client.database, {
    search: "Outstanding Customer",
    page: 2,
    pageSize: 1,
  });
  assert.equal(paged.total >= 2, true);
  assert.equal(paged.items.length, 1);
});

integrationTest("Supplier Payable Report calculates current positive balances and orders largest first", async () => {
  assert.ok(client);

  const result = await getSupplierPayableReport(client.database, {
    page: 1,
    pageSize: 100,
  });
  const fixtureRows = result.items.filter((row) =>
    [fixture.supplierOneId, fixture.supplierTwoId, fixture.supplierThreeId].includes(row.supplierId),
  );

  assert.deepEqual(
    fixtureRows.map((row) => [row.supplierName, row.payableAmount]),
    [
      ["Zeta Payable Supplier", "800.00"],
      ["Alpha Payable Supplier", "450.00"],
    ],
  );
  assert.equal(fixtureRows.some((row) => row.supplierId === fixture.supplierTwoId), false);
});

integrationTest("Supplier Payable Report search and pagination use the approved filters", async () => {
  assert.ok(client);

  const searched = await getSupplierPayableReport(client.database, {
    search: `PAY-S1-${uniqueSuffix}`,
    page: 1,
    pageSize: 20,
  });
  assert.equal(searched.items.length, 1);
  assert.equal(searched.items[0]?.supplierId, fixture.supplierOneId);
  assert.equal(searched.items[0]?.payableAmount, "450.00");

  const paged = await getSupplierPayableReport(client.database, {
    search: "Payable Supplier",
    page: 2,
    pageSize: 1,
  });
  assert.equal(paged.total >= 2, true);
  assert.equal(paged.items.length, 1);
});


integrationTest("Reports outstanding/payable totals reconcile with the Ledger module", async () => {
  assert.ok(client);

  const query = { page: 1, pageSize: 100 };
  const [customerReport, customerLedger, supplierReport, supplierLedger] = await Promise.all([
    getCustomerOutstandingReport(client.database, query),
    getCustomerOutstanding(client.database, query),
    getSupplierPayableReport(client.database, query),
    getSupplierPayables(client.database, query),
  ]);

  const reportCustomers = customerReport.items
    .filter((item) => [fixture.customerOneId, fixture.customerThreeId].includes(item.customerId))
    .map((item) => [item.customerId, item.outstandingAmount])
    .sort();
  const ledgerCustomers = customerLedger.items
    .filter((item) => [fixture.customerOneId, fixture.customerThreeId].includes(item.customerId))
    .map((item) => [item.customerId, item.outstandingAmount])
    .sort();

  const reportSuppliers = supplierReport.items
    .filter((item) => [fixture.supplierOneId, fixture.supplierThreeId].includes(item.supplierId))
    .map((item) => [item.supplierId, item.payableAmount])
    .sort();
  const ledgerSuppliers = supplierLedger.items
    .filter((item) => [fixture.supplierOneId, fixture.supplierThreeId].includes(item.supplierId))
    .map((item) => [item.supplierId, item.payableAmount])
    .sort();

  assert.deepEqual(reportCustomers, ledgerCustomers);
  assert.deepEqual(reportSuppliers, ledgerSuppliers);
});
