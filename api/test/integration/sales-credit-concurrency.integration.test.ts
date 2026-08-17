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
    pool = new Pool({ connectionString: databaseUrl, max: 4 });
  }
});

after(async () => {
  if (pool) {
    await pool.end();
  }
});

/** Converts one numeric(14,2) database value to exact integer cents. */
function moneyToCents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
}

/** Reads the exact customer due from immutable ledger entries. */
async function readCustomerDue(
  client: PoolClient,
  customerId: string,
): Promise<bigint> {
  const result = await client.query<{ due: string }>(
    `select coalesce(sum(debit - credit), 0)::text as due
       from customer_ledger_entries
      where customer_id = $1`,
    [customerId],
  );

  return moneyToCents(result.rows[0]?.due ?? "0.00");
}

/** Simulates the sale-confirmation credit check while holding the customer row lock. */
async function attemptCreditSale(
  customerId: string,
  saleAmountCents: bigint,
): Promise<"CONFIRMED" | "CREDIT_LIMIT_EXCEEDED"> {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const customerResult = await client.query<{ credit_limit: string }>(
      `select credit_limit
         from customers
        where id = $1
        for update`,
      [customerId],
    );
    const creditLimitCents = moneyToCents(
      customerResult.rows[0]?.credit_limit ?? "0.00",
    );
    const currentDueCents = await readCustomerDue(client, customerId);

    if (currentDueCents + saleAmountCents > creditLimitCents) {
      await client.query("rollback");
      return "CREDIT_LIMIT_EXCEEDED";
    }

    await client.query(
      `insert into customer_ledger_entries
        (customer_id, occurred_at, reference_type, reference_id, debit, credit)
       values ($1, now(), 'SALE', $2, $3, 0.00)`,
      [
        customerId,
        randomUUID(),
        `${saleAmountCents / 100n}.${(saleAmountCents % 100n)
          .toString()
          .padStart(2, "0")}`,
      ],
    );

    await client.query("commit");
    return "CONFIRMED";
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

integrationTest("customer row lock prevents concurrent sales from exceeding the credit limit", async () => {
  const customerId = randomUUID();
  const customerCode = `CREDIT-${Date.now()}-${randomUUID().slice(0, 8)}`;

  try {
    await pool.query(
      `insert into customers (id, code, name, credit_limit, is_walk_in, is_active)
       values ($1, $2, 'Concurrent Credit Customer', 100000.00, false, true)`,
      [customerId, customerCode],
    );

    await pool.query(
      `insert into customer_ledger_entries
        (customer_id, occurred_at, reference_type, debit, credit)
       values ($1, now(), 'OPENING_BALANCE', 90000.00, 0.00)`,
      [customerId],
    );

    const results = await Promise.all([
      attemptCreditSale(customerId, 800000n),
      attemptCreditSale(customerId, 800000n),
    ]);

    assert.deepEqual(
      [...results].sort(),
      ["CONFIRMED", "CREDIT_LIMIT_EXCEEDED"].sort(),
    );

    const finalDueResult = await pool.query<{ due: string }>(
      `select coalesce(sum(debit - credit), 0)::text as due
         from customer_ledger_entries
        where customer_id = $1`,
      [customerId],
    );

    assert.equal(finalDueResult.rows[0]?.due, "98000.00");
  } finally {
    await pool.query(
      "delete from customer_ledger_entries where customer_id = $1",
      [customerId],
    );
    await pool.query("delete from customers where id = $1", [customerId]);
  }
});
