-- Preserve fractional per-unit inventory costs until a monetary line/value is finalized.
ALTER TABLE "inventory_balances"
  ALTER COLUMN "weighted_average_cost" TYPE numeric(30,14),
  ALTER COLUMN "damaged_weighted_average_cost" TYPE numeric(30,14),
  ALTER COLUMN "expired_weighted_average_cost" TYPE numeric(30,14);

ALTER TABLE "stock_movements"
  ALTER COLUMN "unit_cost" TYPE numeric(30,14);

ALTER TABLE "purchase_items"
  ALTER COLUMN "landed_unit_cost" TYPE numeric(30,14);

ALTER TABLE "sales_invoice_items"
  ALTER COLUMN "unit_cost_snapshot" TYPE numeric(30,14);

ALTER TABLE "sales_return_items"
  ALTER COLUMN "unit_cost_snapshot" TYPE numeric(30,14);

ALTER TABLE "purchase_return_items"
  ALTER COLUMN "unit_cost_snapshot" TYPE numeric(30,14);
