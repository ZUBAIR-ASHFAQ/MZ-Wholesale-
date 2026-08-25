UPDATE "employee_leaves"
SET "days" = ("to_date" - "from_date" + 1)::numeric
WHERE "days" <> ("to_date" - "from_date" + 1)::numeric;
--> statement-breakpoint
ALTER TABLE "employee_leaves"
ADD CONSTRAINT "employee_leaves_days_match_range_check"
CHECK ("days" = ("to_date" - "from_date" + 1)::numeric);
