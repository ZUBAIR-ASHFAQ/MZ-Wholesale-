CREATE TYPE "purchase_status" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

CREATE TABLE "purchases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "purchase_number" varchar(32),
  "supplier_id" uuid NOT NULL,
  "purchase_date" date NOT NULL,
  "status" "purchase_status" DEFAULT 'DRAFT' NOT NULL,
  "item_discount_total" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "invoice_discount_amount" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "extra_cost_amount" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "subtotal_amount" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "total_amount" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "initial_paid_amount" numeric(14,2),
  "initial_due_amount" numeric(14,2),
  "notes" varchar(1000),
  "confirmed_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE restrict,
  CONSTRAINT "purchases_number_not_blank_check" CHECK ("purchase_number" IS NULL OR length(trim("purchase_number")) > 0),
  CONSTRAINT "purchases_item_discount_non_negative_check" CHECK ("item_discount_total" >= 0),
  CONSTRAINT "purchases_invoice_discount_non_negative_check" CHECK ("invoice_discount_amount" >= 0),
  CONSTRAINT "purchases_extra_cost_non_negative_check" CHECK ("extra_cost_amount" >= 0),
  CONSTRAINT "purchases_subtotal_non_negative_check" CHECK ("subtotal_amount" >= 0),
  CONSTRAINT "purchases_total_non_negative_check" CHECK ("total_amount" >= 0),
  CONSTRAINT "purchases_initial_paid_non_negative_check" CHECK ("initial_paid_amount" IS NULL OR "initial_paid_amount" >= 0),
  CONSTRAINT "purchases_initial_due_non_negative_check" CHECK ("initial_due_amount" IS NULL OR "initial_due_amount" >= 0),
  CONSTRAINT "purchases_initial_payment_pair_check" CHECK (("initial_paid_amount" IS NULL AND "initial_due_amount" IS NULL) OR ("initial_paid_amount" IS NOT NULL AND "initial_due_amount" IS NOT NULL)),
  CONSTRAINT "purchases_initial_payment_total_check" CHECK ("initial_paid_amount" IS NULL OR ("initial_paid_amount" + "initial_due_amount" = "total_amount")),
  CONSTRAINT "purchases_notes_not_blank_check" CHECK ("notes" IS NULL OR length(trim("notes")) > 0),
  CONSTRAINT "purchases_status_dates_check" CHECK (("status" = 'DRAFT' AND "confirmed_at" IS NULL AND "cancelled_at" IS NULL) OR ("status" = 'CONFIRMED' AND "confirmed_at" IS NOT NULL AND "cancelled_at" IS NULL) OR ("status" = 'CANCELLED' AND "confirmed_at" IS NULL AND "cancelled_at" IS NOT NULL)),
  CONSTRAINT "purchases_confirmed_snapshot_check" CHECK ("status" <> 'CONFIRMED' OR ("purchase_number" IS NOT NULL AND "initial_paid_amount" IS NOT NULL AND "initial_due_amount" IS NOT NULL))
);

CREATE UNIQUE INDEX "purchases_purchase_number_normalized_unique"
  ON "purchases" (lower(trim("purchase_number")))
  WHERE "purchase_number" IS NOT NULL;
CREATE INDEX "purchases_supplier_purchase_date_index" ON "purchases" ("supplier_id", "purchase_date");
CREATE INDEX "purchases_status_purchase_date_index" ON "purchases" ("status", "purchase_date");

CREATE TABLE "purchase_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "purchase_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "product_unit_id" uuid NOT NULL,
  "product_sku_snapshot" varchar(64) NOT NULL,
  "product_name_snapshot" varchar(200) NOT NULL,
  "unit_name_snapshot" varchar(80) NOT NULL,
  "conversion_to_base_snapshot" numeric(14,3) NOT NULL,
  "quantity" numeric(14,3) NOT NULL,
  "base_quantity" numeric(14,3) NOT NULL,
  "unit_cost" numeric(14,2) NOT NULL,
  "item_discount_amount" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "line_total" numeric(14,2) NOT NULL,
  "allocated_extra_cost" numeric(14,2) DEFAULT '0.00' NOT NULL,
  "landed_unit_cost" numeric(14,2) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "purchase_items_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE restrict,
  CONSTRAINT "purchase_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE restrict,
  CONSTRAINT "purchase_items_product_unit_id_product_units_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "product_units"("id") ON DELETE restrict,
  CONSTRAINT "purchase_items_product_sku_snapshot_not_blank_check" CHECK (length(trim("product_sku_snapshot")) > 0),
  CONSTRAINT "purchase_items_product_name_snapshot_not_blank_check" CHECK (length(trim("product_name_snapshot")) > 0),
  CONSTRAINT "purchase_items_unit_name_snapshot_not_blank_check" CHECK (length(trim("unit_name_snapshot")) > 0),
  CONSTRAINT "purchase_items_conversion_positive_check" CHECK ("conversion_to_base_snapshot" > 0),
  CONSTRAINT "purchase_items_quantity_positive_check" CHECK ("quantity" > 0),
  CONSTRAINT "purchase_items_base_quantity_positive_check" CHECK ("base_quantity" > 0),
  CONSTRAINT "purchase_items_unit_cost_positive_check" CHECK ("unit_cost" > 0),
  CONSTRAINT "purchase_items_discount_non_negative_check" CHECK ("item_discount_amount" >= 0),
  CONSTRAINT "purchase_items_line_total_non_negative_check" CHECK ("line_total" >= 0),
  CONSTRAINT "purchase_items_allocated_extra_cost_non_negative_check" CHECK ("allocated_extra_cost" >= 0),
  CONSTRAINT "purchase_items_landed_unit_cost_non_negative_check" CHECK ("landed_unit_cost" >= 0)
);

CREATE INDEX "purchase_items_purchase_id_index" ON "purchase_items" ("purchase_id");
CREATE INDEX "purchase_items_product_id_index" ON "purchase_items" ("product_id");
CREATE INDEX "purchase_items_product_unit_id_index" ON "purchase_items" ("product_unit_id");

-- Module 8 intentionally deferred this direct relation until the real purchases table existed.
ALTER TABLE "supplier_payment_allocations"
  ADD CONSTRAINT "supplier_payment_allocations_purchase_id_purchases_id_fk"
  FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE restrict;

-- Supports outstanding-purchase and payment-allocation lookups by purchase.
CREATE INDEX "supplier_payment_allocations_purchase_index"
  ON "supplier_payment_allocations" ("purchase_id");
