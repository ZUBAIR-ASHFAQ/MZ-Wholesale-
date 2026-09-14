-- Adds account ownership to business data while preserving the existing service/repository APIs.
CREATE OR REPLACE FUNCTION current_tenant_admin_user_id() RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.admin_user_id', true), '')::uuid;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wholesale_erp_tenant') THEN
    CREATE ROLE wholesale_erp_tenant NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

GRANT wholesale_erp_tenant TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO wholesale_erp_tenant;

ALTER TABLE admin_users DROP CONSTRAINT admin_users_singleton_key_unique;
ALTER TABLE admin_users DROP CONSTRAINT admin_users_singleton_key_check;
ALTER TABLE admin_users DROP COLUMN singleton_key;

-- Add ownership without exposing the column through Drizzle response selections.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'sales_invoices',
    'sales_invoice_items',
    'suppliers',
    'cash_accounts',
    'bank_accounts',
    'customer_payments',
    'customer_payment_splits',
    'customer_payment_allocations',
    'supplier_payments',
    'supplier_payment_splits',
    'supplier_payment_allocations',
    'cash_bank_movements',
    'cash_bank_transfers',
    'cash_reconciliations',
    'product_categories',
    'brands',
    'products',
    'product_units',
    'expense_categories',
    'expenses',
    'business_settings',
    'document_sequences',
    'customer_ledger_entries',
    'supplier_ledger_entries',
    'inventory_balances',
    'stock_movements',
    'stock_counts',
    'stock_count_items',
    'customers',
    'employees',
    'attendance_records',
    'leave_types',
    'employee_leaves',
    'payroll_runs',
    'payroll_items',
    'employee_advances',
    'employee_advance_recoveries',
    'salary_payments',
    'salary_payment_splits',
    'salary_payment_allocations',
    'employee_ledger_entries',
    'purchases',
    'purchase_items',
    'idempotency_requests',
    'import_jobs',
    'import_job_errors',
    'sales_returns',
    'sales_return_items',
    'purchase_returns',
    'purchase_return_items'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN admin_user_id uuid DEFAULT current_tenant_admin_user_id()', table_name);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE RESTRICT', table_name, table_name || '_tenant_fk');
    EXECUTE format('CREATE INDEX %I ON %I (admin_user_id)', table_name || '_admin_user_id_index', table_name);
  END LOOP;
END
$$;

-- Existing single-operator data belongs to the oldest existing administrator.
DO $$
DECLARE
  existing_admin_id uuid;
  table_name text;
BEGIN
  SELECT id INTO existing_admin_id FROM admin_users ORDER BY created_at, id LIMIT 1;
  IF existing_admin_id IS NOT NULL THEN
    FOREACH table_name IN ARRAY ARRAY[
      'sales_invoices',
      'sales_invoice_items',
      'suppliers',
      'cash_accounts',
      'bank_accounts',
      'customer_payments',
      'customer_payment_splits',
      'customer_payment_allocations',
      'supplier_payments',
      'supplier_payment_splits',
      'supplier_payment_allocations',
      'cash_bank_movements',
      'cash_bank_transfers',
      'cash_reconciliations',
      'product_categories',
      'brands',
      'products',
      'product_units',
      'expense_categories',
      'expenses',
      'business_settings',
      'document_sequences',
      'customer_ledger_entries',
      'supplier_ledger_entries',
      'inventory_balances',
      'stock_movements',
      'stock_counts',
      'stock_count_items',
      'customers',
      'employees',
      'attendance_records',
      'leave_types',
      'employee_leaves',
      'payroll_runs',
      'payroll_items',
      'employee_advances',
      'employee_advance_recoveries',
      'salary_payments',
      'salary_payment_splits',
      'salary_payment_allocations',
      'employee_ledger_entries',
      'purchases',
      'purchase_items',
      'idempotency_requests',
      'import_jobs',
      'import_job_errors',
      'sales_returns',
      'sales_return_items',
      'purchase_returns',
      'purchase_return_items'
    ]
    LOOP
      EXECUTE format('UPDATE %I SET admin_user_id = $1 WHERE admin_user_id IS NULL', table_name) USING existing_admin_id;
    END LOOP;
  END IF;
END
$$;

-- Foreign-key ownership is enforced as part of every business-to-business relationship.
-- RLS prevents direct cross-account access, while these composite keys also prevent a
-- tenant from attaching one of its rows to another tenant's UUID through an FK check.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'sales_invoices',
    'sales_invoice_items',
    'suppliers',
    'cash_accounts',
    'bank_accounts',
    'customer_payments',
    'customer_payment_splits',
    'customer_payment_allocations',
    'supplier_payments',
    'supplier_payment_splits',
    'supplier_payment_allocations',
    'cash_bank_movements',
    'cash_bank_transfers',
    'cash_reconciliations',
    'product_categories',
    'brands',
    'products',
    'product_units',
    'expense_categories',
    'expenses',
    'business_settings',
    'document_sequences',
    'customer_ledger_entries',
    'supplier_ledger_entries',
    'inventory_balances',
    'stock_movements',
    'stock_counts',
    'stock_count_items',
    'customers',
    'employees',
    'attendance_records',
    'leave_types',
    'employee_leaves',
    'payroll_runs',
    'payroll_items',
    'employee_advances',
    'employee_advance_recoveries',
    'salary_payments',
    'salary_payment_splits',
    'salary_payment_allocations',
    'employee_ledger_entries',
    'purchases',
    'purchase_items',
    'idempotency_requests',
    'import_jobs',
    'import_job_errors',
    'sales_returns',
    'sales_return_items',
    'purchase_returns',
    'purchase_return_items'
  ]
  LOOP
    EXECUTE format(
      'CREATE UNIQUE INDEX %I ON %I (admin_user_id, id)',
      table_name || '_tenant_id_unique',
      table_name
    );
  END LOOP;
END
$$;

DO $$
DECLARE
  tenant_tables text[] := ARRAY[
    'sales_invoices',
    'sales_invoice_items',
    'suppliers',
    'cash_accounts',
    'bank_accounts',
    'customer_payments',
    'customer_payment_splits',
    'customer_payment_allocations',
    'supplier_payments',
    'supplier_payment_splits',
    'supplier_payment_allocations',
    'cash_bank_movements',
    'cash_bank_transfers',
    'cash_reconciliations',
    'product_categories',
    'brands',
    'products',
    'product_units',
    'expense_categories',
    'expenses',
    'business_settings',
    'document_sequences',
    'customer_ledger_entries',
    'supplier_ledger_entries',
    'inventory_balances',
    'stock_movements',
    'stock_counts',
    'stock_count_items',
    'customers',
    'employees',
    'attendance_records',
    'leave_types',
    'employee_leaves',
    'payroll_runs',
    'payroll_items',
    'employee_advances',
    'employee_advance_recoveries',
    'salary_payments',
    'salary_payment_splits',
    'salary_payment_allocations',
    'employee_ledger_entries',
    'purchases',
    'purchase_items',
    'idempotency_requests',
    'import_jobs',
    'import_job_errors',
    'sales_returns',
    'sales_return_items',
    'purchase_returns',
    'purchase_return_items'
  ];
  foreign_key record;
  update_action text;
  delete_action text;
  match_clause text;
  deferrable_clause text;
  validation_clause text;
BEGIN
  FOR foreign_key IN
    SELECT
      constraint_row.conname,
      child_table.relname AS child_table,
      parent_table.relname AS parent_table,
      constraint_row.confupdtype,
      constraint_row.confdeltype,
      constraint_row.confmatchtype,
      constraint_row.condeferrable,
      constraint_row.condeferred,
      constraint_row.convalidated,
      (
        SELECT string_agg(format('%I', child_attribute.attname), ', ' ORDER BY child_key.ordinality)
        FROM unnest(constraint_row.conkey) WITH ORDINALITY AS child_key(attnum, ordinality)
        JOIN pg_attribute AS child_attribute
          ON child_attribute.attrelid = constraint_row.conrelid
         AND child_attribute.attnum = child_key.attnum
      ) AS child_columns,
      (
        SELECT string_agg(format('%I', parent_attribute.attname), ', ' ORDER BY parent_key.ordinality)
        FROM unnest(constraint_row.confkey) WITH ORDINALITY AS parent_key(attnum, ordinality)
        JOIN pg_attribute AS parent_attribute
          ON parent_attribute.attrelid = constraint_row.confrelid
         AND parent_attribute.attnum = parent_key.attnum
      ) AS parent_columns
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS child_table
      ON child_table.oid = constraint_row.conrelid
    JOIN pg_namespace AS child_namespace
      ON child_namespace.oid = child_table.relnamespace
    JOIN pg_class AS parent_table
      ON parent_table.oid = constraint_row.confrelid
    JOIN pg_namespace AS parent_namespace
      ON parent_namespace.oid = parent_table.relnamespace
    WHERE constraint_row.contype = 'f'
      AND child_namespace.nspname = 'public'
      AND parent_namespace.nspname = 'public'
      AND child_table.relname = ANY(tenant_tables)
      AND parent_table.relname = ANY(tenant_tables)
    ORDER BY child_table.relname, constraint_row.conname
  LOOP
    update_action := CASE foreign_key.confupdtype
      WHEN 'r' THEN ' RESTRICT'
      WHEN 'c' THEN ' CASCADE'
      WHEN 'n' THEN ' SET NULL'
      WHEN 'd' THEN ' SET DEFAULT'
      ELSE ' NO ACTION'
    END;

    delete_action := CASE foreign_key.confdeltype
      WHEN 'r' THEN ' RESTRICT'
      WHEN 'c' THEN ' CASCADE'
      WHEN 'n' THEN ' SET NULL'
      WHEN 'd' THEN ' SET DEFAULT'
      ELSE ' NO ACTION'
    END;

    match_clause := CASE foreign_key.confmatchtype
      WHEN 'f' THEN ' MATCH FULL'
      WHEN 'p' THEN ' MATCH PARTIAL'
      ELSE ''
    END;

    deferrable_clause := CASE
      WHEN foreign_key.condeferrable AND foreign_key.condeferred
        THEN ' DEFERRABLE INITIALLY DEFERRED'
      WHEN foreign_key.condeferrable
        THEN ' DEFERRABLE INITIALLY IMMEDIATE'
      ELSE ''
    END;

    validation_clause := CASE
      WHEN foreign_key.convalidated THEN ''
      ELSE ' NOT VALID'
    END;

    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT %I',
      foreign_key.child_table,
      foreign_key.conname
    );

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (admin_user_id, %s) REFERENCES public.%I (admin_user_id, %s)%s ON UPDATE%s ON DELETE%s%s%s',
      foreign_key.child_table,
      foreign_key.conname,
      foreign_key.child_columns,
      foreign_key.parent_table,
      foreign_key.parent_columns,
      match_clause,
      update_action,
      delete_action,
      deferrable_clause,
      validation_clause
    );
  END LOOP;
END
$$;

-- Uniqueness remains identical inside one account, but no longer collides across accounts.
ALTER TABLE business_settings DROP CONSTRAINT business_settings_singleton_key_unique;
ALTER TABLE document_sequences DROP CONSTRAINT document_sequences_document_type_unique;
ALTER TABLE document_sequences DROP CONSTRAINT document_sequences_prefix_unique;
DROP INDEX customers_code_normalized_unique;
DROP INDEX customers_one_walk_in_unique;
DROP INDEX suppliers_code_normalized_unique;
DROP INDEX customer_ledger_source_unique;
DROP INDEX customer_ledger_one_opening_balance_unique;
DROP INDEX supplier_ledger_source_unique;
DROP INDEX supplier_ledger_one_opening_balance_unique;
DROP INDEX inventory_balances_product_id_unique;
DROP INDEX stock_counts_count_number_normalized_unique;
DROP INDEX stock_count_items_count_product_condition_unique;
DROP INDEX employees_employee_code_normalized_unique;
DROP INDEX employees_reference_id_normalized_unique;
DROP INDEX attendance_records_employee_date_unique;
DROP INDEX leave_types_name_normalized_unique;
DROP INDEX payroll_runs_payroll_number_normalized_unique;
DROP INDEX payroll_runs_confirmed_period_unique;
DROP INDEX payroll_items_run_employee_unique;
DROP INDEX employee_advances_advance_number_normalized_unique;
DROP INDEX employee_advance_recoveries_recovery_number_normalized_unique;
DROP INDEX salary_payments_document_number_normalized_unique;
DROP INDEX salary_payments_one_reversal_unique;
DROP INDEX salary_payment_allocations_item_unique;
DROP INDEX employee_ledger_source_unique;
DROP INDEX expense_categories_name_normalized_unique;
DROP INDEX expenses_expense_number_normalized_unique;
DROP INDEX expenses_one_reversal_unique;
DROP INDEX cash_accounts_name_unique;
DROP INDEX bank_accounts_account_number_unique;
DROP INDEX customer_payments_document_number_unique;
DROP INDEX customer_payments_one_reversal_unique;
DROP INDEX customer_payment_allocations_invoice_unique;
DROP INDEX supplier_payments_document_number_unique;
DROP INDEX supplier_payments_one_reversal_unique;
DROP INDEX supplier_payment_allocations_purchase_unique;
DROP INDEX cash_bank_movements_cash_source_effect_unique;
DROP INDEX cash_bank_movements_bank_source_effect_unique;
DROP INDEX cash_bank_movements_opening_cash_unique;
DROP INDEX cash_bank_movements_opening_bank_unique;
DROP INDEX product_categories_name_normalized_unique;
DROP INDEX brands_name_normalized_unique;
DROP INDEX products_sku_normalized_unique;
DROP INDEX products_barcode_unique;
DROP INDEX product_units_product_unit_name_normalized_unique;
DROP INDEX product_units_one_base_unit_per_product_unique;
DROP INDEX purchases_purchase_number_normalized_unique;
DROP INDEX sales_invoices_invoice_number_normalized_unique;
DROP INDEX sales_returns_return_number_normalized_unique;
DROP INDEX purchase_returns_return_number_normalized_unique;
DROP INDEX idempotency_requests_key_unique;

CREATE UNIQUE INDEX business_settings_singleton_key_unique ON business_settings (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), singleton_key);
CREATE UNIQUE INDEX document_sequences_document_type_unique ON document_sequences (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), document_type);
CREATE UNIQUE INDEX document_sequences_prefix_unique ON document_sequences (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), prefix);
CREATE UNIQUE INDEX customers_code_normalized_unique ON customers (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(code)));
CREATE UNIQUE INDEX customers_one_walk_in_unique ON customers (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), is_walk_in) WHERE is_walk_in = true;
CREATE UNIQUE INDEX suppliers_code_normalized_unique ON suppliers (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(code)));
CREATE UNIQUE INDEX customer_ledger_source_unique ON customer_ledger_entries (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), customer_id, reference_type, reference_id) WHERE reference_id is not null;
CREATE UNIQUE INDEX customer_ledger_one_opening_balance_unique ON customer_ledger_entries (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), customer_id, reference_type) WHERE reference_type = 'OPENING_BALANCE';
CREATE UNIQUE INDEX supplier_ledger_source_unique ON supplier_ledger_entries (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), supplier_id, reference_type, reference_id) WHERE reference_id is not null;
CREATE UNIQUE INDEX supplier_ledger_one_opening_balance_unique ON supplier_ledger_entries (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), supplier_id, reference_type) WHERE reference_type = 'OPENING_BALANCE';
CREATE UNIQUE INDEX inventory_balances_product_id_unique ON inventory_balances (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), product_id);
CREATE UNIQUE INDEX stock_counts_count_number_normalized_unique ON stock_counts (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(count_number)));
CREATE UNIQUE INDEX stock_count_items_count_product_condition_unique ON stock_count_items (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), stock_count_id, product_id, stock_condition);
CREATE UNIQUE INDEX employees_employee_code_normalized_unique ON employees (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(employee_code)));
CREATE UNIQUE INDEX employees_reference_id_normalized_unique ON employees (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(reference_id))) WHERE reference_id is not null;
CREATE UNIQUE INDEX attendance_records_employee_date_unique ON attendance_records (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), employee_id, attendance_date);
CREATE UNIQUE INDEX leave_types_name_normalized_unique ON leave_types (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(name)));
CREATE UNIQUE INDEX payroll_runs_payroll_number_normalized_unique ON payroll_runs (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(payroll_number)));
CREATE UNIQUE INDEX payroll_runs_confirmed_period_unique ON payroll_runs (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), period_start, period_end) WHERE status = 'CONFIRMED';
CREATE UNIQUE INDEX payroll_items_run_employee_unique ON payroll_items (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), payroll_run_id, employee_id);
CREATE UNIQUE INDEX employee_advances_advance_number_normalized_unique ON employee_advances (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(advance_number)));
CREATE UNIQUE INDEX employee_advance_recoveries_recovery_number_normalized_unique ON employee_advance_recoveries (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(recovery_number))) WHERE recovery_number is not null;
CREATE UNIQUE INDEX salary_payments_document_number_normalized_unique ON salary_payments (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(document_number)));
CREATE UNIQUE INDEX salary_payments_one_reversal_unique ON salary_payments (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), reversal_of_payment_id) WHERE reversal_of_payment_id is not null;
CREATE UNIQUE INDEX salary_payment_allocations_item_unique ON salary_payment_allocations (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), salary_payment_id, payroll_item_id);
CREATE UNIQUE INDEX employee_ledger_source_unique ON employee_ledger_entries (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), employee_id, reference_type, reference_id);
CREATE UNIQUE INDEX expense_categories_name_normalized_unique ON expense_categories (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(name)));
CREATE UNIQUE INDEX expenses_expense_number_normalized_unique ON expenses (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(expense_number)));
CREATE UNIQUE INDEX expenses_one_reversal_unique ON expenses (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), reversal_of_expense_id) WHERE reversal_of_expense_id is not null;
CREATE UNIQUE INDEX cash_accounts_name_unique ON cash_accounts (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), name);
CREATE UNIQUE INDEX bank_accounts_account_number_unique ON bank_accounts (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), account_number);
CREATE UNIQUE INDEX customer_payments_document_number_unique ON customer_payments (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), document_number);
CREATE UNIQUE INDEX customer_payments_one_reversal_unique ON customer_payments (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), reversal_of_payment_id) WHERE reversal_of_payment_id is not null;
CREATE UNIQUE INDEX customer_payment_allocations_invoice_unique ON customer_payment_allocations (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), customer_payment_id, sales_invoice_id);
CREATE UNIQUE INDEX supplier_payments_document_number_unique ON supplier_payments (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), document_number);
CREATE UNIQUE INDEX supplier_payments_one_reversal_unique ON supplier_payments (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), reversal_of_payment_id) WHERE reversal_of_payment_id is not null;
CREATE UNIQUE INDEX supplier_payment_allocations_purchase_unique ON supplier_payment_allocations (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), supplier_payment_id, purchase_id);
CREATE UNIQUE INDEX cash_bank_movements_cash_source_effect_unique ON cash_bank_movements (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), source_type, source_id, direction, cash_account_id) WHERE source_id is not null and cash_account_id is not null;
CREATE UNIQUE INDEX cash_bank_movements_bank_source_effect_unique ON cash_bank_movements (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), source_type, source_id, direction, bank_account_id) WHERE source_id is not null and bank_account_id is not null;
CREATE UNIQUE INDEX cash_bank_movements_opening_cash_unique ON cash_bank_movements (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), cash_account_id, source_type) WHERE source_type = 'OPENING_BALANCE' and cash_account_id is not null;
CREATE UNIQUE INDEX cash_bank_movements_opening_bank_unique ON cash_bank_movements (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), bank_account_id, source_type) WHERE source_type = 'OPENING_BALANCE' and bank_account_id is not null;
CREATE UNIQUE INDEX product_categories_name_normalized_unique ON product_categories (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(name)));
CREATE UNIQUE INDEX brands_name_normalized_unique ON brands (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(name)));
CREATE UNIQUE INDEX products_sku_normalized_unique ON products (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(sku)));
CREATE UNIQUE INDEX products_barcode_unique ON products (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), barcode) WHERE barcode is not null;
CREATE UNIQUE INDEX product_units_product_unit_name_normalized_unique ON product_units (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), product_id, lower(trim(unit_name)));
CREATE UNIQUE INDEX product_units_one_base_unit_per_product_unique ON product_units (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), product_id) WHERE is_base_unit = true;
CREATE UNIQUE INDEX purchases_purchase_number_normalized_unique ON purchases (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(purchase_number))) WHERE purchase_number is not null;
CREATE UNIQUE INDEX sales_invoices_invoice_number_normalized_unique ON sales_invoices (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(invoice_number))) WHERE invoice_number is not null;
CREATE UNIQUE INDEX sales_returns_return_number_normalized_unique ON sales_returns (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(return_number)));
CREATE UNIQUE INDEX purchase_returns_return_number_normalized_unique ON purchase_returns (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(return_number)));
CREATE UNIQUE INDEX idempotency_requests_key_unique ON idempotency_requests (coalesce(admin_user_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

-- Every existing and future administrator owns a protected Walk-in Customer.
INSERT INTO customers (admin_user_id, code, name, phone, email, address, credit_limit, is_walk_in, is_active)
SELECT admin.id, 'WALK-IN', 'Walk-in Customer', NULL, NULL, NULL, '0.00', true, true
FROM admin_users AS admin
WHERE NOT EXISTS (
  SELECT 1 FROM customers
  WHERE customers.admin_user_id = admin.id AND customers.is_walk_in = true
);

CREATE OR REPLACE FUNCTION provision_admin_walk_in_customer() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO customers (admin_user_id, code, name, phone, email, address, credit_limit, is_walk_in, is_active)
  VALUES (NEW.id, 'WALK-IN', 'Walk-in Customer', NULL, NULL, NULL, '0.00', true, true);
  RETURN NEW;
END;
$$;

CREATE TRIGGER admin_users_provision_walk_in_customer
AFTER INSERT ON admin_users
FOR EACH ROW EXECUTE FUNCTION provision_admin_walk_in_customer();

-- RLS is the enforcement boundary; repositories do not need tenant filters scattered through every query.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'sales_invoices',
    'sales_invoice_items',
    'suppliers',
    'cash_accounts',
    'bank_accounts',
    'customer_payments',
    'customer_payment_splits',
    'customer_payment_allocations',
    'supplier_payments',
    'supplier_payment_splits',
    'supplier_payment_allocations',
    'cash_bank_movements',
    'cash_bank_transfers',
    'cash_reconciliations',
    'product_categories',
    'brands',
    'products',
    'product_units',
    'expense_categories',
    'expenses',
    'business_settings',
    'document_sequences',
    'customer_ledger_entries',
    'supplier_ledger_entries',
    'inventory_balances',
    'stock_movements',
    'stock_counts',
    'stock_count_items',
    'customers',
    'employees',
    'attendance_records',
    'leave_types',
    'employee_leaves',
    'payroll_runs',
    'payroll_items',
    'employee_advances',
    'employee_advance_recoveries',
    'salary_payments',
    'salary_payment_splits',
    'salary_payment_allocations',
    'employee_ledger_entries',
    'purchases',
    'purchase_items',
    'idempotency_requests',
    'import_jobs',
    'import_job_errors',
    'sales_returns',
    'sales_return_items',
    'purchase_returns',
    'purchase_return_items'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (admin_user_id = current_tenant_admin_user_id()) WITH CHECK (admin_user_id = current_tenant_admin_user_id())', table_name);
  END LOOP;
END
$$;

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_logs
  USING (admin_user_id = current_tenant_admin_user_id())
  WITH CHECK (admin_user_id = current_tenant_admin_user_id());

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'sales_invoices',
    'sales_invoice_items',
    'suppliers',
    'cash_accounts',
    'bank_accounts',
    'customer_payments',
    'customer_payment_splits',
    'customer_payment_allocations',
    'supplier_payments',
    'supplier_payment_splits',
    'supplier_payment_allocations',
    'cash_bank_movements',
    'cash_bank_transfers',
    'cash_reconciliations',
    'product_categories',
    'brands',
    'products',
    'product_units',
    'expense_categories',
    'expenses',
    'business_settings',
    'document_sequences',
    'customer_ledger_entries',
    'supplier_ledger_entries',
    'inventory_balances',
    'stock_movements',
    'stock_counts',
    'stock_count_items',
    'customers',
    'employees',
    'attendance_records',
    'leave_types',
    'employee_leaves',
    'payroll_runs',
    'payroll_items',
    'employee_advances',
    'employee_advance_recoveries',
    'salary_payments',
    'salary_payment_splits',
    'salary_payment_allocations',
    'employee_ledger_entries',
    'purchases',
    'purchase_items',
    'idempotency_requests',
    'import_jobs',
    'import_job_errors',
    'sales_returns',
    'sales_return_items',
    'purchase_returns',
    'purchase_return_items',
    'audit_logs'
  ]
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO wholesale_erp_tenant', table_name);
  END LOOP;
END
$$;

GRANT EXECUTE ON FUNCTION current_tenant_admin_user_id() TO wholesale_erp_tenant;
