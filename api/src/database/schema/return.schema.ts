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
import { bankAccounts, cashAccounts } from "./payment.schema.js";
import { products, productUnits } from "./product.schema.js";
import { purchaseItems, purchases } from "./purchase.schema.js";
import { salesInvoiceItems, salesInvoices } from "./sales.schema.js";
import { suppliers } from "./supplier.schema.js";

/** Sales returns are confirmed immediately in version 1. */
export const returnStatusEnum = pgEnum("return_status", ["CONFIRMED"]);

/** Identifies how a confirmed sales return settles the customer's value. */
export const salesReturnRefundModeEnum = pgEnum("sales_return_refund_mode", [
  "DUE_REDUCTION",
  "CASH",
  "BANK_TRANSFER",
]);

/** Keeps returned sale stock separate by its physical condition. */
export const salesReturnStockConditionEnum = pgEnum(
  "sales_return_stock_condition",
  ["GOOD", "DAMAGED", "EXPIRED"],
);

/** Stores one immutable confirmed return against an original sales invoice. */
export const salesReturns = pgTable(
  "sales_returns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    returnNumber: varchar("return_number", { length: 32 }).notNull(),
    originalSaleId: uuid("original_sale_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    returnDate: date("return_date").notNull(),
    status: returnStatusEnum("status").default("CONFIRMED").notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    refundMode: salesReturnRefundModeEnum("refund_mode").notNull(),
    cashAccountId: uuid("cash_account_id"),
    bankAccountId: uuid("bank_account_id"),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  /** Builds direct relationships and protects the immutable return header. */
  function buildSalesReturnConstraints(table) {
    return [
      foreignKey({
        columns: [table.originalSaleId],
        foreignColumns: [salesInvoices.id],
        name: "sales_returns_original_sale_id_sales_invoices_id_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.customerId],
        foreignColumns: [customers.id],
        name: "sales_returns_customer_id_customers_id_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.cashAccountId],
        foreignColumns: [cashAccounts.id],
        name: "sales_returns_cash_account_id_cash_accounts_id_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.bankAccountId],
        foreignColumns: [bankAccounts.id],
        name: "sales_returns_bank_account_id_bank_accounts_id_fk",
      }).onDelete("restrict"),
      uniqueIndex("sales_returns_return_number_normalized_unique").on(
        sql`lower(trim(${table.returnNumber}))`,
      ),
      index("sales_returns_original_sale_id_index").on(table.originalSaleId),
      index("sales_returns_return_date_index").on(table.returnDate),
      index("sales_returns_customer_return_date_index").on(
        table.customerId,
        table.returnDate,
      ),
      check(
        "sales_returns_return_number_not_blank_check",
        sql`length(trim(${table.returnNumber})) > 0`,
      ),
      check(
        "sales_returns_reason_not_blank_check",
        sql`length(trim(${table.reason})) > 0`,
      ),
      check(
        "sales_returns_total_amount_non_negative_check",
        sql`${table.totalAmount} >= 0`,
      ),
      check(
        "sales_returns_refund_account_check",
        sql`(${table.refundMode} = 'CASH' and ${table.cashAccountId} is not null and ${table.bankAccountId} is null)
          or (${table.refundMode} = 'BANK_TRANSFER' and ${table.cashAccountId} is null and ${table.bankAccountId} is not null)
          or (${table.refundMode} = 'DUE_REDUCTION' and ${table.cashAccountId} is null and ${table.bankAccountId} is null)`,
      ),
    ];
  },
);

/** Stores immutable original sale snapshots for every returned sales line. */
export const salesReturnItems = pgTable(
  "sales_return_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    salesReturnId: uuid("sales_return_id").notNull(),
    originalSaleItemId: uuid("original_sale_item_id").notNull(),
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
    unitPriceSnapshot: numeric("unit_price_snapshot", {
      precision: 14,
      scale: 2,
    }).notNull(),
    unitCostSnapshot: numeric("unit_cost_snapshot", {
      precision: 30,
      scale: 14,
    }).notNull(),
    stockCondition: salesReturnStockConditionEnum("stock_condition").notNull(),
    lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  /** Builds direct source/product relationships and validates return snapshots. */
  function buildSalesReturnItemConstraints(table) {
    return [
      foreignKey({
        columns: [table.salesReturnId],
        foreignColumns: [salesReturns.id],
        name: "sales_return_items_sales_return_id_sales_returns_id_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.originalSaleItemId],
        foreignColumns: [salesInvoiceItems.id],
        name: "sales_return_items_original_sale_item_id_sales_invoice_items_id_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.productId],
        foreignColumns: [products.id],
        name: "sales_return_items_product_id_products_id_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.productUnitId],
        foreignColumns: [productUnits.id],
        name: "sales_return_items_product_unit_id_product_units_id_fk",
      }).onDelete("restrict"),
      index("sales_return_items_sales_return_id_index").on(table.salesReturnId),
      index("sales_return_items_original_sale_item_id_index").on(
        table.originalSaleItemId,
      ),
      index("sales_return_items_product_id_index").on(table.productId),
      check(
        "sales_return_items_product_sku_snapshot_not_blank_check",
        sql`length(trim(${table.productSkuSnapshot})) > 0`,
      ),
      check(
        "sales_return_items_product_name_snapshot_not_blank_check",
        sql`length(trim(${table.productNameSnapshot})) > 0`,
      ),
      check(
        "sales_return_items_unit_name_snapshot_not_blank_check",
        sql`length(trim(${table.unitNameSnapshot})) > 0`,
      ),
      check(
        "sales_return_items_conversion_positive_check",
        sql`${table.conversionToBaseSnapshot} > 0`,
      ),
      check(
        "sales_return_items_quantity_positive_check",
        sql`${table.quantity} > 0`,
      ),
      check(
        "sales_return_items_base_quantity_positive_check",
        sql`${table.baseQuantity} > 0`,
      ),
      check(
        "sales_return_items_unit_price_positive_check",
        sql`${table.unitPriceSnapshot} > 0`,
      ),
      check(
        "sales_return_items_unit_cost_non_negative_check",
        sql`${table.unitCostSnapshot} >= 0`,
      ),
      check(
        "sales_return_items_line_total_non_negative_check",
        sql`${table.lineTotal} >= 0`,
      ),
    ];
  },
);


/** Stores one immutable confirmed return against an original supplier purchase. */
export const purchaseReturns = pgTable(
  "purchase_returns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    returnNumber: varchar("return_number", { length: 32 }).notNull(),
    originalPurchaseId: uuid("original_purchase_id").notNull(),
    supplierId: uuid("supplier_id").notNull(),
    returnDate: date("return_date").notNull(),
    status: returnStatusEnum("status").default("CONFIRMED").notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  /** Builds direct purchase/supplier relationships and validates the return header. */
  function buildPurchaseReturnConstraints(table) {
    return [
      foreignKey({
        columns: [table.originalPurchaseId],
        foreignColumns: [purchases.id],
        name: "purchase_returns_original_purchase_id_purchases_id_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.supplierId],
        foreignColumns: [suppliers.id],
        name: "purchase_returns_supplier_id_suppliers_id_fk",
      }).onDelete("restrict"),
      uniqueIndex("purchase_returns_return_number_normalized_unique").on(
        sql`lower(trim(${table.returnNumber}))`,
      ),
      index("purchase_returns_original_purchase_id_index").on(
        table.originalPurchaseId,
      ),
      index("purchase_returns_return_date_index").on(table.returnDate),
      index("purchase_returns_supplier_return_date_index").on(
        table.supplierId,
        table.returnDate,
      ),
      check(
        "purchase_returns_return_number_not_blank_check",
        sql`length(trim(${table.returnNumber})) > 0`,
      ),
      check(
        "purchase_returns_reason_not_blank_check",
        sql`length(trim(${table.reason})) > 0`,
      ),
      check(
        "purchase_returns_total_amount_non_negative_check",
        sql`${table.totalAmount} >= 0`,
      ),
    ];
  },
);

/** Stores immutable original purchase snapshots for every returned purchase line. */
export const purchaseReturnItems = pgTable(
  "purchase_return_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    purchaseReturnId: uuid("purchase_return_id").notNull(),
    originalPurchaseItemId: uuid("original_purchase_item_id").notNull(),
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
    unitCostSnapshot: numeric("unit_cost_snapshot", {
      precision: 30,
      scale: 14,
    }).notNull(),
    lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  /** Builds direct source/product relationships and validates purchase-return snapshots. */
  function buildPurchaseReturnItemConstraints(table) {
    return [
      foreignKey({
        columns: [table.purchaseReturnId],
        foreignColumns: [purchaseReturns.id],
        name: "purchase_return_items_purchase_return_id_purchase_returns_id_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.originalPurchaseItemId],
        foreignColumns: [purchaseItems.id],
        name: "purchase_return_items_original_purchase_item_id_purchase_items_id_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.productId],
        foreignColumns: [products.id],
        name: "purchase_return_items_product_id_products_id_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.productUnitId],
        foreignColumns: [productUnits.id],
        name: "purchase_return_items_product_unit_id_product_units_id_fk",
      }).onDelete("restrict"),
      index("purchase_return_items_purchase_return_id_index").on(
        table.purchaseReturnId,
      ),
      index("purchase_return_items_original_purchase_item_id_index").on(
        table.originalPurchaseItemId,
      ),
      index("purchase_return_items_product_id_index").on(table.productId),
      check(
        "purchase_return_items_product_sku_snapshot_not_blank_check",
        sql`length(trim(${table.productSkuSnapshot})) > 0`,
      ),
      check(
        "purchase_return_items_product_name_snapshot_not_blank_check",
        sql`length(trim(${table.productNameSnapshot})) > 0`,
      ),
      check(
        "purchase_return_items_unit_name_snapshot_not_blank_check",
        sql`length(trim(${table.unitNameSnapshot})) > 0`,
      ),
      check(
        "purchase_return_items_conversion_positive_check",
        sql`${table.conversionToBaseSnapshot} > 0`,
      ),
      check(
        "purchase_return_items_quantity_positive_check",
        sql`${table.quantity} > 0`,
      ),
      check(
        "purchase_return_items_base_quantity_positive_check",
        sql`${table.baseQuantity} > 0`,
      ),
      check(
        "purchase_return_items_unit_cost_non_negative_check",
        sql`${table.unitCostSnapshot} >= 0`,
      ),
      check(
        "purchase_return_items_line_total_non_negative_check",
        sql`${table.lineTotal} >= 0`,
      ),
    ];
  },
);
