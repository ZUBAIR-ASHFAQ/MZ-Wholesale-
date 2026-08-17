CREATE TABLE "customer_ledger_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
  "occurred_at" timestamptz NOT NULL,
  "reference_type" varchar(40) NOT NULL,
  "reference_id" uuid,
  "document_number" varchar(50),
  "description" varchar(200),
  "debit" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "credit" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "notes" varchar(500),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "customer_ledger_amount_check" CHECK (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0)),
  CONSTRAINT "customer_ledger_reference_check" CHECK (("reference_type" = 'OPENING_BALANCE' AND "reference_id" IS NULL) OR ("reference_type" <> 'OPENING_BALANCE' AND "reference_id" IS NOT NULL))
);
CREATE INDEX "customer_ledger_customer_date_index" ON "customer_ledger_entries" ("customer_id", "occurred_at");
CREATE INDEX "customer_ledger_reference_index" ON "customer_ledger_entries" ("reference_type", "reference_id");
CREATE UNIQUE INDEX "customer_ledger_source_unique" ON "customer_ledger_entries" ("customer_id", "reference_type", "reference_id") WHERE "reference_id" IS NOT NULL;
CREATE UNIQUE INDEX "customer_ledger_one_opening_balance_unique" ON "customer_ledger_entries" ("customer_id", "reference_type") WHERE "reference_type" = 'OPENING_BALANCE';

CREATE TABLE "supplier_ledger_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "supplier_id" uuid NOT NULL REFERENCES "suppliers"("id"),
  "occurred_at" timestamptz NOT NULL,
  "reference_type" varchar(40) NOT NULL,
  "reference_id" uuid,
  "document_number" varchar(50),
  "description" varchar(200),
  "debit" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "credit" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "notes" varchar(500),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "supplier_ledger_amount_check" CHECK (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0)),
  CONSTRAINT "supplier_ledger_reference_check" CHECK (("reference_type" = 'OPENING_BALANCE' AND "reference_id" IS NULL) OR ("reference_type" <> 'OPENING_BALANCE' AND "reference_id" IS NOT NULL))
);
CREATE INDEX "supplier_ledger_supplier_date_index" ON "supplier_ledger_entries" ("supplier_id", "occurred_at");
CREATE INDEX "supplier_ledger_reference_index" ON "supplier_ledger_entries" ("reference_type", "reference_id");
CREATE UNIQUE INDEX "supplier_ledger_source_unique" ON "supplier_ledger_entries" ("supplier_id", "reference_type", "reference_id") WHERE "reference_id" IS NOT NULL;
CREATE UNIQUE INDEX "supplier_ledger_one_opening_balance_unique" ON "supplier_ledger_entries" ("supplier_id", "reference_type") WHERE "reference_type" = 'OPENING_BALANCE';
