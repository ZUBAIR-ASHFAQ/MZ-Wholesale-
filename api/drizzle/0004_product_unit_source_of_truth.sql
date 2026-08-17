ALTER TABLE "product_units"
ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "product_units"
ADD CONSTRAINT "product_units_base_active_check"
CHECK ("is_base_unit" = false OR "is_active" = true);
--> statement-breakpoint
ALTER TABLE "products"
DROP CONSTRAINT IF EXISTS "products_base_unit_name_not_blank_check";
--> statement-breakpoint
ALTER TABLE "products"
DROP COLUMN "base_unit_name";
