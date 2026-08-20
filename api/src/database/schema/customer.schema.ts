import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Stores regular customers and the single protected Walk-in Customer.
 * Customer balances are not stored here because the Ledger module calculates them.
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    email: varchar("email", { length: 254 }),
    address: varchar("address", { length: 500 }),
    creditLimit: numeric("credit_limit", {
      precision: 14,
      scale: 2,
    })
      .default("0.00")
      .notNull(),
    isWalkIn: boolean("is_walk_in").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  function buildCustomerConstraints(table) {
    return [
      uniqueIndex("customers_code_normalized_unique").on(
        sql`lower(trim(${table.code}))`,
      ),
      uniqueIndex("customers_one_walk_in_unique")
        .on(table.isWalkIn)
        .where(sql`${table.isWalkIn} = true`),
      index("customers_active_name_index").on(table.isActive, table.name),
      check(
        "customers_code_not_blank_check",
        sql`length(trim(${table.code})) > 0`,
      ),
      check(
        "customers_name_not_blank_check",
        sql`length(trim(${table.name})) > 0`,
      ),
      check(
        "customers_phone_not_blank_check",
        sql`${table.phone} is null or length(trim(${table.phone})) > 0`,
      ),
      check(
        "customers_email_not_blank_check",
        sql`${table.email} is null or length(trim(${table.email})) > 0`,
      ),
      check(
        "customers_credit_limit_non_negative_check",
        sql`${table.creditLimit} >= 0`,
      ),
      check(
        "customers_walk_in_active_check",
        sql`${table.isWalkIn} = false or ${table.isActive} = true`,
      ),
      check(
        "customers_walk_in_no_credit_check",
        sql`${table.isWalkIn} = false or ${table.creditLimit} = 0.00`,
      ),
    ];
  },
);
