import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  boolean,
} from "drizzle-orm/pg-core";

import { customers } from "./customer.schema.js";
import { suppliers } from "./supplier.schema.js";
import { purchases } from "./purchase.schema.js";
import { salesInvoices } from "./sales.schema.js";

/** Lists the two payment methods allowed in version 1. */
export const paymentMethodEnum = pgEnum("payment_method", [
  "CASH",
  "BANK_TRANSFER",
]);

/** Lists the immutable lifecycle states of a confirmed payment. */
export const paymentStatusEnum = pgEnum("payment_status", [
  "CONFIRMED",
  "REVERSED",
]);

/** Identifies whether money entered or left an account. */
export const movementDirectionEnum = pgEnum("movement_direction", [
  "INFLOW",
  "OUTFLOW",
]);

/** Identifies the business action that created a cash or bank movement. */
export const movementSourceTypeEnum = pgEnum("movement_source_type", [
  "OPENING_BALANCE",
  "CUSTOMER_RECEIPT",
  "CUSTOMER_RECEIPT_REVERSAL",
  "SUPPLIER_PAYMENT",
  "SUPPLIER_PAYMENT_REVERSAL",
  "TRANSFER",
  "RECONCILIATION_ADJUSTMENT",
  "PURCHASE_INITIAL_PAYMENT",
  "SALE_INITIAL_PAYMENT",
  "SALES_RETURN",
  "EXPENSE",
  "EXPENSE_REVERSAL",
  "EMPLOYEE_ADVANCE",
  "ADVANCE_RECOVERY",
  "SALARY_PAYMENT",
  "SALARY_PAYMENT_REVERSAL",
]);

/** Lists the editable and immutable states of a cash reconciliation. */
export const reconciliationStatusEnum = pgEnum("reconciliation_status", [
  "DRAFT",
  "CONFIRMED",
]);

/** Stores physical cash accounts used by the shop. */
export const cashAccounts = pgTable(
  "cash_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    openingBalance: numeric("opening_balance", { precision: 14, scale: 2 })
      .default("0.00")
      .notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  /** Builds simple uniqueness and money checks for cash accounts. */
  function buildCashAccountConstraints(table) {
    return [
      uniqueIndex("cash_accounts_name_unique").on(table.name),
      check(
        "cash_accounts_name_not_blank_check",
        sql`length(trim(${table.name})) > 0`,
      ),
      check(
        "cash_accounts_opening_balance_check",
        sql`${table.openingBalance} >= 0`,
      ),
    ];
  },
);

/** Stores bank accounts used for bank-transfer payments. */
export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bankName: varchar("bank_name", { length: 120 }).notNull(),
    accountName: varchar("account_name", { length: 120 }).notNull(),
    accountNumber: varchar("account_number", { length: 80 }).notNull(),
    openingBalance: numeric("opening_balance", { precision: 14, scale: 2 })
      .default("0.00")
      .notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  /** Builds uniqueness and required-field checks for bank accounts. */
  function buildBankAccountConstraints(table) {
    return [
      uniqueIndex("bank_accounts_account_number_unique").on(
        table.accountNumber,
      ),
      check(
        "bank_accounts_bank_name_not_blank_check",
        sql`length(trim(${table.bankName})) > 0`,
      ),
      check(
        "bank_accounts_account_name_not_blank_check",
        sql`length(trim(${table.accountName})) > 0`,
      ),
      check(
        "bank_accounts_account_number_not_blank_check",
        sql`length(trim(${table.accountNumber})) > 0`,
      ),
      check(
        "bank_accounts_opening_balance_check",
        sql`${table.openingBalance} >= 0`,
      ),
    ];
  },
);

/** Stores immutable customer receipt headers. */
export const customerPayments = pgTable(
  "customer_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    documentNumber: varchar("document_number", { length: 50 }).notNull(),
    paymentDate: timestamp("payment_date", { withTimezone: true }).notNull(),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
    status: paymentStatusEnum("status").default("CONFIRMED").notNull(),
    reversalOfPaymentId: uuid("reversal_of_payment_id"),
    reversalReason: varchar("reversal_reason", { length: 500 }),
    notes: varchar("notes", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  /** Builds document, amount, and reversal checks for customer receipts. */
  function buildCustomerPaymentConstraints(table) {
    return [
      foreignKey({
        columns: [table.reversalOfPaymentId],
        foreignColumns: [table.id],
        name: "customer_payments_reversal_of_fk",
      }),
      uniqueIndex("customer_payments_document_number_unique").on(
        table.documentNumber,
      ),
      uniqueIndex("customer_payments_one_reversal_unique")
        .on(table.reversalOfPaymentId)
        .where(sql`${table.reversalOfPaymentId} is not null`),
      index("customer_payments_customer_date_index").on(
        table.customerId,
        table.paymentDate,
      ),
      check(
        "customer_payments_total_amount_check",
        sql`${table.totalAmount} > 0`,
      ),
      check(
        "customer_payments_reversal_shape_check",
        sql`(${table.reversalOfPaymentId} is null and ${table.reversalReason} is null) or (${table.reversalOfPaymentId} is not null and length(trim(coalesce(${table.reversalReason}, ''))) > 0)`,
      ),
      check(
        "customer_payments_no_self_reversal_check",
        sql`${table.reversalOfPaymentId} is null or ${table.reversalOfPaymentId} <> ${table.id}`,
      ),
    ];
  },
);

/** Stores one cash or bank part of a customer receipt. */
export const customerPaymentSplits = pgTable(
  "customer_payment_splits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerPaymentId: uuid("customer_payment_id")
      .notNull()
      .references(() => customerPayments.id),
    method: paymentMethodEnum("method").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    cashAccountId: uuid("cash_account_id").references(() => cashAccounts.id),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  /** Enforces positive amounts and exactly one account matching the method. */
  function buildCustomerPaymentSplitConstraints(table) {
    return [
      index("customer_payment_splits_payment_index").on(
        table.customerPaymentId,
      ),
      check("customer_payment_splits_amount_check", sql`${table.amount} > 0`),
      check(
        "customer_payment_splits_account_check",
        sql`(${table.method} = 'CASH' and ${table.cashAccountId} is not null and ${table.bankAccountId} is null) or (${table.method} = 'BANK_TRANSFER' and ${table.bankAccountId} is not null and ${table.cashAccountId} is null)`,
      ),
    ];
  },
);

/** Stores receipt allocations against confirmed sales invoice UUIDs. */
export const customerPaymentAllocations = pgTable(
  "customer_payment_allocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerPaymentId: uuid("customer_payment_id")
      .notNull()
      .references(() => customerPayments.id),
    salesInvoiceId: uuid("sales_invoice_id")
      .notNull()
      .references(() => salesInvoices.id),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  /** Prevents duplicate invoice allocations inside one receipt. */
  function buildCustomerAllocationConstraints(table) {
    return [
      uniqueIndex("customer_payment_allocations_invoice_unique").on(
        table.customerPaymentId,
        table.salesInvoiceId,
      ),
      check(
        "customer_payment_allocations_amount_check",
        sql`${table.amount} > 0`,
      ),
    ];
  },
);

/** Stores immutable supplier payment headers. */
export const supplierPayments = pgTable(
  "supplier_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    documentNumber: varchar("document_number", { length: 50 }).notNull(),
    paymentDate: timestamp("payment_date", { withTimezone: true }).notNull(),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
    status: paymentStatusEnum("status").default("CONFIRMED").notNull(),
    reversalOfPaymentId: uuid("reversal_of_payment_id"),
    reversalReason: varchar("reversal_reason", { length: 500 }),
    notes: varchar("notes", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  /** Builds document, amount, and reversal checks for supplier payments. */
  function buildSupplierPaymentConstraints(table) {
    return [
      foreignKey({
        columns: [table.reversalOfPaymentId],
        foreignColumns: [table.id],
        name: "supplier_payments_reversal_of_fk",
      }),
      uniqueIndex("supplier_payments_document_number_unique").on(
        table.documentNumber,
      ),
      uniqueIndex("supplier_payments_one_reversal_unique")
        .on(table.reversalOfPaymentId)
        .where(sql`${table.reversalOfPaymentId} is not null`),
      index("supplier_payments_supplier_date_index").on(
        table.supplierId,
        table.paymentDate,
      ),
      check(
        "supplier_payments_total_amount_check",
        sql`${table.totalAmount} > 0`,
      ),
      check(
        "supplier_payments_reversal_shape_check",
        sql`(${table.reversalOfPaymentId} is null and ${table.reversalReason} is null) or (${table.reversalOfPaymentId} is not null and length(trim(coalesce(${table.reversalReason}, ''))) > 0)`,
      ),
      check(
        "supplier_payments_no_self_reversal_check",
        sql`${table.reversalOfPaymentId} is null or ${table.reversalOfPaymentId} <> ${table.id}`,
      ),
    ];
  },
);

/** Stores one cash or bank part of a supplier payment. */
export const supplierPaymentSplits = pgTable(
  "supplier_payment_splits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    supplierPaymentId: uuid("supplier_payment_id")
      .notNull()
      .references(() => supplierPayments.id),
    method: paymentMethodEnum("method").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    cashAccountId: uuid("cash_account_id").references(() => cashAccounts.id),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  /** Enforces positive amounts and exactly one account matching the method. */
  function buildSupplierPaymentSplitConstraints(table) {
    return [
      index("supplier_payment_splits_payment_index").on(
        table.supplierPaymentId,
      ),
      check("supplier_payment_splits_amount_check", sql`${table.amount} > 0`),
      check(
        "supplier_payment_splits_account_check",
        sql`(${table.method} = 'CASH' and ${table.cashAccountId} is not null and ${table.bankAccountId} is null) or (${table.method} = 'BANK_TRANSFER' and ${table.bankAccountId} is not null and ${table.cashAccountId} is null)`,
      ),
    ];
  },
);

/** Stores each supplier-payment allocation against a real Purchase document. */
export const supplierPaymentAllocations = pgTable(
  "supplier_payment_allocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    supplierPaymentId: uuid("supplier_payment_id")
      .notNull()
      .references(() => supplierPayments.id),
    purchaseId: uuid("purchase_id").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  /** Enforces the Purchase relationship and prevents duplicate purchase allocations. */
  function buildSupplierAllocationConstraints(table) {
    return [
      foreignKey({
        columns: [table.purchaseId],
        foreignColumns: [purchases.id],
        name: "supplier_payment_allocations_purchase_id_purchases_id_fk",
      }).onDelete("restrict"),
      uniqueIndex("supplier_payment_allocations_purchase_unique").on(
        table.supplierPaymentId,
        table.purchaseId,
      ),
      index("supplier_payment_allocations_purchase_index").on(table.purchaseId),
      check(
        "supplier_payment_allocations_amount_check",
        sql`${table.amount} > 0`,
      ),
    ];
  },
);

/** Stores every immutable cash and bank inflow or outflow. */
export const cashBankMovements = pgTable(
  "cash_bank_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    method: paymentMethodEnum("method").notNull(),
    cashAccountId: uuid("cash_account_id").references(() => cashAccounts.id),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id),
    direction: movementDirectionEnum("direction").notNull(),
    sourceType: movementSourceTypeEnum("source_type").notNull(),
    sourceId: uuid("source_id"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    documentNumber: varchar("document_number", { length: 50 }),
    description: varchar("description", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  /** Builds account, source, and duplicate-effect checks for movements. */
  function buildCashBankMovementConstraints(table) {
    return [
      index("cash_bank_movements_cash_date_index").on(
        table.cashAccountId,
        table.occurredAt,
      ),
      index("cash_bank_movements_bank_date_index").on(
        table.bankAccountId,
        table.occurredAt,
      ),
      index("cash_bank_movements_source_index").on(
        table.sourceType,
        table.sourceId,
      ),
      uniqueIndex("cash_bank_movements_cash_source_effect_unique")
        .on(
          table.sourceType,
          table.sourceId,
          table.direction,
          table.cashAccountId,
        )
        .where(
          sql`${table.sourceId} is not null and ${table.cashAccountId} is not null`,
        ),
      uniqueIndex("cash_bank_movements_bank_source_effect_unique")
        .on(
          table.sourceType,
          table.sourceId,
          table.direction,
          table.bankAccountId,
        )
        .where(
          sql`${table.sourceId} is not null and ${table.bankAccountId} is not null`,
        ),
      uniqueIndex("cash_bank_movements_opening_cash_unique")
        .on(table.cashAccountId, table.sourceType)
        .where(
          sql`${table.sourceType} = 'OPENING_BALANCE' and ${table.cashAccountId} is not null`,
        ),
      uniqueIndex("cash_bank_movements_opening_bank_unique")
        .on(table.bankAccountId, table.sourceType)
        .where(
          sql`${table.sourceType} = 'OPENING_BALANCE' and ${table.bankAccountId} is not null`,
        ),
      check("cash_bank_movements_amount_check", sql`${table.amount} > 0`),
      check(
        "cash_bank_movements_account_check",
        sql`(${table.method} = 'CASH' and ${table.cashAccountId} is not null and ${table.bankAccountId} is null) or (${table.method} = 'BANK_TRANSFER' and ${table.bankAccountId} is not null and ${table.cashAccountId} is null)`,
      ),
      check(
        "cash_bank_movements_source_check",
        sql`(${table.sourceType} = 'OPENING_BALANCE' and ${table.sourceId} is null) or (${table.sourceType} <> 'OPENING_BALANCE' and ${table.sourceId} is not null)`,
      ),
    ];
  },
);

/** Stores immutable transfers between two cash or bank accounts. */
export const cashBankTransfers = pgTable(
  "cash_bank_transfers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transferDate: timestamp("transfer_date", { withTimezone: true }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    sourceMethod: paymentMethodEnum("source_method").notNull(),
    sourceCashAccountId: uuid("source_cash_account_id").references(
      () => cashAccounts.id,
    ),
    sourceBankAccountId: uuid("source_bank_account_id").references(
      () => bankAccounts.id,
    ),
    destinationMethod: paymentMethodEnum("destination_method").notNull(),
    destinationCashAccountId: uuid("destination_cash_account_id").references(
      () => cashAccounts.id,
    ),
    destinationBankAccountId: uuid("destination_bank_account_id").references(
      () => bankAccounts.id,
    ),
    notes: varchar("notes", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  /** Enforces positive transfers and valid source and destination accounts. */
  function buildTransferConstraints(table) {
    return [
      index("cash_bank_transfers_date_index").on(table.transferDate),
      check("cash_bank_transfers_amount_check", sql`${table.amount} > 0`),
      check(
        "cash_bank_transfers_source_account_check",
        sql`(${table.sourceMethod} = 'CASH' and ${table.sourceCashAccountId} is not null and ${table.sourceBankAccountId} is null) or (${table.sourceMethod} = 'BANK_TRANSFER' and ${table.sourceBankAccountId} is not null and ${table.sourceCashAccountId} is null)`,
      ),
      check(
        "cash_bank_transfers_destination_account_check",
        sql`(${table.destinationMethod} = 'CASH' and ${table.destinationCashAccountId} is not null and ${table.destinationBankAccountId} is null) or (${table.destinationMethod} = 'BANK_TRANSFER' and ${table.destinationBankAccountId} is not null and ${table.destinationCashAccountId} is null)`,
      ),
      check(
        "cash_bank_transfers_different_accounts_check",
        sql`not (${table.sourceMethod} = ${table.destinationMethod} and coalesce(${table.sourceCashAccountId}::text, ${table.sourceBankAccountId}::text) = coalesce(${table.destinationCashAccountId}::text, ${table.destinationBankAccountId}::text))`,
      ),
    ];
  },
);

/** Stores draft or confirmed physical cash counts. */
export const cashReconciliations = pgTable(
  "cash_reconciliations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cashAccountId: uuid("cash_account_id")
      .notNull()
      .references(() => cashAccounts.id),
    reconciliationDate: timestamp("reconciliation_date", {
      withTimezone: true,
    }).notNull(),
    systemBalance: numeric("system_balance", { precision: 14, scale: 2 })
      .notNull(),
    countedAmount: numeric("counted_amount", { precision: 14, scale: 2 })
      .notNull(),
    differenceAmount: numeric("difference_amount", {
      precision: 14,
      scale: 2,
    }).notNull(),
    status: reconciliationStatusEnum("status").default("DRAFT").notNull(),
    notes: varchar("notes", { length: 500 }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  /** Builds amount and confirmation-state checks for cash reconciliations. */
  function buildReconciliationConstraints(table) {
    return [
      index("cash_reconciliations_account_date_index").on(
        table.cashAccountId,
        table.reconciliationDate,
      ),
      check(
        "cash_reconciliations_counted_amount_check",
        sql`${table.countedAmount} >= 0`,
      ),
      check(
        "cash_reconciliations_confirmation_check",
        sql`(${table.status} = 'DRAFT' and ${table.confirmedAt} is null) or (${table.status} = 'CONFIRMED' and ${table.confirmedAt} is not null)`,
      ),
    ];
  },
);
