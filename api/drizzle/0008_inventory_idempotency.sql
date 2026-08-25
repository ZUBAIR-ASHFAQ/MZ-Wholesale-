CREATE TYPE "public"."idempotency_status" AS ENUM('PROCESSING', 'COMPLETED');
--> statement-breakpoint
CREATE TABLE "idempotency_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" varchar(200) NOT NULL,
  "method" varchar(16) NOT NULL,
  "path" varchar(300) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "status" "idempotency_status" DEFAULT 'PROCESSING' NOT NULL,
  "response_status" integer,
  "response_body" jsonb,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "idempotency_requests_key_not_blank_check" CHECK (length(trim("idempotency_requests"."key")) > 0),
  CONSTRAINT "idempotency_requests_completed_response_check" CHECK (("idempotency_requests"."status" = 'PROCESSING' and "idempotency_requests"."response_status" is null and "idempotency_requests"."response_body" is null) or ("idempotency_requests"."status" = 'COMPLETED' and "idempotency_requests"."response_status" is not null and "idempotency_requests"."response_body" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_requests_key_unique" ON "idempotency_requests" USING btree ("key");
