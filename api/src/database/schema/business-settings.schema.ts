import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/** Lists every business document type that receives a generated number. */
export const DOCUMENT_TYPES = [
  "SALE",
  "PURCHASE",
  "CUSTOMER_RECEIPT",
  "SUPPLIER_PAYMENT",
  "SALES_RETURN",
  "PURCHASE_RETURN",
  "EXPENSE",
  "EMPLOYEE_ADVANCE",
  "PAYROLL",
  "SALARY_PAYMENT",
  "ADVANCE_RECOVERY",
] as const;

/** The database stores Pakistani rupees only in version 1. */
export const FIXED_CURRENCY = "PKR";

/** Business dates and reports use the Karachi timezone in version 1. */
export const FIXED_TIMEZONE = "Asia/Karachi";

/** PostgreSQL limits sequence rows to the approved document types. */
export const documentTypeEnum = pgEnum("document_type", DOCUMENT_TYPES);

/**
 * Stores the single business profile used by invoices and reports.
 * The singleton key is always 1, so PostgreSQL can reject a second record.
 */
export const businessSettings = pgTable(
  "business_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    singletonKey: integer("singleton_key").default(1).notNull(),
    businessName: varchar("business_name", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 32 }).notNull(),
    email: varchar("email", { length: 254 }),
    address: text("address").notNull(),
    logoUrl: varchar("logo_url", { length: 2048 }),
    currency: varchar("currency", { length: 3 })
      .default(FIXED_CURRENCY)
      .notNull(),
    timezone: varchar("timezone", { length: 64 })
      .default(FIXED_TIMEZONE)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  // Builds the database rules that keep the business profile a valid singleton.
  function buildBusinessSettingsConstraints(table) {
    return [
      unique("business_settings_singleton_key_unique").on(table.singletonKey),
      check(
        "business_settings_singleton_key_check",
        sql`${table.singletonKey} = 1`,
      ),
      check(
        "business_settings_currency_check",
        sql`${table.currency} = 'PKR'`,
      ),
      check(
        "business_settings_timezone_check",
        sql`${table.timezone} = 'Asia/Karachi'`,
      ),
      check(
        "business_settings_name_not_blank_check",
        sql`length(trim(${table.businessName})) > 0`,
      ),
      check(
        "business_settings_phone_not_blank_check",
        sql`length(trim(${table.phone})) > 0`,
      ),
      check(
        "business_settings_address_not_blank_check",
        sql`length(trim(${table.address})) > 0`,
      ),
    ];
  },
);

/**
 * Stores the prefix and next available number for every document type.
 * Actual number reservation will be implemented transactionally in a later pass.
 */
export const documentSequences = pgTable(
  "document_sequences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentType: documentTypeEnum("document_type").notNull(),
    prefix: varchar("prefix", { length: 20 }).notNull(),
    nextNumber: integer("next_number").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  // Builds uniqueness and validity rules for document sequences.
  function buildDocumentSequenceConstraints(table) {
    return [
      unique("document_sequences_document_type_unique").on(table.documentType),
      unique("document_sequences_prefix_unique").on(table.prefix),
      check(
        "document_sequences_prefix_not_blank_check",
        sql`length(trim(${table.prefix})) > 0`,
      ),
      check(
        "document_sequences_next_number_positive_check",
        sql`${table.nextNumber} > 0`,
      ),
    ];
  },
);
