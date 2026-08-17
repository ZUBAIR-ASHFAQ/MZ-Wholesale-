import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Stores supplier master data used by future purchase, payment, return, and ledger modules.
 * Supplier payable balances are not stored here because the Ledger module calculates them.
 */
export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    email: varchar("email", { length: 254 }),
    address: varchar("address", { length: 500 }),
    taxId: varchar("tax_id", { length: 80 }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  /** Builds database constraints and indexes for supplier master data. */
  function buildSupplierConstraints(table) {
    return [
      uniqueIndex("suppliers_code_normalized_unique").on(
        sql`lower(trim(${table.code}))`,
      ),
      index("suppliers_active_name_index").on(table.isActive, table.name),
      check(
        "suppliers_code_not_blank_check",
        sql`length(trim(${table.code})) > 0`,
      ),
      check(
        "suppliers_name_not_blank_check",
        sql`length(trim(${table.name})) > 0`,
      ),
      check(
        "suppliers_phone_not_blank_check",
        sql`${table.phone} is null or length(trim(${table.phone})) > 0`,
      ),
      check(
        "suppliers_email_not_blank_check",
        sql`${table.email} is null or length(trim(${table.email})) > 0`,
      ),
    ];
  },
);
