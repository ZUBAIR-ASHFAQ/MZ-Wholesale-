CREATE TYPE "attendance_status" AS ENUM (
  'PRESENT',
  'ABSENT',
  'HALF_DAY',
  'LEAVE',
  'HOLIDAY',
  'WEEKLY_OFF'
);

CREATE TYPE "employee_leave_status" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED'
);

CREATE TYPE "payroll_status" AS ENUM (
  'DRAFT',
  'CONFIRMED'
);

CREATE TABLE "employees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employee_code" varchar(32) NOT NULL,
  "name" varchar(160) NOT NULL,
  "father_spouse_name" varchar(160),
  "phone" varchar(32),
  "email" varchar(254),
  "reference_id" varchar(80),
  "address" text,
  "emergency_contact" varchar(160),
  "job_title" varchar(120),
  "department" varchar(120),
  "join_date" date NOT NULL,
  "leave_date" date,
  "employment_type" varchar(40) NOT NULL,
  "base_monthly_salary" numeric(14,2) NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employees_employee_code_not_blank_check" CHECK (length(trim("employee_code")) > 0),
  CONSTRAINT "employees_name_not_blank_check" CHECK (length(trim("name")) > 0),
  CONSTRAINT "employees_employment_type_not_blank_check" CHECK (length(trim("employment_type")) > 0),
  CONSTRAINT "employees_base_salary_non_negative_check" CHECK ("base_monthly_salary" >= 0),
  CONSTRAINT "employees_leave_date_check" CHECK ("leave_date" IS NULL OR "leave_date" >= "join_date"),
  CONSTRAINT "employees_reference_id_not_blank_check" CHECK ("reference_id" IS NULL OR length(trim("reference_id")) > 0)
);

CREATE UNIQUE INDEX "employees_employee_code_normalized_unique"
  ON "employees" (lower(trim("employee_code")));
CREATE UNIQUE INDEX "employees_reference_id_normalized_unique"
  ON "employees" (lower(trim("reference_id")))
  WHERE "reference_id" IS NOT NULL;
CREATE INDEX "employees_active_name_index"
  ON "employees" ("is_active", "name");
CREATE INDEX "employees_department_index"
  ON "employees" ("department");

CREATE TABLE "attendance_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "attendance_date" date NOT NULL,
  "status" "attendance_status" NOT NULL,
  "check_in" time(0) without time zone,
  "check_out" time(0) without time zone,
  "worked_hours" numeric(14,2),
  "notes" varchar(500),
  "source" varchar(20) DEFAULT 'MANUAL' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "attendance_records_employee_id_employees_id_fk"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE restrict,
  CONSTRAINT "attendance_records_worked_hours_non_negative_check"
    CHECK ("worked_hours" IS NULL OR "worked_hours" >= 0),
  CONSTRAINT "attendance_records_source_not_blank_check"
    CHECK (length(trim("source")) > 0)
);

CREATE UNIQUE INDEX "attendance_records_employee_date_unique"
  ON "attendance_records" ("employee_id", "attendance_date");
CREATE INDEX "attendance_records_date_index"
  ON "attendance_records" ("attendance_date");

CREATE TABLE "leave_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(120) NOT NULL,
  "is_paid" boolean NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "leave_types_name_not_blank_check" CHECK (length(trim("name")) > 0)
);

CREATE UNIQUE INDEX "leave_types_name_normalized_unique"
  ON "leave_types" (lower(trim("name")));

CREATE TABLE "employee_leaves" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "leave_type_id" uuid NOT NULL,
  "from_date" date NOT NULL,
  "to_date" date NOT NULL,
  "days" numeric(14,2) NOT NULL,
  "reason" varchar(500) NOT NULL,
  "status" "employee_leave_status" DEFAULT 'PENDING' NOT NULL,
  "notes" varchar(500),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employee_leaves_employee_id_employees_id_fk"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE restrict,
  CONSTRAINT "employee_leaves_leave_type_id_leave_types_id_fk"
    FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE restrict,
  CONSTRAINT "employee_leaves_days_positive_check" CHECK ("days" > 0),
  CONSTRAINT "employee_leaves_date_range_check" CHECK ("to_date" >= "from_date"),
  CONSTRAINT "employee_leaves_reason_not_blank_check" CHECK (length(trim("reason")) > 0)
);

CREATE INDEX "employee_leaves_employee_dates_index"
  ON "employee_leaves" ("employee_id", "from_date", "to_date");
CREATE INDEX "employee_leaves_status_dates_index"
  ON "employee_leaves" ("status", "from_date", "to_date");

CREATE TABLE "payroll_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payroll_number" varchar(32) NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "status" "payroll_status" DEFAULT 'DRAFT' NOT NULL,
  "gross_total" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "attendance_deduction_total" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "additions_total" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "deductions_total" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "advance_recovery_total" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "net_total" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "notes" varchar(500),
  "confirmed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payroll_runs_payroll_number_not_blank_check" CHECK (length(trim("payroll_number")) > 0),
  CONSTRAINT "payroll_runs_period_check" CHECK ("period_end" >= "period_start"),
  CONSTRAINT "payroll_runs_totals_non_negative_check" CHECK (
    "gross_total" >= 0
    AND "attendance_deduction_total" >= 0
    AND "additions_total" >= 0
    AND "deductions_total" >= 0
    AND "advance_recovery_total" >= 0
    AND "net_total" >= 0
  ),
  CONSTRAINT "payroll_runs_confirmation_shape_check" CHECK (
    ("status" = 'DRAFT' AND "confirmed_at" IS NULL)
    OR ("status" = 'CONFIRMED' AND "confirmed_at" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "payroll_runs_payroll_number_normalized_unique"
  ON "payroll_runs" (lower(trim("payroll_number")));
CREATE UNIQUE INDEX "payroll_runs_confirmed_period_unique"
  ON "payroll_runs" ("period_start", "period_end")
  WHERE "status" = 'CONFIRMED';
CREATE INDEX "payroll_runs_period_status_index"
  ON "payroll_runs" ("period_start", "period_end", "status");

CREATE TABLE "payroll_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payroll_run_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "employee_code_snapshot" varchar(32) NOT NULL,
  "employee_name_snapshot" varchar(160) NOT NULL,
  "job_title_snapshot" varchar(120),
  "base_salary_snapshot" numeric(14,2) NOT NULL,
  "working_days" numeric(14,2) NOT NULL,
  "payable_days" numeric(14,2) NOT NULL,
  "present_days" numeric(14,2) NOT NULL,
  "paid_leave_days" numeric(14,2) NOT NULL,
  "unpaid_leave_days" numeric(14,2) NOT NULL,
  "absent_days" numeric(14,2) NOT NULL,
  "half_days" numeric(14,2) NOT NULL,
  "gross_salary" numeric(14,2) NOT NULL,
  "attendance_deduction" numeric(14,2) NOT NULL,
  "additions_amount" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "additions_reason" varchar(500),
  "deductions_amount" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "deductions_reason" varchar(500),
  "advance_recovery_amount" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "net_salary" numeric(14,2) NOT NULL,
  "initial_paid_amount" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "initial_due_amount" numeric(14,2) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payroll_items_payroll_run_id_payroll_runs_id_fk"
    FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE restrict,
  CONSTRAINT "payroll_items_employee_id_employees_id_fk"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE restrict,
  CONSTRAINT "payroll_items_snapshots_not_blank_check"
    CHECK (length(trim("employee_code_snapshot")) > 0 AND length(trim("employee_name_snapshot")) > 0),
  CONSTRAINT "payroll_items_days_non_negative_check" CHECK (
    "working_days" >= 0
    AND "payable_days" >= 0
    AND "present_days" >= 0
    AND "paid_leave_days" >= 0
    AND "unpaid_leave_days" >= 0
    AND "absent_days" >= 0
    AND "half_days" >= 0
  ),
  CONSTRAINT "payroll_items_money_non_negative_check" CHECK (
    "base_salary_snapshot" >= 0
    AND "gross_salary" >= 0
    AND "attendance_deduction" >= 0
    AND "additions_amount" >= 0
    AND "deductions_amount" >= 0
    AND "advance_recovery_amount" >= 0
    AND "net_salary" >= 0
    AND "initial_paid_amount" >= 0
    AND "initial_due_amount" >= 0
  ),
  CONSTRAINT "payroll_items_initial_balance_check"
    CHECK ("initial_paid_amount" + "initial_due_amount" = "net_salary"),
  CONSTRAINT "payroll_items_additions_reason_check"
    CHECK ("additions_amount" = 0 OR length(trim(coalesce("additions_reason", ''))) > 0),
  CONSTRAINT "payroll_items_deductions_reason_check"
    CHECK ("deductions_amount" = 0 OR length(trim(coalesce("deductions_reason", ''))) > 0)
);

CREATE UNIQUE INDEX "payroll_items_run_employee_unique"
  ON "payroll_items" ("payroll_run_id", "employee_id");
CREATE INDEX "payroll_items_employee_index"
  ON "payroll_items" ("employee_id");

CREATE TABLE "employee_advances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "advance_number" varchar(32) NOT NULL,
  "employee_id" uuid NOT NULL,
  "advance_date" date NOT NULL,
  "original_amount" numeric(14,2) NOT NULL,
  "payment_method" "payment_method" NOT NULL,
  "cash_account_id" uuid,
  "bank_account_id" uuid,
  "note" varchar(500),
  "status" varchar(20) DEFAULT 'CONFIRMED' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employee_advances_employee_id_employees_id_fk"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE restrict,
  CONSTRAINT "employee_advances_cash_account_id_cash_accounts_id_fk"
    FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE restrict,
  CONSTRAINT "employee_advances_bank_account_id_bank_accounts_id_fk"
    FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE restrict,
  CONSTRAINT "employee_advances_advance_number_not_blank_check"
    CHECK (length(trim("advance_number")) > 0),
  CONSTRAINT "employee_advances_amount_positive_check" CHECK ("original_amount" > 0),
  CONSTRAINT "employee_advances_account_check" CHECK (
    ("payment_method" = 'CASH' AND "cash_account_id" IS NOT NULL AND "bank_account_id" IS NULL)
    OR ("payment_method" = 'BANK_TRANSFER' AND "bank_account_id" IS NOT NULL AND "cash_account_id" IS NULL)
  ),
  CONSTRAINT "employee_advances_status_check" CHECK ("status" = 'CONFIRMED')
);

CREATE UNIQUE INDEX "employee_advances_advance_number_normalized_unique"
  ON "employee_advances" (lower(trim("advance_number")));
CREATE INDEX "employee_advances_employee_date_index"
  ON "employee_advances" ("employee_id", "advance_date");

CREATE TABLE "employee_advance_recoveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employee_advance_id" uuid NOT NULL,
  "payroll_item_id" uuid,
  "recovery_number" varchar(32),
  "recovery_date" date NOT NULL,
  "amount" numeric(14,2) NOT NULL,
  "payment_method" "payment_method",
  "cash_account_id" uuid,
  "bank_account_id" uuid,
  "note" varchar(500),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employee_advance_recoveries_employee_advance_id_employee_advances_id_fk"
    FOREIGN KEY ("employee_advance_id") REFERENCES "employee_advances"("id") ON DELETE restrict,
  CONSTRAINT "employee_advance_recoveries_payroll_item_id_payroll_items_id_fk"
    FOREIGN KEY ("payroll_item_id") REFERENCES "payroll_items"("id") ON DELETE restrict,
  CONSTRAINT "employee_advance_recoveries_cash_account_id_cash_accounts_id_fk"
    FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE restrict,
  CONSTRAINT "employee_advance_recoveries_bank_account_id_bank_accounts_id_fk"
    FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE restrict,
  CONSTRAINT "employee_advance_recoveries_amount_positive_check" CHECK ("amount" > 0),
  CONSTRAINT "employee_advance_recoveries_shape_check" CHECK (
    ("payroll_item_id" IS NOT NULL
      AND "recovery_number" IS NULL
      AND "payment_method" IS NULL
      AND "cash_account_id" IS NULL
      AND "bank_account_id" IS NULL)
    OR
    ("payroll_item_id" IS NULL
      AND "recovery_number" IS NOT NULL
      AND (
        ("payment_method" = 'CASH' AND "cash_account_id" IS NOT NULL AND "bank_account_id" IS NULL)
        OR ("payment_method" = 'BANK_TRANSFER' AND "bank_account_id" IS NOT NULL AND "cash_account_id" IS NULL)
      ))
  )
);

CREATE UNIQUE INDEX "employee_advance_recoveries_recovery_number_normalized_unique"
  ON "employee_advance_recoveries" (lower(trim("recovery_number")))
  WHERE "recovery_number" IS NOT NULL;
CREATE INDEX "employee_advance_recoveries_advance_date_index"
  ON "employee_advance_recoveries" ("employee_advance_id", "recovery_date");
CREATE INDEX "employee_advance_recoveries_payroll_item_index"
  ON "employee_advance_recoveries" ("payroll_item_id");

CREATE TABLE "salary_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "document_number" varchar(32) NOT NULL,
  "payment_date" date NOT NULL,
  "total_amount" numeric(14,2) NOT NULL,
  "status" "payment_status" DEFAULT 'CONFIRMED' NOT NULL,
  "reversal_of_payment_id" uuid,
  "reversal_reason" varchar(500),
  "notes" varchar(500),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "salary_payments_employee_id_employees_id_fk"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE restrict,
  CONSTRAINT "salary_payments_reversal_of_fk"
    FOREIGN KEY ("reversal_of_payment_id") REFERENCES "salary_payments"("id") ON DELETE restrict,
  CONSTRAINT "salary_payments_document_number_not_blank_check"
    CHECK (length(trim("document_number")) > 0),
  CONSTRAINT "salary_payments_total_amount_positive_check" CHECK ("total_amount" > 0),
  CONSTRAINT "salary_payments_reversal_shape_check" CHECK (
    ("reversal_of_payment_id" IS NULL AND "reversal_reason" IS NULL)
    OR ("reversal_of_payment_id" IS NOT NULL AND length(trim(coalesce("reversal_reason", ''))) > 0)
  ),
  CONSTRAINT "salary_payments_no_self_reversal_check"
    CHECK ("reversal_of_payment_id" IS NULL OR "reversal_of_payment_id" <> "id")
);

CREATE UNIQUE INDEX "salary_payments_document_number_normalized_unique"
  ON "salary_payments" (lower(trim("document_number")));
CREATE UNIQUE INDEX "salary_payments_one_reversal_unique"
  ON "salary_payments" ("reversal_of_payment_id")
  WHERE "reversal_of_payment_id" IS NOT NULL;
CREATE INDEX "salary_payments_employee_date_index"
  ON "salary_payments" ("employee_id", "payment_date");

CREATE TABLE "salary_payment_splits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "salary_payment_id" uuid NOT NULL,
  "method" "payment_method" NOT NULL,
  "amount" numeric(14,2) NOT NULL,
  "cash_account_id" uuid,
  "bank_account_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "salary_payment_splits_salary_payment_id_salary_payments_id_fk"
    FOREIGN KEY ("salary_payment_id") REFERENCES "salary_payments"("id") ON DELETE restrict,
  CONSTRAINT "salary_payment_splits_cash_account_id_cash_accounts_id_fk"
    FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE restrict,
  CONSTRAINT "salary_payment_splits_bank_account_id_bank_accounts_id_fk"
    FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE restrict,
  CONSTRAINT "salary_payment_splits_amount_positive_check" CHECK ("amount" > 0),
  CONSTRAINT "salary_payment_splits_account_check" CHECK (
    ("method" = 'CASH' AND "cash_account_id" IS NOT NULL AND "bank_account_id" IS NULL)
    OR ("method" = 'BANK_TRANSFER' AND "bank_account_id" IS NOT NULL AND "cash_account_id" IS NULL)
  )
);

CREATE INDEX "salary_payment_splits_payment_index"
  ON "salary_payment_splits" ("salary_payment_id");

CREATE TABLE "salary_payment_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "salary_payment_id" uuid NOT NULL,
  "payroll_item_id" uuid NOT NULL,
  "amount" numeric(14,2) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "salary_payment_allocations_salary_payment_id_salary_payments_id_fk"
    FOREIGN KEY ("salary_payment_id") REFERENCES "salary_payments"("id") ON DELETE restrict,
  CONSTRAINT "salary_payment_allocations_payroll_item_id_payroll_items_id_fk"
    FOREIGN KEY ("payroll_item_id") REFERENCES "payroll_items"("id") ON DELETE restrict,
  CONSTRAINT "salary_payment_allocations_amount_positive_check" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "salary_payment_allocations_item_unique"
  ON "salary_payment_allocations" ("salary_payment_id", "payroll_item_id");
CREATE INDEX "salary_payment_allocations_payroll_item_index"
  ON "salary_payment_allocations" ("payroll_item_id");

CREATE TABLE "employee_ledger_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "reference_type" varchar(40) NOT NULL,
  "reference_id" uuid NOT NULL,
  "document_number" varchar(32),
  "description" varchar(200),
  "debit" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "credit" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "notes" varchar(500),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employee_ledger_entries_employee_id_employees_id_fk"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE restrict,
  CONSTRAINT "employee_ledger_amount_check" CHECK (
    ("debit" > 0 AND "credit" = 0)
    OR ("credit" > 0 AND "debit" = 0)
  ),
  CONSTRAINT "employee_ledger_reference_type_not_blank_check"
    CHECK (length(trim("reference_type")) > 0)
);

CREATE INDEX "employee_ledger_employee_date_index"
  ON "employee_ledger_entries" ("employee_id", "occurred_at");
CREATE INDEX "employee_ledger_reference_index"
  ON "employee_ledger_entries" ("reference_type", "reference_id");
CREATE UNIQUE INDEX "employee_ledger_source_unique"
  ON "employee_ledger_entries" ("employee_id", "reference_type", "reference_id");
