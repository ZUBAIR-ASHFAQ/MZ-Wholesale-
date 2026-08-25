import { sql } from "drizzle-orm";
import {
  check,
  index,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { customers } from "./customer.schema.js";
import { suppliers } from "./supplier.schema.js";

/** Immutable entries used to calculate customer dues. */
export const customerLedgerEntries = pgTable(
  "customer_ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    referenceType: varchar("reference_type", { length: 40 }).notNull(),
    referenceId: uuid("reference_id"),
    documentNumber: varchar("document_number", { length: 50 }),
    description: varchar("description", { length: 200 }),
    debit: numeric("debit", { precision: 14, scale: 2 }).default("0.00").notNull(),
    credit: numeric("credit", { precision: 14, scale: 2 }).default("0.00").notNull(),
    notes: varchar("notes", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("customer_ledger_customer_date_index").on(table.customerId, table.occurredAt),
    index("customer_ledger_reference_index").on(table.referenceType, table.referenceId),
    uniqueIndex("customer_ledger_source_unique")
      .on(table.customerId, table.referenceType, table.referenceId)
      .where(sql`${table.referenceId} is not null`),
    uniqueIndex("customer_ledger_one_opening_balance_unique")
      .on(table.customerId, table.referenceType)
      .where(sql`${table.referenceType} = 'OPENING_BALANCE'`),
    check("customer_ledger_amount_check", sql`(${table.debit} > 0 and ${table.credit} = 0) or (${table.credit} > 0 and ${table.debit} = 0)`),
    check("customer_ledger_reference_check", sql`(${table.referenceType} = 'OPENING_BALANCE' and ${table.referenceId} is null) or (${table.referenceType} <> 'OPENING_BALANCE' and ${table.referenceId} is not null)`),
  ],
);

/** Immutable entries used to calculate supplier payables. */
export const supplierLedgerEntries = pgTable(
  "supplier_ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    referenceType: varchar("reference_type", { length: 40 }).notNull(),
    referenceId: uuid("reference_id"),
    documentNumber: varchar("document_number", { length: 50 }),
    description: varchar("description", { length: 200 }),
    debit: numeric("debit", { precision: 14, scale: 2 }).default("0.00").notNull(),
    credit: numeric("credit", { precision: 14, scale: 2 }).default("0.00").notNull(),
    notes: varchar("notes", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("supplier_ledger_supplier_date_index").on(table.supplierId, table.occurredAt),
    index("supplier_ledger_reference_index").on(table.referenceType, table.referenceId),
    uniqueIndex("supplier_ledger_source_unique")
      .on(table.supplierId, table.referenceType, table.referenceId)
      .where(sql`${table.referenceId} is not null`),
    uniqueIndex("supplier_ledger_one_opening_balance_unique")
      .on(table.supplierId, table.referenceType)
      .where(sql`${table.referenceType} = 'OPENING_BALANCE'`),
    check("supplier_ledger_amount_check", sql`(${table.debit} > 0 and ${table.credit} = 0) or (${table.credit} > 0 and ${table.debit} = 0)`),
    check("supplier_ledger_reference_check", sql`(${table.referenceType} = 'OPENING_BALANCE' and ${table.referenceId} is null) or (${table.referenceType} <> 'OPENING_BALANCE' and ${table.referenceId} is not null)`),
  ],
);
