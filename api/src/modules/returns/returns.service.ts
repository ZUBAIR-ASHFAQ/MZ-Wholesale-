import { AppError, type AppErrorField } from "../../shared/errors/app-error.js";
import { reserveBusinessDocumentNumberInTransaction } from "../business-settings/index.js";
import { findCustomerByIdForUpdate } from "../customers/customers.repository.js";
import { findSupplierByIdForUpdate } from "../suppliers/suppliers.repository.js";
import {
  recordPurchaseReturnStockOut,
  recordSalesReturnStockIn,
} from "../inventory/inventory.service.js";
import {
  getCustomerCurrentDue,
  getSupplierCurrentPayable,
  writeCustomerCredit,
  writeCustomerDebit,
  writeSupplierDebit,
} from "../ledgers/ledgers.service.js";
import { writeBankOutflow, writeCashOutflow } from "../payments/index.js";
import {
  countPurchaseReturns,
  countSalesReturns,
  findConfirmedPurchaseForReturn,
  findConfirmedSaleForReturn,
  findOriginalPurchaseItemForReturn,
  findOriginalSaleItemForReturn,
  findPurchaseReturnById,
  findPurchaseReturnItems,
  findSalesReturnById,
  findOriginalSaleItems,
  createPurchaseReturn,
  createPurchaseReturnItems,
  createSalesReturn,
  createSalesReturnItems,
  getPurchaseItemReturnedQuantity,
  getSalesItemReturnedAmount,
  getSalesItemReturnedQuantity,
  getSalesReturnSettlementAmounts,
  findSalesReturnItems,
  lockConfirmedPurchaseForReturn,
  lockConfirmedSaleForReturn,
  lockOriginalPurchaseItemsForReturn,
  lockOriginalSaleItemsForReturn,
  listPurchaseReturns as readPurchaseReturns,
  listSalesReturns as readSalesReturns,
  type OriginalPurchaseItemRecord,
  type OriginalPurchaseRecord,
  type OriginalSaleItemRecord,
  type OriginalSaleRecord,
  type PurchaseReturnItemRecord,
  type PurchaseReturnRecord,
  type ReturnsDatabase,
  type SalesReturnItemRecord,
  type SalesReturnRecord,
} from "./returns.repository.js";
import type {
  CreatePurchaseReturnInput,
  CreateSalesReturnInput,
  ListPurchaseReturnsQuery,
  ListSalesReturnsQuery,
} from "./returns.schema.js";

const MONEY_SCALE = 2;
const QUANTITY_SCALE = 3;

/** Contains one validated Sales Return item before any database side effects are created. */
export interface PreparedSalesReturnItem {
  originalSaleItem: OriginalSaleItemRecord;
  quantity: string;
  baseQuantity: string;
  stockCondition: SalesReturnItemRecord["stockCondition"];
  unitPriceSnapshot: string;
  unitCostSnapshot: string;
  lineTotal: string;
}

/** Contains a fully validated Sales Return request ready for the later transaction pass. */
export interface PreparedSalesReturn {
  originalSale: OriginalSaleRecord;
  items: PreparedSalesReturnItem[];
  totalAmount: string;
}


/** Contains one validated Purchase Return item before any database side effects are created. */
export interface PreparedPurchaseReturnItem {
  originalPurchaseItem: OriginalPurchaseItemRecord;
  quantity: string;
  baseQuantity: string;
  unitCostSnapshot: string;
  lineTotal: string;
}

/** Contains a fully validated Purchase Return request ready for the later transaction pass. */
export interface PreparedPurchaseReturn {
  originalPurchase: OriginalPurchaseRecord;
  items: PreparedPurchaseReturnItem[];
  totalAmount: string;
}

/** Contains one paginated Sales Return list response. */
export interface PaginatedSalesReturns {
  items: SalesReturnRecord[];
  total: number;
  page: number;
  pageSize: number;
}

/** Contains one paginated Purchase Return list response. */
export interface PaginatedPurchaseReturns {
  items: PurchaseReturnRecord[];
  total: number;
  page: number;
  pageSize: number;
}

/** Describes how one returned item changes stock after a confirmed Sales Return. */
export interface SalesReturnStockResultItem {
  productId: string;
  stockCondition: SalesReturnItemRecord["stockCondition"];
  baseQuantity: string;
}

/** Describes the settlement information stored on a confirmed Sales Return. */
export interface SalesReturnSettlementResult {
  refundMode: SalesReturnRecord["refundMode"];
  totalAmount: string;
  cashAccountId: string | null;
  bankAccountId: string | null;
}

/** Contains one Sales Return with its items, source sale, stock result and settlement result. */
export interface SalesReturnDetail {
  salesReturn: SalesReturnRecord;
  items: SalesReturnItemRecord[];
  originalSale: OriginalSaleRecord;
  stockResult: SalesReturnStockResultItem[];
  settlementResult: SalesReturnSettlementResult;
}

/** Describes one immutable Purchase Return stock-out item for the detail response. */
export interface PurchaseReturnStockResultItem {
  productId: string;
  baseQuantity: string;
  unitCostSnapshot: string;
}

/** Describes the supplier-payable reduction represented by a Purchase Return. */
export interface PurchaseReturnSupplierBalanceResult {
  reductionAmount: string;
}

/** Contains one Purchase Return with its items, source purchase and stored result summaries. */
export interface PurchaseReturnDetail {
  purchaseReturn: PurchaseReturnRecord;
  items: PurchaseReturnItemRecord[];
  originalPurchase: OriginalPurchaseRecord;
  stockResult: PurchaseReturnStockResultItem[];
  supplierBalanceResult: PurchaseReturnSupplierBalanceResult;
}

/** Creates a stable Returns error for the shared HTTP error handler. */
function returnError(
  code: string,
  message: string,
  statusCode = 400,
  fields?: AppErrorField[],
): AppError {
  return new AppError(code, message, statusCode, fields);
}

/** Builds the simple stock-result summary from immutable Sales Return item snapshots. */
function buildSalesReturnStockResult(
  items: readonly SalesReturnItemRecord[],
): SalesReturnStockResultItem[] {
  return items.map((item) => ({
    productId: item.productId,
    stockCondition: item.stockCondition,
    baseQuantity: item.baseQuantity,
  }));
}

/** Builds the simple settlement summary stored on the Sales Return header. */
function buildSalesReturnSettlementResult(
  salesReturn: SalesReturnRecord,
): SalesReturnSettlementResult {
  return {
    refundMode: salesReturn.refundMode,
    totalAmount: salesReturn.totalAmount,
    cashAccountId: salesReturn.cashAccountId,
    bankAccountId: salesReturn.bankAccountId,
  };
}

/** Converts a validated decimal string to an integer at the requested scale. */
function decimalToScaledInteger(value: string, scale: number): bigint {
  const [wholePart, fractionPart = ""] = value.split(".");
  const paddedFraction = fractionPart.padEnd(scale, "0").slice(0, scale);
  return BigInt(wholePart) * 10n ** BigInt(scale) + BigInt(paddedFraction || "0");
}

/** Converts a non-negative scaled integer back to a fixed decimal string. */
function scaledIntegerToDecimal(value: bigint, scale: number): string {
  const divisor = 10n ** BigInt(scale);
  const wholePart = value / divisor;
  const fractionPart = (value % divisor).toString().padStart(scale, "0");
  return `${wholePart}.${fractionPart}`;
}

/** Divides positive integer values using standard half-up rounding. */
function divideAndRound(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

/** Calculates returned base quantity from the original unit-conversion snapshot. */
function calculateReturnBaseQuantity(
  quantity: string,
  conversionToBase: string,
): string {
  const quantityUnits = decimalToScaledInteger(quantity, QUANTITY_SCALE);
  const conversionUnits = decimalToScaledInteger(
    conversionToBase,
    QUANTITY_SCALE,
  );
  const divisor = 10n ** BigInt(QUANTITY_SCALE);
  const baseQuantityUnits = divideAndRound(
    quantityUnits * conversionUnits,
    divisor,
  );

  return scaledIntegerToDecimal(baseQuantityUnits, QUANTITY_SCALE);
}

/** Allocates an exact money amount across positive weights without losing a cent. */
function allocateMoneyProportionally(
  totalCents: bigint,
  weights: readonly bigint[],
): bigint[] {
  if (totalCents === 0n) {
    return weights.map(() => 0n);
  }

  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0n);
  if (weightTotal <= 0n) {
    return weights.map(() => 0n);
  }

  const allocations = weights.map((weight) => (totalCents * weight) / weightTotal);
  let remaining = totalCents - allocations.reduce((sum, value) => sum + value, 0n);
  const remainderOrder = weights
    .map((weight, index) => ({
      index,
      remainder: (totalCents * weight) % weightTotal,
    }))
    .sort((left, right) => {
      if (left.remainder === right.remainder) return left.index - right.index;
      return left.remainder > right.remainder ? -1 : 1;
    });

  for (const item of remainderOrder) {
    if (remaining === 0n) break;
    allocations[item.index] += 1n;
    remaining -= 1n;
  }

  return allocations;
}

/** Calculates each sale item's final value after its proportional invoice-discount share. */
function buildSaleItemReturnableValues(
  originalSale: OriginalSaleRecord,
  originalItems: readonly OriginalSaleItemRecord[],
): Map<string, bigint> {
  const itemValues = originalItems.map((item) =>
    decimalToScaledInteger(item.lineTotal, MONEY_SCALE),
  );
  const invoiceDiscountCents = decimalToScaledInteger(
    originalSale.invoiceDiscountAmount,
    MONEY_SCALE,
  );
  const discountShares = allocateMoneyProportionally(
    invoiceDiscountCents,
    itemValues,
  );

  return new Map(
    originalItems.map((item, index) => [
      item.id,
      itemValues[index] - discountShares[index],
    ]),
  );
}

/** Calculates one partial-return value while preserving the original discounted item total. */
function calculateSalesReturnLineTotal(
  originalItemValueCents: bigint,
  originalQuantity: string,
  alreadyReturnedQuantity: string,
  alreadyReturnedAmount: string,
  requestedQuantity: string,
): string {
  const originalQuantityUnits = decimalToScaledInteger(originalQuantity, QUANTITY_SCALE);
  const returnedQuantityUnits = decimalToScaledInteger(alreadyReturnedQuantity, QUANTITY_SCALE);
  const requestedQuantityUnits = decimalToScaledInteger(requestedQuantity, QUANTITY_SCALE);
  const cumulativeQuantityUnits = returnedQuantityUnits + requestedQuantityUnits;
  const previousAmountCents = decimalToScaledInteger(alreadyReturnedAmount, MONEY_SCALE);

  const cumulativeTargetCents = cumulativeQuantityUnits >= originalQuantityUnits
    ? originalItemValueCents
    : divideAndRound(
        originalItemValueCents * cumulativeQuantityUnits,
        originalQuantityUnits,
      );

  if (previousAmountCents > cumulativeTargetCents) {
    throw returnError(
      "RETURN_VALUE_CONFLICT",
      "Previous returns already exceed the proportional value of this sale item.",
      409,
    );
  }

  return scaledIntegerToDecimal(
    cumulativeTargetCents - previousAmountCents,
    MONEY_SCALE,
  );
}

/** Calculates Purchase Return value from returned base quantity and original landed unit cost. */
function calculatePurchaseReturnLineTotal(
  baseQuantity: string,
  landedUnitCost: string,
): string {
  const baseQuantityUnits = decimalToScaledInteger(baseQuantity, QUANTITY_SCALE);
  const landedUnitCostCents = decimalToScaledInteger(landedUnitCost, MONEY_SCALE);
  const divisor = 10n ** BigInt(QUANTITY_SCALE);
  const lineTotalCents = divideAndRound(
    baseQuantityUnits * landedUnitCostCents,
    divisor,
  );

  return scaledIntegerToDecimal(lineTotalCents, MONEY_SCALE);
}

/** Validates one requested Sales Return item against the original immutable sale item. */
async function prepareSalesReturnItem(
  database: ReturnsDatabase,
  originalSaleId: string,
  originalItemValueCents: bigint,
  input: CreateSalesReturnInput["items"][number],
): Promise<PreparedSalesReturnItem> {
  const originalSaleItem = await findOriginalSaleItemForReturn(
    database,
    originalSaleId,
    input.originalSaleItemId,
  );

  if (!originalSaleItem) {
    throw returnError(
      "RETURN_ITEM_NOT_FOUND",
      "The selected item does not belong to the original sale.",
      400,
      [{ field: "originalSaleItemId", message: "Select an item from the original confirmed sale." }],
    );
  }

  if (originalSaleItem.unitCostSnapshot === null) {
    throw returnError(
      "INVALID_ORIGINAL_SALE_ITEM",
      "The original sale item does not have a cost snapshot.",
      409,
    );
  }

  const [alreadyReturned, alreadyReturnedAmount] = await Promise.all([
    getSalesItemReturnedQuantity(database, originalSaleItem.id),
    getSalesItemReturnedAmount(database, originalSaleItem.id),
  ]);
  const soldQuantityUnits = decimalToScaledInteger(
    originalSaleItem.quantity,
    QUANTITY_SCALE,
  );
  const returnedQuantityUnits = decimalToScaledInteger(
    alreadyReturned,
    QUANTITY_SCALE,
  );
  const requestedQuantityUnits = decimalToScaledInteger(
    input.quantity,
    QUANTITY_SCALE,
  );
  const remainingQuantityUnits = soldQuantityUnits - returnedQuantityUnits;

  if (requestedQuantityUnits > remainingQuantityUnits) {
    throw returnError(
      "RETURN_QUANTITY_EXCEEDS_AVAILABLE",
      "Return quantity exceeds the remaining returnable quantity.",
      400,
      [{ field: "quantity", message: "Quantity is greater than the remaining returnable quantity." }],
    );
  }

  return {
    originalSaleItem,
    quantity: input.quantity,
    baseQuantity: calculateReturnBaseQuantity(
      input.quantity,
      originalSaleItem.conversionToBaseSnapshot,
    ),
    stockCondition: input.stockCondition,
    unitPriceSnapshot: originalSaleItem.manualUnitPrice,
    unitCostSnapshot: originalSaleItem.unitCostSnapshot,
    lineTotal: calculateSalesReturnLineTotal(
      originalItemValueCents,
      originalSaleItem.quantity,
      alreadyReturned,
      alreadyReturnedAmount,
      input.quantity,
    ),
  };
}

/** Validates a Sales Return request and builds immutable source snapshots without writing data. */
export async function prepareSalesReturnCreation(
  database: ReturnsDatabase,
  input: CreateSalesReturnInput,
): Promise<PreparedSalesReturn> {
  const originalSale = await findConfirmedSaleForReturn(
    database,
    input.originalSaleId,
  );

  if (!originalSale) {
    throw returnError(
      "ORIGINAL_SALE_NOT_FOUND",
      "Original confirmed sale was not found.",
      404,
    );
  }

  const originalItems = await findOriginalSaleItems(database, originalSale.id);
  const returnableValues = buildSaleItemReturnableValues(originalSale, originalItems);
  const items: PreparedSalesReturnItem[] = [];

  for (const item of input.items) {
    const originalItemValueCents = returnableValues.get(item.originalSaleItemId);
    if (originalItemValueCents === undefined) {
      throw returnError(
        "RETURN_ITEM_NOT_FOUND",
        "The selected item does not belong to the original sale.",
        400,
        [{ field: "originalSaleItemId", message: "Select an item from the original confirmed sale." }],
      );
    }

    items.push(
      await prepareSalesReturnItem(
        database,
        originalSale.id,
        originalItemValueCents,
        item,
      ),
    );
  }

  const totalCents = items.reduce(
    (sum, item) => sum + decimalToScaledInteger(item.lineTotal, MONEY_SCALE),
    0n,
  );

  return {
    originalSale,
    items,
    totalAmount: scaledIntegerToDecimal(totalCents, MONEY_SCALE),
  };
}

/** Validates one requested Purchase Return item against the original immutable purchase item. */
async function preparePurchaseReturnItem(
  database: ReturnsDatabase,
  originalPurchaseId: string,
  input: CreatePurchaseReturnInput["items"][number],
): Promise<PreparedPurchaseReturnItem> {
  const originalPurchaseItem = await findOriginalPurchaseItemForReturn(
    database,
    originalPurchaseId,
    input.originalPurchaseItemId,
  );

  if (!originalPurchaseItem) {
    throw returnError(
      "RETURN_ITEM_NOT_FOUND",
      "The selected item does not belong to the original purchase.",
      400,
      [{ field: "originalPurchaseItemId", message: "Select an item from the original confirmed purchase." }],
    );
  }

  const alreadyReturned = await getPurchaseItemReturnedQuantity(
    database,
    originalPurchaseItem.id,
  );
  const purchasedQuantityUnits = decimalToScaledInteger(
    originalPurchaseItem.quantity,
    QUANTITY_SCALE,
  );
  const returnedQuantityUnits = decimalToScaledInteger(
    alreadyReturned,
    QUANTITY_SCALE,
  );
  const requestedQuantityUnits = decimalToScaledInteger(
    input.quantity,
    QUANTITY_SCALE,
  );
  const remainingQuantityUnits = purchasedQuantityUnits - returnedQuantityUnits;

  if (requestedQuantityUnits > remainingQuantityUnits) {
    throw returnError(
      "RETURN_QUANTITY_EXCEEDS_AVAILABLE",
      "Return quantity exceeds the remaining returnable quantity.",
      400,
      [{ field: "quantity", message: "Quantity is greater than the remaining returnable quantity." }],
    );
  }

  const baseQuantity = calculateReturnBaseQuantity(
    input.quantity,
    originalPurchaseItem.conversionToBaseSnapshot,
  );

  return {
    originalPurchaseItem,
    quantity: input.quantity,
    baseQuantity,
    unitCostSnapshot: originalPurchaseItem.landedUnitCost,
    lineTotal: calculatePurchaseReturnLineTotal(
      baseQuantity,
      originalPurchaseItem.landedUnitCost,
    ),
  };
}

/** Validates a Purchase Return request and builds immutable source snapshots without writing data. */
export async function preparePurchaseReturnCreation(
  database: ReturnsDatabase,
  input: CreatePurchaseReturnInput,
): Promise<PreparedPurchaseReturn> {
  const originalPurchase = await findConfirmedPurchaseForReturn(
    database,
    input.originalPurchaseId,
  );

  if (!originalPurchase) {
    throw returnError(
      "ORIGINAL_PURCHASE_NOT_FOUND",
      "Original confirmed purchase was not found.",
      404,
    );
  }

  const items: PreparedPurchaseReturnItem[] = [];

  for (const item of input.items) {
    items.push(
      await preparePurchaseReturnItem(database, originalPurchase.id, item),
    );
  }

  const totalCents = items.reduce(
    (sum, item) => sum + decimalToScaledInteger(item.lineTotal, MONEY_SCALE),
    0n,
  );

  return {
    originalPurchase,
    items,
    totalAmount: scaledIntegerToDecimal(totalCents, MONEY_SCALE),
  };
}

/** Applies all prepared Purchase Return stock decreases inside the caller-owned transaction. */
export async function applyPreparedPurchaseReturnInventory(
  database: ReturnsDatabase,
  purchaseReturnId: string,
  occurredAt: Date,
  prepared: PreparedPurchaseReturn,
): Promise<void> {
  const items = [...prepared.items].sort((left, right) =>
    left.originalPurchaseItem.productId.localeCompare(right.originalPurchaseItem.productId),
  );

  for (const item of items) {
    await recordPurchaseReturnStockOut(database, {
      productId: item.originalPurchaseItem.productId,
      quantity: item.baseQuantity,
      unitCost: item.unitCostSnapshot,
      purchaseReturnId,
      occurredAt,
    });
  }
}

/** Ensures a Purchase Return cannot reduce the supplier payable below zero. */
export async function validatePreparedPurchaseReturnPayable(
  database: ReturnsDatabase,
  prepared: PreparedPurchaseReturn,
): Promise<void> {
  const currentPayable = await getSupplierCurrentPayable(
    database,
    prepared.originalPurchase.supplierId,
  );
  const currentPayableCents = decimalToScaledInteger(currentPayable, MONEY_SCALE);
  const returnAmountCents = decimalToScaledInteger(
    prepared.totalAmount,
    MONEY_SCALE,
  );

  if (returnAmountCents > currentPayableCents) {
    throw returnError(
      "PURCHASE_RETURN_EXCEEDS_SUPPLIER_PAYABLE",
      "Purchase Return cannot reduce the supplier payable below zero. Record the excess through the supplier refund/credit cash-bank flow.",
      409,
      [{ field: "items", message: "Reduce the return amount so supplier payable does not become negative." }],
    );
  }
}

/** Reduces the supplier payable for a confirmed Purchase Return inside the caller-owned transaction. */
export async function applyPreparedPurchaseReturnSupplierLedger(
  database: ReturnsDatabase,
  purchaseReturnId: string,
  returnNumber: string,
  occurredAt: Date,
  prepared: PreparedPurchaseReturn,
): Promise<void> {
  await validatePreparedPurchaseReturnPayable(database, prepared);

  // A zero-value return changes stock but must not create an invalid zero ledger entry.
  if (decimalToScaledInteger(prepared.totalAmount, MONEY_SCALE) === 0n) {
    return;
  }

  await writeSupplierDebit(database, {
    supplierId: prepared.originalPurchase.supplierId,
    amount: prepared.totalAmount,
    occurredAt,
    referenceType: "PURCHASE_RETURN",
    referenceId: purchaseReturnId,
    documentNumber: returnNumber,
    description: "Purchase return payable reduction",
  });
}

/** Maps the Sales Return condition to the matching Inventory stock condition. */
function toInventoryStockCondition(
  condition: PreparedSalesReturnItem["stockCondition"],
): "SELLABLE" | "DAMAGED" | "EXPIRED" {
  if (condition === "GOOD") {
    return "SELLABLE";
  }

  return condition;
}

/** Applies all prepared Sales Return stock increases inside the caller-owned transaction. */
export async function applyPreparedSalesReturnInventory(
  database: ReturnsDatabase,
  salesReturnId: string,
  occurredAt: Date,
  prepared: PreparedSalesReturn,
): Promise<void> {
  const items = [...prepared.items].sort((left, right) =>
    left.originalSaleItem.productId.localeCompare(right.originalSaleItem.productId),
  );

  for (const item of items) {
    await recordSalesReturnStockIn(database, {
      productId: item.originalSaleItem.productId,
      quantity: item.baseQuantity,
      stockCondition: toInventoryStockCondition(item.stockCondition),
      unitCost: item.unitCostSnapshot,
      salesReturnId,
      occurredAt,
    });
  }
}


/** Validates that one Sales Return settlement stays within the original sale value and paid amount. */
export async function validatePreparedSalesReturnSettlement(
  database: ReturnsDatabase,
  salesReturnId: string | undefined,
  refundMode: SalesReturnRecord["refundMode"],
  prepared: PreparedSalesReturn,
): Promise<void> {
  const settlement = await getSalesReturnSettlementAmounts(
    database,
    prepared.originalSale.id,
    salesReturnId,
  );

  const saleTotalCents = decimalToScaledInteger(
    prepared.originalSale.totalAmount,
    MONEY_SCALE,
  );
  const paidCents = decimalToScaledInteger(settlement.paidAmount, MONEY_SCALE);
  const previousReturnCents = decimalToScaledInteger(
    settlement.previousReturnAmount,
    MONEY_SCALE,
  );
  const previousRefundCents = decimalToScaledInteger(
    settlement.previousRefundAmount,
    MONEY_SCALE,
  );
  const currentReturnCents = decimalToScaledInteger(
    prepared.totalAmount,
    MONEY_SCALE,
  );

  const remainingReturnValue = saleTotalCents - previousReturnCents;
  if (currentReturnCents > remainingReturnValue) {
    throw returnError(
      "RETURN_AMOUNT_EXCEEDS_AVAILABLE",
      "Return amount exceeds the remaining value of the original sale.",
      400,
      [{ field: "items", message: "Reduce the return quantity to the remaining sale value." }],
    );
  }

  const retainedPaidCents = paidCents > previousRefundCents
    ? paidCents - previousRefundCents
    : 0n;
  const netSaleValueBeforeReturn = saleTotalCents - previousReturnCents;
  const outstandingBeforeReturn = netSaleValueBeforeReturn > retainedPaidCents
    ? netSaleValueBeforeReturn - retainedPaidCents
    : 0n;

  if (refundMode === "DUE_REDUCTION" && currentReturnCents > outstandingBeforeReturn) {
    throw returnError(
      "RETURN_AMOUNT_EXCEEDS_SALE_DUE",
      "Due reduction cannot be greater than the outstanding amount of the original sale.",
      400,
      [{ field: "refundMode", message: "Due reduction is greater than this sale's outstanding amount." }],
    );
  }

  if (refundMode !== "DUE_REDUCTION" && currentReturnCents > retainedPaidCents) {
    throw returnError(
      "RETURN_REFUND_EXCEEDS_PAID_AMOUNT",
      "Cash or bank refund cannot be greater than the amount still paid against the original sale.",
      400,
      [{ field: "refundMode", message: "Refund is greater than the paid amount still available for this sale." }],
    );
  }
}

/** Reduces the customer's current due for a DUE_REDUCTION Sales Return. */
export async function applyPreparedSalesReturnDueReduction(
  database: ReturnsDatabase,
  salesReturnId: string,
  returnNumber: string,
  occurredAt: Date,
  prepared: PreparedSalesReturn,
): Promise<void> {
  await validatePreparedSalesReturnSettlement(
    database,
    salesReturnId,
    "DUE_REDUCTION",
    prepared,
  );

  const currentDue = await getCustomerCurrentDue(
    database,
    prepared.originalSale.customerId,
  );
  const currentDueCents = decimalToScaledInteger(currentDue, MONEY_SCALE);
  const returnAmountCents = decimalToScaledInteger(
    prepared.totalAmount,
    MONEY_SCALE,
  );

  if (returnAmountCents > currentDueCents) {
    throw returnError(
      "RETURN_AMOUNT_EXCEEDS_CUSTOMER_DUE",
      "Due reduction cannot be greater than the customer's current due.",
      400,
      [{ field: "refundMode", message: "Due reduction is greater than the customer's current due." }],
    );
  }

  // A fully discounted return changes stock but has no ledger value to record.
  if (returnAmountCents === 0n) {
    return;
  }

  await writeCustomerCredit(database, {
    customerId: prepared.originalSale.customerId,
    amount: prepared.totalAmount,
    occurredAt,
    referenceType: "SALES_RETURN",
    referenceId: salesReturnId,
    documentNumber: returnNumber,
    description: "Sales return due reduction",
  });
}

/** Refunds a confirmed Sales Return from one active cash account inside the caller-owned transaction. */
export async function applyPreparedSalesReturnCashRefund(
  database: ReturnsDatabase,
  salesReturnId: string,
  returnNumber: string,
  cashAccountId: string,
  occurredAt: Date,
  prepared: PreparedSalesReturn,
): Promise<void> {
  await validatePreparedSalesReturnSettlement(
    database,
    salesReturnId,
    "CASH",
    prepared,
  );

  await writeCustomerCredit(database, {
    customerId: prepared.originalSale.customerId,
    amount: prepared.totalAmount,
    occurredAt,
    referenceType: "SALES_RETURN",
    referenceId: salesReturnId,
    documentNumber: returnNumber,
    description: "Sales return cash refund",
  });

  await writeCashOutflow(database, {
    accountId: cashAccountId,
    sourceType: "SALES_RETURN",
    sourceId: salesReturnId,
    amount: prepared.totalAmount,
    occurredAt,
    documentNumber: returnNumber,
    description: `Sales return cash refund ${returnNumber}`,
  });

  // The refund pays the customer's return credit back out, so it must not leave a negative customer balance.
  await writeCustomerDebit(database, {
    customerId: prepared.originalSale.customerId,
    amount: prepared.totalAmount,
    occurredAt,
    referenceType: "SALES_RETURN_REFUND",
    referenceId: salesReturnId,
    documentNumber: returnNumber,
    description: "Sales return cash refund settlement",
  });
}

/** Refunds a confirmed Sales Return from one active bank account inside the caller-owned transaction. */
export async function applyPreparedSalesReturnBankRefund(
  database: ReturnsDatabase,
  salesReturnId: string,
  returnNumber: string,
  bankAccountId: string,
  occurredAt: Date,
  prepared: PreparedSalesReturn,
): Promise<void> {
  await validatePreparedSalesReturnSettlement(
    database,
    salesReturnId,
    "BANK_TRANSFER",
    prepared,
  );

  await writeCustomerCredit(database, {
    customerId: prepared.originalSale.customerId,
    amount: prepared.totalAmount,
    occurredAt,
    referenceType: "SALES_RETURN",
    referenceId: salesReturnId,
    documentNumber: returnNumber,
    description: "Sales return bank refund",
  });

  await writeBankOutflow(database, {
    accountId: bankAccountId,
    sourceType: "SALES_RETURN",
    sourceId: salesReturnId,
    amount: prepared.totalAmount,
    occurredAt,
    documentNumber: returnNumber,
    description: `Sales return bank refund ${returnNumber}`,
  });

  // The refund pays the customer's return credit back out, so it must not leave a negative customer balance.
  await writeCustomerDebit(database, {
    customerId: prepared.originalSale.customerId,
    amount: prepared.totalAmount,
    occurredAt,
    referenceType: "SALES_RETURN_REFUND",
    referenceId: salesReturnId,
    documentNumber: returnNumber,
    description: "Sales return bank refund settlement",
  });
}

/** Converts a return business date in Asia/Karachi to the UTC instant used by financial movements. */
function returnDateToOccurredAt(returnDate: string): Date {
  return new Date(`${returnDate}T00:00:00+05:00`);
}

/** Formats one reserved return sequence value using the approved business prefix. */
function formatReturnNumber(prefix: string, number: number): string {
  return `${prefix}-${number}`;
}

/** Creates one confirmed Sales Return inside an existing caller-owned transaction. */
export async function createConfirmedSalesReturnInTransaction(
  transaction: ReturnsDatabase,
  input: CreateSalesReturnInput,
): Promise<SalesReturnDetail> {
  const lockedSale = await lockConfirmedSaleForReturn(
    transaction,
    input.originalSaleId,
  );

  if (!lockedSale) {
    throw returnError(
      "ORIGINAL_SALE_NOT_FOUND",
      "Original confirmed sale was not found.",
      404,
    );
  }

  // Lock the party and source items before checking prior returns and balances.
  const customer = await findCustomerByIdForUpdate(
    transaction,
    lockedSale.customerId,
  );
  if (!customer) {
    throw returnError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
  }

  await lockOriginalSaleItemsForReturn(transaction, lockedSale.id);
  const prepared = await prepareSalesReturnCreation(transaction, input);

  // Validate settlement before reserving a number or creating return rows.
  // Settlement is checked again when the financial effect is written.
  await validatePreparedSalesReturnSettlement(
    transaction,
    undefined,
    input.refundMode,
    prepared,
  );

  const reservedNumber = await reserveBusinessDocumentNumberInTransaction(
    transaction,
    "SALES_RETURN",
  );
  const returnNumber = formatReturnNumber(
    reservedNumber.prefix,
    reservedNumber.number,
  );
  const occurredAt = returnDateToOccurredAt(input.returnDate);

  const savedReturn = await createSalesReturn(transaction, {
    returnNumber,
    originalSaleId: prepared.originalSale.id,
    customerId: prepared.originalSale.customerId,
    returnDate: input.returnDate,
    status: "CONFIRMED",
    reason: input.reason,
    refundMode: input.refundMode,
    cashAccountId: input.cashAccountId ?? null,
    bankAccountId: input.bankAccountId ?? null,
    totalAmount: prepared.totalAmount,
  });

  if (!savedReturn) {
    throw returnError(
      "SALES_RETURN_CREATE_FAILED",
      "Sales Return could not be created.",
      500,
    );
  }

  await createSalesReturnItems(
    transaction,
    prepared.items.map((item) => ({
      salesReturnId: savedReturn.id,
      originalSaleItemId: item.originalSaleItem.id,
      productId: item.originalSaleItem.productId,
      productUnitId: item.originalSaleItem.productUnitId,
      productSkuSnapshot: item.originalSaleItem.productSkuSnapshot,
      productNameSnapshot: item.originalSaleItem.productNameSnapshot,
      unitNameSnapshot: item.originalSaleItem.unitNameSnapshot,
      conversionToBaseSnapshot: item.originalSaleItem.conversionToBaseSnapshot,
      quantity: item.quantity,
      baseQuantity: item.baseQuantity,
      unitPriceSnapshot: item.unitPriceSnapshot,
      unitCostSnapshot: item.unitCostSnapshot,
      stockCondition: item.stockCondition,
      lineTotal: item.lineTotal,
    })),
  );

  await applyPreparedSalesReturnInventory(
    transaction,
    savedReturn.id,
    occurredAt,
    prepared,
  );

  if (input.refundMode === "DUE_REDUCTION") {
    await applyPreparedSalesReturnDueReduction(
      transaction,
      savedReturn.id,
      returnNumber,
      occurredAt,
      prepared,
    );
  } else if (input.refundMode === "CASH") {
    await applyPreparedSalesReturnCashRefund(
      transaction,
      savedReturn.id,
      returnNumber,
      input.cashAccountId!,
      occurredAt,
      prepared,
    );
  } else {
    await applyPreparedSalesReturnBankRefund(
      transaction,
      savedReturn.id,
      returnNumber,
      input.bankAccountId!,
      occurredAt,
      prepared,
    );
  }

  return getSalesReturn(transaction, savedReturn.id);
}

/** Creates one confirmed Purchase Return inside an existing caller-owned transaction. */
export async function createConfirmedPurchaseReturnInTransaction(
  transaction: ReturnsDatabase,
  input: CreatePurchaseReturnInput,
): Promise<PurchaseReturnDetail> {
  const lockedPurchase = await lockConfirmedPurchaseForReturn(
    transaction,
    input.originalPurchaseId,
  );

  if (!lockedPurchase) {
    throw returnError(
      "ORIGINAL_PURCHASE_NOT_FOUND",
      "Original confirmed purchase was not found.",
      404,
    );
  }

  // Lock the supplier and source items before checking previous returns/payable.
  const supplier = await findSupplierByIdForUpdate(
    transaction,
    lockedPurchase.supplierId,
  );
  if (!supplier) {
    throw returnError("SUPPLIER_NOT_FOUND", "Supplier was not found.", 404);
  }

  await lockOriginalPurchaseItemsForReturn(transaction, lockedPurchase.id);
  const prepared = await preparePurchaseReturnCreation(transaction, input);
  await validatePreparedPurchaseReturnPayable(transaction, prepared);

  const reservedNumber = await reserveBusinessDocumentNumberInTransaction(
    transaction,
    "PURCHASE_RETURN",
  );
  const returnNumber = formatReturnNumber(
    reservedNumber.prefix,
    reservedNumber.number,
  );
  const occurredAt = returnDateToOccurredAt(input.returnDate);

  const savedReturn = await createPurchaseReturn(transaction, {
    returnNumber,
    originalPurchaseId: prepared.originalPurchase.id,
    supplierId: prepared.originalPurchase.supplierId,
    returnDate: input.returnDate,
    status: "CONFIRMED",
    reason: input.reason,
    totalAmount: prepared.totalAmount,
  });

  if (!savedReturn) {
    throw returnError(
      "PURCHASE_RETURN_CREATE_FAILED",
      "Purchase Return could not be created.",
      500,
    );
  }

  await createPurchaseReturnItems(
    transaction,
    prepared.items.map((item) => ({
      purchaseReturnId: savedReturn.id,
      originalPurchaseItemId: item.originalPurchaseItem.id,
      productId: item.originalPurchaseItem.productId,
      productUnitId: item.originalPurchaseItem.productUnitId,
      productSkuSnapshot: item.originalPurchaseItem.productSkuSnapshot,
      productNameSnapshot: item.originalPurchaseItem.productNameSnapshot,
      unitNameSnapshot: item.originalPurchaseItem.unitNameSnapshot,
      conversionToBaseSnapshot: item.originalPurchaseItem.conversionToBaseSnapshot,
      quantity: item.quantity,
      baseQuantity: item.baseQuantity,
      unitCostSnapshot: item.unitCostSnapshot,
      lineTotal: item.lineTotal,
    })),
  );

  await applyPreparedPurchaseReturnInventory(
    transaction,
    savedReturn.id,
    occurredAt,
    prepared,
  );
  await applyPreparedPurchaseReturnSupplierLedger(
    transaction,
    savedReturn.id,
    returnNumber,
    occurredAt,
    prepared,
  );

  return getPurchaseReturn(transaction, savedReturn.id);
}

/** Lists Sales Returns using the approved customer, date and page filters. */
export async function listSalesReturns(
  database: ReturnsDatabase,
  query: ListSalesReturnsQuery,
): Promise<PaginatedSalesReturns> {
  const [items, total] = await Promise.all([
    readSalesReturns(database, query),
    countSalesReturns(database, query),
  ]);

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** Loads one confirmed Sales Return with its immutable source and item snapshots. */
export async function getSalesReturn(
  database: ReturnsDatabase,
  salesReturnId: string,
): Promise<SalesReturnDetail> {
  const salesReturn = await findSalesReturnById(database, salesReturnId);

  if (!salesReturn) {
    throw returnError(
      "SALES_RETURN_NOT_FOUND",
      "Sales Return was not found.",
      404,
    );
  }

  const [items, originalSale] = await Promise.all([
    findSalesReturnItems(database, salesReturn.id),
    findConfirmedSaleForReturn(database, salesReturn.originalSaleId),
  ]);

  if (!originalSale) {
    throw returnError(
      "ORIGINAL_SALE_NOT_FOUND",
      "Original confirmed sale was not found.",
      404,
    );
  }

  return {
    salesReturn,
    items,
    originalSale,
    stockResult: buildSalesReturnStockResult(items),
    settlementResult: buildSalesReturnSettlementResult(salesReturn),
  };
}

/** Lists Purchase Returns using the approved supplier, date and page filters. */
export async function listPurchaseReturns(
  database: ReturnsDatabase,
  query: ListPurchaseReturnsQuery,
): Promise<PaginatedPurchaseReturns> {
  const [items, total] = await Promise.all([
    readPurchaseReturns(database, query),
    countPurchaseReturns(database, query),
  ]);

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** Loads one confirmed Purchase Return with its immutable source and item snapshots. */
export async function getPurchaseReturn(
  database: ReturnsDatabase,
  purchaseReturnId: string,
): Promise<PurchaseReturnDetail> {
  const purchaseReturn = await findPurchaseReturnById(database, purchaseReturnId);

  if (!purchaseReturn) {
    throw returnError(
      "PURCHASE_RETURN_NOT_FOUND",
      "Purchase Return was not found.",
      404,
    );
  }

  const [items, originalPurchase] = await Promise.all([
    findPurchaseReturnItems(database, purchaseReturn.id),
    findConfirmedPurchaseForReturn(database, purchaseReturn.originalPurchaseId),
  ]);

  if (!originalPurchase) {
    throw returnError(
      "ORIGINAL_PURCHASE_NOT_FOUND",
      "Original confirmed purchase was not found.",
      404,
    );
  }

  return {
    purchaseReturn,
    items,
    originalPurchase,
    stockResult: items.map((item) => ({
      productId: item.productId,
      baseQuantity: item.baseQuantity,
      unitCostSnapshot: item.unitCostSnapshot,
    })),
    supplierBalanceResult: {
      reductionAmount: purchaseReturn.totalAmount,
    },
  };
}
