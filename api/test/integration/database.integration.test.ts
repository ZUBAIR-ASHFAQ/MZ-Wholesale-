import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";

import { Pool, type PoolClient } from "pg";

const databaseUrl = process.env.TEST_DATABASE_URL;
const shouldRun = typeof databaseUrl === "string" && databaseUrl.length > 0;
const integrationTest = shouldRun ? test : test.skip;

let pool: Pool;

before(() => {
  if (shouldRun) {
    pool = new Pool({ connectionString: databaseUrl, max: 2 });
  }
});

after(async () => {
  if (pool) {
    await pool.end();
  }
});

/** Runs one integration scenario inside a transaction that is always rolled back. */
async function withRollback(
  callback: (client: PoolClient) => Promise<void>,
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("begin");
    await callback(client);
  } finally {
    await client.query("rollback");
    client.release();
  }
}

/** Checks a PostgreSQL error code without depending on a driver-specific class. */
function isPostgresErrorWithCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

integrationTest("reviewed migrations create all Module 1 to 8 foundation tables", async () => {
  const expectedTables = [
    "business_settings",
    "document_sequences",
    "admin_users",
    "admin_sessions",
    "product_categories",
    "brands",
    "products",
    "product_units",
    "customers",
    "suppliers",
    "inventory_balances",
    "stock_movements",
    "stock_counts",
    "stock_count_items",
    "customer_ledger_entries",
    "supplier_ledger_entries",
    "cash_accounts",
    "bank_accounts",
    "customer_payments",
    "customer_payment_splits",
    "customer_payment_allocations",
    "supplier_payments",
    "supplier_payment_splits",
    "supplier_payment_allocations",
    "cash_bank_movements",
    "cash_bank_transfers",
    "cash_reconciliations",
  ];

  const result = await pool.query<{ table_name: string }>(
    `select table_name
       from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])`,
    [expectedTables],
  );

  assert.deepEqual(
    result.rows.map((row) => row.table_name).sort(),
    [...expectedTables].sort(),
  );
});

integrationTest("database transactions roll back incomplete writes", async () => {
  const code = `ROLLBACK-${Date.now()}`;

  await withRollback(async (client) => {
    await client.query(
      `insert into customers (code, name)
       values ($1, 'Rollback Test Customer')`,
      [code],
    );
  });

  const result = await pool.query(
    "select id from customers where code = $1",
    [code],
  );

  assert.equal(result.rowCount, 0);
});

integrationTest("business settings singleton is enforced by PostgreSQL", async () => {
  await withRollback(async (client) => {
    await client.query(
      `insert into business_settings
        (business_name, phone, address)
       values ('Test Wholesale', '03000000000', 'Lahore')`,
    );

    await assert.rejects(
      client.query(
        `insert into business_settings
          (business_name, phone, address)
         values ('Second Wholesale', '03111111111', 'Karachi')`,
      ),
      (error: unknown) => isPostgresErrorWithCode(error, "23505"),
    );
  });
});

integrationTest("customer ledger rejects an entry with both debit and credit", async () => {
  await withRollback(async (client) => {
    const customer = await client.query<{ id: string }>(
      `insert into customers (code, name)
       values ($1, 'Ledger Constraint Customer')
       returning id`,
      [`LEDGER-${Date.now()}`],
    );

    await assert.rejects(
      client.query(
        `insert into customer_ledger_entries
          (customer_id, occurred_at, reference_type, debit, credit)
         values ($1, now(), 'OPENING_BALANCE', 100.00, 25.00)`,
        [customer.rows[0]?.id],
      ),
      (error: unknown) => isPostgresErrorWithCode(error, "23514"),
    );
  });
});

integrationTest("a customer can have only one opening ledger balance", async () => {
  await withRollback(async (client) => {
    const customer = await client.query<{ id: string }>(
      `insert into customers (code, name)
       values ($1, 'Opening Balance Customer')
       returning id`,
      [`OPENING-${Date.now()}`],
    );
    const customerId = customer.rows[0]?.id;

    await client.query(
      `insert into customer_ledger_entries
        (customer_id, occurred_at, reference_type, debit, credit)
       values ($1, now(), 'OPENING_BALANCE', 100.00, 0.00)`,
      [customerId],
    );

    await assert.rejects(
      client.query(
        `insert into customer_ledger_entries
          (customer_id, occurred_at, reference_type, debit, credit)
         values ($1, now(), 'OPENING_BALANCE', 50.00, 0.00)`,
        [customerId],
      ),
      (error: unknown) => isPostgresErrorWithCode(error, "23505"),
    );
  });
});

integrationTest("supplier ledger rejects an entry with both debit and credit", async () => {
  await withRollback(async (client) => {
    const supplier = await client.query<{ id: string }>(
      `insert into suppliers (code, name)
       values ($1, 'Ledger Constraint Supplier')
       returning id`,
      [`SUP-LEDGER-${Date.now()}`],
    );

    await assert.rejects(
      client.query(
        `insert into supplier_ledger_entries
          (supplier_id, occurred_at, reference_type, debit, credit)
         values ($1, now(), 'OPENING_BALANCE', 100.00, 25.00)`,
        [supplier.rows[0]?.id],
      ),
      (error: unknown) => isPostgresErrorWithCode(error, "23514"),
    );
  });
});

integrationTest("ledger entries reject zero debit and zero credit", async () => {
  await withRollback(async (client) => {
    const customer = await client.query<{ id: string }>(
      `insert into customers (code, name)
       values ($1, 'Zero Ledger Customer')
       returning id`,
      [`ZERO-${Date.now()}`],
    );

    await assert.rejects(
      client.query(
        `insert into customer_ledger_entries
          (customer_id, occurred_at, reference_type, debit, credit)
         values ($1, now(), 'OPENING_BALANCE', 0.00, 0.00)`,
        [customer.rows[0]?.id],
      ),
      (error: unknown) => isPostgresErrorWithCode(error, "23514"),
    );
  });
});

integrationTest("normal ledger sources require a source id", async () => {
  await withRollback(async (client) => {
    const customer = await client.query<{ id: string }>(
      `insert into customers (code, name)
       values ($1, 'Source Validation Customer')
       returning id`,
      [`SOURCE-${Date.now()}`],
    );

    await assert.rejects(
      client.query(
        `insert into customer_ledger_entries
          (customer_id, occurred_at, reference_type, debit, credit)
         values ($1, now(), 'SALE', 100.00, 0.00)`,
        [customer.rows[0]?.id],
      ),
      (error: unknown) => isPostgresErrorWithCode(error, "23514"),
    );
  });
});

integrationTest("opening balance entries reject a source id", async () => {
  await withRollback(async (client) => {
    const supplier = await client.query<{ id: string }>(
      `insert into suppliers (code, name)
       values ($1, 'Opening Source Supplier')
       returning id`,
      [`OPEN-SOURCE-${Date.now()}`],
    );

    await assert.rejects(
      client.query(
        `insert into supplier_ledger_entries
          (supplier_id, occurred_at, reference_type, reference_id, debit, credit)
         values ($1, now(), 'OPENING_BALANCE', gen_random_uuid(), 0.00, 100.00)`,
        [supplier.rows[0]?.id],
      ),
      (error: unknown) => isPostgresErrorWithCode(error, "23514"),
    );
  });
});

integrationTest("duplicate customer source entries are rejected", async () => {
  await withRollback(async (client) => {
    const customer = await client.query<{ id: string }>(
      `insert into customers (code, name)
       values ($1, 'Duplicate Source Customer')
       returning id`,
      [`DUP-SOURCE-${Date.now()}`],
    );
    const customerId = customer.rows[0]?.id;
    const sourceId = "11111111-1111-4111-8111-111111111111";

    await client.query(
      `insert into customer_ledger_entries
        (customer_id, occurred_at, reference_type, reference_id, debit, credit)
       values ($1, now(), 'SALE', $2, 100.00, 0.00)`,
      [customerId, sourceId],
    );

    await assert.rejects(
      client.query(
        `insert into customer_ledger_entries
          (customer_id, occurred_at, reference_type, reference_id, debit, credit)
         values ($1, now(), 'SALE', $2, 50.00, 0.00)`,
        [customerId, sourceId],
      ),
      (error: unknown) => isPostgresErrorWithCode(error, "23505"),
    );
  });
});

integrationTest("supplier opening balance is unique", async () => {
  await withRollback(async (client) => {
    const supplier = await client.query<{ id: string }>(
      `insert into suppliers (code, name)
       values ($1, 'Opening Balance Supplier')
       returning id`,
      [`SUP-OPEN-${Date.now()}`],
    );
    const supplierId = supplier.rows[0]?.id;

    await client.query(
      `insert into supplier_ledger_entries
        (supplier_id, occurred_at, reference_type, debit, credit)
       values ($1, now(), 'OPENING_BALANCE', 0.00, 100.00)`,
      [supplierId],
    );

    await assert.rejects(
      client.query(
        `insert into supplier_ledger_entries
          (supplier_id, occurred_at, reference_type, debit, credit)
         values ($1, now(), 'OPENING_BALANCE', 0.00, 50.00)`,
        [supplierId],
      ),
      (error: unknown) => isPostgresErrorWithCode(error, "23505"),
    );
  });
});

integrationTest("ledger foreign keys reject unknown customer and supplier ids", async () => {
  await withRollback(async (client) => {
    const missingId = "22222222-2222-4222-8222-222222222222";

    await assert.rejects(
      client.query(
        `insert into customer_ledger_entries
          (customer_id, occurred_at, reference_type, debit, credit)
         values ($1, now(), 'OPENING_BALANCE', 100.00, 0.00)`,
        [missingId],
      ),
      (error: unknown) => isPostgresErrorWithCode(error, "23503"),
    );

    await assert.rejects(
      client.query(
        `insert into supplier_ledger_entries
          (supplier_id, occurred_at, reference_type, debit, credit)
         values ($1, now(), 'OPENING_BALANCE', 0.00, 100.00)`,
        [missingId],
      ),
      (error: unknown) => isPostgresErrorWithCode(error, "23503"),
    );
  });
});

integrationTest("customer and supplier balances follow the approved debit credit direction", async () => {
  await withRollback(async (client) => {
    const customer = await client.query<{ id: string }>(
      `insert into customers (code, name)
       values ($1, 'Balance Direction Customer')
       returning id`,
      [`BAL-C-${Date.now()}`],
    );
    const supplier = await client.query<{ id: string }>(
      `insert into suppliers (code, name)
       values ($1, 'Balance Direction Supplier')
       returning id`,
      [`BAL-S-${Date.now()}`],
    );

    await client.query(
      `insert into customer_ledger_entries
        (customer_id, occurred_at, reference_type, debit, credit)
       values
        ($1, now(), 'OPENING_BALANCE', 100.00, 0.00),
        ($1, now(), 'CUSTOMER_PAYMENT', 0.00, 25.00)`,
      [customer.rows[0]?.id],
    );

    await client.query(
      `insert into supplier_ledger_entries
        (supplier_id, occurred_at, reference_type, debit, credit)
       values
        ($1, now(), 'OPENING_BALANCE', 0.00, 100.00),
        ($1, now(), 'SUPPLIER_PAYMENT', 25.00, 0.00)`,
      [supplier.rows[0]?.id],
    );

    const customerBalance = await client.query<{ balance: string }>(
      `select (sum(debit) - sum(credit))::numeric(14,2)::text as balance
         from customer_ledger_entries
        where customer_id = $1`,
      [customer.rows[0]?.id],
    );
    const supplierBalance = await client.query<{ balance: string }>(
      `select (sum(credit) - sum(debit))::numeric(14,2)::text as balance
         from supplier_ledger_entries
        where supplier_id = $1`,
      [supplier.rows[0]?.id],
    );

    assert.equal(customerBalance.rows[0]?.balance, "75.00");
    assert.equal(supplierBalance.rows[0]?.balance, "75.00");
  });
});

integrationTest("cash payment splits reject a bank account", async () => {
  await withRollback(async (client) => {
    const customer = await client.query<{ id: string }>(
      `insert into customers (code, name)
       values ($1, 'Payment Constraint Customer')
       returning id`,
      [`PAY-CUSTOMER-${Date.now()}`],
    );
    const bank = await client.query<{ id: string }>(
      `insert into bank_accounts (bank_name, account_name, account_number)
       values ('Test Bank', 'Test Account', $1)
       returning id`,
      [`BANK-${Date.now()}`],
    );
    const payment = await client.query<{ id: string }>(
      `insert into customer_payments
        (customer_id, document_number, payment_date, total_amount)
       values ($1, $2, now(), 100.00)
       returning id`,
      [customer.rows[0]?.id, `CR-${Date.now()}`],
    );

    await assert.rejects(
      client.query(
        `insert into customer_payment_splits
          (customer_payment_id, method, amount, bank_account_id)
         values ($1, 'CASH', 100.00, $2)`,
        [payment.rows[0]?.id, bank.rows[0]?.id],
      ),
      (error: unknown) => isPostgresErrorWithCode(error, "23514"),
    );
  });
});

integrationTest("bank transfer splits reject a cash account", async () => {
  await withRollback(async (client) => {
    const supplier = await client.query<{ id: string }>(
      `insert into suppliers (code, name)
       values ($1, 'Payment Constraint Supplier')
       returning id`,
      [`PAY-SUPPLIER-${Date.now()}`],
    );
    const cash = await client.query<{ id: string }>(
      `insert into cash_accounts (name)
       values ($1)
       returning id`,
      [`Cash ${Date.now()}`],
    );
    const payment = await client.query<{ id: string }>(
      `insert into supplier_payments
        (supplier_id, document_number, payment_date, total_amount)
       values ($1, $2, now(), 100.00)
       returning id`,
      [supplier.rows[0]?.id, `SP-${Date.now()}`],
    );

    await assert.rejects(
      client.query(
        `insert into supplier_payment_splits
          (supplier_payment_id, method, amount, cash_account_id)
         values ($1, 'BANK_TRANSFER', 100.00, $2)`,
        [payment.rows[0]?.id, cash.rows[0]?.id],
      ),
      (error: unknown) => isPostgresErrorWithCode(error, "23514"),
    );
  });
});

integrationTest("cash bank movements reject duplicate source effects", async () => {
  await withRollback(async (client) => {
    const cash = await client.query<{ id: string }>(
      `insert into cash_accounts (name)
       values ($1)
       returning id`,
      [`Movement Cash ${Date.now()}`],
    );
    const sourceId = randomUUID();

    await client.query(
      `insert into cash_bank_movements
        (method, cash_account_id, direction, source_type, source_id, amount, occurred_at)
       values ('CASH', $1, 'INFLOW', 'CUSTOMER_RECEIPT', $2, 50.00, now())`,
      [cash.rows[0]?.id, sourceId],
    );

    await assert.rejects(
      client.query(
        `insert into cash_bank_movements
          (method, cash_account_id, direction, source_type, source_id, amount, occurred_at)
         values ('CASH', $1, 'INFLOW', 'CUSTOMER_RECEIPT', $2, 50.00, now())`,
        [cash.rows[0]?.id, sourceId],
      ),
      (error: unknown) => isPostgresErrorWithCode(error, "23505"),
    );
  });
});

integrationTest("transfers reject the same source and destination account", async () => {
  await withRollback(async (client) => {
    const cash = await client.query<{ id: string }>(
      `insert into cash_accounts (name)
       values ($1)
       returning id`,
      [`Transfer Cash ${Date.now()}`],
    );

    await assert.rejects(
      client.query(
        `insert into cash_bank_transfers
          (transfer_date, amount, source_method, source_cash_account_id,
           destination_method, destination_cash_account_id)
         values (now(), 25.00, 'CASH', $1, 'CASH', $1)`,
        [cash.rows[0]?.id],
      ),
      (error: unknown) => isPostgresErrorWithCode(error, "23514"),
    );
  });
});

integrationTest("confirmed cash reconciliations cannot be edited", async () => {
  await withRollback(async (client) => {
    const cash = await client.query<{ id: string }>(
      `insert into cash_accounts (name)
       values ($1)
       returning id`,
      [`Reconciliation Cash ${Date.now()}`],
    );
    const reconciliation = await client.query<{ id: string }>(
      `insert into cash_reconciliations
        (cash_account_id, reconciliation_date, system_balance,
         counted_amount, difference_amount)
       values ($1, now(), 100.00, 100.00, 0.00)
       returning id`,
      [cash.rows[0]?.id],
    );

    await client.query(
      `update cash_reconciliations
          set status = 'CONFIRMED', confirmed_at = now()
        where id = $1`,
      [reconciliation.rows[0]?.id],
    );

    await assert.rejects(
      client.query(
        `update cash_reconciliations
            set notes = 'Changed after confirmation'
          where id = $1`,
        [reconciliation.rows[0]?.id],
      ),
      (error: unknown) => isPostgresErrorWithCode(error, "23514"),
    );
  });
});
