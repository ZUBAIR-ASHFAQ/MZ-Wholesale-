UPDATE "employees"
SET "leave_date" = NULL, "updated_at" = now()
WHERE "is_active" = true AND "leave_date" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "employees"
ADD CONSTRAINT "employees_active_leave_date_check"
CHECK ("is_active" = false OR "leave_date" IS NULL);
