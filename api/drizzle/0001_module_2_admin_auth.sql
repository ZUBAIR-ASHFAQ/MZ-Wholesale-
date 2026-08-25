CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"refresh_token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_sessions_refresh_token_hash_unique" UNIQUE("refresh_token_hash"),
	CONSTRAINT "admin_sessions_refresh_token_hash_format_check" CHECK ("admin_sessions"."refresh_token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "admin_sessions_expiry_after_creation_check" CHECK ("admin_sessions"."expires_at" > "admin_sessions"."created_at"),
	CONSTRAINT "admin_sessions_revocation_after_creation_check" CHECK ("admin_sessions"."revoked_at" is null or "admin_sessions"."revoked_at" >= "admin_sessions"."created_at"),
	CONSTRAINT "admin_sessions_last_use_after_creation_check" CHECK ("admin_sessions"."last_used_at" >= "admin_sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"singleton_key" integer DEFAULT 1 NOT NULL,
	"name" varchar(160) NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_singleton_key_unique" UNIQUE("singleton_key"),
	CONSTRAINT "admin_users_email_unique" UNIQUE("email"),
	CONSTRAINT "admin_users_singleton_key_check" CHECK ("admin_users"."singleton_key" = 1),
	CONSTRAINT "admin_users_name_not_blank_check" CHECK (length(trim("admin_users"."name")) > 0),
	CONSTRAINT "admin_users_email_not_blank_check" CHECK (length(trim("admin_users"."email")) > 0),
	CONSTRAINT "admin_users_email_normalized_check" CHECK ("admin_users"."email" = lower(trim("admin_users"."email"))),
	CONSTRAINT "admin_users_password_hash_not_blank_check" CHECK (length(trim("admin_users"."password_hash")) > 0)
);
--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_sessions_admin_user_id_index" ON "admin_sessions" USING btree ("admin_user_id");