CREATE TYPE "public"."stock_condition" AS ENUM('SELLABLE', 'DAMAGED', 'EXPIRED');
--> statement-breakpoint
CREATE TYPE "public"."stock_direction" AS ENUM('IN', 'OUT');
--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('OPENING_STOCK', 'PURCHASE', 'SALE', 'SALES_RETURN', 'PURCHASE_RETURN', 'ADJUSTMENT', 'STOCK_COUNT', 'DISPOSAL');
--> statement-breakpoint
CREATE TYPE "public"."stock_count_status" AS ENUM('DRAFT', 'CONFIRMED');
--> statement-breakpoint
CREATE TABLE "inventory_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"sellable_quantity_on_hand" numeric(14,3) DEFAULT '0.000' NOT NULL,
	"damaged_quantity_on_hand" numeric(14,3) DEFAULT '0.000' NOT NULL,
	"expired_quantity_on_hand" numeric(14,3) DEFAULT '0.000' NOT NULL,
	"weighted_average_cost" numeric(14,2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_balances_sellable_non_negative_check" CHECK ("inventory_balances"."sellable_quantity_on_hand" >= 0),
	CONSTRAINT "inventory_balances_damaged_non_negative_check" CHECK ("inventory_balances"."damaged_quantity_on_hand" >= 0),
	CONSTRAINT "inventory_balances_expired_non_negative_check" CHECK ("inventory_balances"."expired_quantity_on_hand" >= 0),
	CONSTRAINT "inventory_balances_weighted_cost_non_negative_check" CHECK ("inventory_balances"."weighted_average_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"movement_type" "stock_movement_type" NOT NULL,
	"stock_condition" "stock_condition" NOT NULL,
	"direction" "stock_direction" NOT NULL,
	"quantity" numeric(14,3) NOT NULL,
	"unit_cost" numeric(14,2) NOT NULL,
	"allocated_extra_cost" numeric(14,2),
	"source_type" varchar(40),
	"source_id" uuid,
	"reason" varchar(200),
	"notes" varchar(1000),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_quantity_positive_check" CHECK ("stock_movements"."quantity" > 0),
	CONSTRAINT "stock_movements_unit_cost_non_negative_check" CHECK ("stock_movements"."unit_cost" >= 0),
	CONSTRAINT "stock_movements_allocated_extra_cost_non_negative_check" CHECK ("stock_movements"."allocated_extra_cost" is null or "stock_movements"."allocated_extra_cost" >= 0),
	CONSTRAINT "stock_movements_source_pair_check" CHECK (("stock_movements"."source_type" is null and "stock_movements"."source_id" is null) or ("stock_movements"."source_type" is not null and "stock_movements"."source_id" is not null)),
	CONSTRAINT "stock_movements_source_type_not_blank_check" CHECK ("stock_movements"."source_type" is null or length(trim("stock_movements"."source_type")) > 0),
	CONSTRAINT "stock_movements_reason_not_blank_check" CHECK ("stock_movements"."reason" is null or length(trim("stock_movements"."reason")) > 0),
	CONSTRAINT "stock_movements_notes_not_blank_check" CHECK ("stock_movements"."notes" is null or length(trim("stock_movements"."notes")) > 0)
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"count_number" varchar(32) NOT NULL,
	"count_date" date NOT NULL,
	"status" "stock_count_status" DEFAULT 'DRAFT' NOT NULL,
	"notes" varchar(1000),
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_counts_count_number_not_blank_check" CHECK (length(trim("stock_counts"."count_number")) > 0),
	CONSTRAINT "stock_counts_notes_not_blank_check" CHECK ("stock_counts"."notes" is null or length(trim("stock_counts"."notes")) > 0),
	CONSTRAINT "stock_counts_confirmation_state_check" CHECK (("stock_counts"."status" = 'DRAFT' and "stock_counts"."confirmed_at" is null) or ("stock_counts"."status" = 'CONFIRMED' and "stock_counts"."confirmed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "stock_count_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_count_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"stock_condition" "stock_condition" NOT NULL,
	"system_quantity" numeric(14,3) NOT NULL,
	"counted_quantity" numeric(14,3) NOT NULL,
	"difference_quantity" numeric(14,3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_count_items_system_quantity_non_negative_check" CHECK ("stock_count_items"."system_quantity" >= 0),
	CONSTRAINT "stock_count_items_counted_quantity_non_negative_check" CHECK ("stock_count_items"."counted_quantity" >= 0),
	CONSTRAINT "stock_count_items_difference_matches_check" CHECK ("stock_count_items"."difference_quantity" = "stock_count_items"."counted_quantity" - "stock_count_items"."system_quantity")
);
--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_stock_count_id_stock_counts_id_fk" FOREIGN KEY ("stock_count_id") REFERENCES "public"."stock_counts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_balances_product_id_unique" ON "inventory_balances" USING btree ("product_id");
--> statement-breakpoint
CREATE INDEX "stock_movements_product_occurred_at_index" ON "stock_movements" USING btree ("product_id","occurred_at");
--> statement-breakpoint
CREATE INDEX "stock_movements_source_index" ON "stock_movements" USING btree ("source_type","source_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "stock_counts_count_number_normalized_unique" ON "stock_counts" USING btree (lower(trim("count_number")));
--> statement-breakpoint
CREATE INDEX "stock_counts_status_count_date_index" ON "stock_counts" USING btree ("status","count_date");
--> statement-breakpoint
CREATE UNIQUE INDEX "stock_count_items_count_product_condition_unique" ON "stock_count_items" USING btree ("stock_count_id","product_id","stock_condition");
--> statement-breakpoint
CREATE INDEX "stock_count_items_product_id_index" ON "stock_count_items" USING btree ("product_id");
