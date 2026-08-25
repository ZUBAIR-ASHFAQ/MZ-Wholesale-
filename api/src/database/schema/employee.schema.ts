import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  bankAccounts,
  cashAccounts,
  paymentMethodEnum,
  paymentStatusEnum,
} from "./payment.schema.js";

/** Lists the approved daily attendance states for the first employee-module release. */
export const attendanceStatusEnum = pgEnum("attendance_status", [
  "PRESENT",
  "ABSENT",
  "HALF_DAY",
  "LEAVE",
  "HOLIDAY",
  "WEEKLY_OFF",
]);

/** Lists the simple leave workflow states approved for the first release. */
export const employeeLeaveStatusEnum = pgEnum("employee_leave_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);

/** Payroll runs remain editable only until they are confirmed. */
export const payrollStatusEnum = pgEnum("payroll_status", [
  "DRAFT",
  "CONFIRMED",
]);

/** Stores employee identity, employment dates, and the current salary configuration. */
export const employees = pgTable(
  "employees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeCode: varchar("employee_code", { length: 32 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    fatherSpouseName: varchar("father_spouse_name", { length: 160 }),
    phone: varchar("phone", { length: 32 }),
    email: varchar("email", { length: 254 }),
    referenceId: varchar("reference_id", { length: 80 }),
    address: text("address"),
    emergencyContact: varchar("emergency_contact", { length: 160 }),
    jobTitle: varchar("job_title", { length: 120 }),
    department: varchar("department", { length: 120 }),
    joinDate: date("join_date").notNull(),
    leaveDate: date("leave_date"),
    employmentType: varchar("employment_type", { length: 40 }).notNull(),
    baseMonthlySalary: numeric("base_monthly_salary", {
      precision: 14,
      scale: 2,
    }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("employees_employee_code_normalized_unique").on(
      sql`lower(trim(${table.employeeCode}))`,
    ),
    uniqueIndex("employees_reference_id_normalized_unique")
      .on(sql`lower(trim(${table.referenceId}))`)
      .where(sql`${table.referenceId} is not null`),
    index("employees_active_name_index").on(table.isActive, table.name),
    index("employees_department_index").on(table.department),
    check(
      "employees_employee_code_not_blank_check",
      sql`length(trim(${table.employeeCode})) > 0`,
    ),
    check(
      "employees_name_not_blank_check",
      sql`length(trim(${table.name})) > 0`,
    ),
    check(
      "employees_employment_type_not_blank_check",
      sql`length(trim(${table.employmentType})) > 0`,
    ),
    check(
      "employees_base_salary_non_negative_check",
      sql`${table.baseMonthlySalary} >= 0`,
    ),
    check(
      "employees_leave_date_check",
      sql`${table.leaveDate} is null or ${table.leaveDate} >= ${table.joinDate}`,
    ),
    check(
      "employees_reference_id_not_blank_check",
      sql`${table.referenceId} is null or length(trim(${table.referenceId})) > 0`,
    ),
  ],
);

/** Stores at most one attendance result for one employee on one business date. */
export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    attendanceDate: date("attendance_date").notNull(),
    status: attendanceStatusEnum("status").notNull(),
    checkIn: time("check_in", { precision: 0 }),
    checkOut: time("check_out", { precision: 0 }),
    workedHours: numeric("worked_hours", { precision: 14, scale: 2 }),
    notes: varchar("notes", { length: 500 }),
    source: varchar("source", { length: 20 }).default("MANUAL").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("attendance_records_employee_date_unique").on(
      table.employeeId,
      table.attendanceDate,
    ),
    index("attendance_records_date_index").on(table.attendanceDate),
    check(
      "attendance_records_worked_hours_non_negative_check",
      sql`${table.workedHours} is null or ${table.workedHours} >= 0`,
    ),
    check(
      "attendance_records_source_not_blank_check",
      sql`length(trim(${table.source})) > 0`,
    ),
  ],
);

/** Stores reusable paid or unpaid leave classifications. */
export const leaveTypes = pgTable(
  "leave_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    isPaid: boolean("is_paid").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("leave_types_name_normalized_unique").on(
      sql`lower(trim(${table.name}))`,
    ),
    check(
      "leave_types_name_not_blank_check",
      sql`length(trim(${table.name})) > 0`,
    ),
  ],
);

/** Stores employee leave requests/records without deleting historical decisions. */
export const employeeLeaves = pgTable(
  "employee_leaves",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "restrict" }),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date").notNull(),
    days: numeric("days", { precision: 14, scale: 2 }).notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    status: employeeLeaveStatusEnum("status").default("PENDING").notNull(),
    notes: varchar("notes", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("employee_leaves_employee_dates_index").on(
      table.employeeId,
      table.fromDate,
      table.toDate,
    ),
    index("employee_leaves_status_dates_index").on(
      table.status,
      table.fromDate,
      table.toDate,
    ),
    check("employee_leaves_days_positive_check", sql`${table.days} > 0`),
    check(
      "employee_leaves_date_range_check",
      sql`${table.toDate} >= ${table.fromDate}`,
    ),
    check(
      "employee_leaves_reason_not_blank_check",
      sql`length(trim(${table.reason})) > 0`,
    ),
  ],
);

/** Stores monthly payroll headers; only DRAFT rows may be edited later. */
export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    payrollNumber: varchar("payroll_number", { length: 32 }).notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    status: payrollStatusEnum("status").default("DRAFT").notNull(),
    grossTotal: numeric("gross_total", { precision: 14, scale: 2 })
      .default("0.00")
      .notNull(),
    attendanceDeductionTotal: numeric("attendance_deduction_total", {
      precision: 14,
      scale: 2,
    })
      .default("0.00")
      .notNull(),
    additionsTotal: numeric("additions_total", { precision: 14, scale: 2 })
      .default("0.00")
      .notNull(),
    deductionsTotal: numeric("deductions_total", { precision: 14, scale: 2 })
      .default("0.00")
      .notNull(),
    advanceRecoveryTotal: numeric("advance_recovery_total", {
      precision: 14,
      scale: 2,
    })
      .default("0.00")
      .notNull(),
    netTotal: numeric("net_total", { precision: 14, scale: 2 })
      .default("0.00")
      .notNull(),
    notes: varchar("notes", { length: 500 }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("payroll_runs_payroll_number_normalized_unique").on(
      sql`lower(trim(${table.payrollNumber}))`,
    ),
    uniqueIndex("payroll_runs_confirmed_period_unique")
      .on(table.periodStart, table.periodEnd)
      .where(sql`${table.status} = 'CONFIRMED'`),
    index("payroll_runs_period_status_index").on(
      table.periodStart,
      table.periodEnd,
      table.status,
    ),
    check(
      "payroll_runs_payroll_number_not_blank_check",
      sql`length(trim(${table.payrollNumber})) > 0`,
    ),
    check(
      "payroll_runs_period_check",
      sql`${table.periodEnd} >= ${table.periodStart}`,
    ),
    check(
      "payroll_runs_totals_non_negative_check",
      sql`${table.grossTotal} >= 0 and ${table.attendanceDeductionTotal} >= 0 and ${table.additionsTotal} >= 0 and ${table.deductionsTotal} >= 0 and ${table.advanceRecoveryTotal} >= 0 and ${table.netTotal} >= 0`,
    ),
    check(
      "payroll_runs_confirmation_shape_check",
      sql`(${table.status} = 'DRAFT' and ${table.confirmedAt} is null) or (${table.status} = 'CONFIRMED' and ${table.confirmedAt} is not null)`,
    ),
  ],
);

/** Stores the immutable employee/payroll snapshots used after a run is confirmed. */
export const payrollItems = pgTable(
  "payroll_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    payrollRunId: uuid("payroll_run_id")
      .notNull()
      .references(() => payrollRuns.id, { onDelete: "restrict" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    employeeCodeSnapshot: varchar("employee_code_snapshot", { length: 32 })
      .notNull(),
    employeeNameSnapshot: varchar("employee_name_snapshot", { length: 160 })
      .notNull(),
    jobTitleSnapshot: varchar("job_title_snapshot", { length: 120 }),
    baseSalarySnapshot: numeric("base_salary_snapshot", {
      precision: 14,
      scale: 2,
    }).notNull(),
    workingDays: numeric("working_days", { precision: 14, scale: 2 }).notNull(),
    payableDays: numeric("payable_days", { precision: 14, scale: 2 }).notNull(),
    presentDays: numeric("present_days", { precision: 14, scale: 2 }).notNull(),
    paidLeaveDays: numeric("paid_leave_days", { precision: 14, scale: 2 }).notNull(),
    unpaidLeaveDays: numeric("unpaid_leave_days", { precision: 14, scale: 2 }).notNull(),
    absentDays: numeric("absent_days", { precision: 14, scale: 2 }).notNull(),
    halfDays: numeric("half_days", { precision: 14, scale: 2 }).notNull(),
    grossSalary: numeric("gross_salary", { precision: 14, scale: 2 }).notNull(),
    attendanceDeduction: numeric("attendance_deduction", {
      precision: 14,
      scale: 2,
    }).notNull(),
    additionsAmount: numeric("additions_amount", { precision: 14, scale: 2 })
      .default("0.00")
      .notNull(),
    additionsReason: varchar("additions_reason", { length: 500 }),
    deductionsAmount: numeric("deductions_amount", { precision: 14, scale: 2 })
      .default("0.00")
      .notNull(),
    deductionsReason: varchar("deductions_reason", { length: 500 }),
    advanceRecoveryAmount: numeric("advance_recovery_amount", {
      precision: 14,
      scale: 2,
    })
      .default("0.00")
      .notNull(),
    netSalary: numeric("net_salary", { precision: 14, scale: 2 }).notNull(),
    initialPaidAmount: numeric("initial_paid_amount", {
      precision: 14,
      scale: 2,
    })
      .default("0.00")
      .notNull(),
    initialDueAmount: numeric("initial_due_amount", {
      precision: 14,
      scale: 2,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("payroll_items_run_employee_unique").on(
      table.payrollRunId,
      table.employeeId,
    ),
    index("payroll_items_employee_index").on(table.employeeId),
    check(
      "payroll_items_snapshots_not_blank_check",
      sql`length(trim(${table.employeeCodeSnapshot})) > 0 and length(trim(${table.employeeNameSnapshot})) > 0`,
    ),
    check(
      "payroll_items_days_non_negative_check",
      sql`${table.workingDays} >= 0 and ${table.payableDays} >= 0 and ${table.presentDays} >= 0 and ${table.paidLeaveDays} >= 0 and ${table.unpaidLeaveDays} >= 0 and ${table.absentDays} >= 0 and ${table.halfDays} >= 0`,
    ),
    check(
      "payroll_items_money_non_negative_check",
      sql`${table.baseSalarySnapshot} >= 0 and ${table.grossSalary} >= 0 and ${table.attendanceDeduction} >= 0 and ${table.additionsAmount} >= 0 and ${table.deductionsAmount} >= 0 and ${table.advanceRecoveryAmount} >= 0 and ${table.netSalary} >= 0 and ${table.initialPaidAmount} >= 0 and ${table.initialDueAmount} >= 0`,
    ),
    check(
      "payroll_items_initial_balance_check",
      sql`${table.initialPaidAmount} + ${table.initialDueAmount} = ${table.netSalary}`,
    ),
    check(
      "payroll_items_additions_reason_check",
      sql`${table.additionsAmount} = 0 or length(trim(coalesce(${table.additionsReason}, ''))) > 0`,
    ),
    check(
      "payroll_items_deductions_reason_check",
      sql`${table.deductionsAmount} = 0 or length(trim(coalesce(${table.deductionsReason}, ''))) > 0`,
    ),
  ],
);

/** Stores confirmed employee advance payments made from one cash or bank account. */
export const employeeAdvances = pgTable(
  "employee_advances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    advanceNumber: varchar("advance_number", { length: 32 }).notNull(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    advanceDate: date("advance_date").notNull(),
    originalAmount: numeric("original_amount", { precision: 14, scale: 2 }).notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    cashAccountId: uuid("cash_account_id").references(() => cashAccounts.id, {
      onDelete: "restrict",
    }),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "restrict",
    }),
    note: varchar("note", { length: 500 }),
    status: varchar("status", { length: 20 }).default("CONFIRMED").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("employee_advances_advance_number_normalized_unique").on(
      sql`lower(trim(${table.advanceNumber}))`,
    ),
    index("employee_advances_employee_date_index").on(
      table.employeeId,
      table.advanceDate,
    ),
    check(
      "employee_advances_advance_number_not_blank_check",
      sql`length(trim(${table.advanceNumber})) > 0`,
    ),
    check(
      "employee_advances_amount_positive_check",
      sql`${table.originalAmount} > 0`,
    ),
    check(
      "employee_advances_account_check",
      sql`(${table.paymentMethod} = 'CASH' and ${table.cashAccountId} is not null and ${table.bankAccountId} is null) or (${table.paymentMethod} = 'BANK_TRANSFER' and ${table.bankAccountId} is not null and ${table.cashAccountId} is null)`,
    ),
    check(
      "employee_advances_status_check",
      sql`${table.status} = 'CONFIRMED'`,
    ),
  ],
);

/** Stores immutable advance recoveries, either through payroll or as direct cash/bank recovery. */
export const employeeAdvanceRecoveries = pgTable(
  "employee_advance_recoveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeAdvanceId: uuid("employee_advance_id")
      .notNull()
      .references(() => employeeAdvances.id, { onDelete: "restrict" }),
    payrollItemId: uuid("payroll_item_id").references(() => payrollItems.id, {
      onDelete: "restrict",
    }),
    recoveryNumber: varchar("recovery_number", { length: 32 }),
    recoveryDate: date("recovery_date").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    paymentMethod: paymentMethodEnum("payment_method"),
    cashAccountId: uuid("cash_account_id").references(() => cashAccounts.id, {
      onDelete: "restrict",
    }),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "restrict",
    }),
    note: varchar("note", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("employee_advance_recoveries_recovery_number_normalized_unique")
      .on(sql`lower(trim(${table.recoveryNumber}))`)
      .where(sql`${table.recoveryNumber} is not null`),
    index("employee_advance_recoveries_advance_date_index").on(
      table.employeeAdvanceId,
      table.recoveryDate,
    ),
    index("employee_advance_recoveries_payroll_item_index").on(
      table.payrollItemId,
    ),
    check(
      "employee_advance_recoveries_amount_positive_check",
      sql`${table.amount} > 0`,
    ),
    check(
      "employee_advance_recoveries_shape_check",
      sql`(${table.payrollItemId} is not null and ${table.recoveryNumber} is null and ${table.paymentMethod} is null and ${table.cashAccountId} is null and ${table.bankAccountId} is null) or (${table.payrollItemId} is null and ${table.recoveryNumber} is not null and ((${table.paymentMethod} = 'CASH' and ${table.cashAccountId} is not null and ${table.bankAccountId} is null) or (${table.paymentMethod} = 'BANK_TRANSFER' and ${table.bankAccountId} is not null and ${table.cashAccountId} is null)))`,
    ),
  ],
);

/** Stores immutable salary payment headers and their linked reversal rows. */
export const salaryPayments = pgTable(
  "salary_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    documentNumber: varchar("document_number", { length: 32 }).notNull(),
    paymentDate: date("payment_date").notNull(),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
    status: paymentStatusEnum("status").default("CONFIRMED").notNull(),
    reversalOfPaymentId: uuid("reversal_of_payment_id"),
    reversalReason: varchar("reversal_reason", { length: 500 }),
    notes: varchar("notes", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.reversalOfPaymentId],
      foreignColumns: [table.id],
      name: "salary_payments_reversal_of_fk",
    }).onDelete("restrict"),
    uniqueIndex("salary_payments_document_number_normalized_unique").on(
      sql`lower(trim(${table.documentNumber}))`,
    ),
    uniqueIndex("salary_payments_one_reversal_unique")
      .on(table.reversalOfPaymentId)
      .where(sql`${table.reversalOfPaymentId} is not null`),
    index("salary_payments_employee_date_index").on(
      table.employeeId,
      table.paymentDate,
    ),
    check(
      "salary_payments_document_number_not_blank_check",
      sql`length(trim(${table.documentNumber})) > 0`,
    ),
    check("salary_payments_total_amount_positive_check", sql`${table.totalAmount} > 0`),
    check(
      "salary_payments_reversal_shape_check",
      sql`(${table.reversalOfPaymentId} is null and ${table.reversalReason} is null) or (${table.reversalOfPaymentId} is not null and length(trim(coalesce(${table.reversalReason}, ''))) > 0)`,
    ),
    check(
      "salary_payments_no_self_reversal_check",
      sql`${table.reversalOfPaymentId} is null or ${table.reversalOfPaymentId} <> ${table.id}`,
    ),
  ],
);

/** Stores one CASH or BANK_TRANSFER portion of a salary payment. */
export const salaryPaymentSplits = pgTable(
  "salary_payment_splits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    salaryPaymentId: uuid("salary_payment_id")
      .notNull()
      .references(() => salaryPayments.id, { onDelete: "restrict" }),
    method: paymentMethodEnum("method").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    cashAccountId: uuid("cash_account_id").references(() => cashAccounts.id, {
      onDelete: "restrict",
    }),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("salary_payment_splits_payment_index").on(table.salaryPaymentId),
    check("salary_payment_splits_amount_positive_check", sql`${table.amount} > 0`),
    check(
      "salary_payment_splits_account_check",
      sql`(${table.method} = 'CASH' and ${table.cashAccountId} is not null and ${table.bankAccountId} is null) or (${table.method} = 'BANK_TRANSFER' and ${table.bankAccountId} is not null and ${table.cashAccountId} is null)`,
    ),
  ],
);

/** Stores salary-payment allocations against confirmed employee payroll items. */
export const salaryPaymentAllocations = pgTable(
  "salary_payment_allocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    salaryPaymentId: uuid("salary_payment_id")
      .notNull()
      .references(() => salaryPayments.id, { onDelete: "restrict" }),
    payrollItemId: uuid("payroll_item_id")
      .notNull()
      .references(() => payrollItems.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("salary_payment_allocations_item_unique").on(
      table.salaryPaymentId,
      table.payrollItemId,
    ),
    index("salary_payment_allocations_payroll_item_index").on(table.payrollItemId),
    check(
      "salary_payment_allocations_amount_positive_check",
      sql`${table.amount} > 0`,
    ),
  ],
);

/** Stores immutable employee salary/advance statement entries; balances are always derived. */
export const employeeLedgerEntries = pgTable(
  "employee_ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    referenceType: varchar("reference_type", { length: 40 }).notNull(),
    referenceId: uuid("reference_id").notNull(),
    documentNumber: varchar("document_number", { length: 32 }),
    description: varchar("description", { length: 200 }),
    debit: numeric("debit", { precision: 14, scale: 2 }).default("0.00").notNull(),
    credit: numeric("credit", { precision: 14, scale: 2 }).default("0.00").notNull(),
    notes: varchar("notes", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("employee_ledger_employee_date_index").on(
      table.employeeId,
      table.occurredAt,
    ),
    index("employee_ledger_reference_index").on(
      table.referenceType,
      table.referenceId,
    ),
    uniqueIndex("employee_ledger_source_unique").on(
      table.employeeId,
      table.referenceType,
      table.referenceId,
    ),
    check(
      "employee_ledger_amount_check",
      sql`(${table.debit} > 0 and ${table.credit} = 0) or (${table.credit} > 0 and ${table.debit} = 0)`,
    ),
    check(
      "employee_ledger_reference_type_not_blank_check",
      sql`length(trim(${table.referenceType})) > 0`,
    ),
  ],
);
