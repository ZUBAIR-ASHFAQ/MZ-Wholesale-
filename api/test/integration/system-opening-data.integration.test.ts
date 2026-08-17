import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";

import { createDatabaseClient } from "../../src/database/client.js";
import { listInventoryStock, getProductMovements } from "../../src/modules/inventory/inventory.service.js";
import {
  getCustomerOutstanding,
  getCustomerStatement,
  getSupplierPayables,
  getSupplierStatement,
} from "../../src/modules/ledgers/ledgers.service.js";
import { getProduct } from "../../src/modules/products/products.service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const shouldRun = typeof databaseUrl === "string" && databaseUrl.length > 0;
const integrationTest = shouldRun ? test : test.skip;
const uniqueSuffix = randomUUID().slice(0, 8);

const fixture = {
  categoryId: randomUUID(),
  productId: randomUUID(),
  unitId: randomUUID(),
  balanceId: randomUUID(),
  movementId: randomUUID(),
  customerId: randomUUID(),
  supplierId: randomUUID(),
};

const fixtureValues = {
  sku: `SYS-OPEN-${uniqueSuffix}`,
  customerCode: `SYS-C-${uniqueSuffix}`,
  supplierCode: `SYS-S-${uniqueSuffix}`,
};

const client = shouldRun
  ? createDatabaseClient(databaseUrl, {
      maximumConnections: 3,
      connectionTimeoutMilliseconds: 5_000,
      idleTimeoutMilliseconds: 5_000,
    })
  : undefined;

/** Seeds rows with the same database effects produced by confirmed opening-data imports. */
async function seedOpeningDataEffects(): Promise<void> {
  if (!client) return;

  await client.pool.query(
    `insert into product_categories (id, name, is_active)
     values ($1, $2, true)`,
    [fixture.categoryId, `System Opening Category ${uniqueSuffix}`],
  );

  await client.pool.query(
    `insert into products
       (id, sku, name, category_id, reorder_level, is_active)
     values ($1, $2, $3, $4, 5.000, true)`,
    [
      fixture.productId,
      fixtureValues.sku,
      `System Opening Product ${uniqueSuffix}`,
      fixture.categoryId,
    ],
  );

  await client.pool.query(
    `insert into product_units
       (id, product_id, unit_name, conversion_to_base, is_base_unit, is_active)
     values ($1, $2, 'Each', 1.000, true, true)`,
    [fixture.unitId, fixture.productId],
  );

  await client.pool.query(
    `insert into inventory_balances
       (id, product_id, sellable_quantity_on_hand, damaged_quantity_on_hand,
        expired_quantity_on_hand, weighted_average_cost)
     values ($1, $2, 12.500, 0.000, 0.000, 40.00)`,
    [fixture.balanceId, fixture.productId],
  );

  await client.pool.query(
    `insert into stock_movements
       (id, product_id, stock_condition, direction, quantity, source_type,
        unit_cost_snapshot, notes)
     values ($1, $2, 'SELLABLE', 'IN', 12.500, 'OPENING_STOCK', 40.00,
             'Opening stock import')`,
    [fixture.movementId, fixture.productId],
  );

  await client.pool.query(
    `insert into customers (id, code, name, is_walk_in, is_active)
     values ($1, $2, $3, false, true)`,
    [fixture.customerId, fixtureValues.customerCode, `System Opening Customer ${uniqueSuffix}`],
  );

  await client.pool.query(
    `insert into suppliers (id, code, name, is_active)
     values ($1, $2, $3, true)`,
    [fixture.supplierId, fixtureValues.supplierCode, `System Opening Supplier ${uniqueSuffix}`],
  );

  await client.pool.query(
    `insert into customer_ledger_entries
       (customer_id, occurred_at, reference_type, debit, credit, notes)
     values ($1, now(), 'OPENING_BALANCE', 125.50, 0.00, 'Opening customer balance import')`,
    [fixture.customerId],
  );

  await client.pool.query(
    `insert into supplier_ledger_entries
       (supplier_id, occurred_at, reference_type, debit, credit, notes)
     values ($1, now(), 'OPENING_BALANCE', 0.00, 300.00, 'Opening supplier payable import')`,
    [fixture.supplierId],
  );
}

/** Removes only rows created by this integration fixture. */
async function cleanupOpeningDataEffects(): Promise<void> {
  if (!client) return;

  await client.pool.query("delete from customer_ledger_entries where customer_id = $1", [fixture.customerId]);
  await client.pool.query("delete from supplier_ledger_entries where supplier_id = $1", [fixture.supplierId]);
  await client.pool.query("delete from stock_movements where product_id = $1", [fixture.productId]);
  await client.pool.query("delete from inventory_balances where product_id = $1", [fixture.productId]);
  await client.pool.query("delete from product_units where product_id = $1", [fixture.productId]);
  await client.pool.query("delete from products where id = $1", [fixture.productId]);
  await client.pool.query("delete from product_categories where id = $1", [fixture.categoryId]);
  await client.pool.query("delete from customers where id = $1", [fixture.customerId]);
  await client.pool.query("delete from suppliers where id = $1", [fixture.supplierId]);
}

before(async () => {
  if (!client) return;
  await seedOpeningDataEffects();
});

after(async () => {
  if (!client) return;
  await cleanupOpeningDataEffects();
  await client.pool.end();
});

integrationTest("imported product data is readable through Product Management", async () => {
  assert.ok(client);

  const product = await getProduct(client.database, fixture.productId);

  assert.equal(product.sku, fixtureValues.sku);
  assert.equal(product.isActive, true);
  assert.equal(product.units.length, 1);
  assert.equal(product.units[0]?.unitName, "Each");
  assert.equal(product.units[0]?.conversionToBase, "1.000");
  assert.equal(product.units[0]?.isBaseUnit, true);
});

integrationTest("opening stock agrees with Inventory stock and movement history", async () => {
  assert.ok(client);

  const stock = await listInventoryStock(client.database, {
    search: fixtureValues.sku,
    page: 1,
    pageSize: 20,
  });
  const movements = await getProductMovements(client.database, fixture.productId, {
    page: 1,
    pageSize: 20,
  });

  assert.equal(stock.total, 1);
  assert.equal(stock.items[0]?.productId, fixture.productId);
  assert.equal(stock.items[0]?.sellableQuantityOnHand, "12.500");
  assert.equal(stock.items[0]?.weightedAverageCost, "40.00");
  assert.equal(movements.total, 1);
  assert.equal(movements.items[0]?.referenceType, "OPENING_STOCK");
  assert.equal(movements.items[0]?.direction, "IN");
  assert.equal(movements.items[0]?.quantity, "12.500");
});

integrationTest("customer opening balance agrees with statement and outstanding", async () => {
  assert.ok(client);

  const statement = await getCustomerStatement(client.database, fixture.customerId, {
    page: 1,
    pageSize: 20,
  });
  const outstanding = await getCustomerOutstanding(client.database, {
    search: fixtureValues.customerCode,
    page: 1,
    pageSize: 20,
  });

  assert.equal(statement.closingBalance, "125.50");
  assert.equal(statement.totalDebit, "125.50");
  assert.equal(statement.totalCredit, "0.00");
  assert.equal(statement.entries[0]?.referenceType, "OPENING_BALANCE");
  assert.equal(outstanding.total, 1);
  assert.equal(outstanding.items[0]?.customerId, fixture.customerId);
  assert.equal(outstanding.items[0]?.outstandingAmount, "125.50");
});

integrationTest("supplier opening balance agrees with statement and payable", async () => {
  assert.ok(client);

  const statement = await getSupplierStatement(client.database, fixture.supplierId, {
    page: 1,
    pageSize: 20,
  });
  const payables = await getSupplierPayables(client.database, {
    search: fixtureValues.supplierCode,
    page: 1,
    pageSize: 20,
  });

  assert.equal(statement.closingBalance, "300.00");
  assert.equal(statement.totalDebit, "0.00");
  assert.equal(statement.totalCredit, "300.00");
  assert.equal(statement.entries[0]?.referenceType, "OPENING_BALANCE");
  assert.equal(payables.total, 1);
  assert.equal(payables.items[0]?.supplierId, fixture.supplierId);
  assert.equal(payables.items[0]?.payableAmount, "300.00");
});
