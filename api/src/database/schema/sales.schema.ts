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
import { customers } from "./customer.schema.js";
import { products, productUnits } from "./product.schema.js";

/** Identifies whether a sale can still change or has become permanent. */
export const salesStatusEnum = pgEnum("sales_status", [
  "DRAFT",
  "HELD",
  "CONFIRMED",
  "CANCELLED",
]);

/**
 * Stores the sales invoice header and the immutable paid/due snapshot captured
 * when the sale is confirmed.
 */
export const salesInvoices = pgTable(
  "sales_invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceNumber: varchar("invoice_number", { length: 32 }),
    customerId: uuid("customer_id").notNull(),
    invoiceDate: date("invoice_date").notNull(),
    status: salesStatusEnum("status").default("DRAFT").notNull(),
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
  /** Builds the customer relationship, useful indexes, and invoice integrity checks. */
  function buildSalesInvoiceConstraints(table) {
    return [
      foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "sales_invoices_customer_id_customers_id_fk",
      }).onDelete("restrict"),
      uniqueIndex("sales_invoices_invoice_number_normalized_unique")
        .on(sql`lower(trim(${table.invoiceNumber}))`)
        .where(sql`${table.invoiceNumber} is not null`),
      index("sales_invoices_customer_invoice_date_index").on(
        table.customerId,
        table.invoiceDate,
      ),
      index("sales_invoices_status_invoice_date_index").on(
        table.status,
        table.invoiceDate,
      ),
      check(
        "sales_invoices_number_not_blank_check",
        sql`${table.invoiceNumber} is null or length(trim(${table.invoiceNumber})) > 0`,
      ),
      check(
        "sales_invoices_item_discount_non_negative_check",
        sql`${table.itemDiscountTotal} >= 0`,
      ),
      check(
        "sales_invoices_invoice_discount_non_negative_check",
        sql`${table.invoiceDiscountAmount} >= 0`,
      ),
      check(
        "sales_invoices_subtotal_non_negative_check",
        sql`${table.subtotalAmount} >= 0`,
      ),
      check(
        "sales_invoices_total_non_negative_check",
        sql`${table.totalAmount} >= 0`,
      ),
      check(
        "sales_invoices_invoice_discount_limit_check",
        sql`${table.invoiceDiscountAmount} <= ${table.subtotalAmount}`,
      ),
      check(
        "sales_invoices_total_calculation_check",
        sql`${table.totalAmount} = ${table.subtotalAmount} - ${table.invoiceDiscountAmount}`,
      ),
      check(
        "sales_invoices_initial_paid_non_negative_check",
        sql`${table.initialPaidAmount} is null or ${table.initialPaidAmount} >= 0`,
      ),
      check(
        "sales_invoices_initial_due_non_negative_check",
        sql`${table.initialDueAmount} is null or ${table.initialDueAmount} >= 0`,
      ),
      check(
        "sales_invoices_initial_payment_pair_check",
        sql`(${table.initialPaidAmount} is null and ${table.initialDueAmount} is null) or (${table.initialPaidAmount} is not null and ${table.initialDueAmount} is not null)`,
      ),
      check(
        "sales_invoices_initial_payment_total_check",
        sql`${table.initialPaidAmount} is null or (${table.initialPaidAmount} + ${table.initialDueAmount} = ${table.totalAmount})`,
      ),
      check(
        "sales_invoices_notes_not_blank_check",
        sql`${table.notes} is null or length(trim(${table.notes})) > 0`,
      ),
      check(
        "sales_invoices_status_dates_check",
        sql`(${table.status} in ('DRAFT', 'HELD') and ${table.confirmedAt} is null and ${table.cancelledAt} is null) or (${table.status} = 'CONFIRMED' and ${table.confirmedAt} is not null and ${table.cancelledAt} is null) or (${table.status} = 'CANCELLED' and ${table.confirmedAt} is null and ${table.cancelledAt} is not null)`,
      ),
      check(
        "sales_invoices_confirmed_snapshot_check",
        sql`${table.status} <> 'CONFIRMED' or (${table.invoiceNumber} is not null and ${table.initialPaidAmount} is not null and ${table.initialDueAmount} is not null)`,
      ),
    ];
  },
);

/**
 * Stores the product, unit, quantity, manual selling price, and cost snapshots
 * for each sales invoice line.
 */
export const salesInvoiceItems = pgTable(
  "sales_invoice_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    salesInvoiceId: uuid("sales_invoice_id").notNull(),
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
    manualUnitPrice: numeric("manual_unit_price", {
      precision: 14,
      scale: 2,
    }).notNull(),
    itemDiscountAmount: numeric("item_discount_amount", {
      precision: 14,
      scale: 2,
    })
      .default("0.00")
      .notNull(),
    lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull(),
    unitCostSnapshot: numeric("unit_cost_snapshot", {
      precision: 30,
      scale: 14,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  /** Builds direct sale/product/unit relationships and protects line snapshots. */
  function buildSalesInvoiceItemConstraints(table) {
    return [
      foreignKey({
        columns: [table.salesInvoiceId],
        foreignColumns: [salesInvoices.id],
        name: "sales_invoice_items_sales_invoice_id_sales_invoices_id_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.productId],
        foreignColumns: [products.id],
        name: "sales_invoice_items_product_id_products_id_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.productUnitId],
        foreignColumns: [productUnits.id],
        name: "sales_invoice_items_product_unit_id_product_units_id_fk",
      }).onDelete("restrict"),
      index("sales_invoice_items_sales_invoice_id_index").on(
        table.salesInvoiceId,
      ),
      index("sales_invoice_items_product_id_index").on(table.productId),
      index("sales_invoice_items_product_unit_id_index").on(
        table.productUnitId,
      ),
      check(
        "sales_invoice_items_product_sku_snapshot_not_blank_check",
        sql`length(trim(${table.productSkuSnapshot})) > 0`,
      ),
      check(
        "sales_invoice_items_product_name_snapshot_not_blank_check",
        sql`length(trim(${table.productNameSnapshot})) > 0`,
      ),
      check(
        "sales_invoice_items_unit_name_snapshot_not_blank_check",
        sql`length(trim(${table.unitNameSnapshot})) > 0`,
      ),
      check(
        "sales_invoice_items_conversion_positive_check",
        sql`${table.conversionToBaseSnapshot} > 0`,
      ),
      check(
        "sales_invoice_items_quantity_positive_check",
        sql`${table.quantity} > 0`,
      ),
      check(
        "sales_invoice_items_base_quantity_positive_check",
        sql`${table.baseQuantity} > 0`,
      ),
      check(
        "sales_invoice_items_manual_unit_price_positive_check",
        sql`${table.manualUnitPrice} > 0`,
      ),
      check(
        "sales_invoice_items_discount_non_negative_check",
        sql`${table.itemDiscountAmount} >= 0`,
      ),
      check(
        "sales_invoice_items_discount_limit_check",
        sql`${table.itemDiscountAmount} <= round(${table.quantity} * ${table.manualUnitPrice}, 2)`,
      ),
      check(
        "sales_invoice_items_line_total_non_negative_check",
        sql`${table.lineTotal} >= 0`,
      ),
      check(
        "sales_invoice_items_line_total_calculation_check",
        sql`${table.lineTotal} = round(${table.quantity} * ${table.manualUnitPrice}, 2) - ${table.itemDiscountAmount}`,
      ),
      check(
        "sales_invoice_items_unit_cost_non_negative_check",
        sql`${table.unitCostSnapshot} is null or ${table.unitCostSnapshot} >= 0`,
      ),
    ];
  },
);
