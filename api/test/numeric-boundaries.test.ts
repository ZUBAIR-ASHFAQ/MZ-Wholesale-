import assert from "node:assert/strict";
import test from "node:test";

import { createCustomerSchema } from "../src/modules/customers/customers.schema.js";
import { createOpeningStockSchema } from "../src/modules/inventory/inventory.schema.js";
import { createCashAccountSchema } from "../src/modules/payments/payments.schema.js";
import {
  isMoneyWithinDatabaseRange,
  isQuantityWithinDatabaseRange,
} from "../src/shared/utils/decimal-validation.js";

const PRODUCT_ID = "00000000-0000-4000-8000-000000000001";

/** Verifies PostgreSQL numeric(14,2) money boundaries before a request reaches the database. */
test("money validation matches numeric(14,2) boundaries", () => {
  for (const value of ["0", "0.00", "1.00", "999999999999.99"]) {
    assert.equal(isMoneyWithinDatabaseRange(value), true, `${value} should fit numeric(14,2)`);
  }

  for (const value of [
    "1000000000000.00",
    "9999999999999.99",
    "1.001",
    "-1.00",
    "abc",
  ]) {
    assert.equal(isMoneyWithinDatabaseRange(value), false, `${value} should not fit numeric(14,2)`);
  }
});

/** Verifies PostgreSQL numeric(14,3) quantity boundaries before a request reaches the database. */
test("quantity validation matches numeric(14,3) boundaries", () => {
  for (const value of ["0", "0.001", "1.000", "99999999999.999"]) {
    assert.equal(isQuantityWithinDatabaseRange(value), true, `${value} should fit numeric(14,3)`);
  }

  for (const value of [
    "100000000000.000",
    "999999999999.999",
    "1.0001",
    "-1.000",
    "abc",
  ]) {
    assert.equal(isQuantityWithinDatabaseRange(value), false, `${value} should not fit numeric(14,3)`);
  }
});

/** Verifies public Zod request schemas reject oversized money values as validation errors. */
test("request Zod schemas enforce money database boundaries", () => {
  assert.equal(
    createCustomerSchema.safeParse({
      name: "Boundary Customer",
      creditLimit: "999999999999.99",
      openingBalance: "0.00",
    }).success,
    true,
  );

  assert.equal(
    createCustomerSchema.safeParse({
      name: "Boundary Customer",
      creditLimit: "1000000000000.00",
      openingBalance: "0.00",
    }).success,
    false,
  );

  assert.equal(
    createCashAccountSchema.safeParse({
      name: "Main Cash",
      openingBalance: "999999999999.99",
    }).success,
    true,
  );

  assert.equal(
    createCashAccountSchema.safeParse({
      name: "Main Cash",
      openingBalance: "1000000000000.00",
    }).success,
    false,
  );
});

/** Verifies inventory request validation rejects quantity/cost values beyond database precision. */
test("inventory Zod schema enforces quantity and money boundaries", () => {
  const validResult = createOpeningStockSchema.safeParse({
    items: [
      {
        productId: PRODUCT_ID,
        stockCondition: "SELLABLE",
        quantity: "99999999999.999",
        unitCost: "999999999999.99",
      },
    ],
  });
  assert.equal(validResult.success, true);

  const oversizedQuantity = createOpeningStockSchema.safeParse({
    items: [
      {
        productId: PRODUCT_ID,
        stockCondition: "SELLABLE",
        quantity: "100000000000.000",
        unitCost: "1.00",
      },
    ],
  });
  assert.equal(oversizedQuantity.success, false);

  const oversizedMoney = createOpeningStockSchema.safeParse({
    items: [
      {
        productId: PRODUCT_ID,
        stockCondition: "SELLABLE",
        quantity: "1.000",
        unitCost: "1000000000000.00",
      },
    ],
  });
  assert.equal(oversizedMoney.success, false);
});
