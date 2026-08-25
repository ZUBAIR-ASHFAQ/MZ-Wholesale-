CREATE TABLE "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "admin_user_id" uuid NOT NULL,
  "request_id" varchar(120) NOT NULL,
  "ip_address" varchar(64),
  "device" varchar(500),
  "action" varchar(100) NOT NULL,
  "entity" varchar(100) NOT NULL,
  "before_data" jsonb,
  "after_data" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "audit_logs_request_id_not_blank_check" CHECK (length(trim("audit_logs"."request_id")) > 0),
  CONSTRAINT "audit_logs_action_not_blank_check" CHECK (length(trim("audit_logs"."action")) > 0),
  CONSTRAINT "audit_logs_entity_not_blank_check" CHECK (length(trim("audit_logs"."entity")) > 0)
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_index" ON "audit_logs" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "audit_logs_action_created_at_index" ON "audit_logs" USING btree ("action","created_at");
--> statement-breakpoint
CREATE INDEX "audit_logs_entity_created_at_index" ON "audit_logs" USING btree ("entity","created_at");
