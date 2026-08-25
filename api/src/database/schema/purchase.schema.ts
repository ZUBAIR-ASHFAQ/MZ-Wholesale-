import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { products, productUnits } from "./product.schema.js";
import { suppliers } from "./supplier.schema.js";

/** Identifies whether a purchase is editable, confirmed, or cancelled. */
export const purchaseStatusEnum = pgEnum("purchase_status", [
  "DRAFT",
  "CONFIRMED",
  "CANCELLED",
]);

/**
 * Stores the purchase header used for supplier bills, totals, and the immutable
 * paid/due snapshot captured when a purchase is confirmed.
 */
export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    purchaseNumber: varchar("purchase_number", { length: 32 }),
    supplierId: uuid("supplier_id").notNull(),
    purchaseDate: date("purchase_date").notNull(),
    status: purchaseStatusEnum("status").default("DRAFT").notNull(),
    itemDiscountTotal: numeric("item_discount_total", {
      precision: 14,
      scale: 2,
    })
      .default("0.00")
      .notNull(),
    invoiceDiscountAmount: numeric("invoice_discount_amount", {
      precision: 14,
      scale: 2,
    })
      .default("0.00")
      .notNull(),
    extraCostAmount: numeric("extra_cost_amount", {
      precision: 14,
      scale: 2,
    })
      .default("0.00")
      .notNull(),
    subtotalAmount: numeric("subtotal_amount", {
      precision: 14,
      scale: 2,
    })
      .default("0.00")
      .notNull(),
    totalAmount: numeric("total_amount", {
      precision: 14,
      scale: 2,
    })
      .default("0.00")
      .notNull(),
    initialPaidAmount: numeric("initial_paid_amount", {
      precision: 14,
      scale: 2,
    }),
    initialDueAmount: numeric("initial_due_amount", {
      precision: 14,
      scale: 2,
    }),
    notes: varchar("notes", { length: 1000 }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  /** Builds direct relationships, indexes, and integrity checks for purchases. */
  function buildPurchaseConstraints(table) {
    return [
      foreignKey({
        columns: [table.supplierId],
        foreignColumns: [suppliers.id],
        name: "purchases_supplier_id_suppliers_id_fk",
      }).onDelete("restrict"),
      uniqueIndex("purchases_purchase_number_normalized_unique")
        .on(sql`lower(trim(${table.purchaseNumber}))`)
        .where(sql`${table.purchaseNumber} is not null`),
      index("purchases_supplier_purchase_date_index").on(
        table.supplierId,
        table.purchaseDate,
      ),
      index("purchases_status_purchase_date_index").on(
        table.status,
        table.purchaseDate,
      ),
      check(
        "purchases_number_not_blank_check",
        sql`${table.purchaseNumber} is null or length(trim(${table.purchaseNumber})) > 0`,
      ),
      check(
        "purchases_item_discount_non_negative_check",
        sql`${table.itemDiscountTotal} >= 0`,
      ),
      check(
        "purchases_invoice_discount_non_negative_check",
        sql`${table.invoiceDiscountAmount} >= 0`,
      ),
      check(
        "purchases_extra_cost_non_negative_check",
        sql`${table.extraCostAmount} >= 0`,
      ),
      check(
        "purchases_subtotal_non_negative_check",
        sql`${table.subtotalAmount} >= 0`,
      ),
      check(
        "purchases_total_non_negative_check",
        sql`${table.totalAmount} >= 0`,
      ),
      check(
        "purchases_initial_paid_non_negative_check",
        sql`${table.initialPaidAmount} is null or ${table.initialPaidAmount} >= 0`,
      ),
      check(
        "purchases_initial_due_non_negative_check",
        sql`${table.initialDueAmount} is null or ${table.initialDueAmount} >= 0`,
      ),
      check(
        "purchases_initial_payment_pair_check",
        sql`(${table.initialPaidAmount} is null and ${table.initialDueAmount} is null) or (${table.initialPaidAmount} is not null and ${table.initialDueAmount} is not null)`,
      ),
      check(
        "purchases_initial_payment_total_check",
        sql`${table.initialPaidAmount} is null or (${table.initialPaidAmount} + ${table.initialDueAmount} = ${table.totalAmount})`,
      ),
      check(
        "purchases_notes_not_blank_check",
        sql`${table.notes} is null or length(trim(${table.notes})) > 0`,
      ),
      check(
        "purchases_status_dates_check",
        sql`(${table.status} = 'DRAFT' and ${table.confirmedAt} is null and ${table.cancelledAt} is null) or (${table.status} = 'CONFIRMED' and ${table.confirmedAt} is not null and ${table.cancelledAt} is null) or (${table.status} = 'CANCELLED' and ${table.confirmedAt} is null and ${table.cancelledAt} is not null)`,
      ),
      check(
        "purchases_confirmed_snapshot_check",
        sql`${table.status} <> 'CONFIRMED' or (${table.purchaseNumber} is not null and ${table.initialPaidAmount} is not null and ${table.initialDueAmount} is not null)`,
      ),
    ];
  },
);

/**
 * Stores immutable product, unit, quantity, purchase-rate, and landed-cost
 * snapshots for each line on a purchase.
 */
export const purchaseItems = pgTable(
  "purchase_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    purchaseId: uuid("purchase_id").notNull(),
    productId: uuid("product_id").notNull(),
    productUnitId: uuid("product_unit_id").notNull(),
    productSkuSnapshot: varchar("product_sku_snapshot", { length: 64 }).notNull(),
    productNameSnapshot: varchar("product_name_snapshot", {
      length: 200,
    }).notNull(),
    unitNameSnapshot: varchar("unit_name_snapshot", { length: 80 }).notNull(),
    conversionToBaseSnapshot: numeric("conversion_to_base_snapshot", {
      precision: 14,
      scale: 3,
    }).notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    baseQuantity: numeric("base_quantity", {
      precision: 14,
      scale: 3,
    }).notNull(),
    unitCost: numeric("unit_cost", { precision: 14, scale: 2 }).notNull(),
    itemDiscountAmount: numeric("item_discount_amount", {
      precision: 14,
      scale: 2,
    })
      .default("0.00")
      .notNull(),
    lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull(),
    allocatedExtraCost: numeric("allocated_extra_cost", {
      precision: 14,
      scale: 2,
    })
      .default("0.00")
      .notNull(),
    landedUnitCost: numeric("landed_unit_cost", {
      precision: 30,
      scale: 14,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  /** Builds direct purchase/product/unit relationships and item value checks. */
  function buildPurchaseItemConstraints(table) {
    return [
      foreignKey({
        columns: [table.purchaseId],
        foreignColumns: [purchases.id],
        name: "purchase_items_purchase_id_purchases_id_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.productId],
        foreignColumns: [products.id],
        name: "purchase_items_product_id_products_id_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.productUnitId],
        foreignColumns: [productUnits.id],
        name: "purchase_items_product_unit_id_product_units_id_fk",
      }).onDelete("restrict"),
      index("purchase_items_purchase_id_index").on(table.purchaseId),
      index("purchase_items_product_id_index").on(table.productId),
      index("purchase_items_product_unit_id_index").on(table.productUnitId),
      check(
        "purchase_items_product_sku_snapshot_not_blank_check",
        sql`length(trim(${table.productSkuSnapshot})) > 0`,
      ),
      check(
        "purchase_items_product_name_snapshot_not_blank_check",
        sql`length(trim(${table.productNameSnapshot})) > 0`,
      ),
      check(
        "purchase_items_unit_name_snapshot_not_blank_check",
        sql`length(trim(${table.unitNameSnapshot})) > 0`,
      ),
      check(
        "purchase_items_conversion_positive_check",
        sql`${table.conversionToBaseSnapshot} > 0`,
      ),
      check("purchase_items_quantity_positive_check", sql`${table.quantity} > 0`),
      check(
        "purchase_items_base_quantity_positive_check",
        sql`${table.baseQuantity} > 0`,
      ),
      check("purchase_items_unit_cost_positive_check", sql`${table.unitCost} > 0`),
      check(
        "purchase_items_discount_non_negative_check",
        sql`${table.itemDiscountAmount} >= 0`,
      ),
      check(
        "purchase_items_line_total_non_negative_check",
        sql`${table.lineTotal} >= 0`,
      ),
      check(
        "purchase_items_allocated_extra_cost_non_negative_check",
        sql`${table.allocatedExtraCost} >= 0`,
      ),
      check(
        "purchase_items_landed_unit_cost_non_negative_check",
        sql`${table.landedUnitCost} >= 0`,
      ),
    ];
  },
);
