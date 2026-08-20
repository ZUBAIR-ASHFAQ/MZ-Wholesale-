import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const inventorySchemaPath = new URL(
  "../src/database/schema/inventory.schema.ts",
  import.meta.url,
);
const inventoryValidationPath = new URL(
  "../src/modules/inventory/inventory.schema.ts",
  import.meta.url,
);
const inventoryRepositoryPath = new URL(
  "../src/modules/inventory/inventory.repository.ts",
  import.meta.url,
);
const inventoryServicePath = new URL(
  "../src/modules/inventory/inventory.service.ts",
  import.meta.url,
);
const inventoryRoutesPath = new URL(
  "../src/modules/inventory/inventory.routes.ts",
  import.meta.url,
);

const stockCountDetailPagePath = new URL(
  "../../web-admin/src/features/inventory/pages/stock-count-detail-page.tsx",
  import.meta.url,
);
const stockCountItemsTablePath = new URL(
  "../../web-admin/src/features/inventory/components/stock-count-items-table.tsx",
  import.meta.url,
);
const inventoryApiPath = new URL(
  "../../web-admin/src/features/inventory/api/inventory.api.ts",
  import.meta.url,
);
const inventoryTablePath = new URL(
  "../../web-admin/src/features/inventory/components/inventory-table.tsx",
  import.meta.url,
);

/** Reads one Inventory source file for focused contract checks. */
async function readSource(path: URL): Promise<string> {
  return readFile(path, "utf8");
}

/** Counts literal occurrences without adding a test-only dependency. */
function countOccurrences(source: string, value: string): number {
  return source.split(value).length - 1;
}

/** Verifies that one inventory balance is enforced for each product. */
test("inventory balance is unique per product", async () => {
  const source = await readSource(inventorySchemaPath);

  assert.match(
    source,
    /uniqueIndex\("inventory_balances_product_id_unique"\)\.on\(table\.productId\)/,
  );
});

/** Verifies that inventory quantities use the approved three-decimal scale. */
test("inventory quantity columns use numeric 14,3", async () => {
  const source = await readSource(inventorySchemaPath);

  assert.ok(countOccurrences(source, "precision: 14,\n      scale: 3") >= 3);
  assert.match(source, /numeric\("quantity", \{ precision: 14, scale: 3 \}\)/);
});

/** Verifies that inventory costs use the approved two-decimal scale. */
test("inventory cost columns use numeric 14,2", async () => {
  const source = await readSource(inventorySchemaPath);

  assert.match(
    source,
    /weightedAverageCost: numeric\("weighted_average_cost", \{[\s\S]*?precision: 14,[\s\S]*?scale: 2/,
  );
  assert.match(
    source,
    /damagedWeightedAverageCost: numeric\("damaged_weighted_average_cost", \{[\s\S]*?precision: 14,[\s\S]*?scale: 2/,
  );
  assert.match(
    source,
    /expiredWeightedAverageCost: numeric\("expired_weighted_average_cost", \{[\s\S]*?precision: 14,[\s\S]*?scale: 2/,
  );
  assert.match(source, /unitCost: numeric\("unit_cost", \{ precision: 14, scale: 2 \}\)/);
});

/** Verifies that database checks prevent every tracked balance from becoming negative. */
test("negative inventory balances are blocked", async () => {
  const source = await readSource(inventorySchemaPath);

  assert.match(source, /inventory_balances_sellable_non_negative_check/);
  assert.match(source, /inventory_balances_damaged_non_negative_check/);
  assert.match(source, /inventory_balances_expired_non_negative_check/);
});

/** Verifies that opening stock uses one transaction for balance and movement writes. */
test("opening stock creates balance and movement in one transaction", async () => {
  const source = await readSource(inventoryServicePath);
  const workflowSource = source.slice(
    source.indexOf("async function saveOpeningStockItem"),
    source.indexOf("export interface InventoryAdjustmentResult"),
  );

  assert.match(workflowSource, /database\.transaction\(async \(transaction\) =>/);
  assert.match(workflowSource, /saveOpeningStockItem\(\s*transaction/);
  assert.match(workflowSource, /applyStockIn\(database/);
  assert.match(workflowSource, /createStockMovement\(database/);
});

/** Verifies that opening stock fails as a unit when any item cannot be saved. */
test("opening stock is designed to roll back when one item fails", async () => {
  const source = await readSource(inventoryServicePath);
  const workflowSource = source.slice(
    source.indexOf("async function saveOpeningStockItem"),
    source.indexOf("export interface InventoryAdjustmentResult"),
  );

  assert.match(workflowSource, /for \(const item of items\)/);
  assert.match(workflowSource, /throw inventoryError\(/);
  assert.doesNotMatch(workflowSource, /catch\s*\(/);
});

/** Verifies that normal inventory activity locks later opening-stock entry. */
test("opening stock is blocked after normal transactions", async () => {
  const source = await readSource(inventoryServicePath);

  assert.match(source, /hasNormalProductTransactions\(\s*database,\s*item\.productId,?\s*\)/);
  assert.match(source, /"OPENING_STOCK_LOCKED"/);
});

/** Verifies that incoming adjustments require a positive unit cost. */
test("adjustment IN requires unit cost", async () => {
  const source = await readSource(inventoryValidationPath);

  assert.match(source, /input\.direction === "IN" && input\.unitCost === undefined/);
  assert.match(source, /Unit cost is required for an IN adjustment/);
});

/** Verifies that outgoing adjustments cannot submit an arbitrary unit cost. */
test("adjustment OUT rejects a supplied unit cost", async () => {
  const source = await readSource(inventoryValidationPath);

  assert.match(source, /input\.direction === "OUT" && input\.unitCost !== undefined/);
  assert.match(source, /Unit cost must not be provided for an OUT adjustment/);
});

/** Verifies that stock-out movements use the selected condition's saved weighted-average cost. */
test("adjustment OUT uses condition weighted-average cost", async () => {
  const source = await readSource(inventoryServicePath);

  assert.match(source, /function readConditionWeightedAverageCost/);
  assert.match(source, /return balance\.weightedAverageCost/);
  assert.match(source, /return balance\.damagedWeightedAverageCost/);
  assert.match(source, /return balance\.expiredWeightedAverageCost/);
  assert.match(source, /unitCost: readConditionWeightedAverageCost\(/);
});

/** Verifies that insufficient stock produces the approved stable error. */
test("insufficient stock is blocked", async () => {
  const source = await readSource(inventoryServicePath);

  assert.match(source, /if \(outgoingQuantity > currentQuantity\)/);
  assert.match(source, /"INSUFFICIENT_STOCK"/);
});

/** Verifies Purchase Returns reverse their original cost from the moving inventory value. */
test("purchase return recalculates weighted-average cost from the returned original cost", async () => {
  const source = await readSource(inventoryServicePath);
  const calculationSource = source.slice(
    source.indexOf("function calculateWeightedAverageCostAfterPurchaseReturn"),
    source.indexOf("/** Locks and returns one product balance", source.indexOf("function calculateWeightedAverageCostAfterPurchaseReturn")),
  );
  const stockOutSource = source.slice(
    source.indexOf("async function applyPurchaseReturnStockOut"),
    source.indexOf("/** Removes confirmed Purchase Return stock", source.indexOf("async function applyPurchaseReturnStockOut")),
  );
  const movementSource = source.slice(
    source.indexOf("export async function recordPurchaseReturnStockOut"),
    source.indexOf("/** Adds confirmed purchase stock", source.indexOf("export async function recordPurchaseReturnStockOut")),
  );

  assert.match(
    calculationSource,
    /currentQuantity \* currentCost - returnedQuantity \* returnedCost/,
  );
  assert.match(calculationSource, /remainingQuantity === 0n/);
  assert.match(calculationSource, /PURCHASE_RETURN_VALUE_EXCEEDS_INVENTORY_VALUE/);
  assert.match(stockOutSource, /weightedAverageCost/);
  assert.match(stockOutSource, /sellableQuantityOnHand/);
  assert.match(movementSource, /applyPurchaseReturnStockOut/);
  assert.doesNotMatch(movementSource, /applyStockOut/);
});

/** Verifies that damaged and expired stock keep separate quantities and weighted costs. */
test("damaged and expired stock keep condition-specific weighted costs", async () => {
  const source = await readSource(inventoryServicePath);

  assert.match(source, /stockCondition === "DAMAGED"/);
  assert.match(source, /damagedQuantityOnHand/);
  assert.match(source, /expiredQuantityOnHand/);
  assert.match(source, /damagedWeightedAverageCost/);
  assert.match(source, /expiredWeightedAverageCost/);
  assert.match(source, /conditionWeightedAverageCostChange/);
});

/** Verifies that stock movements have no update or delete repository workflow. */
test("stock movements are insert-only", async () => {
  const source = await readSource(inventoryRepositoryPath);

  assert.match(source, /export async function createStockMovement/);
  assert.doesNotMatch(source, /function updateStockMovement/);
  assert.doesNotMatch(source, /function deleteStockMovement/);
});

/** Verifies that draft stock counts can be updated. */
test("draft stock counts can be edited", async () => {
  const source = await readSource(inventoryRepositoryPath);

  assert.match(source, /export async function updateStockCount/);
  assert.match(source, /eq\(stockCounts\.status, "DRAFT"\)/);
});

/** Verifies that confirmed stock counts are rejected by the service. */
test("confirmed stock counts cannot be edited or confirmed again", async () => {
  const source = await readSource(inventoryServicePath);

  assert.ok(countOccurrences(source, '"STOCK_COUNT_ALREADY_CONFIRMED"') >= 2);
  assert.match(source, /currentStockCount\.status !== "DRAFT"/);
});

/** Verifies that positive count differences cannot create zero-cost stock in any condition. */
test("positive stock-count differences require a saved condition cost", async () => {
  const source = await readSource(inventoryServicePath);

  assert.match(source, /function requireStockCountCost/);
  assert.match(source, /decimalToScaledInteger\(unitCost, MONEY_SCALE\) <= 0n/);
  assert.match(source, /"STOCK_COUNT_COST_REQUIRED"/);
  assert.match(source, /readConditionWeightedAverageCost\(/);
  assert.match(source, /requireStockCountCost\(unitCost\)/);
});

/** Verifies that count confirmation creates immutable correction movements. */
test("stock-count confirmation creates movements", async () => {
  const source = await readSource(inventoryServicePath);
  const functionSource = source.slice(
    source.indexOf("export async function confirmStockCount"),
  );

  assert.match(functionSource, /movementType: "STOCK_COUNT"/);
  assert.match(functionSource, /createStockMovement\(transaction/);
  assert.match(functionSource, /markStockCountConfirmed\(/);
});

/** Verifies that every approved Inventory route uses authentication. */
test("all Inventory routes require authentication", async () => {
  const source = await readSource(inventoryRoutesPath);

  assert.equal(countOccurrences(source, "app.get("), 4);
  assert.equal(countOccurrences(source, "app.post("), 4);
  assert.equal(countOccurrences(source, "app.patch("), 1);
  assert.match(source, /preHandler: app\.authenticate/);
  assert.equal(countOccurrences(source, "privateRoute("), 10);
});

/** Verifies that no direct stock-editing or movement-deletion route exists. */
test("Inventory exposes no direct stock-update or movement-delete route", async () => {
  const source = await readSource(inventoryRoutesPath);

  assert.doesNotMatch(source, /app\.patch\(\s*"\/inventory\/stock/);
  assert.doesNotMatch(source, /app\.delete\(/);
  assert.doesNotMatch(source, /\/inventory\/movements\/:id/);
});

/** Verifies that stock-count item reads include product display fields. */
test("stock-count items include product display fields", async () => {
  const source = await readSource(inventoryRepositoryPath);

  assert.match(source, /productSku: products\.sku/);
  assert.match(source, /productName: products\.name/);
  assert.match(source, /baseUnitName: productUnits\.unitName/);
  assert.match(source, /innerJoin\(products/);
  assert.match(source, /innerJoin\(\s*productUnits/);
});

/** Verifies that stock-count details do not load a limited product page. */
test("stock-count detail uses item product data directly", async () => {
  const pageSource = await readSource(stockCountDetailPagePath);
  const tableSource = await readSource(stockCountItemsTablePath);

  assert.doesNotMatch(pageSource, /useProducts/);
  assert.doesNotMatch(pageSource, /pageSize:\s*100/);
  assert.match(tableSource, /item\.productSku/);
  assert.match(tableSource, /item\.productName/);
  assert.match(tableSource, /item\.baseUnitName/);
});


/** Verifies that manual adjustments use the approved reason values. */
test("adjustment reasons are standardized", async () => {
  const source = await readSource(inventoryValidationPath);

  for (const reason of [
    "FOUND_STOCK",
    "MISSING_STOCK",
    "DAMAGED",
    "EXPIRED",
    "DISPOSAL",
    "DATA_CORRECTION",
    "OTHER",
  ]) {
    assert.match(source, new RegExp(`"${reason}"`));
  }
});

/** Verifies that the OTHER adjustment reason requires explanatory notes. */
test("OTHER adjustment reason requires notes", async () => {
  const source = await readSource(inventoryValidationPath);

  assert.match(source, /input\.reason === "OTHER"/);
  assert.match(source, /Notes are required when the adjustment reason is OTHER/);
});

/** Verifies inactive products stay visible and are labelled on the Inventory screen. */
test("inventory stock response exposes product active status", async () => {
  const repositorySource = await readSource(inventoryRepositoryPath);
  const apiSource = await readSource(inventoryApiPath);
  const tableSource = await readSource(inventoryTablePath);

  assert.match(repositorySource, /isActive:\s*products\.isActive/);
  assert.match(apiSource, /isActive:\s*boolean/);
  assert.match(tableSource, /item\.isActive \? "Active" : "Inactive"/);
  assert.doesNotMatch(repositorySource, /eq\(products\.isActive, true\)/);
});


/** Verifies draft item replacement happens only after locking and status validation. */
test("draft item replacement requires a locked draft count", async () => {
  const repositorySource = await readSource(inventoryRepositoryPath);
  const serviceSource = await readSource(inventoryServicePath);

  assert.match(
    repositorySource,
    /replaceItemsForLockedDraftCount/,
  );
  assert.doesNotMatch(repositorySource, /replaceDraftStockCountItems/);

  const lockIndex = serviceSource.indexOf("lockStockCountById(");
  const statusIndex = serviceSource.indexOf('currentStockCount.status !== "DRAFT"');
  const replaceIndex = serviceSource.indexOf("replaceItemsForLockedDraftCount(");

  assert.ok(lockIndex >= 0);
  assert.ok(statusIndex > lockIndex);
  assert.ok(replaceIndex > statusIndex);
});


/** Verifies that fixed movement types cannot be saved with the wrong direction. */
test("fixed stock movement directions are validated", async () => {
  const source = await readSource(inventoryServicePath);

  assert.match(source, /function validateMovementDirection/);
  assert.match(source, /OPENING_STOCK: "IN"/);
  assert.match(source, /PURCHASE: "IN"/);
  assert.match(source, /SALE: "OUT"/);
  assert.match(source, /SALES_RETURN: "IN"/);
  assert.match(source, /PURCHASE_RETURN: "OUT"/);
  assert.match(source, /DISPOSAL: "OUT"/);
  assert.match(source, /INVALID_STOCK_MOVEMENT_DIRECTION/);
});

/** Verifies that every current movement workflow validates direction before insertion. */
test("Inventory validates movement direction before every movement insert", async () => {
  const source = await readSource(inventoryServicePath);

  assert.equal(
    countOccurrences(source, "validateMovementDirection(movementInput);"),
    countOccurrences(source, "createStockMovement("),
  );
});


/** Verifies identical idempotent retries replay the saved response instead of running again. */
test("idempotent Inventory retries replay the original response", async () => {
  const helper = await readSource(
    new URL("../src/shared/http/idempotency.ts", import.meta.url),
  );

  assert.match(helper, /existing\.status === "COMPLETED"/);
  assert.match(helper, /statusCode: existing\.responseStatus/);
  assert.match(helper, /body: existing\.responseBody/);
  assert.match(helper, /\.onConflictDoNothing\(\{ target: idempotencyRequests\.key \}\)/);
});

/** Verifies one idempotency key cannot be reused for a different request. */
test("idempotency keys reject different request bodies", async () => {
  const helper = await readSource(
    new URL("../src/shared/http/idempotency.ts", import.meta.url),
  );

  assert.match(helper, /existing\.requestHash !== requestHash/);
  assert.match(helper, /"IDEMPOTENCY_KEY_REUSED"/);
  assert.match(helper, /createRequestHash\(input\.body\)/);
});

/** Verifies authentication and manual retries preserve caller-owned Inventory keys. */
test("Inventory retries preserve one idempotency key per user operation", async () => {
  const apiClient = await readSource(
    new URL("../../web-admin/src/lib/api-client.ts", import.meta.url),
  );
  const inventoryApi = await readSource(inventoryApiPath);
  const openingForm = await readSource(
    new URL("../../web-admin/src/features/inventory/components/opening-stock-form.tsx", import.meta.url),
  );
  const adjustmentForm = await readSource(
    new URL("../../web-admin/src/features/inventory/components/inventory-adjustment-form.tsx", import.meta.url),
  );
  const countPage = await readSource(stockCountDetailPagePath);

  assert.match(apiClient, /result = await sendRequest\(path, options\)/);
  assert.equal(countOccurrences(apiClient, "sendRequest(path, options)"), 4);
  assert.match(inventoryApi, /"Idempotency-Key": idempotencyKey/);
  assert.doesNotMatch(inventoryApi, /crypto\.randomUUID/);
  assert.match(openingForm, /useRef\(crypto\.randomUUID\(\)\)/);
  assert.match(openingForm, /idempotencyKey: idempotencyKey\.current/);
  assert.match(adjustmentForm, /idempotencyKey: idempotencyKey\.current/);
  assert.match(countPage, /idempotencyKey: confirmationKey\.current/);
});

/** Verifies stock-count product names come from joined item data without a page-size limit. */
test("large stock counts do not depend on a limited product list", async () => {
  const repositorySource = await readSource(inventoryRepositoryPath);
  const pageSource = await readSource(stockCountDetailPagePath);

  assert.match(repositorySource, /productSku: products\.sku/);
  assert.match(repositorySource, /productName: products\.name/);
  assert.doesNotMatch(pageSource, /pageSize:\s*100/);
  assert.doesNotMatch(pageSource, /useProducts/);
});

/** Verifies positive count differences use the saved cost for their stock condition. */
test("positive stock-count differences use existing condition weighted cost", async () => {
  const source = await readSource(inventoryServicePath);

  assert.match(source, /unitCost = readConditionWeightedAverageCost\(/);
  assert.match(source, /requireStockCountCost\(unitCost\)/);
  assert.match(source, /applyStockIn\(transaction,\s*balance,\s*\{/);
});

/** Verifies Inventory keeps inactive historical products visible. */
test("inactive historical products remain visible in Inventory", async () => {
  const repositorySource = await readSource(inventoryRepositoryPath);
  const tableSource = await readSource(inventoryTablePath);

  assert.match(repositorySource, /isActive: products\.isActive/);
  assert.doesNotMatch(repositorySource, /where\(eq\(products\.isActive, true\)\)/);
  assert.match(tableSource, /item\.isActive \? "Active" : "Inactive"/);
});

/** Verifies every current adjustment reason is stable and report-friendly. */
test("adjustment reason values remain stable", async () => {
  const source = await readSource(inventoryValidationPath);
  const expectedReasons = [
    "FOUND_STOCK",
    "MISSING_STOCK",
    "DAMAGED",
    "EXPIRED",
    "DISPOSAL",
    "DATA_CORRECTION",
    "OTHER",
  ];

  for (const reason of expectedReasons) {
    assert.equal(countOccurrences(source, `"${reason}"`) >= 1, true);
  }
});

/** Verifies Inventory movement mutation queries remain inaccessible from other modules. */
test("Inventory movement writers remain behind the Inventory service", async () => {
  const repositorySource = await readSource(inventoryRepositoryPath);
  const serviceSource = await readSource(inventoryServicePath);

  assert.match(repositorySource, /export async function createStockMovement/);
  assert.match(serviceSource, /validateMovementDirection\(movementInput\)/);
  assert.match(serviceSource, /createStockMovement\(/);
});

// Module 11 Pass 12: Sales Returns must restore stock to the correct condition.
test("Sales Return stock-in uses the immutable Sales Return movement and condition", async () => {
  const inventorySource = await readFile(
    new URL("../src/modules/inventory/inventory.service.ts", import.meta.url),
    "utf8",
  );
  const returnsSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(inventorySource, /recordSalesReturnStockIn/);
  assert.match(inventorySource, /movementType: "SALES_RETURN"/);
  assert.match(inventorySource, /direction: "IN"/);
  assert.match(inventorySource, /stockCondition: input\.stockCondition/);
  assert.match(returnsSource, /condition === "GOOD"/);
  assert.match(returnsSource, /return "SELLABLE"/);
  assert.match(returnsSource, /unitCost: item\.unitCostSnapshot/);
});
