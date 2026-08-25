import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createPurchaseReturnSchema,
  createSalesReturnSchema,
  listPurchaseReturnsQuerySchema,
  listSalesReturnsQuerySchema,
} from "../src/modules/returns/returns.schema.js";

const originalSaleId = "00000000-0000-4000-8000-000000000101";
const originalSaleItemId = "00000000-0000-4000-8000-000000000102";
const originalPurchaseId = "00000000-0000-4000-8000-000000000103";
const originalPurchaseItemId = "00000000-0000-4000-8000-000000000104";
const cashAccountId = "00000000-0000-4000-8000-000000000105";
const bankAccountId = "00000000-0000-4000-8000-000000000106";

const returnsServicePath = new URL(
  "../src/modules/returns/returns.service.ts",
  import.meta.url,
);
const returnsRepositoryPath = new URL(
  "../src/modules/returns/returns.repository.ts",
  import.meta.url,
);
const returnsRoutesPath = new URL(
  "../src/modules/returns/returns.routes.ts",
  import.meta.url,
);

/** Reads one Returns source file for focused integration-contract checks. */
async function readSource(path: URL): Promise<string> {
  return readFile(path, "utf8");
}

/** Builds one valid Sales Return body used by the validation tests. */
function validSalesReturn() {
  return {
    originalSaleId,
    returnDate: "2026-08-08",
    reason: "Customer returned goods.",
    refundMode: "DUE_REDUCTION" as const,
    items: [
      {
        originalSaleItemId,
        quantity: "1.000",
        stockCondition: "GOOD" as const,
      },
    ],
  };
}

/** Builds one valid Purchase Return body used by the validation tests. */
function validPurchaseReturn() {
  return {
    originalPurchaseId,
    returnDate: "2026-08-08",
    reason: "Goods returned to supplier.",
    items: [
      {
        originalPurchaseItemId,
        quantity: "1.000",
      },
    ],
  };
}

test("sales return schema accepts one confirmed return request", () => {
  assert.equal(createSalesReturnSchema.safeParse(validSalesReturn()).success, true);
});

test("purchase return schema accepts one confirmed return request", () => {
  assert.equal(
    createPurchaseReturnSchema.safeParse(validPurchaseReturn()).success,
    true,
  );
});

test("return schemas reject zero quantity", () => {
  const salesResult = createSalesReturnSchema.safeParse({
    ...validSalesReturn(),
    items: [
      {
        originalSaleItemId,
        quantity: "0.000",
        stockCondition: "GOOD",
      },
    ],
  });
  const purchaseResult = createPurchaseReturnSchema.safeParse({
    ...validPurchaseReturn(),
    items: [{ originalPurchaseItemId, quantity: "0.000" }],
  });

  assert.equal(salesResult.success, false);
  assert.equal(purchaseResult.success, false);
});

test("sales return schema accepts GOOD DAMAGED and EXPIRED stock conditions", () => {
  for (const stockCondition of ["GOOD", "DAMAGED", "EXPIRED"] as const) {
    const result = createSalesReturnSchema.safeParse({
      ...validSalesReturn(),
      items: [{ originalSaleItemId, quantity: "1.000", stockCondition }],
    });

    assert.equal(result.success, true);
  }
});

test("sales return schema rejects duplicate original sale items", () => {
  const item = {
    originalSaleItemId,
    quantity: "1.000",
    stockCondition: "GOOD" as const,
  };
  const result = createSalesReturnSchema.safeParse({
    ...validSalesReturn(),
    items: [item, item],
  });

  assert.equal(result.success, false);
});

test("purchase return schema rejects duplicate original purchase items", () => {
  const item = { originalPurchaseItemId, quantity: "1.000" };
  const result = createPurchaseReturnSchema.safeParse({
    ...validPurchaseReturn(),
    items: [item, item],
  });

  assert.equal(result.success, false);
});

test("sales return CASH refund requires only a cash account", () => {
  const validResult = createSalesReturnSchema.safeParse({
    ...validSalesReturn(),
    refundMode: "CASH",
    cashAccountId,
  });
  const invalidResult = createSalesReturnSchema.safeParse({
    ...validSalesReturn(),
    refundMode: "CASH",
    bankAccountId,
  });

  assert.equal(validResult.success, true);
  assert.equal(invalidResult.success, false);
});

test("sales return BANK_TRANSFER refund requires only a bank account", () => {
  const validResult = createSalesReturnSchema.safeParse({
    ...validSalesReturn(),
    refundMode: "BANK_TRANSFER",
    bankAccountId,
  });
  const invalidResult = createSalesReturnSchema.safeParse({
    ...validSalesReturn(),
    refundMode: "BANK_TRANSFER",
    cashAccountId,
  });

  assert.equal(validResult.success, true);
  assert.equal(invalidResult.success, false);
});

test("sales return DUE_REDUCTION rejects cash and bank accounts", () => {
  const result = createSalesReturnSchema.safeParse({
    ...validSalesReturn(),
    cashAccountId,
  });

  assert.equal(result.success, false);
});

test("return list schemas reject reversed date ranges", () => {
  assert.equal(
    listSalesReturnsQuerySchema.safeParse({
      startDate: "2026-08-10",
      endDate: "2026-08-08",
    }).success,
    false,
  );
  assert.equal(
    listPurchaseReturnsQuerySchema.safeParse({
      startDate: "2026-08-10",
      endDate: "2026-08-08",
    }).success,
    false,
  );
});

test("returns service validates original documents items and remaining quantities", async () => {
  const source = await readSource(returnsServicePath);

  assert.match(source, /lockConfirmedSaleForReturn/);
  assert.match(source, /lockConfirmedPurchaseForReturn/);
  assert.match(source, /ORIGINAL_SALE_NOT_FOUND/);
  assert.match(source, /ORIGINAL_PURCHASE_NOT_FOUND/);
  assert.match(source, /findOriginalSaleItemForReturn/);
  assert.match(source, /findOriginalPurchaseItemForReturn/);
  assert.match(source, /RETURN_ITEM_NOT_FOUND/);
  assert.match(source, /RETURN_QUANTITY_EXCEEDS_AVAILABLE/);
});

test("sales return inventory maps GOOD to SELLABLE and keeps damaged or expired separate", async () => {
  const source = await readSource(returnsServicePath);
  const inventorySection = source.slice(
    source.indexOf("function toInventoryStockCondition"),
    source.indexOf("export async function validatePreparedSalesReturnSettlement"),
  );

  assert.match(inventorySection, /condition === "GOOD"/);
  assert.match(inventorySection, /return "SELLABLE"/);
  assert.match(inventorySection, /recordSalesReturnStockIn/);
  assert.match(inventorySection, /stockCondition: toInventoryStockCondition/);
});

test("purchase return inventory always creates stock out using original cost snapshot", async () => {
  const source = await readSource(returnsServicePath);
  const inventorySection = source.slice(
    source.indexOf("export async function applyPreparedPurchaseReturnInventory"),
    source.indexOf("export async function validatePreparedPurchaseReturnPayable"),
  );

  assert.match(inventorySection, /recordPurchaseReturnStockOut/);
  assert.match(inventorySection, /quantity: item\.baseQuantity/);
  assert.match(inventorySection, /unitCost: item\.unitCostSnapshot/);
});

test("sales return settlement supports due reduction cash refund and bank refund", async () => {
  const source = await readSource(returnsServicePath);

  assert.match(source, /applyPreparedSalesReturnDueReduction/);
  assert.match(source, /writeCustomerCredit/);
  assert.match(source, /applyPreparedSalesReturnCashRefund/);
  assert.match(source, /writeCashOutflow/);
  assert.match(source, /applyPreparedSalesReturnBankRefund/);
  assert.match(source, /writeBankOutflow/);
  assert.match(source, /RETURN_REFUND_EXCEEDS_PAID_AMOUNT/);
});

test("purchase return protects supplier payable and writes the supplier debit", async () => {
  const source = await readSource(returnsServicePath);

  assert.match(source, /validatePreparedPurchaseReturnPayable/);
  assert.match(source, /PURCHASE_RETURN_EXCEEDS_SUPPLIER_PAYABLE/);
  assert.match(source, /writeSupplierDebit/);
});

test("returns repository tracks previous returned quantities by original item", async () => {
  const source = await readSource(returnsRepositoryPath);

  assert.match(source, /export async function getSalesItemReturnedQuantity/);
  assert.match(source, /eq\(salesReturnItems\.originalSaleItemId, originalSaleItemId\)/);
  assert.match(source, /export async function getPurchaseItemReturnedQuantity/);
  assert.match(
    source,
    /eq\(purchaseReturnItems\.originalPurchaseItemId, originalPurchaseItemId\)/,
  );
});

test("returns routes expose only the six approved endpoints and protect POSTs with idempotency", async () => {
  const source = await readSource(returnsRoutesPath);

  assert.match(source, /app\.get\([\s\S]*?"\/sales-returns"/);
  assert.match(source, /app\.post\([\s\S]*?"\/sales-returns"/);
  assert.match(source, /"\/sales-returns\/:id"/);
  assert.match(source, /app\.get\([\s\S]*?"\/purchase-returns"/);
  assert.match(source, /app\.post\([\s\S]*?"\/purchase-returns"/);
  assert.match(source, /"\/purchase-returns\/:id"/);
  assert.equal((source.match(/executeIdempotentMutation\(/g) ?? []).length, 2);
  assert.doesNotMatch(source, /app\.patch\(/);
  assert.doesNotMatch(source, /app\.delete\(/);
});

test("sales and purchase return creation keep all side effects in caller-owned transaction", async () => {
  const source = await readSource(returnsServicePath);

  const salesSection = source.slice(
    source.indexOf("export async function createConfirmedSalesReturnInTransaction"),
    source.indexOf("export async function createConfirmedPurchaseReturnInTransaction"),
  );
  const purchaseSection = source.slice(
    source.indexOf("export async function createConfirmedPurchaseReturnInTransaction"),
    source.indexOf("export async function listSalesReturns"),
  );

  assert.match(salesSection, /lockConfirmedSaleForReturn/);
  assert.match(salesSection, /createSalesReturn\(transaction/);
  assert.match(salesSection, /createSalesReturnItems\(/);
  assert.match(salesSection, /applyPreparedSalesReturnInventory/);
  assert.match(purchaseSection, /lockConfirmedPurchaseForReturn/);
  assert.match(purchaseSection, /createPurchaseReturn\(transaction/);
  assert.match(purchaseSection, /createPurchaseReturnItems\(/);
  assert.match(purchaseSection, /applyPreparedPurchaseReturnInventory/);
  assert.match(purchaseSection, /applyPreparedPurchaseReturnSupplierLedger/);
});

test("sales return validates settlement before reserving a document number or creating rows", async () => {
  const source = await readSource(returnsServicePath);
  const start = source.indexOf("export async function createConfirmedSalesReturnInTransaction");
  const end = source.indexOf("export async function createConfirmedPurchaseReturnInTransaction", start);
  const flow = source.slice(start, end);

  const prepareIndex = flow.indexOf("prepareSalesReturnCreation");
  const validateIndex = flow.indexOf("validatePreparedSalesReturnSettlement");
  const reserveIndex = flow.indexOf("reserveBusinessDocumentNumberInTransaction");
  const createIndex = flow.indexOf("createSalesReturn(transaction");
  const inventoryIndex = flow.indexOf("applyPreparedSalesReturnInventory");

  assert.ok(prepareIndex >= 0);
  assert.ok(validateIndex > prepareIndex);
  assert.ok(reserveIndex > validateIndex);
  assert.ok(createIndex > reserveIndex);
  assert.ok(inventoryIndex > createIndex);
});

test("purchase return validates payable before reserving a document number or creating rows", async () => {
  const source = await readSource(returnsServicePath);
  const start = source.indexOf("export async function createConfirmedPurchaseReturnInTransaction");
  const end = source.indexOf("export async function listSalesReturns", start);
  const flow = source.slice(start, end);

  const prepareIndex = flow.indexOf("preparePurchaseReturnCreation");
  const validateIndex = flow.indexOf("validatePreparedPurchaseReturnPayable");
  const reserveIndex = flow.indexOf("reserveBusinessDocumentNumberInTransaction");
  const createIndex = flow.indexOf("createPurchaseReturn(transaction");
  const inventoryIndex = flow.indexOf("applyPreparedPurchaseReturnInventory");

  assert.ok(prepareIndex >= 0);
  assert.ok(validateIndex > prepareIndex);
  assert.ok(reserveIndex > validateIndex);
  assert.ok(createIndex > reserveIndex);
  assert.ok(inventoryIndex > createIndex);
});

