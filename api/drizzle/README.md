# Database migrations

The files in this directory are reviewed forward-only PostgreSQL migrations. Apply them in numeric order.

Do not edit a migration after it has been applied to a shared database. Create a new migration for every later schema change.

## Migration order

| File | Purpose |
|---|---|
| `0000_module_1_business_settings.sql` | Business settings, document type enum, and document sequences |
| `0001_module_2_admin_auth.sql` | Single administrator and refresh-session storage |
| `0002_module_3_product_management.sql` | Categories, brands, products, and product units |
| `0003_module_4_customer_management.sql` | Customer master data and protected Walk-in Customer rules |
| `0004_product_unit_source_of_truth.sql` | Product-unit source-of-truth corrections |
| `0005_module_5_supplier_management.sql` | Supplier master data |
| `0006_remove_unused_phone_indexes.sql` | Removes B-tree phone indexes that do not support leading-wildcard searches |
| `0007_module_6_inventory_management.sql` | Inventory balances, immutable movements, stock counts, and stock-count items |
| `0008_inventory_idempotency.sql` | Idempotency storage for protected inventory mutations |
| `0009_module_7_ledgers.sql` | Customer and supplier immutable ledger entries |
| `0010_module_8_payment_foundation.sql` | Cash/bank accounts, payments, allocations, movements, transfers, and reconciliations |
| `0011_module_9_purchase_management.sql` | Purchase headers/items and direct supplier-payment allocation to purchases |
| `0012_module_10_counter_sales.sql` | Sales invoice headers/items and direct customer-payment allocation to sales invoices |
| `0013_module_11_returns.sql` | Sales/purchase return headers and items with source, party, product, unit, and refund-account relationships |
| `0014_module_12_expense_management.sql` | Expense categories and immutable expenses with direct cash/bank and reversal relationships |
| `0015_module_12_expense_movement_sources.sql` | Adds immutable EXPENSE and EXPENSE_REVERSAL cash/bank movement source types |
| `0016_module_15_import_jobs.sql` | Import jobs, import statuses, row totals, and row-level validation errors |
| `0017_module_15_validated_import_snapshot.sql` | Stores the validated import snapshot used by the later confirmation request |
| `0018_module_15_audit_logs.sql` | Read-only audit-log persistence for important admin/business actions |
| `0019_module_15_failed_login_audit.sql` | Allows failed-login audit rows that cannot reference an authenticated admin user |
| `0020_remove_supplier_tax_id.sql` | Removes the retired Supplier Tax ID column |
| `0021_remove_customer_tax_id.sql` | Removes the retired Customer Tax ID column |
| `0022_inventory_condition_weighted_costs.sql` | Preserves condition-specific inventory weighted costs |
| `0023_module_16_employee_foundation.sql` | Employee, attendance, leave, advance, payroll, salary-payment, and employee-ledger foundation |
| `0024_module_16_employee_infrastructure.sql` | Employee document sequences and cash/bank movement source registrations |

Modules 13 (Reports) and 14 (Dashboard) are read-only and therefore add no database tables or migrations. Module 16 adds the Employee Management foundation and its minimum shared financial infrastructure.

## Review checklist

Before deployment, verify that each new migration:

1. Runs successfully on an empty database after all earlier migrations.
2. Runs successfully against a copy of the current production schema.
3. Uses UUID primary keys and direct UUID foreign keys for direct relationships.
4. Uses `numeric(14,2)` for money and `numeric(14,3)` for quantities.
5. Adds only indexes required by real query patterns.
6. Adds database constraints for important invariants.
7. Contains no passwords, tokens, administrator credentials, or customer business data.
8. Does not modify already-confirmed business records.

## Deployment note

Use `pnpm db:migrate` in development or `pnpm db:migrate:production` after a production build. Always back up the database and review new SQL before deployment.

## Migration metadata policy

This project uses reviewed forward-only SQL migrations. The Drizzle journal in `meta/_journal.json` must stay in the same order as the numbered SQL files because the runtime migrator reads that history when applying migrations.

The older snapshot files in `meta/` are kept as historical Drizzle Kit metadata. Later migrations were added as reviewed custom SQL, so do not create or edit snapshot JSON files by hand.

For future schema changes:

1. Run `pnpm db:generate` to create a custom migration entry.
2. Write the required SQL in the generated migration file.
3. Review the SQL before committing it.
4. Run `pnpm db:check` to verify journal/file order and detect missing or orphaned SQL files.
5. Run the normal project checks before deployment.

Never use `drizzle-kit push` against production.
