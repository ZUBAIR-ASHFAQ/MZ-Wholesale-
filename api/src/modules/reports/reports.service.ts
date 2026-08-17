import { AppError } from "../../shared/errors/app-error.js";

import type {
  CashBankReportQuery,
  CustomerAgingReportQuery,
  CustomerOutstandingReportQuery,
  ExpenseReportQuery,
  InventoryReportQuery,
  InventoryValuationReportQuery,
  ProductProfitReportQuery,
  ProfitSummaryReportQuery,
  PurchasesReportQuery,
  SalesReportQuery,
  SupplierAgingReportQuery,
  SupplierPayableReportQuery,
} from "./reports.schema.js";
import {
  readCashBankReportSourceRows,
  reportAccountExists,
  reportCustomerExists,
  reportExpenseCategoryExists,
  reportProductExists,
  reportProductCategoryExists,
  reportSupplierExists,
  readCustomerOutstandingReportPage,
  listExpenseReportRows,
  readInventoryReportSourceRows,
  listCustomerAging,
  listInventoryValuation,
  listSupplierAging,
  readProductProfitReportSourceRows,
  readPurchasesReportSourceRows,
  readSalesReportSourceRows,
  readSupplierPayableReportPage,
  type CashBankReportAccountRow,
  type CashBankReportMovementRow,
  type CustomerOutstandingReportRow,
  type ExpenseReportRow,
  type InventoryReportMovementRow,
  type InventoryReportStockRow,
  type CustomerAgingRow,
  type CustomerAgingTotals,
  type InventoryValuationRow,
  type InventoryValuationTotals,
  type PurchasesReportPurchaseRow,
  type PurchasesReportReturnRow,
  type ReportsDatabase,
  type SalesReportReturnRow,
  type SalesReportSaleRow,
  type SupplierAgingRow,
  type SupplierAgingTotals,
  type SupplierPayableReportRow,
} from "./reports.repository.js";

const MONEY_SCALE = 2;

/** Represents one detail row returned by the Sales Report service. */
export interface SalesReportRow {
  documentType: "SALE" | "RETURN";
  documentId: string;
  documentNumber: string;
  documentDate: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  productId: string;
  productSku: string;
  productName: string;
  unitName: string;
  quantity: string;
  baseQuantity: string;
  unitPrice: string;
  amount: string;
}

/** Contains the exact money totals shown above Sales Report details. */
export interface SalesReportTotals {
  salesAmount: string;
  returnAmount: string;
  netSalesAmount: string;
}

/** Contains Sales Report totals and the matching sale/return detail rows. */
export interface SalesReportResult {
  totals: SalesReportTotals;
  rows: SalesReportRow[];
}

/** Converts a two-decimal database money string into exact integer cents. */
function moneyToCents(value: string): bigint {
  const [wholePart, decimalPart = ""] = value.split(".");
  return BigInt(wholePart) * 100n + BigInt(decimalPart.padEnd(MONEY_SCALE, "0"));
}

/** Converts exact signed integer cents into the API's two-decimal string format. */
function centsToMoney(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(MONEY_SCALE, "0");
  return `${sign}${whole}.${fraction}`;
}

/** Allocates one invoice discount across its item values without losing cents. */
function allocateInvoiceDiscount(
  discountCents: bigint,
  itemValues: readonly bigint[],
): bigint[] {
  const total = itemValues.reduce((sum, value) => sum + value, 0n);

  if (discountCents === 0n || total === 0n) {
    return itemValues.map(() => 0n);
  }

  const allocations = itemValues.map((value) => (discountCents * value) / total);
  let remaining = discountCents - allocations.reduce((sum, value) => sum + value, 0n);

  const remainderOrder = itemValues
    .map((value, index) => ({
      index,
      remainder: (discountCents * value) % total,
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

/** Calculates each sale line's final value after its invoice-discount share. */
function calculateSaleItemValues(sales: readonly SalesReportSaleRow[]): Map<string, bigint> {
  const rowsBySale = new Map<string, SalesReportSaleRow[]>();

  for (const row of sales) {
    const existingRows = rowsBySale.get(row.saleId) ?? [];
    existingRows.push(row);
    rowsBySale.set(row.saleId, existingRows);
  }

  const values = new Map<string, bigint>();

  for (const saleRows of rowsBySale.values()) {
    const lineValues = saleRows.map((row) => moneyToCents(row.lineTotal));
    const invoiceDiscount = moneyToCents(saleRows[0].invoiceDiscountAmount);
    const discountShares = allocateInvoiceDiscount(invoiceDiscount, lineValues);

    saleRows.forEach((row, index) => {
      values.set(row.saleItemId, lineValues[index] - discountShares[index]);
    });
  }

  return values;
}

/** Converts one confirmed sale source row into a Sales Report detail row. */
function buildSaleReportRow(row: SalesReportSaleRow, amountCents: bigint): SalesReportRow {
  return {
    documentType: "SALE",
    documentId: row.saleId,
    documentNumber: row.invoiceNumber ?? "",
    documentDate: row.documentDate,
    customerId: row.customerId,
    customerCode: row.customerCode,
    customerName: row.customerName,
    productId: row.productId,
    productSku: row.productSku,
    productName: row.productName,
    unitName: row.unitName,
    quantity: row.quantity,
    baseQuantity: row.baseQuantity,
    unitPrice: row.manualUnitPrice,
    amount: centsToMoney(amountCents),
  };
}

/** Converts one confirmed return source row into a Sales Report detail row. */
function buildReturnReportRow(row: SalesReportReturnRow): SalesReportRow {
  return {
    documentType: "RETURN",
    documentId: row.salesReturnId,
    documentNumber: row.returnNumber,
    documentDate: row.documentDate,
    customerId: row.customerId,
    customerCode: row.customerCode,
    customerName: row.customerName,
    productId: row.productId,
    productSku: row.productSku,
    productName: row.productName,
    unitName: row.unitName,
    quantity: row.quantity,
    baseQuantity: row.baseQuantity,
    unitPrice: row.unitPriceSnapshot,
    amount: row.lineTotal,
  };
}

/** Sorts Sales Report details by business date and document number. */
function sortSalesReportRows(rows: SalesReportRow[]): SalesReportRow[] {
  return rows.sort((left, right) => {
    const dateComparison = left.documentDate.localeCompare(right.documentDate);
    if (dateComparison !== 0) return dateComparison;

    const numberComparison = left.documentNumber.localeCompare(right.documentNumber);
    if (numberComparison !== 0) return numberComparison;

    return left.productName.localeCompare(right.productName);
  });
}

/** Builds the read-only Sales Report from confirmed sales and confirmed returns. */
export async function getSalesReport(
  database: ReportsDatabase,
  query: SalesReportQuery,
): Promise<SalesReportResult> {
  // Read all sale lines in the selected date/customer range so invoice discounts
  // can be allocated exactly before an optional product filter is applied.
  const sourceRows = await readSalesReportSourceRows(database, {
    ...query,
    productId: undefined,
  });
  const saleItemValues = calculateSaleItemValues(sourceRows.sales);
  const matchingSales = query.productId
    ? sourceRows.sales.filter((row) => row.productId === query.productId)
    : sourceRows.sales;
  const matchingReturns = query.productId
    ? sourceRows.returns.filter((row) => row.productId === query.productId)
    : sourceRows.returns;

  let salesCents = 0n;
  let returnCents = 0n;

  const saleRows = matchingSales.map((row) => {
    const amountCents = saleItemValues.get(row.saleItemId) ?? 0n;
    salesCents += amountCents;
    return buildSaleReportRow(row, amountCents);
  });

  const returnRows = matchingReturns.map((row) => {
    returnCents += moneyToCents(row.lineTotal);
    return buildReturnReportRow(row);
  });

  return {
    totals: {
      salesAmount: centsToMoney(salesCents),
      returnAmount: centsToMoney(returnCents),
      netSalesAmount: centsToMoney(salesCents - returnCents),
    },
    rows: sortSalesReportRows([...saleRows, ...returnRows]),
  };
}


/** Represents one detail row returned by the Purchase Report service. */
export interface PurchasesReportRow {
  documentType: "PURCHASE" | "RETURN";
  documentId: string;
  documentNumber: string;
  documentDate: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  productId: string;
  productSku: string;
  productName: string;
  unitName: string;
  quantity: string;
  baseQuantity: string;
  unitCost: string;
  amount: string;
}

/** Contains the exact money totals shown above Purchase Report details. */
export interface PurchasesReportTotals {
  purchasesAmount: string;
  returnAmount: string;
  netPurchasesAmount: string;
}

/** Contains Purchase Report totals and matching purchase/return detail rows. */
export interface PurchasesReportResult {
  totals: PurchasesReportTotals;
  rows: PurchasesReportRow[];
}

/** Calculates each purchase line's final landed value after shared invoice discount and extra cost. */
function calculatePurchaseItemValues(
  purchaseRows: readonly PurchasesReportPurchaseRow[],
): Map<string, bigint> {
  const rowsByPurchase = new Map<string, PurchasesReportPurchaseRow[]>();

  for (const row of purchaseRows) {
    const existingRows = rowsByPurchase.get(row.purchaseId) ?? [];
    existingRows.push(row);
    rowsByPurchase.set(row.purchaseId, existingRows);
  }

  const values = new Map<string, bigint>();

  for (const rows of rowsByPurchase.values()) {
    const lineValues = rows.map((row) => moneyToCents(row.lineTotal));
    const invoiceDiscount = moneyToCents(rows[0].invoiceDiscountAmount);
    const discountShares = allocateInvoiceDiscount(invoiceDiscount, lineValues);

    rows.forEach((row, index) => {
      const extraCost = moneyToCents(row.allocatedExtraCost);
      values.set(
        row.purchaseItemId,
        lineValues[index] - discountShares[index] + extraCost,
      );
    });
  }

  return values;
}

/** Converts one confirmed purchase row into a Purchase Report detail row. */
function buildPurchaseReportRow(
  row: PurchasesReportPurchaseRow,
  amountCents: bigint,
): PurchasesReportRow {
  return {
    documentType: "PURCHASE",
    documentId: row.purchaseId,
    documentNumber: row.purchaseNumber ?? "",
    documentDate: row.documentDate,
    supplierId: row.supplierId,
    supplierCode: row.supplierCode,
    supplierName: row.supplierName,
    productId: row.productId,
    productSku: row.productSku,
    productName: row.productName,
    unitName: row.unitName,
    quantity: row.quantity,
    baseQuantity: row.baseQuantity,
    unitCost: row.unitCost,
    amount: centsToMoney(amountCents),
  };
}

/** Converts one confirmed purchase-return row into a Purchase Report detail row. */
function buildPurchaseReturnReportRow(
  row: PurchasesReportReturnRow,
): PurchasesReportRow {
  return {
    documentType: "RETURN",
    documentId: row.purchaseReturnId,
    documentNumber: row.returnNumber,
    documentDate: row.documentDate,
    supplierId: row.supplierId,
    supplierCode: row.supplierCode,
    supplierName: row.supplierName,
    productId: row.productId,
    productSku: row.productSku,
    productName: row.productName,
    unitName: row.unitName,
    quantity: row.quantity,
    baseQuantity: row.baseQuantity,
    unitCost: row.unitCostSnapshot,
    amount: row.lineTotal,
  };
}

/** Sorts Purchase Report rows by business date and document number. */
function sortPurchasesReportRows(rows: PurchasesReportRow[]): PurchasesReportRow[] {
  return rows.sort((left, right) => {
    const dateComparison = left.documentDate.localeCompare(right.documentDate);
    if (dateComparison !== 0) return dateComparison;

    const numberComparison = left.documentNumber.localeCompare(right.documentNumber);
    if (numberComparison !== 0) return numberComparison;

    return left.productName.localeCompare(right.productName);
  });
}

/** Builds the read-only Purchase Report from confirmed purchases and confirmed returns. */
export async function getPurchasesReport(
  database: ReportsDatabase,
  query: PurchasesReportQuery,
): Promise<PurchasesReportResult> {
  // Read every purchase line before product filtering so the shared invoice
  // discount is allocated across the full immutable purchase consistently.
  const sourceRows = await readPurchasesReportSourceRows(database, {
    ...query,
    productId: undefined,
  });
  const purchaseItemValues = calculatePurchaseItemValues(sourceRows.purchases);
  const matchingPurchases = query.productId
    ? sourceRows.purchases.filter((row) => row.productId === query.productId)
    : sourceRows.purchases;
  const matchingReturns = query.productId
    ? sourceRows.returns.filter((row) => row.productId === query.productId)
    : sourceRows.returns;

  let purchasesCents = 0n;
  let returnCents = 0n;

  const purchaseRows = matchingPurchases.map((row) => {
    const amountCents = purchaseItemValues.get(row.purchaseItemId) ?? 0n;
    purchasesCents += amountCents;
    return buildPurchaseReportRow(row, amountCents);
  });

  const returnRows = matchingReturns.map((row) => {
    returnCents += moneyToCents(row.lineTotal);
    return buildPurchaseReturnReportRow(row);
  });

  return {
    totals: {
      purchasesAmount: centsToMoney(purchasesCents),
      returnAmount: centsToMoney(returnCents),
      netPurchasesAmount: centsToMoney(purchasesCents - returnCents),
    },
    rows: sortPurchasesReportRows([...purchaseRows, ...returnRows]),
  };
}

/** Represents one immutable movement returned by the Inventory Report service. */
export interface InventoryReportMovement {
  movementId: string;
  productId: string;
  productSku: string;
  productName: string;
  occurredAt: string;
  movementType: InventoryReportMovementRow["movementType"];
  stockCondition: InventoryReportMovementRow["stockCondition"];
  direction: InventoryReportMovementRow["direction"];
  quantity: string;
  unitCost: string;
  allocatedExtraCost: string | null;
  sourceType: string | null;
  sourceId: string | null;
  reason: string | null;
  notes: string | null;
}

/** Contains current stock plus the selected date-range movement history. */
export interface InventoryReportResult {
  stock: InventoryReportStockRow[];
  movements: InventoryReportMovement[];
}

/** Converts a database movement timestamp into the API ISO timestamp format. */
function buildInventoryMovementRow(
  row: InventoryReportMovementRow,
): InventoryReportMovement {
  return {
    ...row,
    occurredAt: row.occurredAt.toISOString(),
  };
}

/** Builds the read-only Inventory Report from balances and immutable movements. */
export async function getInventoryReport(
  database: ReportsDatabase,
  query: InventoryReportQuery,
): Promise<InventoryReportResult> {
  const sourceRows = await readInventoryReportSourceRows(database, query);

  return {
    stock: sourceRows.stock,
    movements: sourceRows.movements.map(buildInventoryMovementRow),
  };
}

/** Contains one paginated Inventory Valuation Report response. */
export interface InventoryValuationReportResult {
  items: InventoryValuationRow[];
  totals: InventoryValuationTotals;
  page: number;
  pageSize: number;
  total: number;
}

/** Builds the read-only Inventory Valuation Report from current stock balances. */
export async function getInventoryValuationReport(
  database: ReportsDatabase,
  query: InventoryValuationReportQuery,
): Promise<InventoryValuationReportResult> {
  const sourcePage = await listInventoryValuation(database, {
    search: query.search,
    categoryId: query.categoryId,
    isActive: query.active,
    page: query.page,
    pageSize: query.pageSize,
  });

  return {
    items: sourcePage.items,
    totals: sourcePage.totals,
    page: query.page,
    pageSize: query.pageSize,
    total: sourcePage.total,
  };
}

/** Contains one paginated Customer Aging Report response. */
export interface CustomerAgingReportResult {
  items: CustomerAgingRow[];
  totals: CustomerAgingTotals;
  page: number;
  pageSize: number;
  total: number;
}

/** Builds the read-only Customer Aging Report from confirmed unpaid sales. */
export async function getCustomerAgingReport(
  database: ReportsDatabase,
  query: CustomerAgingReportQuery,
): Promise<CustomerAgingReportResult> {
  const sourcePage = await listCustomerAging(database, query);

  return {
    items: sourcePage.items,
    totals: sourcePage.totals,
    page: query.page,
    pageSize: query.pageSize,
    total: sourcePage.total,
  };
}

/** Contains one paginated Supplier Aging Report response. */
export interface SupplierAgingReportResult {
  items: SupplierAgingRow[];
  totals: SupplierAgingTotals;
  page: number;
  pageSize: number;
  total: number;
}

/** Builds the read-only Supplier Aging Report from confirmed unpaid purchases. */
export async function getSupplierAgingReport(
  database: ReportsDatabase,
  query: SupplierAgingReportQuery,
): Promise<SupplierAgingReportResult> {
  const sourcePage = await listSupplierAging(database, query);

  return {
    items: sourcePage.items,
    totals: sourcePage.totals,
    page: query.page,
    pageSize: query.pageSize,
    total: sourcePage.total,
  };
}

/** Contains one paginated Customer Outstanding Report response. */
export interface CustomerOutstandingReportResult {
  items: CustomerOutstandingReportRow[];
  page: number;
  pageSize: number;
  total: number;
}

/** Builds the read-only Customer Outstanding Report from the customer ledger. */
export async function getCustomerOutstandingReport(
  database: ReportsDatabase,
  query: CustomerOutstandingReportQuery,
): Promise<CustomerOutstandingReportResult> {
  const sourcePage = await readCustomerOutstandingReportPage(database, query);

  return {
    items: sourcePage.items.map((item) => ({
      ...item,
      outstandingAmount: centsToMoney(moneyToCents(item.outstandingAmount)),
    })),
    page: query.page,
    pageSize: query.pageSize,
    total: sourcePage.total,
  };
}



/** Contains one paginated Supplier Payable Report response. */
export interface SupplierPayableReportResult {
  items: SupplierPayableReportRow[];
  page: number;
  pageSize: number;
  total: number;
}

/** Builds the read-only Supplier Payable Report from the supplier ledger. */
export async function getSupplierPayableReport(
  database: ReportsDatabase,
  query: SupplierPayableReportQuery,
): Promise<SupplierPayableReportResult> {
  const sourcePage = await readSupplierPayableReportPage(database, query);

  return {
    items: sourcePage.items.map((item) => ({
      ...item,
      payableAmount: centsToMoney(moneyToCents(item.payableAmount)),
    })),
    page: query.page,
    pageSize: query.pageSize,
    total: sourcePage.total,
  };
}

/** Represents one movement returned by the Cash/Bank Report service. */
export interface CashBankReportMovement {
  movementId: string;
  businessDate: string;
  occurredAt: string;
  direction: CashBankReportMovementRow["direction"];
  sourceType: string;
  sourceId: string | null;
  amount: string;
  documentNumber: string | null;
  description: string | null;
}

/** Represents one account summary returned by the Cash/Bank Report. */
export interface CashBankReportAccount {
  accountId: string;
  accountType: CashBankReportAccountRow["accountType"];
  accountName: string;
  accountReference: string | null;
  openingBalance: string;
  inflowAmount: string;
  outflowAmount: string;
  closingBalance: string;
  movements: CashBankReportMovement[];
}

/** Contains all matching cash and bank account summaries. */
export interface CashBankReportResult {
  accounts: CashBankReportAccount[];
}

/** Applies one movement's direction to an exact signed account balance. */
function applyMovement(balance: bigint, movement: CashBankReportMovementRow): bigint {
  const amount = moneyToCents(movement.amount);
  return movement.direction === "INFLOW" ? balance + amount : balance - amount;
}

/** Builds one Cash/Bank Report account summary from its immutable movements. */
function buildCashBankReportAccount(
  account: CashBankReportAccountRow,
  movements: readonly CashBankReportMovementRow[],
  startDate: string,
): CashBankReportAccount {
  let openingBalance = 0n;
  let inflowAmount = 0n;
  let outflowAmount = 0n;
  const periodMovements: CashBankReportMovement[] = [];

  for (const movement of movements) {
    if (movement.businessDate < startDate) {
      openingBalance = applyMovement(openingBalance, movement);
      continue;
    }

    const amount = moneyToCents(movement.amount);
    if (movement.direction === "INFLOW") inflowAmount += amount;
    else outflowAmount += amount;

    periodMovements.push({
      movementId: movement.movementId,
      businessDate: movement.businessDate,
      occurredAt: movement.occurredAt.toISOString(),
      direction: movement.direction,
      sourceType: movement.sourceType,
      sourceId: movement.sourceId,
      amount: centsToMoney(amount),
      documentNumber: movement.documentNumber,
      description: movement.description,
    });
  }

  return {
    ...account,
    openingBalance: centsToMoney(openingBalance),
    inflowAmount: centsToMoney(inflowAmount),
    outflowAmount: centsToMoney(outflowAmount),
    closingBalance: centsToMoney(openingBalance + inflowAmount - outflowAmount),
    movements: periodMovements,
  };
}

/** Builds the read-only Cash/Bank Report with opening, movement, and closing balances. */
export async function getCashBankReport(
  database: ReportsDatabase,
  query: CashBankReportQuery,
): Promise<CashBankReportResult> {
  const sourceRows = await readCashBankReportSourceRows(database, query);

  return {
    accounts: sourceRows.accounts.map((account) =>
      buildCashBankReportAccount(
        account,
        sourceRows.movements.filter(
          (movement) =>
            movement.accountId === account.accountId &&
            movement.accountType === account.accountType,
        ),
        query.startDate,
      ),
    ),
  };
}

/** Represents one expense or reversal row returned by the Expense Report service. */
export interface ExpenseReportDetailRow {
  documentType: "EXPENSE" | "REVERSAL";
  expenseId: string;
  expenseNumber: string;
  documentDate: string;
  categoryId: string;
  categoryName: string;
  paymentMethod: ExpenseReportRow["paymentMethod"];
  accountId: string;
  accountName: string;
  amount: string;
  note: string | null;
  receiptUrl: string | null;
  reversalOfExpenseId: string | null;
  reversalReason: string | null;
}

/** Contains the exact money totals shown above Expense Report rows. */
export interface ExpenseReportTotals {
  expenseAmount: string;
  reversalAmount: string;
  netExpenseAmount: string;
}

/** Contains Expense Report totals and the matching immutable rows. */
export interface ExpenseReportResult {
  totals: ExpenseReportTotals;
  rows: ExpenseReportDetailRow[];
}

/** Returns the exact payment account identity stored on one expense row. */
function getExpenseReportAccount(row: ExpenseReportRow): { id: string; name: string } {
  if (row.paymentMethod === "CASH") {
    return {
      id: row.cashAccountId ?? "",
      name: row.cashAccountName ?? "",
    };
  }

  const bankLabel = [row.bankName, row.bankAccountName, row.bankAccountNumber]
    .filter(Boolean)
    .join(" - ");

  return {
    id: row.bankAccountId ?? "",
    name: bankLabel,
  };
}

/** Converts one immutable expense row into the Expense Report detail shape. */
function buildExpenseReportDetailRow(row: ExpenseReportRow): ExpenseReportDetailRow {
  const account = getExpenseReportAccount(row);
  const isReversal = row.reversalOfExpenseId !== null;
  const amount = moneyToCents(row.amount);

  return {
    documentType: isReversal ? "REVERSAL" : "EXPENSE",
    expenseId: row.expenseId,
    expenseNumber: row.expenseNumber,
    documentDate: row.documentDate,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    paymentMethod: row.paymentMethod,
    accountId: account.id,
    accountName: account.name,
    amount: centsToMoney(isReversal ? -amount : amount),
    note: row.note,
    receiptUrl: row.receiptUrl,
    reversalOfExpenseId: row.reversalOfExpenseId,
    reversalReason: row.reversalReason,
  };
}

/** Builds the read-only Expense Report and deducts linked reversals on their own date. */
export async function getExpenseReport(
  database: ReportsDatabase,
  query: ExpenseReportQuery,
): Promise<ExpenseReportResult> {
  const sourceRows = await listExpenseReportRows(database, query);
  let expenseCents = 0n;
  let reversalCents = 0n;

  for (const row of sourceRows) {
    const amount = moneyToCents(row.amount);
    if (row.reversalOfExpenseId) reversalCents += amount;
    else expenseCents += amount;
  }

  return {
    totals: {
      expenseAmount: centsToMoney(expenseCents),
      reversalAmount: centsToMoney(reversalCents),
      netExpenseAmount: centsToMoney(expenseCents - reversalCents),
    },
    rows: sourceRows.map(buildExpenseReportDetailRow),
  };
}

/** Contains the exact estimated profit figures returned by the Profit Summary Report. */
export interface ProfitSummaryReportResult {
  salesAmount: string;
  salesReturnAmount: string;
  netSalesAmount: string;
  costOfGoodsSoldAmount: string;
  returnedCostAmount: string;
  netCostAmount: string;
  grossProfitAmount: string;
  expenseAmount: string;
  expenseReversalAmount: string;
  netExpenseAmount: string;
  estimatedProfitAmount: string;
}

/** Converts a three-decimal base quantity into exact thousandths. */
function quantityToThousandths(value: string): bigint {
  const [wholePart, decimalPart = ""] = value.split(".");
  return BigInt(wholePart) * 1000n + BigInt(decimalPart.padEnd(3, "0"));
}

/** Multiplies a base quantity by a two-decimal unit cost and rounds to cents. */
function calculateCostCents(baseQuantity: string, unitCost: string): bigint {
  const quantity = quantityToThousandths(baseQuantity);
  const cost = moneyToCents(unitCost);
  const scaled = quantity * cost;
  const wholeCents = scaled / 1000n;
  const remainder = scaled % 1000n;

  return remainder >= 500n ? wholeCents + 1n : wholeCents;
}

/** Builds the read-only estimated Profit Summary from immutable sales, returns, and expenses. */
export async function getProfitSummaryReport(
  database: ReportsDatabase,
  query: ProfitSummaryReportQuery,
): Promise<ProfitSummaryReportResult> {
  const [salesSourceRows, expenseRows] = await Promise.all([
    readSalesReportSourceRows(database, query),
    listExpenseReportRows(database, query),
  ]);

  const saleItemValues = calculateSaleItemValues(salesSourceRows.sales);
  let salesCents = 0n;
  let salesReturnCents = 0n;
  let soldCostCents = 0n;
  let returnedCostCents = 0n;
  let expenseCents = 0n;
  let expenseReversalCents = 0n;

  for (const row of salesSourceRows.sales) {
    salesCents += saleItemValues.get(row.saleItemId) ?? 0n;

    // A confirmed sale must have a cost snapshot; ignore a legacy null snapshot
    // rather than using today's weighted cost and changing historical profit.
    if (row.unitCostSnapshot !== null) {
      soldCostCents += calculateCostCents(row.baseQuantity, row.unitCostSnapshot);
    }
  }

  for (const row of salesSourceRows.returns) {
    salesReturnCents += moneyToCents(row.lineTotal);
    returnedCostCents += calculateCostCents(row.baseQuantity, row.unitCostSnapshot);
  }

  for (const row of expenseRows) {
    const amount = moneyToCents(row.amount);
    if (row.reversalOfExpenseId) expenseReversalCents += amount;
    else expenseCents += amount;
  }

  const netSalesCents = salesCents - salesReturnCents;
  const netCostCents = soldCostCents - returnedCostCents;
  const grossProfitCents = netSalesCents - netCostCents;
  const netExpenseCents = expenseCents - expenseReversalCents;

  return {
    salesAmount: centsToMoney(salesCents),
    salesReturnAmount: centsToMoney(salesReturnCents),
    netSalesAmount: centsToMoney(netSalesCents),
    costOfGoodsSoldAmount: centsToMoney(soldCostCents),
    returnedCostAmount: centsToMoney(returnedCostCents),
    netCostAmount: centsToMoney(netCostCents),
    grossProfitAmount: centsToMoney(grossProfitCents),
    expenseAmount: centsToMoney(expenseCents),
    expenseReversalAmount: centsToMoney(expenseReversalCents),
    netExpenseAmount: centsToMoney(netExpenseCents),
    estimatedProfitAmount: centsToMoney(grossProfitCents - netExpenseCents),
  };
}


/** Represents one product row returned by the Product Profit Report. */
export interface ProductProfitReportRow {
  productId: string;
  productSku: string;
  productName: string;
  soldBaseQuantity: string;
  returnedBaseQuantity: string;
  netBaseQuantity: string;
  salesAmount: string;
  returnAmount: string;
  netSalesAmount: string;
  costOfGoodsSoldAmount: string;
  returnedCostAmount: string;
  netCostAmount: string;
  estimatedProfitAmount: string;
}

/** Contains a paginated Product Profit Report result. */
export interface ProductProfitReportResult {
  items: ProductProfitReportRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface ProductProfitAccumulator {
  productId: string;
  productSku: string;
  productName: string;
  soldQuantity: bigint;
  returnedQuantity: bigint;
  salesCents: bigint;
  returnCents: bigint;
  soldCostCents: bigint;
  returnedCostCents: bigint;
}

/** Converts exact quantity thousandths into the API's three-decimal string format. */
function thousandthsToQuantity(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = absolute / 1000n;
  const fraction = (absolute % 1000n).toString().padStart(3, "0");
  return `${sign}${whole}.${fraction}`;
}

/** Gets or creates the accumulator used for one product in the Product Profit Report. */
function getProductProfitAccumulator(
  productsById: Map<string, ProductProfitAccumulator>,
  productId: string,
  productSku: string,
  productName: string,
): ProductProfitAccumulator {
  const existing = productsById.get(productId);
  if (existing) return existing;

  const created: ProductProfitAccumulator = {
    productId,
    productSku,
    productName,
    soldQuantity: 0n,
    returnedQuantity: 0n,
    salesCents: 0n,
    returnCents: 0n,
    soldCostCents: 0n,
    returnedCostCents: 0n,
  };
  productsById.set(productId, created);
  return created;
}

/** Converts accumulated exact values into one Product Profit Report response row. */
function buildProductProfitReportRow(
  product: ProductProfitAccumulator,
): ProductProfitReportRow {
  const netSalesCents = product.salesCents - product.returnCents;
  const netCostCents = product.soldCostCents - product.returnedCostCents;

  return {
    productId: product.productId,
    productSku: product.productSku,
    productName: product.productName,
    soldBaseQuantity: thousandthsToQuantity(product.soldQuantity),
    returnedBaseQuantity: thousandthsToQuantity(product.returnedQuantity),
    netBaseQuantity: thousandthsToQuantity(
      product.soldQuantity - product.returnedQuantity,
    ),
    salesAmount: centsToMoney(product.salesCents),
    returnAmount: centsToMoney(product.returnCents),
    netSalesAmount: centsToMoney(netSalesCents),
    costOfGoodsSoldAmount: centsToMoney(product.soldCostCents),
    returnedCostAmount: centsToMoney(product.returnedCostCents),
    netCostAmount: centsToMoney(netCostCents),
    estimatedProfitAmount: centsToMoney(netSalesCents - netCostCents),
  };
}

/** Builds the read-only Product Profit Report from immutable sale and return snapshots. */
export async function getProductProfitReport(
  database: ReportsDatabase,
  query: ProductProfitReportQuery,
): Promise<ProductProfitReportResult> {
  const sourceRows = await readProductProfitReportSourceRows(database, query);
  const saleItemValues = calculateSaleItemValues(sourceRows.sales);
  const productsById = new Map<string, ProductProfitAccumulator>();

  for (const row of sourceRows.sales) {
    const product = getProductProfitAccumulator(
      productsById,
      row.productId,
      row.productSku,
      row.productName,
    );
    product.soldQuantity += quantityToThousandths(row.baseQuantity);
    product.salesCents += saleItemValues.get(row.saleItemId) ?? 0n;

    // Keep historical product profit tied to the immutable sale cost snapshot.
    if (row.unitCostSnapshot !== null) {
      product.soldCostCents += calculateCostCents(
        row.baseQuantity,
        row.unitCostSnapshot,
      );
    }
  }

  for (const row of sourceRows.returns) {
    const product = getProductProfitAccumulator(
      productsById,
      row.productId,
      row.productSku,
      row.productName,
    );
    product.returnedQuantity += quantityToThousandths(row.baseQuantity);
    product.returnCents += moneyToCents(row.lineTotal);
    product.returnedCostCents += calculateCostCents(
      row.baseQuantity,
      row.unitCostSnapshot,
    );
  }

  const matchingProducts = [...productsById.values()]
    .filter((product) => !query.productId || product.productId === query.productId)
    .sort((left, right) => {
      const nameComparison = left.productName.localeCompare(right.productName);
      if (nameComparison !== 0) return nameComparison;
      return left.productSku.localeCompare(right.productSku);
    });

  const offset = (query.page - 1) * query.pageSize;
  const pageItems = matchingProducts.slice(offset, offset + query.pageSize);

  return {
    items: pageItems.map(buildProductProfitReportRow),
    total: matchingProducts.length,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** Exposes the approved read-only reports through one small service used by the routes layer. */
export interface ReportsService {
  getSalesReport(query: SalesReportQuery): Promise<SalesReportResult>;
  getPurchasesReport(query: PurchasesReportQuery): Promise<PurchasesReportResult>;
  getInventoryReport(query: InventoryReportQuery): Promise<InventoryReportResult>;
  getInventoryValuationReport(
    query: InventoryValuationReportQuery,
  ): Promise<InventoryValuationReportResult>;
  getCustomerAgingReport(
    query: CustomerAgingReportQuery,
  ): Promise<CustomerAgingReportResult>;
  getSupplierAgingReport(
    query: SupplierAgingReportQuery,
  ): Promise<SupplierAgingReportResult>;
  getCustomerOutstandingReport(
    query: CustomerOutstandingReportQuery,
  ): Promise<CustomerOutstandingReportResult>;
  getSupplierPayableReport(
    query: SupplierPayableReportQuery,
  ): Promise<SupplierPayableReportResult>;
  getCashBankReport(query: CashBankReportQuery): Promise<CashBankReportResult>;
  getExpenseReport(query: ExpenseReportQuery): Promise<ExpenseReportResult>;
  getProfitSummaryReport(
    query: ProfitSummaryReportQuery,
  ): Promise<ProfitSummaryReportResult>;
  getProductProfitReport(
    query: ProductProfitReportQuery,
  ): Promise<ProductProfitReportResult>;
}

/** Throws the stable report-filter error used when a selected entity does not exist. */
function invalidReportFilter(field: string, message: string): never {
  throw new AppError(
    "INVALID_REPORT_FILTER",
    "The report contains an invalid filter.",
    400,
    [{ field, message }],
  );
}

/** Validates optional Sales Report entity filters before reading report rows. */
async function validateSalesFilters(
  database: ReportsDatabase,
  query: SalesReportQuery,
): Promise<void> {
  if (query.customerId && !(await reportCustomerExists(database, query.customerId))) {
    invalidReportFilter("customerId", "The selected customer does not exist.");
  }
  if (query.productId && !(await reportProductExists(database, query.productId))) {
    invalidReportFilter("productId", "The selected product does not exist.");
  }
}

/** Validates optional Purchase Report entity filters before reading report rows. */
async function validatePurchaseFilters(
  database: ReportsDatabase,
  query: PurchasesReportQuery,
): Promise<void> {
  if (query.supplierId && !(await reportSupplierExists(database, query.supplierId))) {
    invalidReportFilter("supplierId", "The selected supplier does not exist.");
  }
  if (query.productId && !(await reportProductExists(database, query.productId))) {
    invalidReportFilter("productId", "The selected product does not exist.");
  }
}

/** Validates one optional product filter shared by inventory and product-profit reports. */
async function validateProductFilter(
  database: ReportsDatabase,
  productId: string | undefined,
): Promise<void> {
  if (productId && !(await reportProductExists(database, productId))) {
    invalidReportFilter("productId", "The selected product does not exist.");
  }
}

/** Validates the optional category filter used by Inventory Valuation. */
async function validateInventoryValuationFilters(
  database: ReportsDatabase,
  query: InventoryValuationReportQuery,
): Promise<void> {
  if (
    query.categoryId &&
    !(await reportProductCategoryExists(database, query.categoryId))
  ) {
    invalidReportFilter(
      "categoryId",
      "The selected product category does not exist.",
    );
  }
}

/** Creates the Reports service and keeps database wiring out of route handlers. */
export function createReportsService(database: ReportsDatabase): ReportsService {
  return {
    getSalesReport: async (query) => {
      await validateSalesFilters(database, query);
      return getSalesReport(database, query);
    },
    getPurchasesReport: async (query) => {
      await validatePurchaseFilters(database, query);
      return getPurchasesReport(database, query);
    },
    getInventoryReport: async (query) => {
      await validateProductFilter(database, query.productId);
      return getInventoryReport(database, query);
    },
    getInventoryValuationReport: async (query) => {
      await validateInventoryValuationFilters(database, query);
      return getInventoryValuationReport(database, query);
    },
    getCustomerAgingReport: (query) => getCustomerAgingReport(database, query),
    getSupplierAgingReport: (query) => getSupplierAgingReport(database, query),
    getCustomerOutstandingReport: (query) =>
      getCustomerOutstandingReport(database, query),
    getSupplierPayableReport: (query) => getSupplierPayableReport(database, query),
    getCashBankReport: async (query) => {
      if (query.accountId && !(await reportAccountExists(database, query.accountId))) {
        invalidReportFilter("accountId", "The selected cash or bank account does not exist.");
      }
      return getCashBankReport(database, query);
    },
    getExpenseReport: async (query) => {
      if (
        query.categoryId &&
        !(await reportExpenseCategoryExists(database, query.categoryId))
      ) {
        invalidReportFilter("categoryId", "The selected expense category does not exist.");
      }
      return getExpenseReport(database, query);
    },
    getProfitSummaryReport: (query) => getProfitSummaryReport(database, query),
    getProductProfitReport: async (query) => {
      await validateProductFilter(database, query.productId);
      return getProductProfitReport(database, query);
    },
  };
}
