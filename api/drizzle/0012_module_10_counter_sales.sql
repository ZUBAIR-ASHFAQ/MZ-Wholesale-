CREATE TYPE "sales_status" AS ENUM ('DRAFT', 'HELD', 'CONFIRMED', 'CANCELLED');

CREATE TABLE "sales_invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invoice_number" varchar(32),
  "customer_id" uuid NOT NULL,
  "invoice_date" date NOT NULL,
  "status" "sales_status" DEFAULT 'DRAFT' NOT NULL,
  "item_discount_total" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "invoice_discount_amount" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "subtotal_amount" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "total_amount" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "initial_paid_amount" numeric(14,2),
  "initial_due_amount" numeric(14,2),
  "notes" varchar(1000),
  "confirmed_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sales_invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE restrict,
  CONSTRAINT "sales_invoices_number_not_blank_check" CHECK ("invoice_number" IS NULL OR length(trim("invoice_number")) > 0),
  CONSTRAINT "sales_invoices_item_discount_non_negative_check" CHECK ("item_discount_total" >= 0),
  CONSTRAINT "sales_invoices_invoice_discount_non_negative_check" CHECK ("invoice_discount_amount" >= 0),
  CONSTRAINT "sales_invoices_subtotal_non_negative_check" CHECK ("subtotal_amount" >= 0),
  CONSTRAINT "sales_invoices_total_non_negative_check" CHECK ("total_amount" >= 0),
  CONSTRAINT "sales_invoices_invoice_discount_limit_check" CHECK ("invoice_discount_amount" <= "subtotal_amount"),
  CONSTRAINT "sales_invoices_total_calculation_check" CHECK ("total_amount" = "subtotal_amount" - "invoice_discount_amount"),
  CONSTRAINT "sales_invoices_initial_paid_non_negative_check" CHECK ("initial_paid_amount" IS NULL OR "initial_paid_amount" >= 0),
  CONSTRAINT "sales_invoices_initial_due_non_negative_check" CHECK ("initial_due_amount" IS NULL OR "initial_due_amount" >= 0),
  CONSTRAINT "sales_invoices_initial_payment_pair_check" CHECK (("initial_paid_amount" IS NULL AND "initial_due_amount" IS NULL) OR ("initial_paid_amount" IS NOT NULL AND "initial_due_amount" IS NOT NULL)),
  CONSTRAINT "sales_invoices_initial_payment_total_check" CHECK ("initial_paid_amount" IS NULL OR ("initial_paid_amount" + "initial_due_amount" = "total_amount")),
  CONSTRAINT "sales_invoices_notes_not_blank_check" CHECK ("notes" IS NULL OR length(trim("notes")) > 0),
  CONSTRAINT "sales_invoices_status_dates_check" CHECK (("status" IN ('DRAFT', 'HELD') AND "confirmed_at" IS NULL AND "cancelled_at" IS NULL) OR ("status" = 'CONFIRMED' AND "confirmed_at" IS NOT NULL AND "cancelled_at" IS NULL) OR ("status" = 'CANCELLED' AND "confirmed_at" IS NULL AND "cancelled_at" IS NOT NULL)),
  CONSTRAINT "sales_invoices_confirmed_snapshot_check" CHECK ("status" <> 'CONFIRMED' OR ("invoice_number" IS NOT NULL AND "initial_paid_amount" IS NOT NULL AND "initial_due_amount" IS NOT NULL))
);

CREATE UNIQUE INDEX "sales_invoices_invoice_number_normalized_unique"
  ON "sales_invoices" (lower(trim("invoice_number")))
  WHERE "invoice_number" IS NOT NULL;
CREATE INDEX "sales_invoices_customer_invoice_date_index" ON "sales_invoices" ("customer_id", "invoice_date");
CREATE INDEX "sales_invoices_status_invoice_date_index" ON "sales_invoices" ("status", "invoice_date");

CREATE TABLE "sales_invoice_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sales_invoice_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "product_unit_id" uuid NOT NULL,
  "product_sku_snapshot" varchar(64) NOT NULL,
  "product_name_snapshot" varchar(200) NOT NULL,
  "unit_name_snapshot" varchar(80) NOT NULL,
  "conversion_to_base_snapshot" numeric(14,3) NOT NULL,
  "quantity" numeric(14,3) NOT NULL,
  "base_quantity" numeric(14,3) NOT NULL,
  "manual_unit_price" numeric(14,2) NOT NULL,
  "item_discount_amount" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "line_total" numeric(14,2) NOT NULL,
  "unit_cost_snapshot" numeric(14,2),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sales_invoice_items_sales_invoice_id_sales_invoices_id_fk" FOREIGN KEY ("sales_invoice_id") REFERENCES "sales_invoices"("id") ON DELETE restrict,
  CONSTRAINT "sales_invoice_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE restrict,
  CONSTRAINT "sales_invoice_items_product_unit_id_product_units_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "product_units"("id") ON DELETE restrict,
  CONSTRAINT "sales_invoice_items_product_sku_snapshot_not_blank_check" CHECK (length(trim("product_sku_snapshot")) > 0),
  CONSTRAINT "sales_invoice_items_product_name_snapshot_not_blank_check" CHECK (length(trim("product_name_snapshot")) > 0),
  CONSTRAINT "sales_invoice_items_unit_name_snapshot_not_blank_check" CHECK (length(trim("unit_name_snapshot")) > 0),
  CONSTRAINT "sales_invoice_items_conversion_positive_check" CHECK ("conversion_to_base_snapshot" > 0),
  CONSTRAINT "sales_invoice_items_quantity_positive_check" CHECK ("quantity" > 0),
  CONSTRAINT "sales_invoice_items_base_quantity_positive_check" CHECK ("base_quantity" > 0),
  CONSTRAINT "sales_invoice_items_manual_unit_price_positive_check" CHECK ("manual_unit_price" > 0),
  CONSTRAINT "sales_invoice_items_discount_non_negative_check" CHECK ("item_discount_amount" >= 0),
  CONSTRAINT "sales_invoice_items_discount_limit_check" CHECK ("item_discount_amount" <= round("quantity" * "manual_unit_price", 2)),
  CONSTRAINT "sales_invoice_items_line_total_non_negative_check" CHECK ("line_total" >= 0),
  CONSTRAINT "sales_invoice_items_line_total_calculation_check" CHECK ("line_total" = round("quantity" * "manual_unit_price", 2) - "item_discount_amount"),
  CONSTRAINT "sales_invoice_items_unit_cost_non_negative_check" CHECK ("unit_cost_snapshot" IS NULL OR "unit_cost_snapshot" >= 0)
);

CREATE INDEX "sales_invoice_items_sales_invoice_id_index" ON "sales_invoice_items" ("sales_invoice_id");
CREATE INDEX "sales_invoice_items_product_id_index" ON "sales_invoice_items" ("product_id");
CREATE INDEX "sales_invoice_items_product_unit_id_index" ON "sales_invoice_items" ("product_unit_id");

-- Module 8 intentionally deferred this direct relation until the real sales invoice table existed.
ALTER TABLE "customer_payment_allocations"
  ADD CONSTRAINT "customer_payment_allocations_sales_invoice_id_sales_invoices_id_fk"
  FOREIGN KEY ("sales_invoice_id") REFERENCES "sales_invoices"("id") ON DELETE restrict;

-- Supports customer outstanding-invoice and payment-allocation lookups by invoice.
CREATE INDEX "customer_payment_allocations_sales_invoice_index"
  ON "customer_payment_allocations" ("sales_invoice_id");
