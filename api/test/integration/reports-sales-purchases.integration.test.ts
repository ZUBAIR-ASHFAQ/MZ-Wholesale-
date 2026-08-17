import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";

import { createDatabaseClient } from "../../src/database/client.js";
import {
  getPurchasesReport,
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
  supplierId: randomUUID(),
  confirmedSaleId: randomUUID(),
  confirmedSaleItemOneId: randomUUID(),
  confirmedSaleItemTwoId: randomUUID(),
  draftSaleId: randomUUID(),
  draftSaleItemId: randomUUID(),
  cancelledSaleId: randomUUID(),
  cancelledSaleItemId: randomUUID(),
  salesReturnId: randomUUID(),
  salesReturnItemId: randomUUID(),
  confirmedPurchaseId: randomUUID(),
  confirmedPurchaseItemOneId: randomUUID(),
  confirmedPurchaseItemTwoId: randomUUID(),
  draftPurchaseId: randomUUID(),
  draftPurchaseItemId: randomUUID(),
  cancelledPurchaseId: randomUUID(),
  cancelledPurchaseItemId: randomUUID(),
  purchaseReturnId: randomUUID(),
  purchaseReturnItemId: randomUUID(),
};

const uniqueSuffix = randomUUID().slice(0, 8);
const client = shouldRun
  ? createDatabaseClient(databaseUrl, {
      maximumConnections: 3,
      connectionTimeoutMilliseconds: 5_000,
      idleTimeoutMilliseconds: 5_000,
    })
  : undefined;

/** Inserts the minimum master data required by the report integration fixtures. */
async function seedMasterData(): Promise<void> {
  if (!client) return;

  await client.pool.query(
    `insert into product_categories (id, name)
     values ($1, $2)`,
    [fixture.categoryId, `Report Category ${uniqueSuffix}`],
  );

  await client.pool.query(
    `insert into products (id, sku, name, category_id)
     values
       ($1, $2, $3, $5),
       ($4, $6, $7, $5)`,
    [
      fixture.productOneId,
      `REPORT-P1-${uniqueSuffix}`,
      "Report Product One",
      fixture.productTwoId,
      fixture.categoryId,
      `REPORT-P2-${uniqueSuffix}`,
      "Report Product Two",
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
     values ($1, $2, 'Report Customer')`,
    [fixture.customerId, `REPORT-C-${uniqueSuffix}`],
  );

  await client.pool.query(
    `insert into suppliers (id, code, name)
     values ($1, $2, 'Report Supplier')`,
    [fixture.supplierId, `REPORT-S-${uniqueSuffix}`],
  );
}

/** Inserts confirmed, draft, cancelled, and returned sales used by Sales Report tests. */
async function seedSalesData(): Promise<void> {
  if (!client) return;

  await client.pool.query(
    `insert into sales_invoices
       (id, invoice_number, customer_id, invoice_date, status,
        invoice_discount_amount, subtotal_amount, total_amount,
        initial_paid_amount, initial_due_amount, confirmed_at)
     values
       ($1, $2, $3, '2026-08-04', 'CONFIRMED', 40.00, 400.00, 360.00, 0.00, 360.00, now())`,
    [fixture.confirmedSaleId, `SI-${uniqueSuffix}`, fixture.customerId],
  );

  await client.pool.query(
    `insert into sales_invoice_items
       (id, sales_invoice_id, product_id, product_unit_id,
        product_sku_snapshot, product_name_snapshot, unit_name_snapshot,
        conversion_to_base_snapshot, quantity, base_quantity,
        manual_unit_price, item_discount_amount, line_total, unit_cost_snapshot)
     values
       ($1, $2, $3, $4, $5, 'Sale Snapshot Product One', 'Each', 1.000, 1.000, 1.000, 100.00, 0.00, 100.00, 50.00),
       ($6, $2, $7, $8, $9, 'Sale Snapshot Product Two', 'Each', 1.000, 3.000, 3.000, 100.00, 0.00, 300.00, 60.00)`,
    [
      fixture.confirmedSaleItemOneId,
      fixture.confirmedSaleId,
      fixture.productOneId,
      fixture.productOneUnitId,
      `SNAP-S1-${uniqueSuffix}`,
      fixture.confirmedSaleItemTwoId,
      fixture.productTwoId,
      fixture.productTwoUnitId,
      `SNAP-S2-${uniqueSuffix}`,
    ],
  );

  await client.pool.query(
    `insert into sales_invoices
       (id, customer_id, invoice_date, status, subtotal_amount, total_amount)
     values ($1, $2, '2026-08-04', 'DRAFT', 500.00, 500.00)`,
    [fixture.draftSaleId, fixture.customerId],
  );

  await client.pool.query(
    `insert into sales_invoice_items
       (id, sales_invoice_id, product_id, product_unit_id,
        product_sku_snapshot, product_name_snapshot, unit_name_snapshot,
        conversion_to_base_snapshot, quantity, base_quantity,
        manual_unit_price, item_discount_amount, line_total)
     values ($1, $2, $3, $4, $5, 'Draft Product', 'Each', 1.000, 1.000, 1.000, 500.00, 0.00, 500.00)`,
    [
      fixture.draftSaleItemId,
      fixture.draftSaleId,
      fixture.productOneId,
      fixture.productOneUnitId,
      `DRAFT-S-${uniqueSuffix}`,
    ],
  );

  await client.pool.query(
    `insert into sales_invoices
       (id, invoice_number, customer_id, invoice_date, status,
        subtotal_amount, total_amount, cancelled_at)
     values ($1, $2, $3, '2026-08-04', 'CANCELLED', 600.00, 600.00, now())`,
    [fixture.cancelledSaleId, `SI-C-${uniqueSuffix}`, fixture.customerId],
  );

  await client.pool.query(
    `insert into sales_invoice_items
       (id, sales_invoice_id, product_id, product_unit_id,
        product_sku_snapshot, product_name_snapshot, unit_name_snapshot,
        conversion_to_base_snapshot, quantity, base_quantity,
        manual_unit_price, item_discount_amount, line_total)
     values ($1, $2, $3, $4, $5, 'Cancelled Product', 'Each', 1.000, 1.000, 1.000, 600.00, 0.00, 600.00)`,
    [
      fixture.cancelledSaleItemId,
      fixture.cancelledSaleId,
      fixture.productOneId,
      fixture.productOneUnitId,
      `CANCEL-S-${uniqueSuffix}`,
    ],
  );

  await client.pool.query(
    `insert into sales_returns
       (id, return_number, original_sale_id, customer_id, return_date,
        reason, refund_mode, total_amount)
     values ($1, $2, $3, $4, '2026-08-06', 'Integration return', 'DUE_REDUCTION', 20.00)`,
    [
      fixture.salesReturnId,
      `SR-${uniqueSuffix}`,
      fixture.confirmedSaleId,
      fixture.customerId,
    ],
  );

  await client.pool.query(
    `insert into sales_return_items
       (id, sales_return_id, original_sale_item_id, product_id, product_unit_id,
        product_sku_snapshot, product_name_snapshot, unit_name_snapshot,
        conversion_to_base_snapshot, quantity, base_quantity,
        unit_price_snapshot, unit_cost_snapshot, stock_condition, line_total)
     values ($1, $2, $3, $4, $5, $6, 'Sale Snapshot Product One', 'Each',
             1.000, 0.200, 0.200, 100.00, 50.00, 'GOOD', 20.00)`,
    [
      fixture.salesReturnItemId,
      fixture.salesReturnId,
      fixture.confirmedSaleItemOneId,
      fixture.productOneId,
      fixture.productOneUnitId,
      `SNAP-S1-${uniqueSuffix}`,
    ],
  );
}

/** Inserts confirmed, draft, cancelled, and returned purchases used by Purchase Report tests. */
async function seedPurchaseData(): Promise<void> {
  if (!client) return;

  await client.pool.query(
    `insert into purchases
       (id, purchase_number, supplier_id, purchase_date, status,
        invoice_discount_amount, extra_cost_amount, subtotal_amount, total_amount,
        initial_paid_amount, initial_due_amount, confirmed_at)
     values
       ($1, $2, $3, '2026-08-03', 'CONFIRMED', 30.00, 15.00, 300.00, 285.00, 0.00, 285.00, now())`,
    [fixture.confirmedPurchaseId, `PI-${uniqueSuffix}`, fixture.supplierId],
  );

  await client.pool.query(
    `insert into purchase_items
       (id, purchase_id, product_id, product_unit_id,
        product_sku_snapshot, product_name_snapshot, unit_name_snapshot,
        conversion_to_base_snapshot, quantity, base_quantity, unit_cost,
        item_discount_amount, line_total, allocated_extra_cost, landed_unit_cost)
     values
       ($1, $2, $3, $4, $5, 'Purchase Snapshot Product One', 'Each', 1.000, 2.000, 2.000, 100.00, 0.00, 200.00, 10.00, 95.00),
       ($6, $2, $7, $8, $9, 'Purchase Snapshot Product Two', 'Each', 1.000, 1.000, 1.000, 100.00, 0.00, 100.00, 5.00, 95.00)`,
    [
      fixture.confirmedPurchaseItemOneId,
      fixture.confirmedPurchaseId,
      fixture.productOneId,
      fixture.productOneUnitId,
      `SNAP-P1-${uniqueSuffix}`,
      fixture.confirmedPurchaseItemTwoId,
      fixture.productTwoId,
      fixture.productTwoUnitId,
      `SNAP-P2-${uniqueSuffix}`,
    ],
  );

  await client.pool.query(
    `insert into purchases
       (id, supplier_id, purchase_date, status, subtotal_amount, total_amount)
     values ($1, $2, '2026-08-03', 'DRAFT', 500.00, 500.00)`,
    [fixture.draftPurchaseId, fixture.supplierId],
  );

  await client.pool.query(
    `insert into purchase_items
       (id, purchase_id, product_id, product_unit_id,
        product_sku_snapshot, product_name_snapshot, unit_name_snapshot,
        conversion_to_base_snapshot, quantity, base_quantity, unit_cost,
        item_discount_amount, line_total, allocated_extra_cost, landed_unit_cost)
     values ($1, $2, $3, $4, $5, 'Draft Purchase Product', 'Each', 1.000, 1.000, 1.000, 500.00, 0.00, 500.00, 0.00, 500.00)`,
    [
      fixture.draftPurchaseItemId,
      fixture.draftPurchaseId,
      fixture.productOneId,
      fixture.productOneUnitId,
      `DRAFT-P-${uniqueSuffix}`,
    ],
  );

  await client.pool.query(
    `insert into purchases
       (id, purchase_number, supplier_id, purchase_date, status,
        subtotal_amount, total_amount, cancelled_at)
     values ($1, $2, $3, '2026-08-03', 'CANCELLED', 600.00, 600.00, now())`,
    [fixture.cancelledPurchaseId, `PI-C-${uniqueSuffix}`, fixture.supplierId],
  );

  await client.pool.query(
    `insert into purchase_items
       (id, purchase_id, product_id, product_unit_id,
        product_sku_snapshot, product_name_snapshot, unit_name_snapshot,
        conversion_to_base_snapshot, quantity, base_quantity, unit_cost,
        item_discount_amount, line_total, allocated_extra_cost, landed_unit_cost)
     values ($1, $2, $3, $4, $5, 'Cancelled Purchase Product', 'Each', 1.000, 1.000, 1.000, 600.00, 0.00, 600.00, 0.00, 600.00)`,
    [
      fixture.cancelledPurchaseItemId,
      fixture.cancelledPurchaseId,
      fixture.productOneId,
      fixture.productOneUnitId,
      `CANCEL-P-${uniqueSuffix}`,
    ],
  );

  await client.pool.query(
    `insert into purchase_returns
       (id, return_number, original_purchase_id, supplier_id, return_date,
        reason, total_amount)
     values ($1, $2, $3, $4, '2026-08-07', 'Integration return', 23.75)`,
    [
      fixture.purchaseReturnId,
      `PR-${uniqueSuffix}`,
      fixture.confirmedPurchaseId,
      fixture.supplierId,
    ],
  );

  await client.pool.query(
    `insert into purchase_return_items
       (id, purchase_return_id, original_purchase_item_id, product_id, product_unit_id,
        product_sku_snapshot, product_name_snapshot, unit_name_snapshot,
        conversion_to_base_snapshot, quantity, base_quantity, unit_cost_snapshot, line_total)
     values ($1, $2, $3, $4, $5, $6, 'Purchase Snapshot Product Two', 'Each',
             1.000, 0.250, 0.250, 95.00, 23.75)`,
    [
      fixture.purchaseReturnItemId,
      fixture.purchaseReturnId,
      fixture.confirmedPurchaseItemTwoId,
      fixture.productTwoId,
      fixture.productTwoUnitId,
      `SNAP-P2-${uniqueSuffix}`,
    ],
  );
}

/** Removes integration fixtures in foreign-key-safe order. */
async function cleanupFixtures(): Promise<void> {
  if (!client) return;

  await client.pool.query("delete from sales_return_items where id = $1", [fixture.salesReturnItemId]);
  await client.pool.query("delete from sales_returns where id = $1", [fixture.salesReturnId]);
  await client.pool.query("delete from purchase_return_items where id = $1", [fixture.purchaseReturnItemId]);
  await client.pool.query("delete from purchase_returns where id = $1", [fixture.purchaseReturnId]);
  await client.pool.query(
    "delete from sales_invoice_items where id = any($1::uuid[])",
    [[fixture.confirmedSaleItemOneId, fixture.confirmedSaleItemTwoId, fixture.draftSaleItemId, fixture.cancelledSaleItemId]],
  );
  await client.pool.query(
    "delete from sales_invoices where id = any($1::uuid[])",
    [[fixture.confirmedSaleId, fixture.draftSaleId, fixture.cancelledSaleId]],
  );
  await client.pool.query(
    "delete from purchase_items where id = any($1::uuid[])",
    [[fixture.confirmedPurchaseItemOneId, fixture.confirmedPurchaseItemTwoId, fixture.draftPurchaseItemId, fixture.cancelledPurchaseItemId]],
  );
  await client.pool.query(
    "delete from purchases where id = any($1::uuid[])",
    [[fixture.confirmedPurchaseId, fixture.draftPurchaseId, fixture.cancelledPurchaseId]],
  );
  await client.pool.query("delete from product_units where id = any($1::uuid[])", [
    [fixture.productOneUnitId, fixture.productTwoUnitId],
  ]);
  await client.pool.query("delete from products where id = any($1::uuid[])", [
    [fixture.productOneId, fixture.productTwoId],
  ]);
  await client.pool.query("delete from customers where id = $1", [fixture.customerId]);
  await client.pool.query("delete from suppliers where id = $1", [fixture.supplierId]);
  await client.pool.query("delete from product_categories where id = $1", [fixture.categoryId]);
}

before(async () => {
  if (!client) return;
  await seedMasterData();
  await seedSalesData();
  await seedPurchaseData();
});

after(async () => {
  if (!client) return;

  try {
    await cleanupFixtures();
  } finally {
    await client.pool.end();
  }
});

integrationTest("Sales Report uses confirmed sales, allocates invoice discount, and subtracts returns", async () => {
  assert.ok(client);

  const result = await getSalesReport(client.database, {
    startDate: "2026-08-01",
    endDate: "2026-08-08",
  });

  assert.deepEqual(result.totals, {
    salesAmount: "360.00",
    returnAmount: "20.00",
    netSalesAmount: "340.00",
  });
  assert.equal(result.rows.length, 3);
  assert.deepEqual(
    result.rows.map((row) => [row.documentType, row.productName, row.amount]),
    [
      ["SALE", "Sale Snapshot Product One", "90.00"],
      ["SALE", "Sale Snapshot Product Two", "270.00"],
      ["RETURN", "Sale Snapshot Product One", "20.00"],
    ],
  );
});

integrationTest("Sales Report product filter keeps the full-invoice discount allocation", async () => {
  assert.ok(client);

  const result = await getSalesReport(client.database, {
    startDate: "2026-08-01",
    endDate: "2026-08-08",
    productId: fixture.productOneId,
  });

  assert.deepEqual(result.totals, {
    salesAmount: "90.00",
    returnAmount: "20.00",
    netSalesAmount: "70.00",
  });
  assert.equal(result.rows.length, 2);
});

integrationTest("Sales Report records a return on the return date instead of the original sale date", async () => {
  assert.ok(client);

  const result = await getSalesReport(client.database, {
    startDate: "2026-08-06",
    endDate: "2026-08-06",
  });

  assert.deepEqual(result.totals, {
    salesAmount: "0.00",
    returnAmount: "20.00",
    netSalesAmount: "-20.00",
  });
  assert.deepEqual(result.rows.map((row) => row.documentType), ["RETURN"]);
});

integrationTest("Purchase Report applies invoice discount and extra cost, then subtracts returns", async () => {
  assert.ok(client);

  const result = await getPurchasesReport(client.database, {
    startDate: "2026-08-01",
    endDate: "2026-08-08",
  });

  assert.deepEqual(result.totals, {
    purchasesAmount: "285.00",
    returnAmount: "23.75",
    netPurchasesAmount: "261.25",
  });
  assert.equal(result.rows.length, 3);
  assert.deepEqual(
    result.rows.map((row) => [row.documentType, row.productName, row.amount]),
    [
      ["PURCHASE", "Purchase Snapshot Product One", "190.00"],
      ["PURCHASE", "Purchase Snapshot Product Two", "95.00"],
      ["RETURN", "Purchase Snapshot Product Two", "23.75"],
    ],
  );
});

integrationTest("Purchase Report product filter preserves shared discount and allocated extra cost", async () => {
  assert.ok(client);

  const result = await getPurchasesReport(client.database, {
    startDate: "2026-08-01",
    endDate: "2026-08-08",
    productId: fixture.productTwoId,
  });

  assert.deepEqual(result.totals, {
    purchasesAmount: "95.00",
    returnAmount: "23.75",
    netPurchasesAmount: "71.25",
  });
  assert.equal(result.rows.length, 2);
});

integrationTest("Purchase Report records a return on the return date with its immutable cost snapshot", async () => {
  assert.ok(client);

  const result = await getPurchasesReport(client.database, {
    startDate: "2026-08-07",
    endDate: "2026-08-07",
  });

  assert.deepEqual(result.totals, {
    purchasesAmount: "0.00",
    returnAmount: "23.75",
    netPurchasesAmount: "-23.75",
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.documentType, "RETURN");
  assert.equal(result.rows[0]?.unitCost, "95.00");
});
