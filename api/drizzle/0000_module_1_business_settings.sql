CREATE TYPE "public"."document_type" AS ENUM('SALE', 'PURCHASE', 'CUSTOMER_RECEIPT', 'SUPPLIER_PAYMENT', 'SALES_RETURN', 'PURCHASE_RETURN', 'EXPENSE');--> statement-breakpoint
CREATE TABLE "business_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"singleton_key" integer DEFAULT 1 NOT NULL,
	"business_name" varchar(160) NOT NULL,
	"phone" varchar(32) NOT NULL,
	"email" varchar(254),
	"address" text NOT NULL,
	"logo_url" varchar(2048),
	"currency" varchar(3) DEFAULT 'PKR' NOT NULL,
	"timezone" varchar(64) DEFAULT 'Asia/Karachi' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_settings_singleton_key_unique" UNIQUE("singleton_key"),
	CONSTRAINT "business_settings_singleton_key_check" CHECK ("business_settings"."singleton_key" = 1),
	CONSTRAINT "business_settings_currency_check" CHECK ("business_settings"."currency" = 'PKR'),
	CONSTRAINT "business_settings_timezone_check" CHECK ("business_settings"."timezone" = 'Asia/Karachi'),
	CONSTRAINT "business_settings_name_not_blank_check" CHECK (length(trim("business_settings"."business_name")) > 0),
	CONSTRAINT "business_settings_phone_not_blank_check" CHECK (length(trim("business_settings"."phone")) > 0),
	CONSTRAINT "business_settings_address_not_blank_check" CHECK (length(trim("business_settings"."address")) > 0)
);
--> statement-breakpoint
CREATE TABLE "document_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_type" "document_type" NOT NULL,
	"prefix" varchar(20) NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_sequences_document_type_unique" UNIQUE("document_type"),
	CONSTRAINT "document_sequences_prefix_unique" UNIQUE("prefix"),
	CONSTRAINT "document_sequences_prefix_not_blank_check" CHECK (length(trim("document_sequences"."prefix")) > 0),
	CONSTRAINT "document_sequences_next_number_positive_check" CHECK ("document_sequences"."next_number" > 0)
);
