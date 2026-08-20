ALTER TABLE "inventory_balances"
ADD COLUMN "damaged_weighted_average_cost" numeric(14,2) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "inventory_balances"
ADD COLUMN "expired_weighted_average_cost" numeric(14,2) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "inventory_balances"
ADD CONSTRAINT "inventory_balances_damaged_weighted_cost_non_negative_check"
CHECK ("damaged_weighted_average_cost" >= 0);
--> statement-breakpoint
ALTER TABLE "inventory_balances"
ADD CONSTRAINT "inventory_balances_expired_weighted_cost_non_negative_check"
CHECK ("expired_weighted_average_cost" >= 0);
--> statement-breakpoint

-- Rebuild the two new condition costs from immutable movement history. OUT
-- movements intentionally retain the condition WAC, matching runtime stock-out behavior.
DO $$
DECLARE
  movement record;
  current_quantity numeric(14,3);
  current_cost numeric(14,2);
  next_quantity numeric(14,3);
  next_cost numeric(14,2);
BEGIN
  CREATE TEMP TABLE inventory_condition_cost_backfill (
    product_id uuid NOT NULL,
    stock_condition stock_condition NOT NULL,
    quantity numeric(14,3) NOT NULL,
    weighted_cost numeric(14,2) NOT NULL,
    PRIMARY KEY (product_id, stock_condition)
  ) ON COMMIT DROP;

  FOR movement IN
    SELECT product_id, stock_condition, direction, quantity, unit_cost
    FROM stock_movements
    WHERE stock_condition IN ('DAMAGED', 'EXPIRED')
    ORDER BY created_at, id
  LOOP
    SELECT quantity, weighted_cost
      INTO current_quantity, current_cost
    FROM inventory_condition_cost_backfill
    WHERE product_id = movement.product_id
      AND stock_condition = movement.stock_condition;

    IF NOT FOUND THEN
      current_quantity := 0.000;
      current_cost := 0.00;
    END IF;

    IF movement.direction = 'IN' THEN
      next_quantity := current_quantity + movement.quantity;
      next_cost := round(
        (
          current_quantity * current_cost
          + movement.quantity * movement.unit_cost
        ) / next_quantity,
        2
      );
    ELSE
      next_quantity := greatest(current_quantity - movement.quantity, 0.000);
      next_cost := current_cost;
    END IF;

    INSERT INTO inventory_condition_cost_backfill (
      product_id,
      stock_condition,
      quantity,
      weighted_cost
    ) VALUES (
      movement.product_id,
      movement.stock_condition,
      next_quantity,
      next_cost
    )
    ON CONFLICT (product_id, stock_condition)
    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      weighted_cost = EXCLUDED.weighted_cost;
  END LOOP;

  UPDATE inventory_balances AS balance
  SET damaged_weighted_average_cost = COALESCE(backfill.weighted_cost, 0.00)
  FROM inventory_condition_cost_backfill AS backfill
  WHERE backfill.product_id = balance.product_id
    AND backfill.stock_condition = 'DAMAGED';

  UPDATE inventory_balances AS balance
  SET expired_weighted_average_cost = COALESCE(backfill.weighted_cost, 0.00)
  FROM inventory_condition_cost_backfill AS backfill
  WHERE backfill.product_id = balance.product_id
    AND backfill.stock_condition = 'EXPIRED';
END $$;
