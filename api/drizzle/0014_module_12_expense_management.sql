CREATE TABLE "expense_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(120) NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "expense_categories_name_not_blank_check" CHECK (length(trim("name")) > 0)
);

CREATE UNIQUE INDEX "expense_categories_name_normalized_unique"
  ON "expense_categories" (lower(trim("name")));

CREATE TABLE "expenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "expense_number" varchar(32) NOT NULL,
  "expense_category_id" uuid NOT NULL,
  "expense_date" date NOT NULL,
  "amount" numeric(14,2) NOT NULL,
  "payment_method" "payment_method" NOT NULL,
  "cash_account_id" uuid,
  "bank_account_id" uuid,
  "note" varchar(500),
  "receipt_url" varchar(2048),
  "reversal_of_expense_id" uuid,
  "reversal_reason" varchar(500),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "expenses_expense_category_id_expense_categories_id_fk" FOREIGN KEY ("expense_category_id") REFERENCES "expense_categories"("id") ON DELETE restrict,
  CONSTRAINT "expenses_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE restrict,
  CONSTRAINT "expenses_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE restrict,
  CONSTRAINT "expenses_reversal_of_expense_id_expenses_id_fk" FOREIGN KEY ("reversal_of_expense_id") REFERENCES "expenses"("id") ON DELETE restrict,
  CONSTRAINT "expenses_expense_number_not_blank_check" CHECK (length(trim("expense_number")) > 0),
  CONSTRAINT "expenses_amount_positive_check" CHECK ("amount" > 0),
  CONSTRAINT "expenses_account_check" CHECK (
    ("payment_method" = 'CASH' AND "cash_account_id" IS NOT NULL AND "bank_account_id" IS NULL)
    OR ("payment_method" = 'BANK_TRANSFER' AND "bank_account_id" IS NOT NULL AND "cash_account_id" IS NULL)
  ),
  CONSTRAINT "expenses_reversal_shape_check" CHECK (
    ("reversal_of_expense_id" IS NULL AND "reversal_reason" IS NULL)
    OR ("reversal_of_expense_id" IS NOT NULL AND length(trim(coalesce("reversal_reason", ''))) > 0)
  ),
  CONSTRAINT "expenses_no_self_reversal_check" CHECK (
    "reversal_of_expense_id" IS NULL OR "reversal_of_expense_id" <> "id"
  )
);

CREATE UNIQUE INDEX "expenses_expense_number_normalized_unique"
  ON "expenses" (lower(trim("expense_number")));
CREATE UNIQUE INDEX "expenses_one_reversal_unique"
  ON "expenses" ("reversal_of_expense_id")
  WHERE "reversal_of_expense_id" IS NOT NULL;
CREATE INDEX "expenses_category_date_index"
  ON "expenses" ("expense_category_id", "expense_date");
CREATE INDEX "expenses_date_index"
  ON "expenses" ("expense_date");
