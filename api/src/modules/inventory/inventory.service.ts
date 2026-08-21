import { randomUUID } from "node:crypto";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { AppError } from "../../shared/errors/app-error.js";
import {
  businessDateInKarachi,
  isBusinessDateNotFuture,
} from "../../shared/utils/business-date.js";
import {
  acquireInventoryProductLock,
  createInventoryBalance,
  countInventoryBalances,
  countProductMovements,
  countStockCounts,
  createStockCount,
  createStockCountItems,
  createStockMovement,
  findInventoryBalanceByProductId,
  findInventoryProductById,
  findLatestProductMovementBusinessDate,
  findStockCountById,
  findStockCountItems,
  hasNormalProductTransactions,
  listInventoryBalances as readInventoryBalances,
  listProductMovements as readProductMovements,
  listStockCounts as readStockCounts,
  lockStockCountById,
  markStockCountConfirmed,
  replaceItemsForLockedDraftCount,
  updateStockCount as saveStockCountChanges,
  lockInventoryBalanceByProductId,
  updateInventoryBalance,
  updateStockCountItemSnapshot,
  type InventoryBalanceChanges,
  type InventoryBalanceRecord,
  type InventoryStockRecord,
  type InventoryDatabase,
  type NewStockCountItem,
  type NewStockMovement,
  type StockCountItemDetail,
  type StockCountRecord,
  type StockMovementRecord,
} from "./inventory.repository.js";
import type {
  CreateAdjustmentInput,
  CreateOpeningStockInput,
  CreateStockCountInput,
  ListInventoryQuery,
  ListProductMovementsQuery,
  ListStockCountsQuery,
  UpdateStockCountInput,
} from "./inventory.schema.js";

/** Identifies one separately tracked inventory quantity. */
export type InventoryStockCondition = CreateAdjustmentInput["stockCondition"];

export interface InventoryBalanceChangeResult {
  balance: InventoryBalanceRecord;
  unitCost: string;
}

export interface PaginatedInventoryStock {
  items: InventoryStockRecord[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PaginatedProductMovements {
  items: StockMovementRecord[];
  page: number;
  pageSize: number;
  total: number;
}

/** Lists the inventory stock. */
export async function listInventoryStock(
  database: InventoryDatabase,
  query: ListInventoryQuery,
): Promise<PaginatedInventoryStock> {
  const [items, total] = await Promise.all([
    readInventoryBalances(database, query),
    countInventoryBalances(database, query),
  ]);

  return { items, page: query.page, pageSize: query.pageSize, total };
}

/** Loads the product movements. */
export async function getProductMovements(
  database: InventoryDatabase,
  productId: string,
  query: ListProductMovementsQuery,
): Promise<PaginatedProductMovements> {
  const product = await findInventoryProductById(database, productId);

  if (!product) {
    throw inventoryError(
      "PRODUCT_NOT_FOUND",
      "Product was not found.",
      404,
    );
  }

  const [items, total] = await Promise.all([
    readProductMovements(database, productId, query),
    countProductMovements(database, productId, query),
  ]);

  return { items, page: query.page, pageSize: query.pageSize, total };
}

const QUANTITY_SCALE = 3;
const COST_SCALE = 14;

/** Creates a consistent application error for inventory operations. */
function inventoryError(
  code: string,
  message: string,
  statusCode = 400,
): AppError {
  return new AppError(code, message, statusCode);
}

/** Trims optional text and converts an empty value to null. */
function optionalText(value: string | undefined): string | null {
  return value ?? null;
}

/** Validates fixed movement directions before an immutable movement is saved. */
function validateMovementDirection(
  movement: Pick<NewStockMovement, "movementType" | "direction">,
): void {
  const requiredDirections: Partial<
    Record<NewStockMovement["movementType"], NewStockMovement["direction"]>
  > = {
    OPENING_STOCK: "IN",
    PURCHASE: "IN",
    SALE: "OUT",
    SALES_RETURN: "IN",
    PURCHASE_RETURN: "OUT",
    DISPOSAL: "OUT",
  };
  const requiredDirection = requiredDirections[movement.movementType];

  if (requiredDirection && movement.direction !== requiredDirection) {
    throw inventoryError(
      "INVALID_STOCK_MOVEMENT_DIRECTION",
      `${movement.movementType} movements must use direction ${requiredDirection}.`,
      500,
    );
  }
}

/** Creates the required movement. */
async function createRequiredMovement(
  database: InventoryDatabase,
  input: NewStockMovement,
  errorCode: string,
  errorMessage: string,
): Promise<StockMovementRecord> {
  validateMovementDirection(input);
  const movement = await createStockMovement(database, input);

  if (!movement) {
    throw inventoryError(errorCode, errorMessage, 500);
  }

  return movement;
}

/** Converts a validated decimal string to a scaled integer without losing precision. */
function decimalToScaledInteger(value: string, scale: number): bigint {
  const [wholePart, fractionPart = ""] = value.split(".");
  const paddedFraction = fractionPart.padEnd(scale, "0").slice(0, scale);
  return BigInt(wholePart) * 10n ** BigInt(scale) + BigInt(paddedFraction || "0");
}

/** Converts a scaled integer back to a fixed decimal string. */
function scaledIntegerToDecimal(value: bigint, scale: number): string {
  const divisor = 10n ** BigInt(scale);
  const wholePart = value / divisor;
  const fractionPart = (value % divisor).toString().padStart(scale, "0");
  return `${wholePart}.${fractionPart}`;
}

/** Rounds a positive fraction to the nearest whole integer using half-up rounding. */
function divideAndRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw inventoryError(
      "INVALID_INVENTORY_CALCULATION",
      "Inventory calculation used an invalid quantity.",
      500,
    );
  }

  return (numerator + denominator / 2n) / denominator;
}

/** Reads the condition quantity. */
function readConditionQuantity(
  balance: InventoryBalanceRecord,
  stockCondition: InventoryStockCondition,
): string {
  if (stockCondition === "SELLABLE") {
    return balance.sellableQuantityOnHand;
  }

  if (stockCondition === "DAMAGED") {
    return balance.damagedQuantityOnHand;
  }

  return balance.expiredQuantityOnHand;
}

/** Reads the weighted-average cost for one stock condition. */
function readConditionWeightedAverageCost(
  balance: InventoryBalanceRecord,
  stockCondition: InventoryStockCondition,
): string {
  if (stockCondition === "SELLABLE") {
    return balance.weightedAverageCost;
  }

  if (stockCondition === "DAMAGED") {
    return balance.damagedWeightedAverageCost;
  }

  return balance.expiredWeightedAverageCost;
}

/** Calculates how a movement changes the selected stock-condition quantity. */
function conditionQuantityChange(
  stockCondition: InventoryStockCondition,
  quantity: string,
): InventoryBalanceChanges {
  if (stockCondition === "SELLABLE") {
    return { sellableQuantityOnHand: quantity };
  }

  if (stockCondition === "DAMAGED") {
    return { damagedQuantityOnHand: quantity };
  }

  return { expiredQuantityOnHand: quantity };
}

/** Selects the weighted-average cost column for one stock condition. */
function conditionWeightedAverageCostChange(
  stockCondition: InventoryStockCondition,
  weightedAverageCost: string,
): InventoryBalanceChanges {
  if (stockCondition === "SELLABLE") {
    return { weightedAverageCost };
  }

  if (stockCondition === "DAMAGED") {
    return { damagedWeightedAverageCost: weightedAverageCost };
  }

  return { expiredWeightedAverageCost: weightedAverageCost };
}

/** Calculates weighted-average cost for incoming stock in one condition. */
export function calculateWeightedAverageCost(input: {
  currentQuantity: string;
  currentCost: string;
  incomingQuantity: string;
  incomingCost: string;
}): string {
  const currentQuantity = decimalToScaledInteger(
    input.currentQuantity,
    QUANTITY_SCALE,
  );
  const incomingQuantity = decimalToScaledInteger(
    input.incomingQuantity,
    QUANTITY_SCALE,
  );
  const totalQuantity = currentQuantity + incomingQuantity;

  if (totalQuantity <= 0n) {
    return "0.00000000000000";
  }

  const currentCost = decimalToScaledInteger(input.currentCost, COST_SCALE);
  const incomingCost = decimalToScaledInteger(input.incomingCost, COST_SCALE);
  const totalValue =
    currentQuantity * currentCost + incomingQuantity * incomingCost;
  const weightedCost = divideAndRound(totalValue, totalQuantity);

  return scaledIntegerToDecimal(weightedCost, COST_SCALE);
}

/** Reverses returned purchase value from sellable stock and recalculates weighted-average cost. */
function calculateWeightedAverageCostAfterPurchaseReturn(input: {
  currentQuantity: string;
  currentCost: string;
  returnedQuantity: string;
  returnedCost: string;
}): string {
  const currentQuantity = decimalToScaledInteger(
    input.currentQuantity,
    QUANTITY_SCALE,
  );
  const returnedQuantity = decimalToScaledInteger(
    input.returnedQuantity,
    QUANTITY_SCALE,
  );

  if (returnedQuantity > currentQuantity) {
    throw inventoryError(
      "INSUFFICIENT_STOCK",
      "The requested quantity is greater than the available stock.",
      409,
    );
  }

  const remainingQuantity = currentQuantity - returnedQuantity;

  if (remainingQuantity === 0n) {
    return "0.00000000000000";
  }

  const currentCost = decimalToScaledInteger(input.currentCost, COST_SCALE);
  const returnedCost = decimalToScaledInteger(input.returnedCost, COST_SCALE);
  const remainingValue =
    currentQuantity * currentCost - returnedQuantity * returnedCost;

  if (remainingValue < 0n) {
    throw inventoryError(
      "PURCHASE_RETURN_VALUE_EXCEEDS_INVENTORY_VALUE",
      "Purchase Return value is greater than the current sellable inventory value.",
      409,
    );
  }

  const weightedCost = divideAndRound(remainingValue, remainingQuantity);
  return scaledIntegerToDecimal(weightedCost, COST_SCALE);
}

/** Locks and returns one product balance, creating the zero row when missing. */
export async function getOrCreateLockedBalance(
  database: InventoryDatabase,
  productId: string,
): Promise<InventoryBalanceRecord> {
  await acquireInventoryProductLock(database, productId);

  const existingBalance = await lockInventoryBalanceByProductId(
    database,
    productId,
  );

  if (existingBalance) {
    return existingBalance;
  }

  const createdBalance = await createInventoryBalance(database, { productId });

  if (!createdBalance) {
    throw inventoryError(
      "INVENTORY_BALANCE_CREATE_FAILED",
      "Inventory balance could not be created.",
      500,
    );
  }

  return createdBalance;
}

/** Adds stock to one condition and updates that condition's weighted-average cost. */
export async function applyStockIn(
  database: InventoryDatabase,
  balance: InventoryBalanceRecord,
  input: {
    stockCondition: InventoryStockCondition;
    quantity: string;
    unitCost: string;
  },
): Promise<InventoryBalanceChangeResult> {
  const currentQuantityValue = readConditionQuantity(
    balance,
    input.stockCondition,
  );
  const currentQuantity = decimalToScaledInteger(
    currentQuantityValue,
    QUANTITY_SCALE,
  );
  const incomingQuantity = decimalToScaledInteger(input.quantity, QUANTITY_SCALE);
  const newQuantity = scaledIntegerToDecimal(
    currentQuantity + incomingQuantity,
    QUANTITY_SCALE,
  );
  const weightedAverageCost = calculateWeightedAverageCost({
    currentQuantity: currentQuantityValue,
    currentCost: readConditionWeightedAverageCost(
      balance,
      input.stockCondition,
    ),
    incomingQuantity: input.quantity,
    incomingCost: input.unitCost,
  });
  const changes = {
    ...conditionQuantityChange(input.stockCondition, newQuantity),
    ...conditionWeightedAverageCostChange(
      input.stockCondition,
      weightedAverageCost,
    ),
  };

  const updatedBalance = await updateInventoryBalance(
    database,
    balance.productId,
    changes,
  );

  if (!updatedBalance) {
    throw inventoryError(
      "INVENTORY_BALANCE_UPDATE_FAILED",
      "Inventory balance could not be updated.",
      500,
    );
  }

  return {
    balance: updatedBalance,
    unitCost: input.unitCost,
  };
}

/** Removes stock from one condition and blocks a negative balance. */
export async function applyStockOut(
  database: InventoryDatabase,
  balance: InventoryBalanceRecord,
  input: {
    stockCondition: InventoryStockCondition;
    quantity: string;
  },
): Promise<InventoryBalanceChangeResult> {
  const currentQuantity = decimalToScaledInteger(
    readConditionQuantity(balance, input.stockCondition),
    QUANTITY_SCALE,
  );
  const outgoingQuantity = decimalToScaledInteger(input.quantity, QUANTITY_SCALE);

  if (outgoingQuantity > currentQuantity) {
    throw inventoryError(
      "INSUFFICIENT_STOCK",
      "The requested quantity is greater than the available stock.",
      409,
    );
  }

  const newQuantity = scaledIntegerToDecimal(
    currentQuantity - outgoingQuantity,
    QUANTITY_SCALE,
  );
  const updatedBalance = await updateInventoryBalance(
    database,
    balance.productId,
    conditionQuantityChange(input.stockCondition, newQuantity),
  );

  if (!updatedBalance) {
    throw inventoryError(
      "INVENTORY_BALANCE_UPDATE_FAILED",
      "Inventory balance could not be updated.",
      500,
    );
  }

  return {
    balance: updatedBalance,
    unitCost: readConditionWeightedAverageCost(
      balance,
      input.stockCondition,
    ),
  };
}

/** Prevents dated stock writes from being inserted before already-applied product state. */
async function requireChronologicalStockMovement(
  database: InventoryDatabase,
  productId: string,
  occurredAt: Date,
): Promise<void> {
  const latestBusinessDate = await findLatestProductMovementBusinessDate(
    database,
    productId,
  );
  const movementBusinessDate = businessDateInKarachi(occurredAt);

  if (latestBusinessDate && movementBusinessDate < latestBusinessDate) {
    throw inventoryError(
      "BACKDATED_STOCK_MOVEMENT",
      `Stock-changing transactions for this product cannot be dated before ${latestBusinessDate}.`,
      409,
    );
  }
}

/** Removes confirmed sale stock and records its immutable SALE movement. */
export async function recordSaleStockOut(
  database: InventoryDatabase,
  input: {
    productId: string;
    quantity: string;
    saleId: string;
    occurredAt: Date;
  },
): Promise<StockMovementRecord> {
  await requireActiveInventoryProduct(database, input.productId, "Sale confirmation");

  const balance = await getOrCreateLockedBalance(database, input.productId);
  await requireChronologicalStockMovement(
    database,
    input.productId,
    input.occurredAt,
  );
  const stockResult = await applyStockOut(database, balance, {
    stockCondition: "SELLABLE",
    quantity: input.quantity,
  });

  return createRequiredMovement(
    database,
    {
      productId: input.productId,
      movementType: "SALE",
      stockCondition: "SELLABLE",
      direction: "OUT",
      quantity: input.quantity,
      unitCost: stockResult.unitCost,
      allocatedExtraCost: null,
      sourceType: "SALE",
      sourceId: input.saleId,
      reason: "Sale confirmation",
      notes: null,
      occurredAt: input.occurredAt,
    },
    "SALE_STOCK_OUT_FAILED",
    "Sale stock movement could not be created.",
  );
}

/** Adds confirmed Sales Return stock to the correct condition and records an immutable movement. */
export async function recordSalesReturnStockIn(
  database: InventoryDatabase,
  input: {
    productId: string;
    quantity: string;
    stockCondition: InventoryStockCondition;
    unitCost: string;
    salesReturnId: string;
    occurredAt: Date;
  },
): Promise<StockMovementRecord> {
  const balance = await getOrCreateLockedBalance(database, input.productId);
  await requireChronologicalStockMovement(
    database,
    input.productId,
    input.occurredAt,
  );

  await applyStockIn(database, balance, {
    stockCondition: input.stockCondition,
    quantity: input.quantity,
    unitCost: input.unitCost,
  });

  return createRequiredMovement(
    database,
    {
      productId: input.productId,
      movementType: "SALES_RETURN",
      stockCondition: input.stockCondition,
      direction: "IN",
      quantity: input.quantity,
      unitCost: input.unitCost,
      allocatedExtraCost: null,
      sourceType: "SALES_RETURN",
      sourceId: input.salesReturnId,
      reason: "Sales Return confirmation",
      notes: null,
      occurredAt: input.occurredAt,
    },
    "SALES_RETURN_STOCK_IN_FAILED",
    "Sales Return stock movement could not be created.",
  );
}

/** Removes Purchase Return stock value and quantity from the locked sellable balance. */
async function applyPurchaseReturnStockOut(
  database: InventoryDatabase,
  balance: InventoryBalanceRecord,
  input: { quantity: string; unitCost: string },
): Promise<InventoryBalanceRecord> {
  const weightedAverageCost = calculateWeightedAverageCostAfterPurchaseReturn({
    currentQuantity: balance.sellableQuantityOnHand,
    currentCost: balance.weightedAverageCost,
    returnedQuantity: input.quantity,
    returnedCost: input.unitCost,
  });
  const currentQuantity = decimalToScaledInteger(
    balance.sellableQuantityOnHand,
    QUANTITY_SCALE,
  );
  const returnedQuantity = decimalToScaledInteger(input.quantity, QUANTITY_SCALE);
  const sellableQuantityOnHand = scaledIntegerToDecimal(
    currentQuantity - returnedQuantity,
    QUANTITY_SCALE,
  );
  const updatedBalance = await updateInventoryBalance(database, balance.productId, {
    sellableQuantityOnHand,
    weightedAverageCost,
  });

  if (!updatedBalance) {
    throw inventoryError(
      "INVENTORY_BALANCE_UPDATE_FAILED",
      "Inventory balance could not be updated.",
      500,
    );
  }

  return updatedBalance;
}

/** Removes confirmed Purchase Return stock and records its immutable PURCHASE_RETURN movement. */
export async function recordPurchaseReturnStockOut(
  database: InventoryDatabase,
  input: {
    productId: string;
    quantity: string;
    unitCost: string;
    purchaseReturnId: string;
    occurredAt: Date;
  },
): Promise<StockMovementRecord> {
  const balance = await getOrCreateLockedBalance(database, input.productId);
  await requireChronologicalStockMovement(
    database,
    input.productId,
    input.occurredAt,
  );

  await applyPurchaseReturnStockOut(database, balance, {
    quantity: input.quantity,
    unitCost: input.unitCost,
  });

  return createRequiredMovement(
    database,
    {
      productId: input.productId,
      movementType: "PURCHASE_RETURN",
      stockCondition: "SELLABLE",
      direction: "OUT",
      quantity: input.quantity,
      unitCost: input.unitCost,
      allocatedExtraCost: null,
      sourceType: "PURCHASE_RETURN",
      sourceId: input.purchaseReturnId,
      reason: "Purchase Return confirmation",
      notes: null,
      occurredAt: input.occurredAt,
    },
    "PURCHASE_RETURN_STOCK_OUT_FAILED",
    "Purchase Return stock movement could not be created.",
  );
}

/** Adds confirmed purchase stock and records its immutable PURCHASE movement. */
export async function recordPurchaseStockIn(
  database: InventoryDatabase,
  input: {
    productId: string;
    quantity: string;
    unitCost: string;
    allocatedExtraCost: string;
    purchaseId: string;
    occurredAt: Date;
  },
): Promise<StockMovementRecord> {
  await requireActiveInventoryProduct(database, input.productId, "Purchase confirmation");

  const balance = await getOrCreateLockedBalance(database, input.productId);
  await requireChronologicalStockMovement(
    database,
    input.productId,
    input.occurredAt,
  );
  await applyStockIn(database, balance, {
    stockCondition: "SELLABLE",
    quantity: input.quantity,
    unitCost: input.unitCost,
  });

  return createRequiredMovement(
    database,
    {
      productId: input.productId,
      movementType: "PURCHASE",
      stockCondition: "SELLABLE",
      direction: "IN",
      quantity: input.quantity,
      unitCost: input.unitCost,
      allocatedExtraCost: input.allocatedExtraCost,
      sourceType: "PURCHASE",
      sourceId: input.purchaseId,
      reason: "Purchase confirmation",
      notes: null,
      occurredAt: input.occurredAt,
    },
    "PURCHASE_STOCK_IN_FAILED",
    "Purchase stock movement could not be created.",
  );
}

export interface OpeningStockResult {
  movements: StockMovementRecord[];
}

/** Validates and returns the active inventory product. */
async function requireActiveInventoryProduct(
  database: InventoryDatabase,
  productId: string,
  actionName: string,
): Promise<void> {
  const product = await findInventoryProductById(database, productId);

  if (!product) {
    throw inventoryError("PRODUCT_NOT_FOUND", "Product was not found.", 404);
  }

  if (!product.isActive) {
    throw inventoryError(
      "PRODUCT_INACTIVE",
      `${actionName} can only be recorded for an active product.`,
      409,
    );
  }
}

/** Saves one opening-stock item after its product balance has been locked. */
export async function recordOpeningStockItem(
  database: InventoryDatabase,
  item: CreateOpeningStockInput["items"][number],
  notes: string | null,
): Promise<StockMovementRecord> {
  await requireActiveInventoryProduct(database, item.productId, "Opening stock");

  const balance = await getOrCreateLockedBalance(database, item.productId);
  const normalTransactionsExist = await hasNormalProductTransactions(
    database,
    item.productId,
  );

  if (normalTransactionsExist) {
    throw inventoryError(
      "OPENING_STOCK_LOCKED",
      "Opening stock cannot be entered after normal inventory transactions exist.",
      409,
    );
  }

  await applyStockIn(database, balance, {
    stockCondition: item.stockCondition,
    quantity: item.quantity,
    unitCost: item.unitCost,
  });

  const movementInput: NewStockMovement = {
    productId: item.productId,
    movementType: "OPENING_STOCK",
    stockCondition: item.stockCondition,
    direction: "IN",
    quantity: item.quantity,
    unitCost: item.unitCost,
    allocatedExtraCost: null,
    sourceType: null,
    sourceId: null,
    reason: "Opening stock",
    notes,
  };

  return createRequiredMovement(
    database,
    movementInput,
    "OPENING_STOCK_CREATE_FAILED",
    "Opening stock movement could not be created.",
  );
}

/** Creates the opening stock. */
export async function createOpeningStock(
  database: NodePgDatabase,
  input: CreateOpeningStockInput,
): Promise<OpeningStockResult> {
  return database.transaction(async (transaction) => {
    const items = [...input.items].sort((left, right) => {
      const productOrder = left.productId.localeCompare(right.productId);
      return (
        productOrder ||
        left.stockCondition.localeCompare(right.stockCondition)
      );
    });
    const movements: StockMovementRecord[] = [];

    for (const item of items) {
      movements.push(
        await recordOpeningStockItem(
          transaction,
          item,
          optionalText(input.notes),
        ),
      );
    }

    return { movements };
  });
}

export interface InventoryAdjustmentResult {
  movement: StockMovementRecord;
}

/** Validates and returns the adjustment unit cost. */
function requireAdjustmentUnitCost(input: CreateAdjustmentInput): string {
  if (input.direction !== "IN" || input.unitCost === undefined) {
    throw inventoryError(
      "INVALID_ADJUSTMENT_COST",
      "A positive unit cost is required for an IN adjustment.",
      400,
    );
  }

  return input.unitCost;
}

/** Creates the adjustment. */
export async function createAdjustment(
  database: NodePgDatabase,
  input: CreateAdjustmentInput,
): Promise<InventoryAdjustmentResult> {
  return database.transaction(async (transaction) => {
    await requireActiveInventoryProduct(
      transaction,
      input.productId,
      "Inventory adjustment",
    );

    const balance = await getOrCreateLockedBalance(transaction, input.productId);
    let movementUnitCost: string;

    if (input.direction === "IN") {
      movementUnitCost = requireAdjustmentUnitCost(input);
      await applyStockIn(transaction, balance, {
        stockCondition: input.stockCondition,
        quantity: input.quantity,
        unitCost: movementUnitCost,
      });
    } else {
      const balanceChange = await applyStockOut(transaction, balance, {
        stockCondition: input.stockCondition,
        quantity: input.quantity,
      });
      movementUnitCost = balanceChange.unitCost;
    }

    const movementInput: NewStockMovement = {
      productId: input.productId,
      movementType: "ADJUSTMENT",
      stockCondition: input.stockCondition,
      direction: input.direction,
      quantity: input.quantity,
      unitCost: movementUnitCost,
      allocatedExtraCost: null,
      sourceType: null,
      sourceId: null,
      reason: input.reason,
      notes: optionalText(input.notes),
    };

    const movement = await createRequiredMovement(
      transaction,
      movementInput,
      "INVENTORY_ADJUSTMENT_CREATE_FAILED",
      "Inventory adjustment movement could not be created.",
    );

    return { movement };
  });
}

export interface PaginatedStockCounts {
  items: StockCountRecord[];
  page: number;
  pageSize: number;
  total: number;
}

export interface StockCountDetail {
  stockCount: StockCountRecord;
  items: StockCountItemDetail[];
}

/** Converts a signed scaled integer to a fixed decimal string. */
function signedScaledIntegerToDecimal(value: bigint, scale: number): string {
  const sign = value < 0n ? "-" : "";
  const absoluteValue = value < 0n ? -value : value;
  return `${sign}${scaledIntegerToDecimal(absoluteValue, scale)}`;
}

/** Calculates counted quantity minus system quantity without floating-point math. */
function calculateCountDifference(
  countedQuantity: string,
  systemQuantity: string,
): string {
  const counted = decimalToScaledInteger(countedQuantity, QUANTITY_SCALE);
  const system = decimalToScaledInteger(systemQuantity, QUANTITY_SCALE);
  return signedScaledIntegerToDecimal(counted - system, QUANTITY_SCALE);
}

/** Reads the system quantity. */
function readSystemQuantity(
  balance: InventoryBalanceRecord | null,
  stockCondition: InventoryStockCondition,
): string {
  if (!balance) {
    return "0.000";
  }

  return readConditionQuantity(balance, stockCondition);
}

/** Creates the stock count number. */
function createStockCountNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `SC-${date}-${suffix}`;
}

/** Reads the postgres code. */
function readPostgresCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  return typeof error.code === "string" ? error.code : null;
}

/** Reads the postgres constraint. */
function readPostgresConstraint(error: unknown): string | null {
  if (
    typeof error !== "object" ||
    error === null ||
    !("constraint" in error)
  ) {
    return null;
  }

  return typeof error.constraint === "string" ? error.constraint : null;
}

/** Checks whether the stock count number conflict condition is true. */
function isStockCountNumberConflict(error: unknown): boolean {
  return (
    readPostgresCode(error) === "23505" &&
    readPostgresConstraint(error) ===
      "stock_counts_count_number_normalized_unique"
  );
}

/** Validates and returns the stock count. */
async function requireStockCount(
  database: InventoryDatabase,
  stockCountId: string,
): Promise<StockCountRecord> {
  const stockCount = await findStockCountById(database, stockCountId);

  if (!stockCount) {
    throw inventoryError(
      "STOCK_COUNT_NOT_FOUND",
      "Stock count was not found.",
      404,
    );
  }

  return stockCount;
}

/** Validates and returns the locked draft stock count. */
async function requireLockedDraftStockCount(
  database: InventoryDatabase,
  stockCountId: string,
  confirmedMessage: string,
): Promise<StockCountRecord> {
  const stockCount = await lockStockCountById(database, stockCountId);

  if (!stockCount) {
    throw inventoryError(
      "STOCK_COUNT_NOT_FOUND",
      "Stock count was not found.",
      404,
    );
  }

  if (stockCount.status !== "DRAFT") {
    throw inventoryError(
      "STOCK_COUNT_ALREADY_CONFIRMED",
      confirmedMessage,
      409,
    );
  }

  return stockCount;
}

/** Builds the stock count items. */
async function buildStockCountItems(
  database: InventoryDatabase,
  stockCountId: string,
  items: CreateStockCountInput["items"],
): Promise<NewStockCountItem[]> {
  const savedItems: NewStockCountItem[] = [];

  for (const item of items) {
    await requireActiveInventoryProduct(
      database,
      item.productId,
      "Stock count",
    );

    const balance = await findInventoryBalanceByProductId(
      database,
      item.productId,
    );
    const systemQuantity = readSystemQuantity(
      balance,
      item.stockCondition,
    );

    savedItems.push({
      stockCountId,
      productId: item.productId,
      stockCondition: item.stockCondition,
      systemQuantity,
      countedQuantity: item.countedQuantity,
      differenceQuantity: calculateCountDifference(
        item.countedQuantity,
        systemQuantity,
      ),
    });
  }

  return savedItems;
}

/** Lists the stock counts. */
export async function listStockCounts(
  database: InventoryDatabase,
  query: ListStockCountsQuery,
): Promise<PaginatedStockCounts> {
  const [items, total] = await Promise.all([
    readStockCounts(database, query),
    countStockCounts(database, query),
  ]);

  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

/** Creates the draft stock count. */
export async function createDraftStockCount(
  database: NodePgDatabase,
  input: CreateStockCountInput,
): Promise<StockCountDetail> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await database.transaction(async (transaction) => {
        const stockCount = await createStockCount(transaction, {
          countNumber: createStockCountNumber(),
          countDate: input.countDate,
          status: "DRAFT",
          notes: optionalText(input.notes),
          confirmedAt: null,
        });

        if (!stockCount) {
          throw inventoryError(
            "STOCK_COUNT_CREATE_FAILED",
            "Stock count could not be created.",
            500,
          );
        }

        const itemInputs = await buildStockCountItems(
          transaction,
          stockCount.id,
          input.items,
        );
        const savedItems = await createStockCountItems(transaction, itemInputs);

        if (savedItems.length !== itemInputs.length) {
          throw inventoryError(
            "STOCK_COUNT_ITEMS_CREATE_FAILED",
            "Stock-count items could not be created.",
            500,
          );
        }

        const items = await findStockCountItems(transaction, stockCount.id);
        return { stockCount, items };
      });
    } catch (error) {
      if (isStockCountNumberConflict(error) && attempt < 4) {
        continue;
      }

      throw error;
    }
  }

  throw inventoryError(
    "STOCK_COUNT_NUMBER_GENERATION_FAILED",
    "A unique stock-count number could not be generated.",
    500,
  );
}

/** Loads the stock count. */
export async function getStockCount(
  database: InventoryDatabase,
  stockCountId: string,
): Promise<StockCountDetail> {
  const stockCount = await requireStockCount(database, stockCountId);
  const items = await findStockCountItems(database, stockCountId);
  return { stockCount, items };
}

/** Updates one draft stock count and refreshes item quantity snapshots. */
export async function updateDraftStockCount(
  database: NodePgDatabase,
  stockCountId: string,
  input: UpdateStockCountInput,
): Promise<StockCountDetail> {
  return database.transaction(async (transaction) => {
    const currentStockCount = await requireLockedDraftStockCount(
      transaction,
      stockCountId,
      "A confirmed stock count cannot be edited.",
    );

    const headerChanges =
      input.notes === undefined ? {} : { notes: input.notes };
    const stockCount =
      Object.keys(headerChanges).length === 0
        ? currentStockCount
        : await saveStockCountChanges(
            transaction,
            stockCountId,
            headerChanges,
          );

    if (!stockCount) {
      throw inventoryError(
        "STOCK_COUNT_UPDATE_FAILED",
        "Stock count could not be updated.",
        500,
      );
    }

    if (input.items) {
      const itemInputs = await buildStockCountItems(
        transaction,
        stockCountId,
        input.items,
      );
      const savedItems = await replaceItemsForLockedDraftCount(
        transaction,
        stockCountId,
        itemInputs,
      );

      if (savedItems.length !== itemInputs.length) {
        throw inventoryError(
          "STOCK_COUNT_ITEMS_UPDATE_FAILED",
          "Stock-count items could not be updated.",
          500,
        );
      }
    }

    const items = await findStockCountItems(transaction, stockCountId);
    return { stockCount, items };
  });
}

export interface ConfirmStockCountResult extends StockCountDetail {
  movements: StockMovementRecord[];
}

/** Rejects positive stock-count differences that have no reliable condition cost. */
function requireStockCountCost(unitCost: string): void {
  if (decimalToScaledInteger(unitCost, COST_SCALE) <= 0n) {
    throw inventoryError(
      "STOCK_COUNT_COST_REQUIRED",
      "Add stock for this condition with a costed IN adjustment before confirming this stock count.",
      409,
    );
  }
}

/** Calculates the absolute stock-count difference as a decimal string. */
function absoluteDifferenceQuantity(differenceQuantity: string): string {
  const difference = decimalToScaledInteger(
    differenceQuantity,
    QUANTITY_SCALE,
  );
  const absoluteDifference = difference < 0n ? -difference : difference;
  return scaledIntegerToDecimal(absoluteDifference, QUANTITY_SCALE);
}

/** Confirms one draft stock count and records every non-zero correction. */
export async function confirmStockCount(
  database: NodePgDatabase,
  stockCountId: string,
): Promise<ConfirmStockCountResult> {
  return database.transaction(async (transaction) => {
    const currentStockCount = await requireLockedDraftStockCount(
      transaction,
      stockCountId,
      "This stock count has already been confirmed.",
    );

    if (!isBusinessDateNotFuture(currentStockCount.countDate)) {
      throw inventoryError(
        "FUTURE_BUSINESS_DATE",
        "Stock count date cannot be in the future.",
        400,
      );
    }

    const savedItems = await findStockCountItems(transaction, stockCountId);
    const orderedItems = [...savedItems].sort((left, right) => {
      const productOrder = left.productId.localeCompare(right.productId);
      return productOrder !== 0
        ? productOrder
        : left.stockCondition.localeCompare(right.stockCondition);
    });
    const movements: StockMovementRecord[] = [];
    const occurredAt = new Date(`${currentStockCount.countDate}T00:00:00+05:00`);

    for (const item of orderedItems) {
      const balance = await getOrCreateLockedBalance(
        transaction,
        item.productId,
      );
      const systemQuantity = readConditionQuantity(
        balance,
        item.stockCondition,
      );
      const differenceQuantity = calculateCountDifference(
        item.countedQuantity,
        systemQuantity,
      );
      const difference = decimalToScaledInteger(
        differenceQuantity,
        QUANTITY_SCALE,
      );

      if (difference !== 0n) {
        await requireChronologicalStockMovement(
          transaction,
          item.productId,
          occurredAt,
        );
        const quantity = absoluteDifferenceQuantity(differenceQuantity);
        const direction = difference > 0n ? "IN" : "OUT";
        let unitCost: string;

        if (direction === "IN") {
          unitCost = readConditionWeightedAverageCost(
            balance,
            item.stockCondition,
          );
          requireStockCountCost(unitCost);
          await applyStockIn(transaction, balance, {
            stockCondition: item.stockCondition,
            quantity,
            unitCost,
          });
        } else {
          const change = await applyStockOut(transaction, balance, {
            stockCondition: item.stockCondition,
            quantity,
          });
          unitCost = change.unitCost;
        }

        const movementInput: NewStockMovement = {
          productId: item.productId,
          movementType: "STOCK_COUNT",
          stockCondition: item.stockCondition,
          direction,
          quantity,
          unitCost,
          allocatedExtraCost: null,
          sourceType: "STOCK_COUNT",
          sourceId: stockCountId,
          reason: "Stock count confirmation",
          notes: currentStockCount.notes,
          occurredAt,
        };

        movements.push(
          await createRequiredMovement(
            transaction,
            movementInput,
            "STOCK_COUNT_MOVEMENT_CREATE_FAILED",
            "Stock-count movement could not be created.",
          ),
        );
      }

      const updatedItem = await updateStockCountItemSnapshot(
        transaction,
        item.id,
        { systemQuantity, differenceQuantity },
      );

      if (!updatedItem) {
        throw inventoryError(
          "STOCK_COUNT_ITEM_UPDATE_FAILED",
          "Stock-count item snapshot could not be updated.",
          500,
        );
      }

    }

    const confirmedAt = new Date();
    const stockCount = await markStockCountConfirmed(
      transaction,
      stockCountId,
      confirmedAt,
    );

    if (!stockCount) {
      throw inventoryError(
        "STOCK_COUNT_CONFIRM_FAILED",
        "Stock count could not be confirmed.",
        500,
      );
    }

    const items = await findStockCountItems(transaction, stockCountId);
    return { stockCount, items, movements };
  });
}

