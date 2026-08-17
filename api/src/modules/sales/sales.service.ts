import { AppError } from "../../shared/errors/app-error.js";
import { reserveBusinessDocumentNumberInTransaction } from "../business-settings/index.js";
import { recordSaleStockOut } from "../inventory/inventory.service.js";
import {
  getCustomerCurrentDue,
  writeCustomerDebit,
} from "../ledgers/ledgers.service.js";
import { recordSaleInitialCustomerReceipt } from "../payments/payments.service.js";
import {
  findCustomerById,
  findCustomerByIdForUpdate,
} from "../customers/customers.repository.js";
import {
  findProductById,
  findProductUnitById,
} from "../products/products.repository.js";
import {
  cancelSaleDraft as markSaleDraftCancelled,
  createSale as insertSale,
  createSaleItems,
  deleteSaleDraftItems,
  countSales as countSalesRecords,
  findSaleById,
  findSaleByIdForUpdate,
  findSaleItems,
  getSaleOutstandingAmount,
  listSalePayments,
  listSales as readSales,
  markSaleConfirmed,
  updateSaleDraft as updateSaleDraftRecord,
  updateSaleItemCostSnapshot,
  type NewSaleItem,
  type SaleItemRecord,
  type SalePaymentRecord,
  type SaleRecord,
  type SalesDatabase,
} from "./sales.repository.js";
import type {
  CancelSaleInput,
  ConfirmSaleInput,
  CreateSaleInput,
  ListSalesQuery,
  UpdateSaleDraftInput,
} from "./sales.schema.js";

const MONEY_SCALE = 2;
const QUANTITY_SCALE = 3;

/** Contains the values needed to calculate one sale line before it is stored. */
export interface SaleCalculationItemInput {
  quantity: string;
  conversionToBase: string;
  manualUnitPrice: string;
  itemDiscountAmount: string;
}

/** Contains the calculated values stored with one sale item. */
export interface SaleCalculatedItem {
  baseQuantity: string;
  itemDiscountAmount: string;
  lineTotal: string;
}

/** Contains the header totals produced from all sale items. */
export interface SaleCalculationResult {
  items: SaleCalculatedItem[];
  itemDiscountTotal: string;
  subtotalAmount: string;
  invoiceDiscountAmount: string;
  totalAmount: string;
}

/** Represents one newly saved sale together with its item snapshots. */
export interface CreatedSale {
  sale: SaleRecord;
  items: SaleItemRecord[];
}

/** Represents the read-only detail shown for one saved sale invoice. */
export interface SaleDetail extends CreatedSale {
  payments: SalePaymentRecord[];
  currentOutstandingAmount: string | null;
}

/** Creates a stable Sales business error for the shared error handler. */
function saleError(
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

/** Converts a validated signed decimal string to an integer at the requested scale. */
function decimalToScaledInteger(value: string, scale: number): bigint {
  const negative = value.startsWith("-");
  const unsignedValue = negative ? value.slice(1) : value;
  const [wholePart, fractionPart = ""] = unsignedValue.split(".");
  const paddedFraction = fractionPart.padEnd(scale, "0").slice(0, scale);
  const scaled =
    BigInt(wholePart) * 10n ** BigInt(scale) + BigInt(paddedFraction || "0");

  return negative ? -scaled : scaled;
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
    throw saleError(
      "VALIDATION_ERROR",
      "Sale calculation used an invalid divisor.",
      400,
      "items",
    );
  }

  return (numerator + denominator / 2n) / denominator;
}

/** Calculates quantity multiplied by the manual unit price as exact money cents. */
function calculateLineGrossCents(
  quantity: string,
  manualUnitPrice: string,
): bigint {
  const quantityUnits = decimalToScaledInteger(quantity, QUANTITY_SCALE);
  const unitPriceCents = decimalToScaledInteger(manualUnitPrice, MONEY_SCALE);
  const quantityDivisor = 10n ** BigInt(QUANTITY_SCALE);
  return divideAndRound(quantityUnits * unitPriceCents, quantityDivisor);
}

/** Converts an entered sale quantity into the product base-stock quantity. */
function calculateBaseQuantity(
  quantity: string,
  conversionToBase: string,
): string {
  const quantityUnits = decimalToScaledInteger(quantity, QUANTITY_SCALE);
  const conversionUnits = decimalToScaledInteger(
    conversionToBase,
    QUANTITY_SCALE,
  );
  const scaleDivisor = 10n ** BigInt(QUANTITY_SCALE);
  const baseQuantityUnits = divideAndRound(
    quantityUnits * conversionUnits,
    scaleDivisor,
  );

  if (baseQuantityUnits <= 0n) {
    throw saleError(
      "VALIDATION_ERROR",
      "Sale item base quantity must be greater than zero.",
      400,
      "items",
    );
  }

  return scaledIntegerToDecimal(baseQuantityUnits, QUANTITY_SCALE);
}

/** Calculates sale line totals and invoice totals without changing the database. */
export function calculateSale(
  items: readonly SaleCalculationItemInput[],
  invoiceDiscountAmount: string,
): SaleCalculationResult {
  if (items.length === 0) {
    throw saleError(
      "VALIDATION_ERROR",
      "At least one sale item is required.",
      400,
      "items",
    );
  }

  const calculatedItems = items.map((item) => {
    const grossCents = calculateLineGrossCents(
      item.quantity,
      item.manualUnitPrice,
    );
    const itemDiscountCents = decimalToScaledInteger(
      item.itemDiscountAmount,
      MONEY_SCALE,
    );

    if (itemDiscountCents > grossCents) {
      throw saleError(
        "VALIDATION_ERROR",
        "Item discount cannot exceed the item gross amount.",
        400,
        "items",
      );
    }

    return {
      baseQuantity: calculateBaseQuantity(
        item.quantity,
        item.conversionToBase,
      ),
      itemDiscountCents,
      lineTotalCents: grossCents - itemDiscountCents,
    };
  });

  const itemDiscountTotalCents = calculatedItems.reduce(
    (sum, item) => sum + item.itemDiscountCents,
    0n,
  );
  const subtotalCents = calculatedItems.reduce(
    (sum, item) => sum + item.lineTotalCents,
    0n,
  );
  const invoiceDiscountCents = decimalToScaledInteger(
    invoiceDiscountAmount,
    MONEY_SCALE,
  );

  if (invoiceDiscountCents > subtotalCents) {
    throw saleError(
      "VALIDATION_ERROR",
      "Invoice discount cannot exceed the sale subtotal.",
      400,
      "invoiceDiscountAmount",
    );
  }

  return {
    items: calculatedItems.map((item) => ({
      baseQuantity: item.baseQuantity,
      itemDiscountAmount: scaledIntegerToDecimal(
        item.itemDiscountCents,
        MONEY_SCALE,
      ),
      lineTotal: scaledIntegerToDecimal(item.lineTotalCents, MONEY_SCALE),
    })),
    itemDiscountTotal: scaledIntegerToDecimal(
      itemDiscountTotalCents,
      MONEY_SCALE,
    ),
    subtotalAmount: scaledIntegerToDecimal(subtotalCents, MONEY_SCALE),
    invoiceDiscountAmount: scaledIntegerToDecimal(
      invoiceDiscountCents,
      MONEY_SCALE,
    ),
    totalAmount: scaledIntegerToDecimal(
      subtotalCents - invoiceDiscountCents,
      MONEY_SCALE,
    ),
  };
}

/** Runs creation of a sale header and its items in one PostgreSQL transaction. */
async function requireTransaction<T>(
  database: SalesDatabase,
  work: (transaction: SalesDatabase) => Promise<T>,
): Promise<T> {
  if (!database.transaction) {
    throw saleError(
      "DATABASE_TRANSACTION_REQUIRED",
      "Creating a sale requires a database transaction.",
      500,
    );
  }

  return database.transaction(async (transaction) =>
    work(transaction as unknown as SalesDatabase),
  );
}

/** Ensures the selected customer exists and is active for a new sale. */
async function requireActiveCustomer(
  database: SalesDatabase,
  customerId: string,
) {
  const customer = await findCustomerById(database, customerId);

  if (!customer) {
    throw saleError(
      "CUSTOMER_NOT_FOUND",
      "Customer was not found.",
      404,
      "customerId",
    );
  }

  if (!customer.isActive) {
    throw saleError(
      "CUSTOMER_INACTIVE",
      "An inactive customer cannot be used for a new sale.",
      409,
      "customerId",
    );
  }

  return customer;
}

/** Loads current product and unit data and prepares immutable sale item snapshots. */
async function prepareSaleItems(
  database: SalesDatabase,
  input: CreateSaleInput,
): Promise<{
  calculated: SaleCalculationResult;
  items: Omit<NewSaleItem, "salesInvoiceId">[];
}> {
  const resolvedItems = [];

  for (const item of input.items) {
    const product = await findProductById(database, item.productId);

    if (!product) {
      throw saleError(
        "PRODUCT_NOT_FOUND",
        "Product was not found.",
        404,
        "items",
      );
    }

    if (!product.isActive) {
      throw saleError(
        "PRODUCT_INACTIVE",
        "An inactive product cannot be used for a new sale.",
        409,
        "items",
      );
    }

    const unit = await findProductUnitById(
      database,
      item.productId,
      item.productUnitId,
    );

    if (!unit || !unit.isActive) {
      throw saleError(
        "PRODUCT_UNIT_NOT_ALLOWED",
        "The selected product unit is not active for this product.",
        400,
        "items",
      );
    }

    resolvedItems.push({ input: item, product, unit });
  }

  const calculated = calculateSale(
    resolvedItems.map(({ input: item, unit }) => ({
      quantity: item.quantity,
      conversionToBase: unit.conversionToBase,
      manualUnitPrice: item.manualUnitPrice,
      itemDiscountAmount: item.itemDiscountAmount,
    })),
    input.invoiceDiscountAmount,
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
    manualUnitPrice: item.manualUnitPrice,
    itemDiscountAmount: calculated.items[index].itemDiscountAmount,
    lineTotal: calculated.items[index].lineTotal,
    unitCostSnapshot: null,
  }));

  return { calculated, items };
}

/** Creates a validated DRAFT or HELD sale without changing stock, ledgers, or accounts. */
async function createUnconfirmedSale(
  database: SalesDatabase,
  input: CreateSaleInput,
): Promise<CreatedSale> {
  if (input.status === "CONFIRMED") {
    throw saleError(
      "INVALID_SALE_STATUS",
      "Confirmed sales must use the sale confirmation workflow.",
      409,
      "status",
    );
  }

  await requireActiveCustomer(database, input.customerId);
  const prepared = await prepareSaleItems(database, input);

  const sale = await insertSale(database, {
    customerId: input.customerId,
    invoiceDate: input.invoiceDate,
    status: input.status,
    itemDiscountTotal: prepared.calculated.itemDiscountTotal,
    invoiceDiscountAmount: prepared.calculated.invoiceDiscountAmount,
    subtotalAmount: prepared.calculated.subtotalAmount,
    totalAmount: prepared.calculated.totalAmount,
    initialPaidAmount: null,
    initialDueAmount: null,
    notes: input.notes ?? null,
  });

  if (!sale) {
    throw saleError(
      "SALE_CREATE_FAILED",
      "Sale could not be created.",
      500,
    );
  }

  const items = await createSaleItems(
    database,
    prepared.items.map((item) => ({
      ...item,
      salesInvoiceId: sale.id,
    })),
  );

  if (items.length !== prepared.items.length) {
    throw saleError(
      "SALE_CREATE_FAILED",
      "Sale items could not be created.",
      500,
    );
  }

  return { sale, items };
}

/**
 * Creates a sale using a transaction already owned by the caller.
 * Immediate CONFIRMED requests first create a DRAFT and then use the normal
 * confirmation workflow so stock, ledger, payment, and idempotency stay atomic.
 */
export async function createSaleInTransaction(
  transaction: SalesDatabase,
  input: CreateSaleInput,
): Promise<CreatedSale> {
  const draftInput: CreateSaleInput =
    input.status === "CONFIRMED"
      ? { ...input, status: "DRAFT", initialPayment: undefined }
      : input;
  const created = await createUnconfirmedSale(transaction, draftInput);

  if (input.status === "CONFIRMED") {
    return confirmSaleInTransaction(transaction, created.sale.id, {
      initialPayment: input.initialPayment,
    });
  }

  return created;
}

/** Creates one DRAFT or HELD sale and its item snapshots in one transaction. */
export async function createSale(
  database: SalesDatabase,
  input: CreateSaleInput,
): Promise<CreatedSale> {
  return requireTransaction(database, (transaction) =>
    createSaleInTransaction(transaction, input),
  );
}

/** Contains one paginated Sales list response. */
export interface PaginatedSales {
  items: SaleRecord[];
  total: number;
  page: number;
  pageSize: number;
}

/** Lists sales using the approved customer, status, date, and page filters. */
export async function listSales(
  database: SalesDatabase,
  query: ListSalesQuery,
): Promise<PaginatedSales> {
  const [items, total] = await Promise.all([
    readSales(database, query),
    countSalesRecords(database, query),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize };
}

/** Loads one sale with its item snapshots, allocated receipts, and current outstanding amount. */
export async function getSale(
  database: SalesDatabase,
  saleId: string,
): Promise<SaleDetail> {
  const sale = await findSaleById(database, saleId);

  if (!sale) {
    throw saleError("SALE_NOT_FOUND", "Sale was not found.", 404);
  }

  const [items, payments, currentOutstandingAmount] = await Promise.all([
    findSaleItems(database, saleId),
    listSalePayments(database, saleId),
    sale.status === "CONFIRMED"
      ? getSaleOutstandingAmount(database, saleId)
      : Promise.resolve(null),
  ]);

  return { sale, items, payments, currentOutstandingAmount };
}


/** Calculates a new invoice discount against the already saved draft subtotal. */
function recalculateDraftDiscount(
  subtotalAmount: string,
  invoiceDiscountAmount: string,
): { invoiceDiscountAmount: string; totalAmount: string } {
  const subtotalCents = decimalToScaledInteger(subtotalAmount, MONEY_SCALE);
  const discountCents = decimalToScaledInteger(
    invoiceDiscountAmount,
    MONEY_SCALE,
  );

  if (discountCents > subtotalCents) {
    throw saleError(
      "VALIDATION_ERROR",
      "Invoice discount cannot exceed the sale subtotal.",
      400,
      "invoiceDiscountAmount",
    );
  }

  return {
    invoiceDiscountAmount: scaledIntegerToDecimal(discountCents, MONEY_SCALE),
    totalAmount: scaledIntegerToDecimal(
      subtotalCents - discountCents,
      MONEY_SCALE,
    ),
  };
}

/** Updates a DRAFT or HELD sale while keeping all recalculated values consistent. */
export async function updateSaleDraft(
  database: SalesDatabase,
  saleId: string,
  input: UpdateSaleDraftInput,
): Promise<CreatedSale> {
  return requireTransaction(database, async (transaction) => {
    const existingSale = await findSaleByIdForUpdate(transaction, saleId);

    if (!existingSale) {
      throw saleError("SALE_NOT_FOUND", "Sale was not found.", 404);
    }

    if (existingSale.status !== "DRAFT" && existingSale.status !== "HELD") {
      throw saleError(
        "INVALID_SALE_STATUS",
        "Only a draft or held sale can be edited.",
        409,
      );
    }

    const customerId = input.customerId ?? existingSale.customerId;
    if (input.customerId) {
      await requireActiveCustomer(transaction, customerId);
    }

    let savedItems: SaleItemRecord[];
    let itemDiscountTotal = existingSale.itemDiscountTotal;
    let subtotalAmount = existingSale.subtotalAmount;
    let invoiceDiscountAmount =
      input.invoiceDiscountAmount ?? existingSale.invoiceDiscountAmount;
    let totalAmount = existingSale.totalAmount;

    if (input.items) {
      const prepared = await prepareSaleItems(transaction, {
        customerId,
        invoiceDate: input.invoiceDate ?? existingSale.invoiceDate,
        status: input.status ?? existingSale.status,
        items: input.items,
        invoiceDiscountAmount,
        notes: input.notes ?? existingSale.notes,
      });

      itemDiscountTotal = prepared.calculated.itemDiscountTotal;
      subtotalAmount = prepared.calculated.subtotalAmount;
      invoiceDiscountAmount = prepared.calculated.invoiceDiscountAmount;
      totalAmount = prepared.calculated.totalAmount;

      await deleteSaleDraftItems(transaction, saleId);
      savedItems = await createSaleItems(
        transaction,
        prepared.items.map((item) => ({
          ...item,
          salesInvoiceId: saleId,
        })),
      );

      if (savedItems.length !== prepared.items.length) {
        throw saleError(
          "SALE_UPDATE_FAILED",
          "Sale items could not be updated.",
          500,
        );
      }
    } else {
      savedItems = await findSaleItems(transaction, saleId);

      if (input.invoiceDiscountAmount !== undefined) {
        const recalculated = recalculateDraftDiscount(
          subtotalAmount,
          input.invoiceDiscountAmount,
        );
        invoiceDiscountAmount = recalculated.invoiceDiscountAmount;
        totalAmount = recalculated.totalAmount;
      }
    }

    const updatedSale = await updateSaleDraftRecord(transaction, saleId, {
      ...(input.customerId !== undefined ? { customerId } : {}),
      ...(input.invoiceDate !== undefined
        ? { invoiceDate: input.invoiceDate }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
      itemDiscountTotal,
      subtotalAmount,
      invoiceDiscountAmount,
      totalAmount,
    });

    if (!updatedSale) {
      throw saleError(
        "SALE_UPDATE_FAILED",
        "Sale could not be updated.",
        409,
      );
    }

    return { sale: updatedSale, items: savedItems };
  });
}

/** Cancels only a DRAFT sale and leaves confirmed financial records untouched. */
export async function cancelSaleDraft(
  database: SalesDatabase,
  saleId: string,
  input: CancelSaleInput,
): Promise<SaleRecord> {
  return requireTransaction(database, async (transaction) => {
    const existingSale = await findSaleByIdForUpdate(transaction, saleId);

    if (!existingSale) {
      throw saleError("SALE_NOT_FOUND", "Sale was not found.", 404);
    }

    if (existingSale.status !== "DRAFT") {
      throw saleError(
        "INVALID_SALE_STATUS",
        "Only a draft sale can be cancelled.",
        409,
      );
    }

    const cancelledSale = await markSaleDraftCancelled(
      transaction,
      saleId,
      new Date(),
      input.note ?? undefined,
    );

    if (!cancelledSale) {
      throw saleError(
        "SALE_CANCEL_FAILED",
        "Sale could not be cancelled.",
        409,
      );
    }

    return cancelledSale;
  });
}


/** Adds all validated payment split amounts and returns an exact money string. */
function calculateInitialPaidAmount(input: ConfirmSaleInput): string {
  const cents = input.initialPayment?.splits.reduce(
    (sum, split) => sum + decimalToScaledInteger(split.amount, MONEY_SCALE),
    0n,
  ) ?? 0n;

  return scaledIntegerToDecimal(cents, MONEY_SCALE);
}

/** Ensures one registered customer will not exceed the configured credit limit. */
async function requireCustomerCreditWithinLimit(
  database: SalesDatabase,
  customerId: string,
  creditLimit: string,
  newDueAmount: string,
): Promise<void> {
  const currentDue = await getCustomerCurrentDue(database, customerId);
  const currentDueCents = decimalToScaledInteger(currentDue, MONEY_SCALE);
  const newDueCents = decimalToScaledInteger(newDueAmount, MONEY_SCALE);
  const creditLimitCents = decimalToScaledInteger(creditLimit, MONEY_SCALE);

  if (currentDueCents + newDueCents > creditLimitCents) {
    throw saleError(
      "CUSTOMER_CREDIT_LIMIT_EXCEEDED",
      "Customer credit limit would be exceeded by this sale.",
      409,
      "customerId",
    );
  }
}

/** Converts the sale business date in Asia/Karachi to the UTC instant used by movements. */
function saleDateToOccurredAt(invoiceDate: string): Date {
  return new Date(`${invoiceDate}T00:00:00+05:00`);
}

/** Formats one reserved SALE sequence value without hiding the sequence rule in the route. */
function formatSaleNumber(prefix: string, number: number): string {
  return `${prefix}-${number}`;
}

/**
 * Confirms one sale using a transaction already owned by the caller.
 * Stock, customer ledger, optional initial receipt, cost snapshots, and the
 * confirmed invoice are written together so a failure rolls everything back.
 */
export async function confirmSaleInTransaction(
  transaction: SalesDatabase,
  saleId: string,
  input: ConfirmSaleInput,
): Promise<CreatedSale> {
  const sale = await findSaleByIdForUpdate(transaction, saleId);

  if (!sale) {
    throw saleError("SALE_NOT_FOUND", "Sale was not found.", 404);
  }

  if (sale.status !== "DRAFT" && sale.status !== "HELD") {
    throw saleError(
      "INVALID_SALE_STATUS",
      "Only a draft or held sale can be confirmed.",
      409,
    );
  }

  // Lock the customer before financial writes so concurrent confirmations for
  // the same customer use one stable customer state and lock order.
  const customer = await findCustomerByIdForUpdate(transaction, sale.customerId);
  if (!customer) {
    throw saleError(
      "CUSTOMER_NOT_FOUND",
      "Customer was not found.",
      404,
      "customerId",
    );
  }
  if (!customer.isActive) {
    throw saleError(
      "CUSTOMER_INACTIVE",
      "An inactive customer cannot be used for a new sale.",
      409,
      "customerId",
    );
  }

  const items = await findSaleItems(transaction, sale.id);
  if (items.length === 0) {
    throw saleError(
      "SALE_ITEMS_NOT_FOUND",
      "Sale draft has no items to confirm.",
      409,
    );
  }

  // Re-check current product and unit activity immediately before confirmation.
  for (const item of items) {
    const product = await findProductById(transaction, item.productId);
    if (!product || !product.isActive) {
      throw saleError(
        "PRODUCT_INACTIVE",
        "A sale product is missing or inactive.",
        409,
        "items",
      );
    }

    const unit = await findProductUnitById(
      transaction,
      item.productId,
      item.productUnitId,
    );
    if (!unit || !unit.isActive) {
      throw saleError(
        "PRODUCT_UNIT_NOT_ALLOWED",
        "A sale product unit is missing or inactive.",
        409,
        "items",
      );
    }
  }

  const paidCents = decimalToScaledInteger(
    calculateInitialPaidAmount(input),
    MONEY_SCALE,
  );
  const totalCents = decimalToScaledInteger(sale.totalAmount, MONEY_SCALE);

  if (paidCents > totalCents) {
    throw saleError(
      "PAYMENT_EXCEEDS_TOTAL",
      "Initial payment cannot exceed the sale total.",
      400,
      "initialPayment",
    );
  }

  // Walk-in sales must be fully paid because the protected Walk-in Customer
  // is never allowed to carry a customer-ledger due balance.
  if (customer.isWalkIn && paidCents !== totalCents) {
    throw saleError(
      "WALK_IN_CUSTOMER_CREDIT_NOT_ALLOWED",
      "Walk-in Customer sales must be fully paid before confirmation.",
      400,
      "initialPayment",
    );
  }

  const initialPaidAmount = scaledIntegerToDecimal(paidCents, MONEY_SCALE);
  const initialDueAmount = scaledIntegerToDecimal(
    totalCents - paidCents,
    MONEY_SCALE,
  );

  // The customer row is already locked above. Reading the ledger after that lock
  // serializes concurrent sale confirmations for the same customer, so each sale
  // checks the latest committed due before adding its own new due amount.
  if (!customer.isWalkIn) {
    await requireCustomerCreditWithinLimit(
      transaction,
      customer.id,
      customer.creditLimit,
      initialDueAmount,
    );
  }

  const reservedNumber = await reserveBusinessDocumentNumberInTransaction(
    transaction,
    "SALE",
  );
  const invoiceNumber = formatSaleNumber(
    reservedNumber.prefix,
    reservedNumber.number,
  );
  const occurredAt = saleDateToOccurredAt(sale.invoiceDate);

  // Product ordering keeps concurrent stock locks predictable across confirmations.
  const orderedItems = [...items].sort((left, right) =>
    left.productId.localeCompare(right.productId),
  );

  for (const item of orderedItems) {
    const movement = await recordSaleStockOut(transaction, {
      productId: item.productId,
      quantity: item.baseQuantity,
      saleId: sale.id,
      occurredAt,
    });

    const savedItem = await updateSaleItemCostSnapshot(
      transaction,
      item.id,
      movement.unitCost,
    );
    if (!savedItem) {
      throw saleError(
        "SALE_CONFIRMATION_FAILED",
        "Sale item cost snapshot could not be saved.",
        500,
      );
    }
  }

  // Debit the full confirmed invoice. Any initial receipt writes its own
  // CUSTOMER_PAYMENT credit, so the ledger balance becomes the remaining due.
  await writeCustomerDebit(transaction, {
    customerId: sale.customerId,
    amount: sale.totalAmount,
    occurredAt,
    referenceType: "SALE",
    referenceId: sale.id,
    documentNumber: invoiceNumber,
    description: `Sale ${invoiceNumber}`,
    notes: sale.notes,
  });

  if (input.initialPayment) {
    await recordSaleInitialCustomerReceipt(transaction, {
      customerId: sale.customerId,
      saleId: sale.id,
      saleNumber: invoiceNumber,
      paymentDate: occurredAt,
      splits: input.initialPayment.splits,
      notes: sale.notes,
    });
  }

  const confirmedSale = await markSaleConfirmed(transaction, sale.id, {
    invoiceNumber,
    initialPaidAmount,
    initialDueAmount,
    confirmedAt: new Date(),
  });

  if (!confirmedSale) {
    throw saleError(
      "SALE_CONFIRMATION_FAILED",
      "Sale could not be confirmed.",
      409,
    );
  }

  return {
    sale: confirmedSale,
    items: await findSaleItems(transaction, sale.id),
  };
}
