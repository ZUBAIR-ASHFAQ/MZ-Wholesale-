CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(160) NOT NULL,
	"phone" varchar(32),
	"email" varchar(254),
	"address" varchar(500),
	"tax_id" varchar(80),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_code_not_blank_check" CHECK (length(trim("suppliers"."code")) > 0),
	CONSTRAINT "suppliers_name_not_blank_check" CHECK (length(trim("suppliers"."name")) > 0),
	CONSTRAINT "suppliers_phone_not_blank_check" CHECK ("suppliers"."phone" is null or length(trim("suppliers"."phone")) > 0),
	CONSTRAINT "suppliers_email_not_blank_check" CHECK ("suppliers"."email" is null or length(trim("suppliers"."email")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_code_normalized_unique" ON "suppliers" USING btree (lower(trim("code")));
--> statement-breakpoint
CREATE INDEX "suppliers_active_name_index" ON "suppliers" USING btree ("is_active","name");
--> statement-breakpoint
CREATE INDEX "suppliers_phone_index" ON "suppliers" USING btree ("phone");
