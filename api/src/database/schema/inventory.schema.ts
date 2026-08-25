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
import { products } from "./product.schema.js";

/** Lists every stock condition tracked separately by Inventory. */
export const stockConditionEnum = pgEnum("stock_condition", [
  "SELLABLE",
  "DAMAGED",
  "EXPIRED",
]);

/** Identifies whether a stock movement adds or removes quantity. */
export const stockDirectionEnum = pgEnum("stock_direction", ["IN", "OUT"]);

/** Identifies the business action that created a stock movement. */
export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "OPENING_STOCK",
  "PURCHASE",
  "SALE",
  "SALES_RETURN",
  "PURCHASE_RETURN",
  "ADJUSTMENT",
  "STOCK_COUNT",
  "DISPOSAL",
]);

/** Identifies whether a physical stock count is still editable. */
export const stockCountStatusEnum = pgEnum("stock_count_status", [
  "DRAFT",
  "CONFIRMED",
]);

/** Stores current quantities and condition-specific weighted costs for one product. */
export const inventoryBalances = pgTable(
  "inventory_balances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id").notNull(),
    sellableQuantityOnHand: numeric("sellable_quantity_on_hand", {
      precision: 14,
      scale: 3,
    })
      .default("0.000")
      .notNull(),
    damagedQuantityOnHand: numeric("damaged_quantity_on_hand", {
      precision: 14,
      scale: 3,
    })
      .default("0.000")
      .notNull(),
    expiredQuantityOnHand: numeric("expired_quantity_on_hand", {
      precision: 14,
      scale: 3,
    })
      .default("0.000")
      .notNull(),
    weightedAverageCost: numeric("weighted_average_cost", {
      precision: 30,
      scale: 14,
    })
      .default("0.00000000000000")
      .notNull(),
    damagedWeightedAverageCost: numeric("damaged_weighted_average_cost", {
      precision: 30,
      scale: 14,
    })
      .default("0.00000000000000")
      .notNull(),
    expiredWeightedAverageCost: numeric("expired_weighted_average_cost", {
      precision: 30,
      scale: 14,
    })
      .default("0.00000000000000")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function buildInventoryBalanceConstraints(table) {
    return [
      foreignKey({
        columns: [table.productId],
        foreignColumns: [products.id],
        name: "inventory_balances_product_id_products_id_fk",
      }).onDelete("restrict"),
      uniqueIndex("inventory_balances_product_id_unique").on(table.productId),
      check(
        "inventory_balances_sellable_non_negative_check",
        sql`${table.sellableQuantityOnHand} >= 0`,
      ),
      check(
        "inventory_balances_damaged_non_negative_check",
        sql`${table.damagedQuantityOnHand} >= 0`,
      ),
      check(
        "inventory_balances_expired_non_negative_check",
        sql`${table.expiredQuantityOnHand} >= 0`,
      ),
      check(
        "inventory_balances_weighted_cost_non_negative_check",
        sql`${table.weightedAverageCost} >= 0`,
      ),
      check(
        "inventory_balances_damaged_weighted_cost_non_negative_check",
        sql`${table.damagedWeightedAverageCost} >= 0`,
      ),
      check(
        "inventory_balances_expired_weighted_cost_non_negative_check",
        sql`${table.expiredWeightedAverageCost} >= 0`,
      ),
    ];
  },
);

/** Stores an immutable record for every stock quantity change. */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id").notNull(),
    movementType: stockMovementTypeEnum("movement_type").notNull(),
    stockCondition: stockConditionEnum("stock_condition").notNull(),
    direction: stockDirectionEnum("direction").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 30, scale: 14 }).notNull(),
    allocatedExtraCost: numeric("allocated_extra_cost", {
      precision: 14,
      scale: 2,
    }),
    sourceType: varchar("source_type", { length: 40 }),
    sourceId: uuid("source_id"),
    reason: varchar("reason", { length: 200 }),
    notes: varchar("notes", { length: 1000 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function buildStockMovementConstraints(table) {
    return [
      foreignKey({
        columns: [table.productId],
        foreignColumns: [products.id],
        name: "stock_movements_product_id_products_id_fk",
      }).onDelete("restrict"),
      index("stock_movements_product_occurred_at_index").on(
        table.productId,
        table.occurredAt,
      ),
      index("stock_movements_source_index").on(
        table.sourceType,
        table.sourceId,
      ),
      check(
        "stock_movements_quantity_positive_check",
        sql`${table.quantity} > 0`,
      ),
      check(
        "stock_movements_unit_cost_non_negative_check",
        sql`${table.unitCost} >= 0`,
      ),
      check(
        "stock_movements_allocated_extra_cost_non_negative_check",
        sql`${table.allocatedExtraCost} is null or ${table.allocatedExtraCost} >= 0`,
      ),
      check(
        "stock_movements_source_pair_check",
        sql`(${table.sourceType} is null and ${table.sourceId} is null) or (${table.sourceType} is not null and ${table.sourceId} is not null)`,
      ),
      check(
        "stock_movements_source_type_not_blank_check",
        sql`${table.sourceType} is null or length(trim(${table.sourceType})) > 0`,
      ),
      check(
        "stock_movements_reason_not_blank_check",
        sql`${table.reason} is null or length(trim(${table.reason})) > 0`,
      ),
      check(
        "stock_movements_notes_not_blank_check",
        sql`${table.notes} is null or length(trim(${table.notes})) > 0`,
      ),
    ];
  },
);

/** Stores one physical stock-count document. */
export const stockCounts = pgTable(
  "stock_counts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countNumber: varchar("count_number", { length: 32 }).notNull(),
    countDate: date("count_date").notNull(),
    status: stockCountStatusEnum("status").default("DRAFT").notNull(),
    notes: varchar("notes", { length: 1000 }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function buildStockCountConstraints(table) {
    return [
      uniqueIndex("stock_counts_count_number_normalized_unique").on(
        sql`lower(trim(${table.countNumber}))`,
      ),
      index("stock_counts_status_count_date_index").on(
        table.status,
        table.countDate,
      ),
      check(
        "stock_counts_count_number_not_blank_check",
        sql`length(trim(${table.countNumber})) > 0`,
      ),
      check(
        "stock_counts_notes_not_blank_check",
        sql`${table.notes} is null or length(trim(${table.notes})) > 0`,
      ),
      check(
        "stock_counts_confirmation_state_check",
        sql`(${table.status} = 'DRAFT' and ${table.confirmedAt} is null) or (${table.status} = 'CONFIRMED' and ${table.confirmedAt} is not null)`,
      ),
    ];
  },
);

/** Stores one product and stock-condition line inside a physical count. */
export const stockCountItems = pgTable(
  "stock_count_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    stockCountId: uuid("stock_count_id").notNull(),
    productId: uuid("product_id").notNull(),
    stockCondition: stockConditionEnum("stock_condition").notNull(),
    systemQuantity: numeric("system_quantity", {
      precision: 14,
      scale: 3,
    }).notNull(),
    countedQuantity: numeric("counted_quantity", {
      precision: 14,
      scale: 3,
    }).notNull(),
    differenceQuantity: numeric("difference_quantity", {
      precision: 14,
      scale: 3,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function buildStockCountItemConstraints(table) {
    return [
      foreignKey({
        columns: [table.stockCountId],
        foreignColumns: [stockCounts.id],
        name: "stock_count_items_stock_count_id_stock_counts_id_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.productId],
        foreignColumns: [products.id],
        name: "stock_count_items_product_id_products_id_fk",
      }).onDelete("restrict"),
      uniqueIndex("stock_count_items_count_product_condition_unique").on(
        table.stockCountId,
        table.productId,
        table.stockCondition,
      ),
      index("stock_count_items_product_id_index").on(table.productId),
      check(
        "stock_count_items_system_quantity_non_negative_check",
        sql`${table.systemQuantity} >= 0`,
      ),
      check(
        "stock_count_items_counted_quantity_non_negative_check",
        sql`${table.countedQuantity} >= 0`,
      ),
      check(
        "stock_count_items_difference_matches_check",
        sql`${table.differenceQuantity} = ${table.countedQuantity} - ${table.systemQuantity}`,
      ),
    ];
  },
);
