import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  bankAccounts,
  cashAccounts,
  paymentMethodEnum,
} from "./payment.schema.js";

/** Stores reusable expense categories such as Rent, Electricity, and Loading. */
export const expenseCategories = pgTable(
  "expense_categories",
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
  /** Keeps category names meaningful and unique without adding delete/status tables. */
  function buildExpenseCategoryConstraints(table) {
    return [
      uniqueIndex("expense_categories_name_normalized_unique").on(
        sql`lower(trim(${table.name}))`,
      ),
      check(
        "expense_categories_name_not_blank_check",
        sql`length(trim(${table.name})) > 0`,
      ),
    ];
  },
);

/** Stores immutable confirmed cash or bank expenses and linked reversal rows. */
export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    expenseNumber: varchar("expense_number", { length: 32 }).notNull(),
    expenseCategoryId: uuid("expense_category_id").notNull(),
    expenseDate: date("expense_date").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    cashAccountId: uuid("cash_account_id"),
    bankAccountId: uuid("bank_account_id"),
    note: varchar("note", { length: 500 }),
    receiptUrl: varchar("receipt_url", { length: 2048 }),
    reversalOfExpenseId: uuid("reversal_of_expense_id"),
    reversalReason: varchar("reversal_reason", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  /** Builds the direct relationships and integrity checks required for expenses. */
  function buildExpenseConstraints(table) {
    return [
      foreignKey({
        columns: [table.expenseCategoryId],
        foreignColumns: [expenseCategories.id],
        name: "expenses_expense_category_id_expense_categories_id_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.cashAccountId],
        foreignColumns: [cashAccounts.id],
        name: "expenses_cash_account_id_cash_accounts_id_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.bankAccountId],
        foreignColumns: [bankAccounts.id],
        name: "expenses_bank_account_id_bank_accounts_id_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.reversalOfExpenseId],
        foreignColumns: [table.id],
        name: "expenses_reversal_of_expense_id_expenses_id_fk",
      }).onDelete("restrict"),
      uniqueIndex("expenses_expense_number_normalized_unique").on(
        sql`lower(trim(${table.expenseNumber}))`,
      ),
      uniqueIndex("expenses_one_reversal_unique")
        .on(table.reversalOfExpenseId)
        .where(sql`${table.reversalOfExpenseId} is not null`),
      index("expenses_category_date_index").on(
        table.expenseCategoryId,
        table.expenseDate,
      ),
      index("expenses_date_index").on(table.expenseDate),
      check(
        "expenses_expense_number_not_blank_check",
        sql`length(trim(${table.expenseNumber})) > 0`,
      ),
      check("expenses_amount_positive_check", sql`${table.amount} > 0`),
      check(
        "expenses_account_check",
        sql`(${table.paymentMethod} = 'CASH' and ${table.cashAccountId} is not null and ${table.bankAccountId} is null)
          or (${table.paymentMethod} = 'BANK_TRANSFER' and ${table.bankAccountId} is not null and ${table.cashAccountId} is null)`,
      ),
      check(
        "expenses_reversal_shape_check",
        sql`(${table.reversalOfExpenseId} is null and ${table.reversalReason} is null)
          or (${table.reversalOfExpenseId} is not null and length(trim(coalesce(${table.reversalReason}, ''))) > 0)`,
      ),
      check(
        "expenses_no_self_reversal_check",
        sql`${table.reversalOfExpenseId} is null or ${table.reversalOfExpenseId} <> ${table.id}`,
      ),
    ];
  },
);
