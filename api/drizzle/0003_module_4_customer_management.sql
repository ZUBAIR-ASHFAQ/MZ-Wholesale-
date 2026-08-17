CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(160) NOT NULL,
	"phone" varchar(32),
	"email" varchar(254),
	"address" varchar(500),
	"tax_id" varchar(80),
	"credit_limit" numeric(14,2) DEFAULT '0.00' NOT NULL,
	"is_walk_in" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_code_not_blank_check" CHECK (length(trim("customers"."code")) > 0),
	CONSTRAINT "customers_name_not_blank_check" CHECK (length(trim("customers"."name")) > 0),
	CONSTRAINT "customers_phone_not_blank_check" CHECK ("customers"."phone" is null or length(trim("customers"."phone")) > 0),
	CONSTRAINT "customers_email_not_blank_check" CHECK ("customers"."email" is null or length(trim("customers"."email")) > 0),
	CONSTRAINT "customers_credit_limit_non_negative_check" CHECK ("customers"."credit_limit" >= 0),
	CONSTRAINT "customers_walk_in_active_check" CHECK ("customers"."is_walk_in" = false or "customers"."is_active" = true),
	CONSTRAINT "customers_walk_in_no_credit_check" CHECK ("customers"."is_walk_in" = false or "customers"."credit_limit" = 0.00)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "customers_code_normalized_unique" ON "customers" USING btree (lower(trim("code")));
--> statement-breakpoint
CREATE UNIQUE INDEX "customers_one_walk_in_unique" ON "customers" USING btree ("is_walk_in") WHERE "customers"."is_walk_in" = true;
--> statement-breakpoint
CREATE INDEX "customers_active_name_index" ON "customers" USING btree ("is_active","name");
--> statement-breakpoint
CREATE INDEX "customers_phone_index" ON "customers" USING btree ("phone");
