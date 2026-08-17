import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/** Groups products for product selection, filtering and reporting. */
export const productCategories = pgTable(
  "product_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function buildProductCategoryConstraints(table) {
    return [
      uniqueIndex("product_categories_name_normalized_unique").on(
        sql`lower(trim(${table.name}))`,
      ),
      index("product_categories_active_name_index").on(
        table.isActive,
        table.name,
      ),
      check(
        "product_categories_name_not_blank_check",
        sql`length(trim(${table.name})) > 0`,
      ),
    ];
  },
);

/** Stores an optional product brand used for product identification and filtering. */
export const brands = pgTable(
  "brands",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function buildBrandConstraints(table) {
    return [
      uniqueIndex("brands_name_normalized_unique").on(
        sql`lower(trim(${table.name}))`,
      ),
      index("brands_active_name_index").on(table.isActive, table.name),
      check(
        "brands_name_not_blank_check",
        sql`length(trim(${table.name})) > 0`,
      ),
    ];
  },
);

/**
 * Stores the product catalogue used by inventory, purchases, sales and returns.
 * Reference prices are informational only; later counter sales still use a
 * manually entered final selling price.
 */
export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sku: varchar("sku", { length: 64 }).notNull(),
    barcode: varchar("barcode", { length: 128 }),
    name: varchar("name", { length: 200 }).notNull(),
    categoryId: uuid("category_id").notNull(),
    brandId: uuid("brand_id"),
    reorderLevel: numeric("reorder_level", {
      precision: 14,
      scale: 3,
    })
      .default("0.000")
      .notNull(),
    referencePurchasePrice: numeric("reference_purchase_price", {
      precision: 14,
      scale: 2,
    }),
    referenceSalePrice: numeric("reference_sale_price", {
      precision: 14,
      scale: 2,
    }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function buildProductConstraints(table) {
    return [
      foreignKey({
        columns: [table.categoryId],
        foreignColumns: [productCategories.id],
        name: "products_category_id_product_categories_id_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.brandId],
        foreignColumns: [brands.id],
        name: "products_brand_id_brands_id_fk",
      }).onDelete("restrict"),
      uniqueIndex("products_sku_normalized_unique").on(
        sql`lower(trim(${table.sku}))`,
      ),
      uniqueIndex("products_barcode_unique")
        .on(table.barcode)
        .where(sql`${table.barcode} is not null`),
      index("products_category_id_index").on(table.categoryId),
      index("products_brand_id_index").on(table.brandId),
      index("products_active_name_index").on(table.isActive, table.name),
      check(
        "products_sku_not_blank_check",
        sql`length(trim(${table.sku})) > 0`,
      ),
      check(
        "products_barcode_not_blank_check",
        sql`${table.barcode} is null or length(trim(${table.barcode})) > 0`,
      ),
      check(
        "products_name_not_blank_check",
        sql`length(trim(${table.name})) > 0`,
      ),
      check(
        "products_reorder_level_non_negative_check",
        sql`${table.reorderLevel} >= 0`,
      ),
      check(
        "products_reference_purchase_price_non_negative_check",
        sql`${table.referencePurchasePrice} is null or ${table.referencePurchasePrice} >= 0`,
      ),
      check(
        "products_reference_sale_price_non_negative_check",
        sql`${table.referenceSalePrice} is null or ${table.referenceSalePrice} >= 0`,
      ),
    ];
  },
);

/**
 * Stores the allowed units for a product and their conversion into its base
 * stock unit. Later transaction items reference this row by UUID and keep
 * historical unit/conversion snapshots.
 */
export const productUnits = pgTable(
  "product_units",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id").notNull(),
    unitName: varchar("unit_name", { length: 80 }).notNull(),
    conversionToBase: numeric("conversion_to_base", {
      precision: 14,
      scale: 3,
    }).notNull(),
    isBaseUnit: boolean("is_base_unit").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function buildProductUnitConstraints(table) {
    return [
      foreignKey({
        columns: [table.productId],
        foreignColumns: [products.id],
        name: "product_units_product_id_products_id_fk",
      }).onDelete("restrict"),
      uniqueIndex("product_units_product_unit_name_normalized_unique").on(
        table.productId,
        sql`lower(trim(${table.unitName}))`,
      ),
      uniqueIndex("product_units_one_base_unit_per_product_unique")
        .on(table.productId)
        .where(sql`${table.isBaseUnit} = true`),
      index("product_units_product_id_index").on(table.productId),
      check(
        "product_units_unit_name_not_blank_check",
        sql`length(trim(${table.unitName})) > 0`,
      ),
      check(
        "product_units_conversion_positive_check",
        sql`${table.conversionToBase} > 0`,
      ),
      check(
        "product_units_base_conversion_check",
        sql`${table.isBaseUnit} = false or ${table.conversionToBase} = 1.000`,
      ),
      check(
        "product_units_base_active_check",
        sql`${table.isBaseUnit} = false or ${table.isActive} = true`,
      ),
    ];
  },
);
