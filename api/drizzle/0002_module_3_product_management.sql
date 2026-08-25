CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_categories_name_not_blank_check" CHECK (length(trim("product_categories"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_name_not_blank_check" CHECK (length(trim("brands"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" varchar(64) NOT NULL,
	"barcode" varchar(128),
	"name" varchar(200) NOT NULL,
	"category_id" uuid NOT NULL,
	"brand_id" uuid,
	"base_unit_name" varchar(80) NOT NULL,
	"reorder_level" numeric(14,3) DEFAULT '0.000' NOT NULL,
	"reference_purchase_price" numeric(14,2),
	"reference_sale_price" numeric(14,2),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_sku_not_blank_check" CHECK (length(trim("products"."sku")) > 0),
	CONSTRAINT "products_barcode_not_blank_check" CHECK ("products"."barcode" is null or length(trim("products"."barcode")) > 0),
	CONSTRAINT "products_name_not_blank_check" CHECK (length(trim("products"."name")) > 0),
	CONSTRAINT "products_base_unit_name_not_blank_check" CHECK (length(trim("products"."base_unit_name")) > 0),
	CONSTRAINT "products_reorder_level_non_negative_check" CHECK ("products"."reorder_level" >= 0),
	CONSTRAINT "products_reference_purchase_price_non_negative_check" CHECK ("products"."reference_purchase_price" is null or "products"."reference_purchase_price" >= 0),
	CONSTRAINT "products_reference_sale_price_non_negative_check" CHECK ("products"."reference_sale_price" is null or "products"."reference_sale_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"unit_name" varchar(80) NOT NULL,
	"conversion_to_base" numeric(14,3) NOT NULL,
	"is_base_unit" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_units_unit_name_not_blank_check" CHECK (length(trim("product_units"."unit_name")) > 0),
	CONSTRAINT "product_units_conversion_positive_check" CHECK ("product_units"."conversion_to_base" > 0),
	CONSTRAINT "product_units_base_conversion_check" CHECK ("product_units"."is_base_unit" = false or "product_units"."conversion_to_base" = 1.000)
);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_name_normalized_unique" ON "product_categories" USING btree (lower(trim("name")));
--> statement-breakpoint
CREATE INDEX "product_categories_active_name_index" ON "product_categories" USING btree ("is_active","name");
--> statement-breakpoint
CREATE UNIQUE INDEX "brands_name_normalized_unique" ON "brands" USING btree (lower(trim("name")));
--> statement-breakpoint
CREATE INDEX "brands_active_name_index" ON "brands" USING btree ("is_active","name");
--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_normalized_unique" ON "products" USING btree (lower(trim("sku")));
--> statement-breakpoint
CREATE UNIQUE INDEX "products_barcode_unique" ON "products" USING btree ("barcode") WHERE "products"."barcode" is not null;
--> statement-breakpoint
CREATE INDEX "products_category_id_index" ON "products" USING btree ("category_id");
--> statement-breakpoint
CREATE INDEX "products_brand_id_index" ON "products" USING btree ("brand_id");
--> statement-breakpoint
CREATE INDEX "products_active_name_index" ON "products" USING btree ("is_active","name");
--> statement-breakpoint
CREATE UNIQUE INDEX "product_units_product_unit_name_normalized_unique" ON "product_units" USING btree ("product_id",lower(trim("unit_name")));
--> statement-breakpoint
CREATE UNIQUE INDEX "product_units_one_base_unit_per_product_unique" ON "product_units" USING btree ("product_id") WHERE "product_units"."is_base_unit" = true;
--> statement-breakpoint
CREATE INDEX "product_units_product_id_index" ON "product_units" USING btree ("product_id");
