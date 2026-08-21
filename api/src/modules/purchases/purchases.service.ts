import { AppError } from "../../shared/errors/app-error.js";
import { isBusinessDateNotFuture } from "../../shared/utils/business-date.js";
import { reserveBusinessDocumentNumberInTransaction } from "../business-settings/index.js";
import { recordPurchaseStockIn } from "../inventory/inventory.service.js";
import { recordPurchaseInitialSupplierPayment } from "../payments/payments.service.js";
import { writeSupplierCredit } from "../ledgers/ledgers.service.js";
import {
  findProductById,
  type ProductDetailRecord,
} from "../products/products.repository.js";
import { findSupplierById } from "../suppliers/suppliers.repository.js";
import {
  createPurchase as insertPurchase,
  createPurchaseItems,
  countPurchases,
  findPurchaseById,
  getPurchaseOutstandingAmount,
  listPurchaseItemReturnAvailability,
  listPurchaseItems,
  listPurchasePayments,
  listPurchases as readPurchases,
  lockPurchaseById,
  markPurchaseCancelled,
  markPurchaseConfirmed,
  replacePurchaseItems,
  updatePurchaseDraft as updatePurchaseDraftRecord,
  type NewPurchaseItem,
  type PurchaseItemRecord,
  type PurchaseItemReturnAvailabilityRecord,
  type PurchaseRecord,
  type PurchasesDatabase,
} from "./purchases.repository.js";
import type {
  CancelPurchaseInput,
  ConfirmPurchaseInput,
  CreatePurchaseInput,
  ListPurchasesQuery,
  UpdatePurchaseDraftInput,
} from "./purchases.schema.js";

const MONEY_SCALE = 2;
const COST_SCALE = 14;
const QUANTITY_SCALE = 3;

/** Contains the values needed to calculate one purchase line before it is stored. */
export interface PurchaseCalculationItemInput {
  quantity: string;
  conversionToBase: string;
  unitCost: string;
  itemDiscountAmount: string;
}

/** Contains the calculated values that will later be stored as purchase-item snapshots. */
export interface PurchaseCalculatedItem {
  baseQuantity: string;
  grossAmount: string;
  itemDiscountAmount: string;
  lineTotal: string;
  invoiceDiscountShare: string;
  allocatedExtraCost: string;
  landedUnitCost: string;
}

/** Contains the header and line totals produced by the purchase calculation. */
export interface PurchaseCalculationResult {
  items: PurchaseCalculatedItem[];
  itemDiscountTotal: string;
  subtotalAmount: string;
  invoiceDiscountAmount: string;
  extraCostAmount: string;
  totalAmount: string;
  initialPaidAmount: string;
  initialDueAmount: string;
}

/** Creates a consistent application error for invalid purchase calculations. */
function purchaseCalculationError(message: string, field?: string): AppError {
  return new AppError(
    "VALIDATION_ERROR",
    message,
    400,
    field ? [{ field, message }] : undefined,
  );
}

/** Converts a validated decimal string to a scaled integer without floating-point math. */
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
  if (denominator <= 0n) {
    throw purchaseCalculationError("Purchase calculation used an invalid divisor.");
  }

  return (numerator + denominator / 2n) / denominator;
}

/** Multiplies a quantity by a unit rate and rounds the result to money cents. */
function calculateLineGrossCents(quantity: string, unitCost: string): bigint {
  const quantityUnits = decimalToScaledInteger(quantity, QUANTITY_SCALE);
  const unitCostCents = decimalToScaledInteger(unitCost, MONEY_SCALE);
  const quantityDivisor = 10n ** BigInt(QUANTITY_SCALE);
  return divideAndRound(quantityUnits * unitCostCents, quantityDivisor);
}

/** Converts the entered purchase quantity into the product base-stock quantity. */
function calculateBaseQuantity(
  quantity: string,
  conversionToBase: string,
): string {
  const quantityUnits = decimalToScaledInteger(quantity, QUANTITY_SCALE);
  const conversionUnits = decimalToScaledInteger(conversionToBase, QUANTITY_SCALE);
  const scaleDivisor = 10n ** BigInt(QUANTITY_SCALE);
  const baseQuantityUnits = divideAndRound(
    quantityUnits * conversionUnits,
    scaleDivisor,
  );

  if (baseQuantityUnits <= 0n) {
    throw purchaseCalculationError(
      "Purchase item base quantity must be greater than zero.",
      "items",
    );
  }

  return scaledIntegerToDecimal(baseQuantityUnits, QUANTITY_SCALE);
}

/** Allocates an exact money total across positive weights without losing a cent. */
function allocateMoneyProportionally(
  totalCents: bigint,
  weights: readonly bigint[],
): bigint[] {
  if (totalCents === 0n) {
    return weights.map(() => 0n);
  }

  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0n);
  if (weightTotal <= 0n) {
    throw purchaseCalculationError(
      "Extra cost cannot be allocated when the purchase net cost is zero.",
      "extraCostAmount",
    );
  }

  const allocations = weights.map((weight) => (totalCents * weight) / weightTotal);
  let remaining = totalCents - allocations.reduce((sum, value) => sum + value, 0n);

  const remainderOrder = weights
    .map((weight, index) => ({
      index,
      remainder: (totalCents * weight) % weightTotal,
    }))
    .sort((left, right) => {
      if (left.remainder === right.remainder) {
        return left.index - right.index;
      }
      return left.remainder > right.remainder ? -1 : 1;
    });

  for (const item of remainderOrder) {
    if (remaining === 0n) {
      break;
    }
    allocations[item.index] += 1n;
    remaining -= 1n;
  }

  return allocations;
}

/** Calculates the landed cost per base unit after discounts and allocated extra cost. */
function calculateLandedUnitCost(
  netItemCostCents: bigint,
  allocatedExtraCostCents: bigint,
  baseQuantity: string,
): string {
  const baseQuantityUnits = decimalToScaledInteger(baseQuantity, QUANTITY_SCALE);
  const valuationCents = netItemCostCents + allocatedExtraCostCents;
  const costScaleMultiplier =
    10n ** BigInt(QUANTITY_SCALE + COST_SCALE - MONEY_SCALE);
  const landedUnitCost = divideAndRound(
    valuationCents * costScaleMultiplier,
    baseQuantityUnits,
  );

  return scaledIntegerToDecimal(landedUnitCost, COST_SCALE);
}

/** Adds the optional initial-payment splits using exact money arithmetic. */
function calculateInitialPaidCents(paymentSplitAmounts: readonly string[]): bigint {
  return paymentSplitAmounts.reduce(
    (sum, amount) => sum + decimalToScaledInteger(amount, MONEY_SCALE),
    0n,
  );
}

/**
 * Calculates purchase totals and item valuation snapshots without performing any
 * database writes. Shared invoice discount and extra cost are allocated
 * proportionally so weighted-average inventory cost can use the final landed cost.
 */
export function calculatePurchase(
  items: readonly PurchaseCalculationItemInput[],
  invoiceDiscountAmount: string,
  extraCostAmount: string,
  paymentSplitAmounts: readonly string[] = [],
): PurchaseCalculationResult {
  if (items.length === 0) {
    throw purchaseCalculationError(
      "At least one purchase item is required.",
      "items",
    );
  }

  const baseItems = items.map((item) => {
    const grossCents = calculateLineGrossCents(item.quantity, item.unitCost);
    const itemDiscountCents = decimalToScaledInteger(
      item.itemDiscountAmount,
      MONEY_SCALE,
    );

    if (itemDiscountCents > grossCents) {
      throw purchaseCalculationError(
        "Item discount cannot exceed the item gross amount.",
        "items",
      );
    }

    return {
      baseQuantity: calculateBaseQuantity(item.quantity, item.conversionToBase),
      grossCents,
      itemDiscountCents,
      lineTotalCents: grossCents - itemDiscountCents,
    };
  });

  const itemDiscountTotalCents = baseItems.reduce(
    (sum, item) => sum + item.itemDiscountCents,
    0n,
  );
  const subtotalCents = baseItems.reduce(
    (sum, item) => sum + item.lineTotalCents,
    0n,
  );
  const invoiceDiscountCents = decimalToScaledInteger(
    invoiceDiscountAmount,
    MONEY_SCALE,
  );
  const extraCostCents = decimalToScaledInteger(extraCostAmount, MONEY_SCALE);

  if (invoiceDiscountCents > subtotalCents) {
    throw purchaseCalculationError(
      "Invoice discount cannot exceed the purchase subtotal.",
      "invoiceDiscountAmount",
    );
  }

  const invoiceDiscountShares = allocateMoneyProportionally(
    invoiceDiscountCents,
    baseItems.map((item) => item.lineTotalCents),
  );
  const netItemCosts = baseItems.map(
    (item, index) => item.lineTotalCents - invoiceDiscountShares[index],
  );
  const netPurchaseCostCents = netItemCosts.reduce(
    (sum, amount) => sum + amount,
    0n,
  );

  if (extraCostCents > 0n && netPurchaseCostCents === 0n) {
    throw purchaseCalculationError(
      "Extra cost cannot be allocated when the purchase net cost is zero.",
      "extraCostAmount",
    );
  }

  const extraCostAllocations = allocateMoneyProportionally(
    extraCostCents,
    netItemCosts,
  );
  const totalCents = netPurchaseCostCents + extraCostCents;
  const initialPaidCents = calculateInitialPaidCents(paymentSplitAmounts);

  if (initialPaidCents > totalCents) {
    throw new AppError(
      "PAYMENT_EXCEEDS_TOTAL",
      "Initial payment cannot exceed the purchase total.",
      400,
      [{ field: "initialPayment", message: "Payment cannot exceed purchase total." }],
    );
  }

  const calculatedItems = baseItems.map((item, index) => ({
    baseQuantity: item.baseQuantity,
    grossAmount: scaledIntegerToDecimal(item.grossCents, MONEY_SCALE),
    itemDiscountAmount: scaledIntegerToDecimal(
      item.itemDiscountCents,
      MONEY_SCALE,
    ),
    lineTotal: scaledIntegerToDecimal(item.lineTotalCents, MONEY_SCALE),
    invoiceDiscountShare: scaledIntegerToDecimal(
      invoiceDiscountShares[index],
      MONEY_SCALE,
    ),
    allocatedExtraCost: scaledIntegerToDecimal(
      extraCostAllocations[index],
      MONEY_SCALE,
    ),
    landedUnitCost: calculateLandedUnitCost(
      netItemCosts[index],
      extraCostAllocations[index],
      item.baseQuantity,
    ),
  }));

  return {
    items: calculatedItems,
    itemDiscountTotal: scaledIntegerToDecimal(
      itemDiscountTotalCents,
      MONEY_SCALE,
    ),
    subtotalAmount: scaledIntegerToDecimal(subtotalCents, MONEY_SCALE),
    invoiceDiscountAmount: scaledIntegerToDecimal(
      invoiceDiscountCents,
      MONEY_SCALE,
    ),
    extraCostAmount: scaledIntegerToDecimal(extraCostCents, MONEY_SCALE),
    totalAmount: scaledIntegerToDecimal(totalCents, MONEY_SCALE),
    initialPaidAmount: scaledIntegerToDecimal(initialPaidCents, MONEY_SCALE),
    initialDueAmount: scaledIntegerToDecimal(
      totalCents - initialPaidCents,
      MONEY_SCALE,
    ),
  };
}

/** Represents one newly created purchase together with its stored item snapshots. */
export interface CreatedPurchase {
  purchase: PurchaseRecord;
  items: PurchaseItemRecord[];
}

/** Creates a stable Purchase Management business error. */
function purchaseError(
  code: string,
  message: string,
  statusCode = 400,
  field?: string,
): AppError {
  return new AppError(
    code,
    message,
    statusCode,
    field ? [{ field, message }] : undefined,
  );
}

/** Runs a Purchase write inside one PostgreSQL transaction. */
async function requireTransaction<T>(
  database: PurchasesDatabase,
  work: (transaction: PurchasesDatabase) => Promise<T>,
): Promise<T> {
  if (!database.transaction) {
    throw purchaseError(
      "DATABASE_TRANSACTION_REQUIRED",
      "Creating a purchase requires a database transaction.",
      500,
    );
  }

  return database.transaction(async (transaction) =>
    work(transaction as unknown as PurchasesDatabase),
  );
}

/** Ensures the selected supplier exists and can be used for a new purchase. */
async function requireActiveSupplier(
  database: PurchasesDatabase,
  supplierId: string,
): Promise<void> {
  const supplier = await findSupplierById(database, supplierId);

  if (!supplier) {
    throw purchaseError(
      "SUPPLIER_NOT_FOUND",
      "Supplier was not found.",
      404,
      "supplierId",
    );
  }

  if (!supplier.isActive) {
    throw purchaseError(
      "SUPPLIER_INACTIVE",
      "An inactive supplier cannot be used for a new purchase.",
      409,
      "supplierId",
    );
  }
}

/** Ensures the selected product and unit are active and belong together. */
async function requirePurchaseProductUnit(
  database: PurchasesDatabase,
  productId: string,
  productUnitId: string,
): Promise<{ product: ProductDetailRecord; unit: ProductDetailRecord["units"][number] }> {
  const product = await findProductById(database, productId);

  if (!product) {
    throw purchaseError(
      "PRODUCT_NOT_FOUND",
      "Product was not found.",
      404,
      "items",
    );
  }

  if (!product.isActive) {
    throw purchaseError(
      "PRODUCT_INACTIVE",
      "An inactive product cannot be used for a new purchase.",
      409,
      "items",
    );
  }

  const unit = product.units.find((item) => item.id === productUnitId);

  if (!unit || !unit.isActive) {
    throw purchaseError(
      "PRODUCT_UNIT_NOT_ALLOWED",
      "The selected product unit is not active for this product.",
      400,
      "items",
    );
  }

  return { product, unit };
}

/** Loads current master data and prepares immutable item snapshots for a new purchase. */
async function preparePurchaseItems(
  database: PurchasesDatabase,
  input: CreatePurchaseInput,
): Promise<{ calculated: PurchaseCalculationResult; items: Omit<NewPurchaseItem, "purchaseId">[] }> {
  const resolvedItems = [];

  for (const item of input.items) {
    const { product, unit } = await requirePurchaseProductUnit(
      database,
      item.productId,
      item.productUnitId,
    );

    resolvedItems.push({ input: item, product, unit });
  }

  const paymentSplitAmounts = input.initialPayment?.splits.map((split) => split.amount) ?? [];
  const calculated = calculatePurchase(
    resolvedItems.map(({ input: item, unit }) => ({
      quantity: item.quantity,
      conversionToBase: unit.conversionToBase,
      unitCost: item.unitCost,
      itemDiscountAmount: item.itemDiscountAmount,
    })),
    input.invoiceDiscountAmount,
    input.extraCostAmount,
    paymentSplitAmounts,
  );

  const items = resolvedItems.map(({ input: item, product, unit }, index) => ({
    productId: product.id,
    productUnitId: unit.id,
    productSkuSnapshot: product.sku,
    productNameSnapshot: product.name,
    unitNameSnapshot: unit.unitName,
    conversionToBaseSnapshot: unit.conversionToBase,
    quantity: item.quantity,
    baseQuantity: calculated.items[index].baseQuantity,
    unitCost: item.unitCost,
    itemDiscountAmount: calculated.items[index].itemDiscountAmount,
    lineTotal: calculated.items[index].lineTotal,
    allocatedExtraCost: calculated.items[index].allocatedExtraCost,
    landedUnitCost: calculated.items[index].landedUnitCost,
  }));

  return { calculated, items };
}

/** Creates a validated purchase draft without changing stock, ledgers, or accounts. */
async function createDraftPurchase(
  database: PurchasesDatabase,
  input: CreatePurchaseInput,
): Promise<CreatedPurchase> {
  await requireActiveSupplier(database, input.supplierId);
  const prepared = await preparePurchaseItems(database, input);

  const purchase = await insertPurchase(database, {
    supplierId: input.supplierId,
    purchaseDate: input.purchaseDate,
    status: "DRAFT",
    itemDiscountTotal: prepared.calculated.itemDiscountTotal,
    invoiceDiscountAmount: prepared.calculated.invoiceDiscountAmount,
    extraCostAmount: prepared.calculated.extraCostAmount,
    subtotalAmount: prepared.calculated.subtotalAmount,
    totalAmount: prepared.calculated.totalAmount,
    initialPaidAmount: null,
    initialDueAmount: null,
    notes: input.notes ?? null,
  });

  if (!purchase) {
    throw purchaseError(
      "PURCHASE_CREATE_FAILED",
      "Purchase draft could not be created.",
      500,
    );
  }

  const items = await createPurchaseItems(
    database,
    prepared.items.map((item) => ({ ...item, purchaseId: purchase.id })),
  );

  if (items.length !== prepared.items.length) {
    throw purchaseError(
      "PURCHASE_CREATE_FAILED",
      "Purchase items could not be created.",
      500,
    );
  }

  return { purchase, items };
}

/**
 * Creates a purchase using a transaction already owned by the caller.
 * This is used by idempotent create-and-confirm requests so the idempotency
 * record and every purchase side effect commit or roll back together.
 */
export async function createPurchaseInTransaction(
  transaction: PurchasesDatabase,
  input: CreatePurchaseInput,
): Promise<PurchaseDetail> {
  const created = await createDraftPurchase(transaction, input);

  if (input.status === "CONFIRMED") {
    return confirmPurchaseInTransaction(transaction, created.purchase.id, {
      initialPayment: input.initialPayment,
    });
  }

  return {
    purchase: created.purchase,
    items: created.items,
    payments: [],
    currentOutstandingAmount: null,
    returnAvailability: [],
  };
}

/**
 * Creates a purchase as a draft or confirms it immediately in one transaction.
 * Non-idempotent callers use this wrapper; HTTP financial mutations pass their
 * existing idempotency transaction to createPurchaseInTransaction instead.
 */
export async function createPurchase(
  database: PurchasesDatabase,
  input: CreatePurchaseInput,
): Promise<PurchaseDetail> {
  return requireTransaction(database, (transaction) =>
    createPurchaseInTransaction(transaction, input),
  );
}

/** Contains one paginated Purchase list response. */
export interface PaginatedPurchases {
  items: PurchaseRecord[];
  total: number;
  page: number;
  pageSize: number;
}

/** Contains the purchase header, item snapshots, and related supplier payments. */
export interface PurchaseDetail {
  purchase: PurchaseRecord;
  items: PurchaseItemRecord[];
  payments: Awaited<ReturnType<typeof listPurchasePayments>>;
  currentOutstandingAmount: string | null;
  returnAvailability: PurchaseItemReturnAvailabilityRecord[];
}

/** Lists purchases using the approved supplier, status, date, and page filters. */
export async function listPurchases(
  database: PurchasesDatabase,
  query: ListPurchasesQuery,
): Promise<PaginatedPurchases> {
  const [items, total] = await Promise.all([
    readPurchases(database, query),
    countPurchases(database, query),
  ]);

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** Loads one purchase with its immutable item snapshots and payment allocations. */
export async function getPurchase(
  database: PurchasesDatabase,
  purchaseId: string,
): Promise<PurchaseDetail> {
  const purchase = await findPurchaseById(database, purchaseId);

  if (!purchase) {
    throw purchaseError(
      "PURCHASE_NOT_FOUND",
      "Purchase was not found.",
      404,
    );
  }

  const [items, payments, currentOutstandingAmount, returnAvailability] = await Promise.all([
    listPurchaseItems(database, purchaseId),
    listPurchasePayments(database, purchaseId),
    purchase.status === "CONFIRMED"
      ? getPurchaseOutstandingAmount(database, purchaseId)
      : Promise.resolve(null),
    purchase.status === "CONFIRMED"
      ? listPurchaseItemReturnAvailability(database, purchaseId)
      : Promise.resolve([]),
  ]);

  return { purchase, items, payments, currentOutstandingAmount, returnAvailability };
}



/** Ensures a purchase exists and is still editable as a draft. */
function requireDraftPurchase(purchase: PurchaseRecord | null): PurchaseRecord {
  if (!purchase) {
    throw purchaseError(
      "PURCHASE_NOT_FOUND",
      "Purchase was not found.",
      404,
    );
  }

  if (purchase.status !== "DRAFT") {
    throw purchaseError(
      "INVALID_PURCHASE_STATUS",
      "Only a draft purchase can be changed or cancelled.",
      409,
    );
  }

  return purchase;
}

/** Recalculates existing draft item snapshots when only header discounts or extra cost change. */
function recalculateStoredDraftItems(
  items: readonly PurchaseItemRecord[],
  invoiceDiscountAmount: string,
  extraCostAmount: string,
): { calculated: PurchaseCalculationResult; items: Omit<NewPurchaseItem, "purchaseId">[] } {
  const calculated = calculatePurchase(
    items.map((item) => ({
      quantity: item.quantity,
      conversionToBase: item.conversionToBaseSnapshot,
      unitCost: item.unitCost,
      itemDiscountAmount: item.itemDiscountAmount,
    })),
    invoiceDiscountAmount,
    extraCostAmount,
  );

  return {
    calculated,
    items: items.map((item, index) => ({
      productId: item.productId,
      productUnitId: item.productUnitId,
      productSkuSnapshot: item.productSkuSnapshot,
      productNameSnapshot: item.productNameSnapshot,
      unitNameSnapshot: item.unitNameSnapshot,
      conversionToBaseSnapshot: item.conversionToBaseSnapshot,
      quantity: item.quantity,
      baseQuantity: calculated.items[index].baseQuantity,
      unitCost: item.unitCost,
      itemDiscountAmount: calculated.items[index].itemDiscountAmount,
      lineTotal: calculated.items[index].lineTotal,
      allocatedExtraCost: calculated.items[index].allocatedExtraCost,
      landedUnitCost: calculated.items[index].landedUnitCost,
    })),
  };
}

/** Updates an unconfirmed purchase draft without creating stock, ledger, or payment effects. */
export async function updatePurchaseDraft(
  database: PurchasesDatabase,
  purchaseId: string,
  input: UpdatePurchaseDraftInput,
): Promise<PurchaseDetail> {
  return requireTransaction(database, async (transaction) => {
    const currentPurchase = requireDraftPurchase(
      await lockPurchaseById(transaction, purchaseId),
    );

    if (input.supplierId !== undefined) {
      await requireActiveSupplier(transaction, input.supplierId);
    }

    const shouldRecalculate =
      input.items !== undefined ||
      input.invoiceDiscountAmount !== undefined ||
      input.extraCostAmount !== undefined;

    let preparedItems: Omit<NewPurchaseItem, "purchaseId">[] | null = null;
    let calculated: PurchaseCalculationResult | null = null;

    if (shouldRecalculate && input.items) {
      const prepared = await preparePurchaseItems(transaction, {
        supplierId: input.supplierId ?? currentPurchase.supplierId,
        purchaseDate: input.purchaseDate ?? currentPurchase.purchaseDate,
        status: "DRAFT",
        items: input.items,
        invoiceDiscountAmount:
          input.invoiceDiscountAmount ?? currentPurchase.invoiceDiscountAmount,
        extraCostAmount: input.extraCostAmount ?? currentPurchase.extraCostAmount,
        notes: input.notes === undefined ? currentPurchase.notes : input.notes,
      });
      preparedItems = prepared.items;
      calculated = prepared.calculated;
    } else if (shouldRecalculate) {
      const currentItems = await listPurchaseItems(transaction, purchaseId);
      if (currentItems.length === 0) {
        throw purchaseError(
          "PURCHASE_ITEMS_NOT_FOUND",
          "Purchase draft has no items to recalculate.",
          409,
        );
      }

      const prepared = recalculateStoredDraftItems(
        currentItems,
        input.invoiceDiscountAmount ?? currentPurchase.invoiceDiscountAmount,
        input.extraCostAmount ?? currentPurchase.extraCostAmount,
      );
      preparedItems = prepared.items;
      calculated = prepared.calculated;
    }

    const updatedPurchase = await updatePurchaseDraftRecord(
      transaction,
      purchaseId,
      {
        ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
        ...(input.purchaseDate !== undefined ? { purchaseDate: input.purchaseDate } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(calculated
          ? {
              itemDiscountTotal: calculated.itemDiscountTotal,
              invoiceDiscountAmount: calculated.invoiceDiscountAmount,
              extraCostAmount: calculated.extraCostAmount,
              subtotalAmount: calculated.subtotalAmount,
              totalAmount: calculated.totalAmount,
            }
          : {}),
      },
    );

    if (!updatedPurchase) {
      throw purchaseError(
        "INVALID_PURCHASE_STATUS",
        "Only a draft purchase can be updated.",
        409,
      );
    }

    if (preparedItems) {
      const savedItems = await replacePurchaseItems(
        transaction,
        purchaseId,
        preparedItems.map((item) => ({ ...item, purchaseId })),
      );

      if (savedItems.length !== preparedItems.length) {
        throw purchaseError(
          "PURCHASE_UPDATE_FAILED",
          "Purchase items could not be updated.",
          500,
        );
      }
    }

    const items = await listPurchaseItems(transaction, purchaseId);
    const payments = await listPurchasePayments(transaction, purchaseId);
    return {
      purchase: updatedPurchase,
      items,
      payments,
      currentOutstandingAmount: null,
      returnAvailability: [],
    };
  });
}

/** Cancels one draft purchase without changing inventory, ledgers, or accounts. */
export async function cancelPurchase(
  database: PurchasesDatabase,
  purchaseId: string,
  input: CancelPurchaseInput,
): Promise<PurchaseDetail> {
  return requireTransaction(database, async (transaction) => {
    requireDraftPurchase(await lockPurchaseById(transaction, purchaseId));

    const cancelledPurchase = await markPurchaseCancelled(
      transaction,
      purchaseId,
      {
        cancelledAt: new Date(),
        ...(input.note !== undefined ? { notes: input.note } : {}),
      },
    );

    if (!cancelledPurchase) {
      throw purchaseError(
        "INVALID_PURCHASE_STATUS",
        "Only a draft purchase can be cancelled.",
        409,
      );
    }

    const items = await listPurchaseItems(transaction, purchaseId);
    const payments = await listPurchasePayments(transaction, purchaseId);
    return {
      purchase: cancelledPurchase,
      items,
      payments,
      currentOutstandingAmount: null,
      returnAvailability: [],
    };
  });
}

/** Formats one reserved business document sequence value for a purchase number. */
function formatPurchaseNumber(prefix: string, number: number): string {
  return `${prefix}-${number}`;
}

/** Converts a purchase business date in Asia/Karachi to a UTC timestamp. */
function purchaseDateToOccurredAt(purchaseDate: string): Date {
  return new Date(`${purchaseDate}T00:00:00+05:00`);
}

/**
 * Confirms one draft using a transaction already owned by the caller.
 * Idempotent HTTP confirmation uses this function so reservation, stock, ledger,
 * payment, and the replay response share one outer PostgreSQL transaction.
 */
export async function confirmPurchaseInTransaction(
  transaction: PurchasesDatabase,
  purchaseId: string,
  input: ConfirmPurchaseInput,
): Promise<PurchaseDetail> {
    const purchase = requireDraftPurchase(
      await lockPurchaseById(transaction, purchaseId),
    );

    if (!isBusinessDateNotFuture(purchase.purchaseDate)) {
      throw purchaseError(
        "FUTURE_BUSINESS_DATE",
        "Purchase date cannot be in the future.",
        400,
        "purchaseDate",
      );
    }

    await requireActiveSupplier(transaction, purchase.supplierId);

    const items = await listPurchaseItems(transaction, purchaseId);
    if (items.length === 0) {
      throw purchaseError(
        "PURCHASE_ITEMS_NOT_FOUND",
        "Purchase draft has no items to confirm.",
        409,
      );
    }

    // Re-check current product and unit activity before irreversible confirmation.
    for (const item of items) {
      await requirePurchaseProductUnit(
        transaction,
        item.productId,
        item.productUnitId,
      );
    }

    const reservedNumber = await reserveBusinessDocumentNumberInTransaction(
      transaction,
      "PURCHASE",
    );
    const purchaseNumber = formatPurchaseNumber(
      reservedNumber.prefix,
      reservedNumber.number,
    );
    const confirmedAt = new Date();
    const occurredAt = purchaseDateToOccurredAt(purchase.purchaseDate);

    // Sort stock writes so concurrent purchase confirmations lock products consistently.
    const orderedItems = [...items].sort((left, right) =>
      left.productId.localeCompare(right.productId),
    );

    for (const item of orderedItems) {
      await recordPurchaseStockIn(transaction, {
        productId: item.productId,
        quantity: item.baseQuantity,
        unitCost: item.landedUnitCost,
        allocatedExtraCost: item.allocatedExtraCost,
        purchaseId: purchase.id,
        occurredAt,
      });
    }

    await writeSupplierCredit(transaction, {
      supplierId: purchase.supplierId,
      amount: purchase.totalAmount,
      occurredAt,
      referenceType: "PURCHASE",
      referenceId: purchase.id,
      documentNumber: purchaseNumber,
      description: `Purchase ${purchaseNumber}`,
      notes: purchase.notes,
    });

    const paymentSplitAmounts = input.initialPayment?.splits.map((split) => split.amount) ?? [];
    const paymentTotals = calculatePurchase(
      items.map((item) => ({
        quantity: item.quantity,
        conversionToBase: item.conversionToBaseSnapshot,
        unitCost: item.unitCost,
        itemDiscountAmount: item.itemDiscountAmount,
      })),
      purchase.invoiceDiscountAmount,
      purchase.extraCostAmount,
      paymentSplitAmounts,
    );

    if (input.initialPayment) {
      await recordPurchaseInitialSupplierPayment(transaction, {
        supplierId: purchase.supplierId,
        purchaseId: purchase.id,
        purchaseNumber,
        paymentDate: occurredAt,
        splits: input.initialPayment.splits,
        notes: purchase.notes,
      });
    }

    const confirmedPurchase = await markPurchaseConfirmed(
      transaction,
      purchase.id,
      {
        purchaseNumber,
        itemDiscountTotal: purchase.itemDiscountTotal,
        invoiceDiscountAmount: purchase.invoiceDiscountAmount,
        extraCostAmount: purchase.extraCostAmount,
        subtotalAmount: purchase.subtotalAmount,
        totalAmount: purchase.totalAmount,
        initialPaidAmount: paymentTotals.initialPaidAmount,
        initialDueAmount: paymentTotals.initialDueAmount,
        confirmedAt,
      },
    );

    if (!confirmedPurchase) {
      throw purchaseError(
        "INVALID_PURCHASE_STATUS",
        "Only a draft purchase can be confirmed.",
        409,
      );
    }

    const [payments, currentOutstandingAmount, returnAvailability] = await Promise.all([
      listPurchasePayments(transaction, purchase.id),
      getPurchaseOutstandingAmount(transaction, purchase.id),
      listPurchaseItemReturnAvailability(transaction, purchase.id),
    ]);
    return {
      purchase: confirmedPurchase,
      items,
      payments,
      currentOutstandingAmount,
      returnAvailability,
    };
}


