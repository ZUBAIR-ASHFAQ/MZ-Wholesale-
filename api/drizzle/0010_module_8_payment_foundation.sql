CREATE TYPE "payment_method" AS ENUM ('CASH', 'BANK_TRANSFER');
CREATE TYPE "payment_status" AS ENUM ('CONFIRMED', 'REVERSED');
CREATE TYPE "movement_direction" AS ENUM ('INFLOW', 'OUTFLOW');
CREATE TYPE "movement_source_type" AS ENUM (
  'OPENING_BALANCE',
  'CUSTOMER_RECEIPT',
  'CUSTOMER_RECEIPT_REVERSAL',
  'SUPPLIER_PAYMENT',
  'SUPPLIER_PAYMENT_REVERSAL',
  'TRANSFER',
  'RECONCILIATION_ADJUSTMENT',
  'PURCHASE_INITIAL_PAYMENT',
  'SALE_INITIAL_PAYMENT'
);
CREATE TYPE "reconciliation_status" AS ENUM ('DRAFT', 'CONFIRMED');

CREATE TABLE "cash_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(120) NOT NULL,
  "opening_balance" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cash_accounts_name_not_blank_check" CHECK (length(trim("name")) > 0),
  CONSTRAINT "cash_accounts_opening_balance_check" CHECK ("opening_balance" >= 0)
);
CREATE UNIQUE INDEX "cash_accounts_name_unique" ON "cash_accounts" ("name");

CREATE TABLE "bank_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "bank_name" varchar(120) NOT NULL,
  "account_name" varchar(120) NOT NULL,
  "account_number" varchar(80) NOT NULL,
  "opening_balance" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bank_accounts_bank_name_not_blank_check" CHECK (length(trim("bank_name")) > 0),
  CONSTRAINT "bank_accounts_account_name_not_blank_check" CHECK (length(trim("account_name")) > 0),
  CONSTRAINT "bank_accounts_account_number_not_blank_check" CHECK (length(trim("account_number")) > 0),
  CONSTRAINT "bank_accounts_opening_balance_check" CHECK ("opening_balance" >= 0)
);
CREATE UNIQUE INDEX "bank_accounts_account_number_unique" ON "bank_accounts" ("account_number");

CREATE TABLE "customer_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
  "document_number" varchar(50) NOT NULL,
  "payment_date" timestamp with time zone NOT NULL,
  "total_amount" numeric(14,2) NOT NULL,
  "status" "payment_status" DEFAULT 'CONFIRMED' NOT NULL,
  "reversal_of_payment_id" uuid,
  "reversal_reason" varchar(500),
  "notes" varchar(500),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_payments_reversal_of_fk" FOREIGN KEY ("reversal_of_payment_id") REFERENCES "customer_payments"("id"),
  CONSTRAINT "customer_payments_total_amount_check" CHECK ("total_amount" > 0),
  CONSTRAINT "customer_payments_reversal_shape_check" CHECK (("reversal_of_payment_id" IS NULL AND "reversal_reason" IS NULL) OR ("reversal_of_payment_id" IS NOT NULL AND length(trim(coalesce("reversal_reason", ''))) > 0)),
  CONSTRAINT "customer_payments_no_self_reversal_check" CHECK ("reversal_of_payment_id" IS NULL OR "reversal_of_payment_id" <> "id")
);
CREATE UNIQUE INDEX "customer_payments_document_number_unique" ON "customer_payments" ("document_number");
CREATE UNIQUE INDEX "customer_payments_one_reversal_unique" ON "customer_payments" ("reversal_of_payment_id") WHERE "reversal_of_payment_id" IS NOT NULL;
CREATE INDEX "customer_payments_customer_date_index" ON "customer_payments" ("customer_id", "payment_date");

CREATE TABLE "customer_payment_splits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_payment_id" uuid NOT NULL REFERENCES "customer_payments"("id"),
  "method" "payment_method" NOT NULL,
  "amount" numeric(14,2) NOT NULL,
  "cash_account_id" uuid REFERENCES "cash_accounts"("id"),
  "bank_account_id" uuid REFERENCES "bank_accounts"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_payment_splits_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "customer_payment_splits_account_check" CHECK (("method" = 'CASH' AND "cash_account_id" IS NOT NULL AND "bank_account_id" IS NULL) OR ("method" = 'BANK_TRANSFER' AND "bank_account_id" IS NOT NULL AND "cash_account_id" IS NULL))
);
CREATE INDEX "customer_payment_splits_payment_index" ON "customer_payment_splits" ("customer_payment_id");

-- The sales-invoice foreign key is added with Module 10, when sales_invoices exists.
CREATE TABLE "customer_payment_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_payment_id" uuid NOT NULL REFERENCES "customer_payments"("id"),
  "sales_invoice_id" uuid NOT NULL,
  "amount" numeric(14,2) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_payment_allocations_amount_check" CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX "customer_payment_allocations_invoice_unique" ON "customer_payment_allocations" ("customer_payment_id", "sales_invoice_id");

CREATE TABLE "supplier_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "supplier_id" uuid NOT NULL REFERENCES "suppliers"("id"),
  "document_number" varchar(50) NOT NULL,
  "payment_date" timestamp with time zone NOT NULL,
  "total_amount" numeric(14,2) NOT NULL,
  "status" "payment_status" DEFAULT 'CONFIRMED' NOT NULL,
  "reversal_of_payment_id" uuid,
  "reversal_reason" varchar(500),
  "notes" varchar(500),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "supplier_payments_reversal_of_fk" FOREIGN KEY ("reversal_of_payment_id") REFERENCES "supplier_payments"("id"),
  CONSTRAINT "supplier_payments_total_amount_check" CHECK ("total_amount" > 0),
  CONSTRAINT "supplier_payments_reversal_shape_check" CHECK (("reversal_of_payment_id" IS NULL AND "reversal_reason" IS NULL) OR ("reversal_of_payment_id" IS NOT NULL AND length(trim(coalesce("reversal_reason", ''))) > 0)),
  CONSTRAINT "supplier_payments_no_self_reversal_check" CHECK ("reversal_of_payment_id" IS NULL OR "reversal_of_payment_id" <> "id")
);
CREATE UNIQUE INDEX "supplier_payments_document_number_unique" ON "supplier_payments" ("document_number");
CREATE UNIQUE INDEX "supplier_payments_one_reversal_unique" ON "supplier_payments" ("reversal_of_payment_id") WHERE "reversal_of_payment_id" IS NOT NULL;
CREATE INDEX "supplier_payments_supplier_date_index" ON "supplier_payments" ("supplier_id", "payment_date");

CREATE TABLE "supplier_payment_splits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "supplier_payment_id" uuid NOT NULL REFERENCES "supplier_payments"("id"),
  "method" "payment_method" NOT NULL,
  "amount" numeric(14,2) NOT NULL,
  "cash_account_id" uuid REFERENCES "cash_accounts"("id"),
  "bank_account_id" uuid REFERENCES "bank_accounts"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "supplier_payment_splits_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "supplier_payment_splits_account_check" CHECK (("method" = 'CASH' AND "cash_account_id" IS NOT NULL AND "bank_account_id" IS NULL) OR ("method" = 'BANK_TRANSFER' AND "bank_account_id" IS NOT NULL AND "cash_account_id" IS NULL))
);
CREATE INDEX "supplier_payment_splits_payment_index" ON "supplier_payment_splits" ("supplier_payment_id");

-- The purchase foreign key is added with Module 9, when purchases exists.
CREATE TABLE "supplier_payment_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "supplier_payment_id" uuid NOT NULL REFERENCES "supplier_payments"("id"),
  "purchase_id" uuid NOT NULL,
  "amount" numeric(14,2) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "supplier_payment_allocations_amount_check" CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX "supplier_payment_allocations_purchase_unique" ON "supplier_payment_allocations" ("supplier_payment_id", "purchase_id");

CREATE TABLE "cash_bank_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "method" "payment_method" NOT NULL,
  "cash_account_id" uuid REFERENCES "cash_accounts"("id"),
  "bank_account_id" uuid REFERENCES "bank_accounts"("id"),
  "direction" "movement_direction" NOT NULL,
  "source_type" "movement_source_type" NOT NULL,
  "source_id" uuid,
  "amount" numeric(14,2) NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "document_number" varchar(50),
  "description" varchar(200),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cash_bank_movements_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "cash_bank_movements_account_check" CHECK (("method" = 'CASH' AND "cash_account_id" IS NOT NULL AND "bank_account_id" IS NULL) OR ("method" = 'BANK_TRANSFER' AND "bank_account_id" IS NOT NULL AND "cash_account_id" IS NULL)),
  CONSTRAINT "cash_bank_movements_source_check" CHECK (("source_type" = 'OPENING_BALANCE' AND "source_id" IS NULL) OR ("source_type" <> 'OPENING_BALANCE' AND "source_id" IS NOT NULL))
);
CREATE INDEX "cash_bank_movements_cash_date_index" ON "cash_bank_movements" ("cash_account_id", "occurred_at");
CREATE INDEX "cash_bank_movements_bank_date_index" ON "cash_bank_movements" ("bank_account_id", "occurred_at");
CREATE INDEX "cash_bank_movements_source_index" ON "cash_bank_movements" ("source_type", "source_id");
CREATE UNIQUE INDEX "cash_bank_movements_cash_source_effect_unique" ON "cash_bank_movements" ("source_type", "source_id", "direction", "cash_account_id") WHERE "source_id" IS NOT NULL AND "cash_account_id" IS NOT NULL;
CREATE UNIQUE INDEX "cash_bank_movements_bank_source_effect_unique" ON "cash_bank_movements" ("source_type", "source_id", "direction", "bank_account_id") WHERE "source_id" IS NOT NULL AND "bank_account_id" IS NOT NULL;
CREATE UNIQUE INDEX "cash_bank_movements_opening_cash_unique" ON "cash_bank_movements" ("cash_account_id", "source_type") WHERE "source_type" = 'OPENING_BALANCE' AND "cash_account_id" IS NOT NULL;
CREATE UNIQUE INDEX "cash_bank_movements_opening_bank_unique" ON "cash_bank_movements" ("bank_account_id", "source_type") WHERE "source_type" = 'OPENING_BALANCE' AND "bank_account_id" IS NOT NULL;

CREATE TABLE "cash_bank_transfers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "transfer_date" timestamp with time zone NOT NULL,
  "amount" numeric(14,2) NOT NULL,
  "source_method" "payment_method" NOT NULL,
  "source_cash_account_id" uuid REFERENCES "cash_accounts"("id"),
  "source_bank_account_id" uuid REFERENCES "bank_accounts"("id"),
  "destination_method" "payment_method" NOT NULL,
  "destination_cash_account_id" uuid REFERENCES "cash_accounts"("id"),
  "destination_bank_account_id" uuid REFERENCES "bank_accounts"("id"),
  "notes" varchar(500),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cash_bank_transfers_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "cash_bank_transfers_source_account_check" CHECK (("source_method" = 'CASH' AND "source_cash_account_id" IS NOT NULL AND "source_bank_account_id" IS NULL) OR ("source_method" = 'BANK_TRANSFER' AND "source_bank_account_id" IS NOT NULL AND "source_cash_account_id" IS NULL)),
  CONSTRAINT "cash_bank_transfers_destination_account_check" CHECK (("destination_method" = 'CASH' AND "destination_cash_account_id" IS NOT NULL AND "destination_bank_account_id" IS NULL) OR ("destination_method" = 'BANK_TRANSFER' AND "destination_bank_account_id" IS NOT NULL AND "destination_cash_account_id" IS NULL)),
  CONSTRAINT "cash_bank_transfers_different_accounts_check" CHECK (NOT ("source_method" = "destination_method" AND coalesce("source_cash_account_id"::text, "source_bank_account_id"::text) = coalesce("destination_cash_account_id"::text, "destination_bank_account_id"::text)))
);
CREATE INDEX "cash_bank_transfers_date_index" ON "cash_bank_transfers" ("transfer_date");

CREATE TABLE "cash_reconciliations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cash_account_id" uuid NOT NULL REFERENCES "cash_accounts"("id"),
  "reconciliation_date" timestamp with time zone NOT NULL,
  "system_balance" numeric(14,2) NOT NULL,
  "counted_amount" numeric(14,2) NOT NULL,
  "difference_amount" numeric(14,2) NOT NULL,
  "status" "reconciliation_status" DEFAULT 'DRAFT' NOT NULL,
  "notes" varchar(500),
  "confirmed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cash_reconciliations_counted_amount_check" CHECK ("counted_amount" >= 0),
  CONSTRAINT "cash_reconciliations_confirmation_check" CHECK (("status" = 'DRAFT' AND "confirmed_at" IS NULL) OR ("status" = 'CONFIRMED' AND "confirmed_at" IS NOT NULL))
);
CREATE INDEX "cash_reconciliations_account_date_index" ON "cash_reconciliations" ("cash_account_id", "reconciliation_date");


-- Keeps a confirmed cash reconciliation immutable while still allowing DRAFT to CONFIRMED.
CREATE OR REPLACE FUNCTION prevent_confirmed_cash_reconciliation_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'CONFIRMED' THEN
    RAISE EXCEPTION 'confirmed cash reconciliation cannot be changed'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER cash_reconciliations_prevent_confirmed_update
BEFORE UPDATE ON "cash_reconciliations"
FOR EACH ROW
EXECUTE FUNCTION prevent_confirmed_cash_reconciliation_change();

-- Prevents deleting a confirmed reconciliation because corrections use movements.
CREATE OR REPLACE FUNCTION prevent_confirmed_cash_reconciliation_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'CONFIRMED' THEN
    RAISE EXCEPTION 'confirmed cash reconciliation cannot be deleted'
      USING ERRCODE = '23514';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER cash_reconciliations_prevent_confirmed_delete
BEFORE DELETE ON "cash_reconciliations"
FOR EACH ROW
EXECUTE FUNCTION prevent_confirmed_cash_reconciliation_delete();
