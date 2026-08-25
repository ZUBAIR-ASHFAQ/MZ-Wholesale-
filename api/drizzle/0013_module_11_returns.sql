-- Allow immutable cash/bank movements created by confirmed Sales Returns.
ALTER TYPE "movement_source_type" ADD VALUE IF NOT EXISTS 'SALES_RETURN';

CREATE TYPE "return_status" AS ENUM ('CONFIRMED');
CREATE TYPE "sales_return_refund_mode" AS ENUM ('DUE_REDUCTION', 'CASH', 'BANK_TRANSFER');
CREATE TYPE "sales_return_stock_condition" AS ENUM ('GOOD', 'DAMAGED', 'EXPIRED');

CREATE TABLE "sales_returns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "return_number" varchar(32) NOT NULL,
  "original_sale_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "return_date" date NOT NULL,
  "status" "return_status" DEFAULT 'CONFIRMED' NOT NULL,
  "reason" varchar(500) NOT NULL,
  "refund_mode" "sales_return_refund_mode" NOT NULL,
  "cash_account_id" uuid,
  "bank_account_id" uuid,
  "total_amount" numeric(14,2) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sales_returns_original_sale_id_sales_invoices_id_fk" FOREIGN KEY ("original_sale_id") REFERENCES "sales_invoices"("id") ON DELETE restrict,
  CONSTRAINT "sales_returns_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE restrict,
  CONSTRAINT "sales_returns_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE restrict,
  CONSTRAINT "sales_returns_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE restrict,
  CONSTRAINT "sales_returns_return_number_not_blank_check" CHECK (length(trim("return_number")) > 0),
  CONSTRAINT "sales_returns_reason_not_blank_check" CHECK (length(trim("reason")) > 0),
  CONSTRAINT "sales_returns_total_amount_non_negative_check" CHECK ("total_amount" >= 0),
  CONSTRAINT "sales_returns_refund_account_check" CHECK (
    ("refund_mode" = 'CASH' AND "cash_account_id" IS NOT NULL AND "bank_account_id" IS NULL)
    OR ("refund_mode" = 'BANK_TRANSFER' AND "cash_account_id" IS NULL AND "bank_account_id" IS NOT NULL)
    OR ("refund_mode" = 'DUE_REDUCTION' AND "cash_account_id" IS NULL AND "bank_account_id" IS NULL)
  )
);

CREATE UNIQUE INDEX "sales_returns_return_number_normalized_unique"
  ON "sales_returns" (lower(trim("return_number")));
CREATE INDEX "sales_returns_original_sale_id_index"
  ON "sales_returns" ("original_sale_id");
CREATE INDEX "sales_returns_return_date_index"
  ON "sales_returns" ("return_date");
CREATE INDEX "sales_returns_customer_return_date_index"
  ON "sales_returns" ("customer_id", "return_date");

CREATE TABLE "sales_return_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sales_return_id" uuid NOT NULL,
  "original_sale_item_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "product_unit_id" uuid NOT NULL,
  "product_sku_snapshot" varchar(64) NOT NULL,
  "product_name_snapshot" varchar(200) NOT NULL,
  "unit_name_snapshot" varchar(80) NOT NULL,
  "conversion_to_base_snapshot" numeric(14,3) NOT NULL,
  "quantity" numeric(14,3) NOT NULL,
  "base_quantity" numeric(14,3) NOT NULL,
  "unit_price_snapshot" numeric(14,2) NOT NULL,
  "unit_cost_snapshot" numeric(14,2) NOT NULL,
  "stock_condition" "sales_return_stock_condition" NOT NULL,
  "line_total" numeric(14,2) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sales_return_items_sales_return_id_sales_returns_id_fk" FOREIGN KEY ("sales_return_id") REFERENCES "sales_returns"("id") ON DELETE restrict,
  CONSTRAINT "sales_return_items_original_sale_item_id_sales_invoice_items_id_fk" FOREIGN KEY ("original_sale_item_id") REFERENCES "sales_invoice_items"("id") ON DELETE restrict,
  CONSTRAINT "sales_return_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE restrict,
  CONSTRAINT "sales_return_items_product_unit_id_product_units_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "product_units"("id") ON DELETE restrict,
  CONSTRAINT "sales_return_items_product_sku_snapshot_not_blank_check" CHECK (length(trim("product_sku_snapshot")) > 0),
  CONSTRAINT "sales_return_items_product_name_snapshot_not_blank_check" CHECK (length(trim("product_name_snapshot")) > 0),
  CONSTRAINT "sales_return_items_unit_name_snapshot_not_blank_check" CHECK (length(trim("unit_name_snapshot")) > 0),
  CONSTRAINT "sales_return_items_conversion_positive_check" CHECK ("conversion_to_base_snapshot" > 0),
  CONSTRAINT "sales_return_items_quantity_positive_check" CHECK ("quantity" > 0),
  CONSTRAINT "sales_return_items_base_quantity_positive_check" CHECK ("base_quantity" > 0),
  CONSTRAINT "sales_return_items_unit_price_positive_check" CHECK ("unit_price_snapshot" > 0),
  CONSTRAINT "sales_return_items_unit_cost_non_negative_check" CHECK ("unit_cost_snapshot" >= 0),
  CONSTRAINT "sales_return_items_line_total_non_negative_check" CHECK ("line_total" >= 0)
);

CREATE INDEX "sales_return_items_sales_return_id_index"
  ON "sales_return_items" ("sales_return_id");
CREATE INDEX "sales_return_items_original_sale_item_id_index"
  ON "sales_return_items" ("original_sale_item_id");
CREATE INDEX "sales_return_items_product_id_index"
  ON "sales_return_items" ("product_id");

CREATE TABLE "purchase_returns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "return_number" varchar(32) NOT NULL,
  "original_purchase_id" uuid NOT NULL,
  "supplier_id" uuid NOT NULL,
  "return_date" date NOT NULL,
  "status" "return_status" DEFAULT 'CONFIRMED' NOT NULL,
  "reason" varchar(500) NOT NULL,
  "total_amount" numeric(14,2) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "purchase_returns_original_purchase_id_purchases_id_fk" FOREIGN KEY ("original_purchase_id") REFERENCES "purchases"("id") ON DELETE restrict,
  CONSTRAINT "purchase_returns_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE restrict,
  CONSTRAINT "purchase_returns_return_number_not_blank_check" CHECK (length(trim("return_number")) > 0),
  CONSTRAINT "purchase_returns_reason_not_blank_check" CHECK (length(trim("reason")) > 0),
  CONSTRAINT "purchase_returns_total_amount_non_negative_check" CHECK ("total_amount" >= 0)
);

CREATE UNIQUE INDEX "purchase_returns_return_number_normalized_unique"
  ON "purchase_returns" (lower(trim("return_number")));
CREATE INDEX "purchase_returns_original_purchase_id_index"
  ON "purchase_returns" ("original_purchase_id");
CREATE INDEX "purchase_returns_return_date_index"
  ON "purchase_returns" ("return_date");
CREATE INDEX "purchase_returns_supplier_return_date_index"
  ON "purchase_returns" ("supplier_id", "return_date");

CREATE TABLE "purchase_return_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "purchase_return_id" uuid NOT NULL,
  "original_purchase_item_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "product_unit_id" uuid NOT NULL,
  "product_sku_snapshot" varchar(64) NOT NULL,
  "product_name_snapshot" varchar(200) NOT NULL,
  "unit_name_snapshot" varchar(80) NOT NULL,
  "conversion_to_base_snapshot" numeric(14,3) NOT NULL,
  "quantity" numeric(14,3) NOT NULL,
  "base_quantity" numeric(14,3) NOT NULL,
  "unit_cost_snapshot" numeric(14,2) NOT NULL,
  "line_total" numeric(14,2) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "purchase_return_items_purchase_return_id_purchase_returns_id_fk" FOREIGN KEY ("purchase_return_id") REFERENCES "purchase_returns"("id") ON DELETE restrict,
  CONSTRAINT "purchase_return_items_original_purchase_item_id_purchase_items_id_fk" FOREIGN KEY ("original_purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE restrict,
  CONSTRAINT "purchase_return_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE restrict,
  CONSTRAINT "purchase_return_items_product_unit_id_product_units_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "product_units"("id") ON DELETE restrict,
  CONSTRAINT "purchase_return_items_product_sku_snapshot_not_blank_check" CHECK (length(trim("product_sku_snapshot")) > 0),
  CONSTRAINT "purchase_return_items_product_name_snapshot_not_blank_check" CHECK (length(trim("product_name_snapshot")) > 0),
  CONSTRAINT "purchase_return_items_unit_name_snapshot_not_blank_check" CHECK (length(trim("unit_name_snapshot")) > 0),
  CONSTRAINT "purchase_return_items_conversion_positive_check" CHECK ("conversion_to_base_snapshot" > 0),
  CONSTRAINT "purchase_return_items_quantity_positive_check" CHECK ("quantity" > 0),
  CONSTRAINT "purchase_return_items_base_quantity_positive_check" CHECK ("base_quantity" > 0),
  CONSTRAINT "purchase_return_items_unit_cost_non_negative_check" CHECK ("unit_cost_snapshot" >= 0),
  CONSTRAINT "purchase_return_items_line_total_non_negative_check" CHECK ("line_total" >= 0)
);

CREATE INDEX "purchase_return_items_purchase_return_id_index"
  ON "purchase_return_items" ("purchase_return_id");
CREATE INDEX "purchase_return_items_original_purchase_item_id_index"
  ON "purchase_return_items" ("original_purchase_item_id");
CREATE INDEX "purchase_return_items_product_id_index"
  ON "purchase_return_items" ("product_id");
