import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  bankAccounts,
  brands,
  cashAccounts,
  cashBankMovements,
  customerLedgerEntries,
  customerPaymentAllocations,
  customerPayments,
  customers,
  attendanceRecords,
  employeeAdvanceRecoveries,
  employeeAdvances,
  employees,
  expenseCategories,
  expenses,
  inventoryBalances,
  productCategories,
  products,
  productUnits,
  purchaseItems,
  purchases,
  purchaseReturnItems,
  purchaseReturns,
  payrollItems,
  payrollRuns,
  salaryPaymentAllocations,
  salaryPayments,
  salesInvoiceItems,
  salesInvoices,
  salesReturnItems,
  salesReturns,
  stockMovements,
  supplierLedgerEntries,
  supplierPaymentAllocations,
  supplierPayments,
  suppliers,
} from "../../database/schema/index.js";
import type {
  AttendanceSummaryReportQuery,
  CashBankReportQuery,
  CustomerOutstandingReportQuery,
  EmployeeAdvanceOutstandingReportQuery,
  EmployeeRegisterReportQuery,
  ExpenseReportQuery,
  InventoryReportQuery,
  LaborCostSummaryReportQuery,
  PayrollRegisterReportQuery,
  ProductProfitReportQuery,
  PurchasesReportQuery,
  SalaryPayableReportQuery,
  SalesReportQuery,
  SupplierPayableReportQuery,
} from "./reports.schema.js";

/** Contains only the read operations required by the Reports repository. */
export type ReportsDatabase = Pick<NodePgDatabase, "select" | "execute">;

/** Contains validated page values used by paginated reports. */
export interface ReportPagination {
  page: number;
  pageSize: number;
}

/** Contains the repository filters used by the Inventory Valuation report. */
export interface InventoryValuationRepositoryQuery extends ReportPagination {
  search?: string;
  categoryId?: string;
  isActive?: boolean;
}

/** Represents one current product balance read for inventory valuation. */
export interface InventoryValuationRow {
  productId: string;
  productSku: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  isActive: boolean;
  sellableQuantity: string;
  damagedQuantity: string;
  expiredQuantity: string;
  totalQuantity: string;
  weightedAverageCost: string;
  sellableValue: string;
  damagedValue: string;
  expiredValue: string;
  totalValue: string;
}

/** Contains totals for every product matching the Inventory Valuation filters. */
export interface InventoryValuationTotals {
  sellableQuantity: string;
  damagedQuantity: string;
  expiredQuantity: string;
  totalQuantity: string;
  sellableValue: string;
  damagedValue: string;
  expiredValue: string;
  totalValue: string;
}

/** Contains one paginated source page and full filtered totals for inventory valuation. */
export interface InventoryValuationSourcePage {
  items: InventoryValuationRow[];
  total: number;
  totals: InventoryValuationTotals;
}

/** Contains the repository filters used by the Customer Aging report. */
export interface CustomerAgingRepositoryQuery extends ReportPagination {
  asOfDate: string;
  search?: string;
}

/** Represents one customer's unpaid confirmed invoices grouped into aging buckets. */
export interface CustomerAgingRow {
  customerId: string;
  customerCode: string;
  customerName: string;
  phone: string | null;
  bucket0To30: string;
  bucket31To60: string;
  bucket61To90: string;
  bucket90Plus: string;
  totalOutstanding: string;
}

/** Contains Customer Aging totals for every matching customer, not only the current page. */
export interface CustomerAgingTotals {
  bucket0To30: string;
  bucket31To60: string;
  bucket61To90: string;
  bucket90Plus: string;
  totalOutstanding: string;
}

/** Contains one paginated Customer Aging page and totals for the full filtered result. */
export interface CustomerAgingSourcePage {
  items: CustomerAgingRow[];
  total: number;
  totals: CustomerAgingTotals;
}


/** Contains the repository filters used by the Supplier Aging report. */
export interface SupplierAgingRepositoryQuery extends ReportPagination {
  asOfDate: string;
  search?: string;
}

/** Represents one supplier's unpaid confirmed purchases grouped into aging buckets. */
export interface SupplierAgingRow {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  phone: string | null;
  bucket0To30: string;
  bucket31To60: string;
  bucket61To90: string;
  bucket90Plus: string;
  totalPayable: string;
}

/** Contains Supplier Aging totals for every matching supplier, not only the current page. */
export interface SupplierAgingTotals {
  bucket0To30: string;
  bucket31To60: string;
  bucket61To90: string;
  bucket90Plus: string;
  totalPayable: string;
}

/** Contains one paginated Supplier Aging page and totals for the full filtered result. */
export interface SupplierAgingSourcePage {
  items: SupplierAgingRow[];
  total: number;
  totals: SupplierAgingTotals;
}


/** Returns true when a customer filter points to an existing customer. */
export async function reportCustomerExists(
  database: ReportsDatabase,
  customerId: string,
): Promise<boolean> {
  const rows = await database
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  return rows.length === 1;
}

/** Returns true when a supplier filter points to an existing supplier. */
export async function reportSupplierExists(
  database: ReportsDatabase,
  supplierId: string,
): Promise<boolean> {
  const rows = await database
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);
  return rows.length === 1;
}

/** Returns true when a product filter points to an existing product. */
export async function reportProductExists(
  database: ReportsDatabase,
  productId: string,
): Promise<boolean> {
  const rows = await database
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  return rows.length === 1;
}

/** Returns true when an inventory-valuation category filter exists. */
export async function reportProductCategoryExists(
  database: ReportsDatabase,
  categoryId: string,
): Promise<boolean> {
  const rows = await database
    .select({ id: productCategories.id })
    .from(productCategories)
    .where(eq(productCategories.id, categoryId))
    .limit(1);
  return rows.length === 1;
}

/** Returns true when an account filter points to an existing cash or bank account. */
export async function reportAccountExists(
  database: ReportsDatabase,
  accountId: string,
): Promise<boolean> {
  const [cashRows, bankRows] = await Promise.all([
    database
      .select({ id: cashAccounts.id })
      .from(cashAccounts)
      .where(eq(cashAccounts.id, accountId))
      .limit(1),
    database
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(eq(bankAccounts.id, accountId))
      .limit(1),
  ]);
  return cashRows.length === 1 || bankRows.length === 1;
}

/** Returns true when an expense-category filter points to an existing category. */
export async function reportExpenseCategoryExists(
  database: ReportsDatabase,
  categoryId: string,
): Promise<boolean> {
  const rows = await database
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(eq(expenseCategories.id, categoryId))
    .limit(1);
  return rows.length === 1;
}

/** Represents one confirmed sale item read by the Sales Report. */
export interface SalesReportSaleRow {
  saleId: string;
  invoiceNumber: string | null;
  documentDate: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  saleItemId: string;
  productId: string;
  productSku: string;
  productName: string;
  unitName: string;
  quantity: string;
  baseQuantity: string;
  manualUnitPrice: string;
  unitCostSnapshot: string | null;
  itemDiscountAmount: string;
  lineTotal: string;
  invoiceSubtotalAmount: string;
  invoiceDiscountAmount: string;
  invoiceTotalAmount: string;
}

/** Represents one confirmed Sales Return item read by the Sales Report. */
export interface SalesReportReturnRow {
  salesReturnId: string;
  returnNumber: string;
  originalSaleId: string;
  documentDate: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  salesReturnItemId: string;
  originalSaleItemId: string;
  productId: string;
  productSku: string;
  productName: string;
  unitName: string;
  quantity: string;
  baseQuantity: string;
  unitPriceSnapshot: string;
  unitCostSnapshot: string;
  lineTotal: string;
}

/** Contains the source rows required to build the Sales Report. */
export interface SalesReportSourceRows {
  sales: SalesReportSaleRow[];
  returns: SalesReportReturnRow[];
}

/** Calculates the SQL offset for a validated report page. */
function getReportOffset(pagination: ReportPagination): number {
  return (pagination.page - 1) * pagination.pageSize;
}

/** Builds the confirmed-sale filters approved for the Sales Report. */
function buildSalesReportSaleFilters(query: SalesReportQuery): SQL[] {
  const filters: SQL[] = [
    eq(salesInvoices.status, "CONFIRMED"),
    gte(salesInvoices.invoiceDate, query.startDate),
    lte(salesInvoices.invoiceDate, query.endDate),
  ];

  if (query.customerId) {
    filters.push(eq(salesInvoices.customerId, query.customerId));
  }

  if (query.productId) {
    filters.push(eq(salesInvoiceItems.productId, query.productId));
  }

  return filters;
}

/** Builds the confirmed-return filters approved for the Sales Report. */
function buildSalesReportReturnFilters(query: SalesReportQuery): SQL[] {
  const filters: SQL[] = [
    eq(salesReturns.status, "CONFIRMED"),
    gte(salesReturns.returnDate, query.startDate),
    lte(salesReturns.returnDate, query.endDate),
  ];

  if (query.customerId) {
    filters.push(eq(salesReturns.customerId, query.customerId));
  }

  if (query.productId) {
    filters.push(eq(salesReturnItems.productId, query.productId));
  }

  return filters;
}

/** Reads confirmed sale items for the Sales Report without changing source data. */
async function listSalesReportSaleRows(
  database: ReportsDatabase,
  query: SalesReportQuery,
): Promise<SalesReportSaleRow[]> {
  return database
    .select({
      saleId: salesInvoices.id,
      invoiceNumber: salesInvoices.invoiceNumber,
      documentDate: salesInvoices.invoiceDate,
      customerId: customers.id,
      customerCode: customers.code,
      customerName: customers.name,
      saleItemId: salesInvoiceItems.id,
      productId: salesInvoiceItems.productId,
      productSku: salesInvoiceItems.productSkuSnapshot,
      productName: salesInvoiceItems.productNameSnapshot,
      unitName: salesInvoiceItems.unitNameSnapshot,
      quantity: salesInvoiceItems.quantity,
      baseQuantity: salesInvoiceItems.baseQuantity,
      manualUnitPrice: salesInvoiceItems.manualUnitPrice,
      unitCostSnapshot: salesInvoiceItems.unitCostSnapshot,
      itemDiscountAmount: salesInvoiceItems.itemDiscountAmount,
      lineTotal: salesInvoiceItems.lineTotal,
      invoiceSubtotalAmount: salesInvoices.subtotalAmount,
      invoiceDiscountAmount: salesInvoices.invoiceDiscountAmount,
      invoiceTotalAmount: salesInvoices.totalAmount,
    })
    .from(salesInvoiceItems)
    .innerJoin(
      salesInvoices,
      eq(salesInvoices.id, salesInvoiceItems.salesInvoiceId),
    )
    .innerJoin(customers, eq(customers.id, salesInvoices.customerId))
    .where(and(...buildSalesReportSaleFilters(query)))
    .orderBy(
      asc(salesInvoices.invoiceDate),
      asc(salesInvoices.invoiceNumber),
      asc(salesInvoiceItems.createdAt),
      asc(salesInvoiceItems.id),
    );
}

/** Reads confirmed Sales Return items on their return date for the Sales Report. */
async function listSalesReportReturnRows(
  database: ReportsDatabase,
  query: SalesReportQuery,
): Promise<SalesReportReturnRow[]> {
  return database
    .select({
      salesReturnId: salesReturns.id,
      returnNumber: salesReturns.returnNumber,
      originalSaleId: salesReturns.originalSaleId,
      documentDate: salesReturns.returnDate,
      customerId: customers.id,
      customerCode: customers.code,
      customerName: customers.name,
      salesReturnItemId: salesReturnItems.id,
      originalSaleItemId: salesReturnItems.originalSaleItemId,
      productId: salesReturnItems.productId,
      productSku: salesReturnItems.productSkuSnapshot,
      productName: salesReturnItems.productNameSnapshot,
      unitName: salesReturnItems.unitNameSnapshot,
      quantity: salesReturnItems.quantity,
      baseQuantity: salesReturnItems.baseQuantity,
      unitPriceSnapshot: salesReturnItems.unitPriceSnapshot,
      unitCostSnapshot: salesReturnItems.unitCostSnapshot,
      lineTotal: salesReturnItems.lineTotal,
    })
    .from(salesReturnItems)
    .innerJoin(
      salesReturns,
      eq(salesReturns.id, salesReturnItems.salesReturnId),
    )
    .innerJoin(customers, eq(customers.id, salesReturns.customerId))
    .where(and(...buildSalesReportReturnFilters(query)))
    .orderBy(
      asc(salesReturns.returnDate),
      asc(salesReturns.returnNumber),
      asc(salesReturnItems.createdAt),
      asc(salesReturnItems.id),
    );
}

/** Reads the confirmed sale and return rows required by one Sales Report request. */
export async function readSalesReportSourceRows(
  database: ReportsDatabase,
  query: SalesReportQuery,
): Promise<SalesReportSourceRows> {
  const [sales, returns] = await Promise.all([
    listSalesReportSaleRows(database, query),
    listSalesReportReturnRows(database, query),
  ]);

  return { sales, returns };
}


/** Represents one confirmed purchase item read by the Purchase Report. */
export interface PurchasesReportPurchaseRow {
  purchaseId: string;
  purchaseNumber: string | null;
  documentDate: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  purchaseItemId: string;
  productId: string;
  productSku: string;
  productName: string;
  unitName: string;
  quantity: string;
  baseQuantity: string;
  unitCost: string;
  lineTotal: string;
  invoiceDiscountAmount: string;
  allocatedExtraCost: string;
}

/** Represents one confirmed Purchase Return item read by the Purchase Report. */
export interface PurchasesReportReturnRow {
  purchaseReturnId: string;
  returnNumber: string;
  originalPurchaseId: string;
  documentDate: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  purchaseReturnItemId: string;
  originalPurchaseItemId: string;
  productId: string;
  productSku: string;
  productName: string;
  unitName: string;
  quantity: string;
  baseQuantity: string;
  unitCostSnapshot: string;
  lineTotal: string;
}

/** Contains the source rows required to build the Purchase Report. */
export interface PurchasesReportSourceRows {
  purchases: PurchasesReportPurchaseRow[];
  returns: PurchasesReportReturnRow[];
}

/** Builds confirmed-purchase filters approved for the Purchase Report. */
function buildPurchasesReportPurchaseFilters(query: PurchasesReportQuery): SQL[] {
  const filters: SQL[] = [
    eq(purchases.status, "CONFIRMED"),
    gte(purchases.purchaseDate, query.startDate),
    lte(purchases.purchaseDate, query.endDate),
  ];

  if (query.supplierId) {
    filters.push(eq(purchases.supplierId, query.supplierId));
  }

  if (query.productId) {
    filters.push(eq(purchaseItems.productId, query.productId));
  }

  return filters;
}

/** Builds confirmed-return filters approved for the Purchase Report. */
function buildPurchasesReportReturnFilters(query: PurchasesReportQuery): SQL[] {
  const filters: SQL[] = [
    eq(purchaseReturns.status, "CONFIRMED"),
    gte(purchaseReturns.returnDate, query.startDate),
    lte(purchaseReturns.returnDate, query.endDate),
  ];

  if (query.supplierId) {
    filters.push(eq(purchaseReturns.supplierId, query.supplierId));
  }

  if (query.productId) {
    filters.push(eq(purchaseReturnItems.productId, query.productId));
  }

  return filters;
}

/** Reads confirmed purchase items without changing operational data. */
async function listPurchasesReportPurchaseRows(
  database: ReportsDatabase,
  query: PurchasesReportQuery,
): Promise<PurchasesReportPurchaseRow[]> {
  return database
    .select({
      purchaseId: purchases.id,
      purchaseNumber: purchases.purchaseNumber,
      documentDate: purchases.purchaseDate,
      supplierId: suppliers.id,
      supplierCode: suppliers.code,
      supplierName: suppliers.name,
      purchaseItemId: purchaseItems.id,
      productId: purchaseItems.productId,
      productSku: purchaseItems.productSkuSnapshot,
      productName: purchaseItems.productNameSnapshot,
      unitName: purchaseItems.unitNameSnapshot,
      quantity: purchaseItems.quantity,
      baseQuantity: purchaseItems.baseQuantity,
      unitCost: purchaseItems.unitCost,
      lineTotal: purchaseItems.lineTotal,
      invoiceDiscountAmount: purchases.invoiceDiscountAmount,
      allocatedExtraCost: purchaseItems.allocatedExtraCost,
    })
    .from(purchaseItems)
    .innerJoin(purchases, eq(purchases.id, purchaseItems.purchaseId))
    .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .where(and(...buildPurchasesReportPurchaseFilters(query)))
    .orderBy(
      asc(purchases.purchaseDate),
      asc(purchases.purchaseNumber),
      asc(purchaseItems.createdAt),
      asc(purchaseItems.id),
    );
}

/** Reads confirmed Purchase Return items on their actual return date. */
async function listPurchasesReportReturnRows(
  database: ReportsDatabase,
  query: PurchasesReportQuery,
): Promise<PurchasesReportReturnRow[]> {
  return database
    .select({
      purchaseReturnId: purchaseReturns.id,
      returnNumber: purchaseReturns.returnNumber,
      originalPurchaseId: purchaseReturns.originalPurchaseId,
      documentDate: purchaseReturns.returnDate,
      supplierId: suppliers.id,
      supplierCode: suppliers.code,
      supplierName: suppliers.name,
      purchaseReturnItemId: purchaseReturnItems.id,
      originalPurchaseItemId: purchaseReturnItems.originalPurchaseItemId,
      productId: purchaseReturnItems.productId,
      productSku: purchaseReturnItems.productSkuSnapshot,
      productName: purchaseReturnItems.productNameSnapshot,
      unitName: purchaseReturnItems.unitNameSnapshot,
      quantity: purchaseReturnItems.quantity,
      baseQuantity: purchaseReturnItems.baseQuantity,
      unitCostSnapshot: purchaseReturnItems.unitCostSnapshot,
      lineTotal: purchaseReturnItems.lineTotal,
    })
    .from(purchaseReturnItems)
    .innerJoin(
      purchaseReturns,
      eq(purchaseReturns.id, purchaseReturnItems.purchaseReturnId),
    )
    .innerJoin(suppliers, eq(suppliers.id, purchaseReturns.supplierId))
    .where(and(...buildPurchasesReportReturnFilters(query)))
    .orderBy(
      asc(purchaseReturns.returnDate),
      asc(purchaseReturns.returnNumber),
      asc(purchaseReturnItems.createdAt),
      asc(purchaseReturnItems.id),
    );
}

/** Reads the confirmed purchase and return rows required by one Purchase Report request. */
export async function readPurchasesReportSourceRows(
  database: ReportsDatabase,
  query: PurchasesReportQuery,
): Promise<PurchasesReportSourceRows> {
  const [purchaseRows, returnRows] = await Promise.all([
    listPurchasesReportPurchaseRows(database, query),
    listPurchasesReportReturnRows(database, query),
  ]);

  return { purchases: purchaseRows, returns: returnRows };
}

/** Builds product filters used by the Inventory Valuation repository query. */
function buildInventoryValuationFilters(
  query: InventoryValuationRepositoryQuery,
): SQL[] {
  const filters: SQL[] = [];

  if (query.search) {
    const search = `%${query.search}%`;
    const searchFilter = or(
      ilike(products.sku, search),
      ilike(products.name, search),
      ilike(products.barcode, search),
    );

    if (searchFilter) {
      filters.push(searchFilter);
    }
  }

  if (query.categoryId) {
    filters.push(eq(products.categoryId, query.categoryId));
  }

  if (query.isActive !== undefined) {
    filters.push(eq(products.isActive, query.isActive));
  }

  return filters;
}

/** Reads one page of current product quantities, cost and calculated stock values. */
async function listInventoryValuationRows(
  database: ReportsDatabase,
  query: InventoryValuationRepositoryQuery,
): Promise<InventoryValuationRow[]> {
  const filters = buildInventoryValuationFilters(query);

  return database
    .select({
      productId: products.id,
      productSku: products.sku,
      productName: products.name,
      categoryId: productCategories.id,
      categoryName: productCategories.name,
      isActive: products.isActive,
      sellableQuantity: sql<string>`cast(coalesce(${inventoryBalances.sellableQuantityOnHand}, 0.000) as numeric(14,3))`,
      damagedQuantity: sql<string>`cast(coalesce(${inventoryBalances.damagedQuantityOnHand}, 0.000) as numeric(14,3))`,
      expiredQuantity: sql<string>`cast(coalesce(${inventoryBalances.expiredQuantityOnHand}, 0.000) as numeric(14,3))`,
      totalQuantity: sql<string>`cast(
        coalesce(${inventoryBalances.sellableQuantityOnHand}, 0.000)
        + coalesce(${inventoryBalances.damagedQuantityOnHand}, 0.000)
        + coalesce(${inventoryBalances.expiredQuantityOnHand}, 0.000)
        as numeric(14,3)
      )`,
      weightedAverageCost: sql<string>`cast(coalesce(${inventoryBalances.weightedAverageCost}, 0.00) as numeric(14,2))`,
      sellableValue: sql<string>`cast(
        coalesce(${inventoryBalances.sellableQuantityOnHand}, 0.000)
        * coalesce(${inventoryBalances.weightedAverageCost}, 0.00)
        as numeric(20,2)
      )`,
      damagedValue: sql<string>`cast(
        coalesce(${inventoryBalances.damagedQuantityOnHand}, 0.000)
        * coalesce(${inventoryBalances.damagedWeightedAverageCost}, 0.00)
        as numeric(20,2)
      )`,
      expiredValue: sql<string>`cast(
        coalesce(${inventoryBalances.expiredQuantityOnHand}, 0.000)
        * coalesce(${inventoryBalances.expiredWeightedAverageCost}, 0.00)
        as numeric(20,2)
      )`,
      totalValue: sql<string>`cast(
        coalesce(${inventoryBalances.sellableQuantityOnHand}, 0.000)
          * coalesce(${inventoryBalances.weightedAverageCost}, 0.00)
        + coalesce(${inventoryBalances.damagedQuantityOnHand}, 0.000)
          * coalesce(${inventoryBalances.damagedWeightedAverageCost}, 0.00)
        + coalesce(${inventoryBalances.expiredQuantityOnHand}, 0.000)
          * coalesce(${inventoryBalances.expiredWeightedAverageCost}, 0.00)
        as numeric(20,2)
      )`,
    })
    .from(products)
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .leftJoin(inventoryBalances, eq(inventoryBalances.productId, products.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(asc(products.name), asc(products.sku), asc(products.id))
    .limit(query.pageSize)
    .offset(getReportOffset(query));
}

/** Reads the matching product count and full filtered valuation totals. */
async function readInventoryValuationTotals(
  database: ReportsDatabase,
  query: InventoryValuationRepositoryQuery,
): Promise<{ total: number; totals: InventoryValuationTotals }> {
  const filters = buildInventoryValuationFilters(query);
  const rows = await database
    .select({
      total: count(),
      sellableQuantity: sql<string>`cast(coalesce(sum(${inventoryBalances.sellableQuantityOnHand}), 0.000) as numeric(20,3))`,
      damagedQuantity: sql<string>`cast(coalesce(sum(${inventoryBalances.damagedQuantityOnHand}), 0.000) as numeric(20,3))`,
      expiredQuantity: sql<string>`cast(coalesce(sum(${inventoryBalances.expiredQuantityOnHand}), 0.000) as numeric(20,3))`,
      totalQuantity: sql<string>`cast(coalesce(sum(
        coalesce(${inventoryBalances.sellableQuantityOnHand}, 0.000)
        + coalesce(${inventoryBalances.damagedQuantityOnHand}, 0.000)
        + coalesce(${inventoryBalances.expiredQuantityOnHand}, 0.000)
      ), 0.000) as numeric(20,3))`,
      sellableValue: sql<string>`cast(coalesce(sum(
        coalesce(${inventoryBalances.sellableQuantityOnHand}, 0.000)
        * coalesce(${inventoryBalances.weightedAverageCost}, 0.00)
      ), 0.00) as numeric(24,2))`,
      damagedValue: sql<string>`cast(coalesce(sum(
        coalesce(${inventoryBalances.damagedQuantityOnHand}, 0.000)
        * coalesce(${inventoryBalances.damagedWeightedAverageCost}, 0.00)
      ), 0.00) as numeric(24,2))`,
      expiredValue: sql<string>`cast(coalesce(sum(
        coalesce(${inventoryBalances.expiredQuantityOnHand}, 0.000)
        * coalesce(${inventoryBalances.expiredWeightedAverageCost}, 0.00)
      ), 0.00) as numeric(24,2))`,
      totalValue: sql<string>`cast(coalesce(sum(
        coalesce(${inventoryBalances.sellableQuantityOnHand}, 0.000)
          * coalesce(${inventoryBalances.weightedAverageCost}, 0.00)
        + coalesce(${inventoryBalances.damagedQuantityOnHand}, 0.000)
          * coalesce(${inventoryBalances.damagedWeightedAverageCost}, 0.00)
        + coalesce(${inventoryBalances.expiredQuantityOnHand}, 0.000)
          * coalesce(${inventoryBalances.expiredWeightedAverageCost}, 0.00)
      ), 0.00) as numeric(24,2))`,
    })
    .from(products)
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .leftJoin(inventoryBalances, eq(inventoryBalances.productId, products.id))
    .where(filters.length > 0 ? and(...filters) : undefined);

  const row = rows[0];

  return {
    total: row?.total ?? 0,
    totals: {
      sellableQuantity: row?.sellableQuantity ?? "0.000",
      damagedQuantity: row?.damagedQuantity ?? "0.000",
      expiredQuantity: row?.expiredQuantity ?? "0.000",
      totalQuantity: row?.totalQuantity ?? "0.000",
      sellableValue: row?.sellableValue ?? "0.00",
      damagedValue: row?.damagedValue ?? "0.00",
      expiredValue: row?.expiredValue ?? "0.00",
      totalValue: row?.totalValue ?? "0.00",
    },
  };
}

/** Reads one paginated Inventory Valuation source page without changing stock. */
export async function listInventoryValuation(
  database: ReportsDatabase,
  query: InventoryValuationRepositoryQuery,
): Promise<InventoryValuationSourcePage> {
  const [items, summary] = await Promise.all([
    listInventoryValuationRows(database, query),
    readInventoryValuationTotals(database, query),
  ]);

  return { items, total: summary.total, totals: summary.totals };
}

/** Represents one current-stock row read by the Inventory Report. */
export interface InventoryReportStockRow {
  productId: string;
  productSku: string;
  productName: string;
  categoryName: string;
  brandName: string | null;
  baseUnitName: string;
  reorderLevel: string;
  sellableQuantity: string;
  damagedQuantity: string;
  expiredQuantity: string;
  weightedAverageCost: string;
  isLowStock: boolean;
}

/** Represents one immutable stock movement read by the Inventory Report. */
export interface InventoryReportMovementRow {
  movementId: string;
  productId: string;
  productSku: string;
  productName: string;
  occurredAt: Date;
  movementType: typeof stockMovements.$inferSelect.movementType;
  stockCondition: typeof stockMovements.$inferSelect.stockCondition;
  direction: typeof stockMovements.$inferSelect.direction;
  quantity: string;
  unitCost: string;
  allocatedExtraCost: string | null;
  sourceType: string | null;
  sourceId: string | null;
  reason: string | null;
  notes: string | null;
}

/** Contains current stock and movement rows required by the Inventory Report. */
export interface InventoryReportSourceRows {
  stock: InventoryReportStockRow[];
  movements: InventoryReportMovementRow[];
}

/** Builds approved current-stock filters for the Inventory Report. */
function buildInventoryReportStockFilters(query: InventoryReportQuery): SQL[] {
  const filters: SQL[] = [eq(productUnits.isBaseUnit, true)];

  if (query.productId) {
    filters.push(eq(products.id, query.productId));
  }

  if (query.lowStock === true) {
    filters.push(
      lte(
        sql`coalesce(${inventoryBalances.sellableQuantityOnHand}, 0.000)`,
        products.reorderLevel,
      ),
    );
  }

  return filters;
}

/** Builds approved date/product filters for Inventory Report movements. */
function buildInventoryReportMovementFilters(query: InventoryReportQuery): SQL[] {
  const filters: SQL[] = [
    sql`timezone('Asia/Karachi', ${stockMovements.occurredAt})::date >= ${query.startDate}::date`,
    sql`timezone('Asia/Karachi', ${stockMovements.occurredAt})::date <= ${query.endDate}::date`,
  ];

  if (query.productId) {
    filters.push(eq(stockMovements.productId, query.productId));
  }

  return filters;
}

/** Reads current product stock without changing Inventory source data. */
async function listInventoryReportStockRows(
  database: ReportsDatabase,
  query: InventoryReportQuery,
): Promise<InventoryReportStockRow[]> {
  return database
    .select({
      productId: products.id,
      productSku: products.sku,
      productName: products.name,
      categoryName: productCategories.name,
      brandName: brands.name,
      baseUnitName: productUnits.unitName,
      reorderLevel: products.reorderLevel,
      sellableQuantity: sql<string>`coalesce(${inventoryBalances.sellableQuantityOnHand}, 0.000)`,
      damagedQuantity: sql<string>`coalesce(${inventoryBalances.damagedQuantityOnHand}, 0.000)`,
      expiredQuantity: sql<string>`coalesce(${inventoryBalances.expiredQuantityOnHand}, 0.000)`,
      weightedAverageCost: sql<string>`coalesce(${inventoryBalances.weightedAverageCost}, 0.00)`,
      isLowStock: sql<boolean>`coalesce(${inventoryBalances.sellableQuantityOnHand}, 0.000) <= ${products.reorderLevel}`,
    })
    .from(products)
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .innerJoin(productUnits, eq(productUnits.productId, products.id))
    .leftJoin(inventoryBalances, eq(inventoryBalances.productId, products.id))
    .where(and(...buildInventoryReportStockFilters(query)))
    .orderBy(asc(products.name), asc(products.sku));
}

/** Reads immutable stock movements inside the requested Karachi business-date range. */
async function listInventoryReportMovementRows(
  database: ReportsDatabase,
  query: InventoryReportQuery,
): Promise<InventoryReportMovementRow[]> {
  return database
    .select({
      movementId: stockMovements.id,
      productId: products.id,
      productSku: products.sku,
      productName: products.name,
      occurredAt: stockMovements.occurredAt,
      movementType: stockMovements.movementType,
      stockCondition: stockMovements.stockCondition,
      direction: stockMovements.direction,
      quantity: stockMovements.quantity,
      unitCost: stockMovements.unitCost,
      allocatedExtraCost: stockMovements.allocatedExtraCost,
      sourceType: stockMovements.sourceType,
      sourceId: stockMovements.sourceId,
      reason: stockMovements.reason,
      notes: stockMovements.notes,
    })
    .from(stockMovements)
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .where(and(...buildInventoryReportMovementFilters(query)))
    .orderBy(asc(stockMovements.occurredAt), asc(stockMovements.id));
}

/** Reads current stock and movement history required by one Inventory Report. */
export async function readInventoryReportSourceRows(
  database: ReportsDatabase,
  query: InventoryReportQuery,
): Promise<InventoryReportSourceRows> {
  const [stock, movements] = await Promise.all([
    listInventoryReportStockRows(database, query),
    listInventoryReportMovementRows(database, query),
  ]);

  return { stock, movements };
}

/** Represents one customer with a positive current ledger balance. */
export interface CustomerOutstandingReportRow {
  customerId: string;
  customerCode: string;
  customerName: string;
  phone: string | null;
  outstandingAmount: string;
}

/** Contains one page of Customer Outstanding Report rows. */
export interface CustomerOutstandingReportSourcePage {
  items: CustomerOutstandingReportRow[];
  total: number;
}

/** Builds the grouped customer-balance query used by the outstanding report. */
function customerOutstandingReportQuery(
  database: ReportsDatabase,
  query: CustomerOutstandingReportQuery,
) {
  const balanceExpression = sql<string>`sum(${customerLedgerEntries.debit} - ${customerLedgerEntries.credit})`;
  const search = query.search
    ? or(
        ilike(customers.code, `%${query.search}%`),
        ilike(customers.name, `%${query.search}%`),
        ilike(customers.phone, `%${query.search}%`),
      )
    : undefined;

  return database
    .select({
      customerId: customers.id,
      customerCode: customers.code,
      customerName: customers.name,
      phone: customers.phone,
      outstandingAmount: balanceExpression.as("outstanding_amount"),
    })
    .from(customers)
    .innerJoin(
      customerLedgerEntries,
      eq(customerLedgerEntries.customerId, customers.id),
    )
    .where(and(eq(customers.isWalkIn, false), search))
    .groupBy(customers.id)
    .having(gt(balanceExpression, "0"))
    .as("customer_outstanding_report");
}

/** Lists one page of customers with a positive current outstanding balance. */
async function listCustomerOutstandingReportRows(
  database: ReportsDatabase,
  query: CustomerOutstandingReportQuery,
): Promise<CustomerOutstandingReportRow[]> {
  const grouped = customerOutstandingReportQuery(database, query);

  return database
    .select()
    .from(grouped)
    .orderBy(
      desc(grouped.outstandingAmount),
      asc(grouped.customerName),
      asc(grouped.customerId),
    )
    .limit(query.pageSize)
    .offset(getReportOffset(query));
}

/** Counts customers that match the outstanding-report filters. */
async function countCustomerOutstandingReportRows(
  database: ReportsDatabase,
  query: CustomerOutstandingReportQuery,
): Promise<number> {
  const grouped = customerOutstandingReportQuery(database, query);
  const rows = await database.select({ total: count() }).from(grouped);
  return rows[0]?.total ?? 0;
}

/** Reads the current customer outstanding page without changing ledger data. */
export async function readCustomerOutstandingReportPage(
  database: ReportsDatabase,
  query: CustomerOutstandingReportQuery,
): Promise<CustomerOutstandingReportSourcePage> {
  const [items, total] = await Promise.all([
    listCustomerOutstandingReportRows(database, query),
    countCustomerOutstandingReportRows(database, query),
  ]);

  return { items, total };
}



/** Represents one supplier with a positive current payable ledger balance. */
export interface SupplierPayableReportRow {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  phone: string | null;
  payableAmount: string;
}

/** Contains one page of Supplier Payable Report rows. */
export interface SupplierPayableReportSourcePage {
  items: SupplierPayableReportRow[];
  total: number;
}

/** Builds the grouped supplier-balance query used by the payable report. */
function supplierPayableReportQuery(
  database: ReportsDatabase,
  query: SupplierPayableReportQuery,
) {
  const balanceExpression = sql<string>`sum(${supplierLedgerEntries.credit} - ${supplierLedgerEntries.debit})`;
  const search = query.search
    ? or(
        ilike(suppliers.code, `%${query.search}%`),
        ilike(suppliers.name, `%${query.search}%`),
        ilike(suppliers.phone, `%${query.search}%`),
      )
    : undefined;

  return database
    .select({
      supplierId: suppliers.id,
      supplierCode: suppliers.code,
      supplierName: suppliers.name,
      phone: suppliers.phone,
      payableAmount: balanceExpression.as("payable_amount"),
    })
    .from(suppliers)
    .innerJoin(
      supplierLedgerEntries,
      eq(supplierLedgerEntries.supplierId, suppliers.id),
    )
    .where(search)
    .groupBy(suppliers.id)
    .having(gt(balanceExpression, "0"))
    .as("supplier_payable_report");
}

/** Lists one page of suppliers with a positive current payable balance. */
async function listSupplierPayableReportRows(
  database: ReportsDatabase,
  query: SupplierPayableReportQuery,
): Promise<SupplierPayableReportRow[]> {
  const grouped = supplierPayableReportQuery(database, query);

  return database
    .select()
    .from(grouped)
    .orderBy(
      desc(grouped.payableAmount),
      asc(grouped.supplierName),
      asc(grouped.supplierId),
    )
    .limit(query.pageSize)
    .offset(getReportOffset(query));
}

/** Counts suppliers that match the payable-report filters. */
async function countSupplierPayableReportRows(
  database: ReportsDatabase,
  query: SupplierPayableReportQuery,
): Promise<number> {
  const grouped = supplierPayableReportQuery(database, query);
  const rows = await database.select({ total: count() }).from(grouped);
  return rows[0]?.total ?? 0;
}

/** Reads the current supplier payable page without changing ledger data. */
export async function readSupplierPayableReportPage(
  database: ReportsDatabase,
  query: SupplierPayableReportQuery,
): Promise<SupplierPayableReportSourcePage> {
  const [items, total] = await Promise.all([
    listSupplierPayableReportRows(database, query),
    countSupplierPayableReportRows(database, query),
  ]);

  return { items, total };
}

/** Represents one cash or bank account shown by the Cash/Bank Report. */
export interface CashBankReportAccountRow {
  accountId: string;
  accountType: "CASH" | "BANK";
  accountName: string;
  accountReference: string | null;
}

/** Represents one immutable account movement used by the Cash/Bank Report. */
export interface CashBankReportMovementRow {
  movementId: string;
  accountId: string;
  accountType: "CASH" | "BANK";
  businessDate: string;
  occurredAt: Date;
  direction: "INFLOW" | "OUTFLOW";
  sourceType: string;
  sourceId: string | null;
  amount: string;
  documentNumber: string | null;
  description: string | null;
}

/** Contains the account and movement rows required by one Cash/Bank Report. */
export interface CashBankReportSourceRows {
  accounts: CashBankReportAccountRow[];
  movements: CashBankReportMovementRow[];
}

/** Reads cash accounts that match the optional Cash/Bank Report account filter. */
async function listCashReportAccounts(
  database: ReportsDatabase,
  query: CashBankReportQuery,
): Promise<CashBankReportAccountRow[]> {
  const rows = await database
    .select({
      accountId: cashAccounts.id,
      accountName: cashAccounts.name,
    })
    .from(cashAccounts)
    .where(query.accountId ? eq(cashAccounts.id, query.accountId) : undefined)
    .orderBy(asc(cashAccounts.name), asc(cashAccounts.id));

  return rows.map((row) => ({
    ...row,
    accountType: "CASH" as const,
    accountReference: null,
  }));
}

/** Reads bank accounts that match the optional Cash/Bank Report account filter. */
async function listBankReportAccounts(
  database: ReportsDatabase,
  query: CashBankReportQuery,
): Promise<CashBankReportAccountRow[]> {
  const rows = await database
    .select({
      accountId: bankAccounts.id,
      accountName: bankAccounts.accountName,
      accountReference: bankAccounts.accountNumber,
    })
    .from(bankAccounts)
    .where(query.accountId ? eq(bankAccounts.id, query.accountId) : undefined)
    .orderBy(asc(bankAccounts.bankName), asc(bankAccounts.accountName), asc(bankAccounts.id));

  return rows.map((row) => ({
    ...row,
    accountType: "BANK" as const,
  }));
}

/** Reads cash movements through the selected end date so opening balance can be calculated. */
async function listCashReportMovements(
  database: ReportsDatabase,
  query: CashBankReportQuery,
): Promise<CashBankReportMovementRow[]> {
  const businessDate = sql<string>`to_char(${cashBankMovements.occurredAt} at time zone 'Asia/Karachi', 'YYYY-MM-DD')`;
  const rows = await database
    .select({
      movementId: cashBankMovements.id,
      accountId: cashBankMovements.cashAccountId,
      businessDate: businessDate.as("business_date"),
      occurredAt: cashBankMovements.occurredAt,
      direction: cashBankMovements.direction,
      sourceType: cashBankMovements.sourceType,
      sourceId: cashBankMovements.sourceId,
      amount: cashBankMovements.amount,
      documentNumber: cashBankMovements.documentNumber,
      description: cashBankMovements.description,
    })
    .from(cashBankMovements)
    .where(
      and(
        eq(cashBankMovements.method, "CASH"),
        query.accountId ? eq(cashBankMovements.cashAccountId, query.accountId) : undefined,
        lte(businessDate, query.endDate),
      ),
    )
    .orderBy(asc(cashBankMovements.occurredAt), asc(cashBankMovements.id));

  return rows
    .filter((row): row is typeof row & { accountId: string } => row.accountId !== null)
    .map((row) => ({ ...row, accountType: "CASH" as const }));
}

/** Reads bank movements through the selected end date so opening balance can be calculated. */
async function listBankReportMovements(
  database: ReportsDatabase,
  query: CashBankReportQuery,
): Promise<CashBankReportMovementRow[]> {
  const businessDate = sql<string>`to_char(${cashBankMovements.occurredAt} at time zone 'Asia/Karachi', 'YYYY-MM-DD')`;
  const rows = await database
    .select({
      movementId: cashBankMovements.id,
      accountId: cashBankMovements.bankAccountId,
      businessDate: businessDate.as("business_date"),
      occurredAt: cashBankMovements.occurredAt,
      direction: cashBankMovements.direction,
      sourceType: cashBankMovements.sourceType,
      sourceId: cashBankMovements.sourceId,
      amount: cashBankMovements.amount,
      documentNumber: cashBankMovements.documentNumber,
      description: cashBankMovements.description,
    })
    .from(cashBankMovements)
    .where(
      and(
        eq(cashBankMovements.method, "BANK_TRANSFER"),
        query.accountId ? eq(cashBankMovements.bankAccountId, query.accountId) : undefined,
        lte(businessDate, query.endDate),
      ),
    )
    .orderBy(asc(cashBankMovements.occurredAt), asc(cashBankMovements.id));

  return rows
    .filter((row): row is typeof row & { accountId: string } => row.accountId !== null)
    .map((row) => ({ ...row, accountType: "BANK" as const }));
}

/** Reads the account and immutable movement rows required by the Cash/Bank Report. */
export async function readCashBankReportSourceRows(
  database: ReportsDatabase,
  query: CashBankReportQuery,
): Promise<CashBankReportSourceRows> {
  const [cash, bank, cashMovements, bankMovements] = await Promise.all([
    listCashReportAccounts(database, query),
    listBankReportAccounts(database, query),
    listCashReportMovements(database, query),
    listBankReportMovements(database, query),
  ]);

  return {
    accounts: [...cash, ...bank],
    movements: [...cashMovements, ...bankMovements],
  };
}

/** Represents one immutable expense or linked reversal row used by the Expense Report. */
export interface ExpenseReportRow {
  expenseId: string;
  expenseNumber: string;
  documentDate: string;
  categoryId: string;
  categoryName: string;
  amount: string;
  paymentMethod: "CASH" | "BANK_TRANSFER";
  cashAccountId: string | null;
  cashAccountName: string | null;
  bankAccountId: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  note: string | null;
  receiptUrl: string | null;
  reversalOfExpenseId: string | null;
  reversalReason: string | null;
}

/** Builds the approved category and date filters for the Expense Report. */
function buildExpenseReportFilters(query: ExpenseReportQuery): SQL[] {
  const filters: SQL[] = [
    gte(expenses.expenseDate, query.startDate),
    lte(expenses.expenseDate, query.endDate),
  ];

  if (query.categoryId) {
    filters.push(eq(expenses.expenseCategoryId, query.categoryId));
  }

  return filters;
}

/** Reads immutable expenses and linked reversal rows for the Expense Report. */
export async function listExpenseReportRows(
  database: ReportsDatabase,
  query: ExpenseReportQuery,
): Promise<ExpenseReportRow[]> {
  return database
    .select({
      expenseId: expenses.id,
      expenseNumber: expenses.expenseNumber,
      documentDate: expenses.expenseDate,
      categoryId: expenseCategories.id,
      categoryName: expenseCategories.name,
      amount: expenses.amount,
      paymentMethod: expenses.paymentMethod,
      cashAccountId: expenses.cashAccountId,
      cashAccountName: cashAccounts.name,
      bankAccountId: expenses.bankAccountId,
      bankName: bankAccounts.bankName,
      bankAccountName: bankAccounts.accountName,
      bankAccountNumber: bankAccounts.accountNumber,
      note: expenses.note,
      receiptUrl: expenses.receiptUrl,
      reversalOfExpenseId: expenses.reversalOfExpenseId,
      reversalReason: expenses.reversalReason,
    })
    .from(expenses)
    .innerJoin(
      expenseCategories,
      eq(expenseCategories.id, expenses.expenseCategoryId),
    )
    .leftJoin(cashAccounts, eq(cashAccounts.id, expenses.cashAccountId))
    .leftJoin(bankAccounts, eq(bankAccounts.id, expenses.bankAccountId))
    .where(and(...buildExpenseReportFilters(query)))
    .orderBy(
      asc(expenses.expenseDate),
      asc(expenses.expenseNumber),
      asc(expenses.id),
    );
}



/** Contains the immutable sale and return rows used to calculate product profit. */
export interface ProductProfitReportSourceRows {
  sales: SalesReportSaleRow[];
  returns: SalesReportReturnRow[];
}

/** Reads all source rows needed to calculate product profit without changing operational data. */
export async function readProductProfitReportSourceRows(
  database: ReportsDatabase,
  query: ProductProfitReportQuery,
): Promise<ProductProfitReportSourceRows> {
  // Read the full invoice range before product filtering so shared invoice discounts
  // are allocated consistently across every invoice line in the service.
  return readSalesReportSourceRows(database, {
    startDate: query.startDate,
    endDate: query.endDate,
  });
}

/**
 * Builds customer receipt allocations that were still valid on the requested business date.
 * A later reversal must not change an older aging report.
 */
function customerAgingAllocationTotals(
  database: ReportsDatabase,
  query: CustomerAgingRepositoryQuery,
) {
  const paymentBusinessDate = sql<string>`to_char(${customerPayments.paymentDate} at time zone 'Asia/Karachi', 'YYYY-MM-DD')`;
  const reversalExistsByAsOfDate = sql`exists (
    select 1
    from ${customerPayments} reversal
    where reversal.reversal_of_payment_id = ${customerPayments.id}
      and to_char(reversal.payment_date at time zone 'Asia/Karachi', 'YYYY-MM-DD') <= ${query.asOfDate}
  )`;

  return database
    .select({
      salesInvoiceId: customerPaymentAllocations.salesInvoiceId,
      allocatedAmount: sql<string>`coalesce(sum(${customerPaymentAllocations.amount}), 0)::text`.as(
        "allocated_amount",
      ),
    })
    .from(customerPaymentAllocations)
    .innerJoin(
      customerPayments,
      eq(customerPayments.id, customerPaymentAllocations.customerPaymentId),
    )
    .where(
      and(
        isNull(customerPayments.reversalOfPaymentId),
        lte(paymentBusinessDate, query.asOfDate),
        sql`not (${reversalExistsByAsOfDate})`,
      ),
    )
    .groupBy(customerPaymentAllocations.salesInvoiceId)
    .as("customer_aging_allocation_totals");
}

/** Builds confirmed due-reduction return totals up to the requested business date. */
function customerAgingReturnTotals(
  database: ReportsDatabase,
  query: CustomerAgingRepositoryQuery,
) {
  return database
    .select({
      salesInvoiceId: salesReturns.originalSaleId,
      returnedAmount: sql<string>`coalesce(sum(${salesReturns.totalAmount}), 0)::text`.as(
        "returned_amount",
      ),
    })
    .from(salesReturns)
    .where(
      and(
        eq(salesReturns.status, "CONFIRMED"),
        eq(salesReturns.refundMode, "DUE_REDUCTION"),
        lte(salesReturns.returnDate, query.asOfDate),
      ),
    )
    .groupBy(salesReturns.originalSaleId)
    .as("customer_aging_return_totals");
}

/** Builds unpaid confirmed invoice rows used by the Customer Aging report. */
function customerAgingOutstandingInvoices(
  database: ReportsDatabase,
  query: CustomerAgingRepositoryQuery,
) {
  const allocations = customerAgingAllocationTotals(database, query);
  const returns = customerAgingReturnTotals(database, query);
  const outstandingAmount = sql<string>`greatest(
    ${salesInvoices.totalAmount}
      - coalesce(${allocations.allocatedAmount}, 0)
      - coalesce(${returns.returnedAmount}, 0),
    0
  )`;
  const search = query.search
    ? or(
        ilike(customers.code, `%${query.search}%`),
        ilike(customers.name, `%${query.search}%`),
        ilike(customers.phone, `%${query.search}%`),
      )
    : undefined;

  return database
    .select({
      salesInvoiceId: salesInvoices.id,
      invoiceDate: salesInvoices.invoiceDate,
      customerId: customers.id,
      customerCode: customers.code,
      customerName: customers.name,
      phone: customers.phone,
      outstandingAmount: outstandingAmount.as("outstanding_amount"),
    })
    .from(salesInvoices)
    .innerJoin(customers, eq(customers.id, salesInvoices.customerId))
    .leftJoin(allocations, eq(allocations.salesInvoiceId, salesInvoices.id))
    .leftJoin(returns, eq(returns.salesInvoiceId, salesInvoices.id))
    .where(
      and(
        eq(salesInvoices.status, "CONFIRMED"),
        eq(customers.isWalkIn, false),
        lte(salesInvoices.invoiceDate, query.asOfDate),
        search,
        gt(outstandingAmount, "0"),
      ),
    )
    .as("customer_aging_outstanding_invoices");
}

/** Builds customer-level aging buckets from unpaid invoice rows. */
function customerAgingGroupedCustomers(
  database: ReportsDatabase,
  query: CustomerAgingRepositoryQuery,
) {
  const invoices = customerAgingOutstandingInvoices(database, query);
  const ageInDays = sql<number>`${query.asOfDate}::date - ${invoices.invoiceDate}`;
  const bucket0To30 = sql<string>`coalesce(sum(case when ${ageInDays} between 0 and 30 then ${invoices.outstandingAmount} else 0 end), 0)::text`;
  const bucket31To60 = sql<string>`coalesce(sum(case when ${ageInDays} between 31 and 60 then ${invoices.outstandingAmount} else 0 end), 0)::text`;
  const bucket61To90 = sql<string>`coalesce(sum(case when ${ageInDays} between 61 and 90 then ${invoices.outstandingAmount} else 0 end), 0)::text`;
  const bucket90Plus = sql<string>`coalesce(sum(case when ${ageInDays} > 90 then ${invoices.outstandingAmount} else 0 end), 0)::text`;
  const totalOutstanding = sql<string>`coalesce(sum(${invoices.outstandingAmount}), 0)::text`;

  return database
    .select({
      customerId: invoices.customerId,
      customerCode: invoices.customerCode,
      customerName: invoices.customerName,
      phone: invoices.phone,
      bucket0To30: bucket0To30.as("bucket_0_to_30"),
      bucket31To60: bucket31To60.as("bucket_31_to_60"),
      bucket61To90: bucket61To90.as("bucket_61_to_90"),
      bucket90Plus: bucket90Plus.as("bucket_90_plus"),
      totalOutstanding: totalOutstanding.as("total_outstanding"),
    })
    .from(invoices)
    .groupBy(
      invoices.customerId,
      invoices.customerCode,
      invoices.customerName,
      invoices.phone,
    )
    .as("customer_aging_grouped_customers");
}

/** Lists one page of customers with outstanding invoices grouped by invoice age. */
async function listCustomerAgingRows(
  database: ReportsDatabase,
  query: CustomerAgingRepositoryQuery,
): Promise<CustomerAgingRow[]> {
  const grouped = customerAgingGroupedCustomers(database, query);

  return database
    .select()
    .from(grouped)
    .orderBy(
      desc(grouped.totalOutstanding),
      asc(grouped.customerName),
      asc(grouped.customerId),
    )
    .limit(query.pageSize)
    .offset(getReportOffset(query));
}

/** Reads the full filtered Customer Aging totals without applying page limits. */
async function readCustomerAgingTotals(
  database: ReportsDatabase,
  query: CustomerAgingRepositoryQuery,
): Promise<{ total: number; totals: CustomerAgingTotals }> {
  const grouped = customerAgingGroupedCustomers(database, query);
  const rows = await database
    .select({
      total: count(),
      bucket0To30: sql<string>`coalesce(sum(${grouped.bucket0To30}), 0)::text`,
      bucket31To60: sql<string>`coalesce(sum(${grouped.bucket31To60}), 0)::text`,
      bucket61To90: sql<string>`coalesce(sum(${grouped.bucket61To90}), 0)::text`,
      bucket90Plus: sql<string>`coalesce(sum(${grouped.bucket90Plus}), 0)::text`,
      totalOutstanding: sql<string>`coalesce(sum(${grouped.totalOutstanding}), 0)::text`,
    })
    .from(grouped);

  const row = rows[0];
  return {
    total: row?.total ?? 0,
    totals: {
      bucket0To30: row?.bucket0To30 ?? "0.00",
      bucket31To60: row?.bucket31To60 ?? "0.00",
      bucket61To90: row?.bucket61To90 ?? "0.00",
      bucket90Plus: row?.bucket90Plus ?? "0.00",
      totalOutstanding: row?.totalOutstanding ?? "0.00",
    },
  };
}

/** Reads one Customer Aging page plus totals for every matching customer. */
export async function listCustomerAging(
  database: ReportsDatabase,
  query: CustomerAgingRepositoryQuery,
): Promise<CustomerAgingSourcePage> {
  const [items, summary] = await Promise.all([
    listCustomerAgingRows(database, query),
    readCustomerAgingTotals(database, query),
  ]);

  return {
    items,
    total: summary.total,
    totals: summary.totals,
  };
}

/**
 * Builds supplier-payment allocations that were still valid on the requested business date.
 * A later reversal must not change an older aging report.
 */
function supplierAgingAllocationTotals(
  database: ReportsDatabase,
  query: SupplierAgingRepositoryQuery,
) {
  const paymentBusinessDate = sql<string>`to_char(${supplierPayments.paymentDate} at time zone 'Asia/Karachi', 'YYYY-MM-DD')`;
  const reversalExistsByAsOfDate = sql`exists (
    select 1
    from ${supplierPayments} reversal
    where reversal.reversal_of_payment_id = ${supplierPayments.id}
      and to_char(reversal.payment_date at time zone 'Asia/Karachi', 'YYYY-MM-DD') <= ${query.asOfDate}
  )`;

  return database
    .select({
      purchaseId: supplierPaymentAllocations.purchaseId,
      allocatedAmount: sql<string>`coalesce(sum(${supplierPaymentAllocations.amount}), 0)::text`.as(
        "allocated_amount",
      ),
    })
    .from(supplierPaymentAllocations)
    .innerJoin(
      supplierPayments,
      eq(supplierPayments.id, supplierPaymentAllocations.supplierPaymentId),
    )
    .where(
      and(
        isNull(supplierPayments.reversalOfPaymentId),
        lte(paymentBusinessDate, query.asOfDate),
        sql`not (${reversalExistsByAsOfDate})`,
      ),
    )
    .groupBy(supplierPaymentAllocations.purchaseId)
    .as("supplier_aging_allocation_totals");
}

/** Builds confirmed purchase-return totals up to the requested business date. */
function supplierAgingReturnTotals(
  database: ReportsDatabase,
  query: SupplierAgingRepositoryQuery,
) {
  return database
    .select({
      purchaseId: purchaseReturns.originalPurchaseId,
      returnedAmount: sql<string>`coalesce(sum(${purchaseReturns.totalAmount}), 0)::text`.as(
        "returned_amount",
      ),
    })
    .from(purchaseReturns)
    .where(
      and(
        eq(purchaseReturns.status, "CONFIRMED"),
        lte(purchaseReturns.returnDate, query.asOfDate),
      ),
    )
    .groupBy(purchaseReturns.originalPurchaseId)
    .as("supplier_aging_return_totals");
}

/** Builds unpaid confirmed purchase rows used by the Supplier Aging report. */
function supplierAgingOutstandingPurchases(
  database: ReportsDatabase,
  query: SupplierAgingRepositoryQuery,
) {
  const allocations = supplierAgingAllocationTotals(database, query);
  const returns = supplierAgingReturnTotals(database, query);
  const outstandingAmount = sql<string>`greatest(
    ${purchases.totalAmount}
      - coalesce(${allocations.allocatedAmount}, 0)
      - coalesce(${returns.returnedAmount}, 0),
    0
  )`;
  const search = query.search
    ? or(
        ilike(suppliers.code, `%${query.search}%`),
        ilike(suppliers.name, `%${query.search}%`),
        ilike(suppliers.phone, `%${query.search}%`),
      )
    : undefined;

  return database
    .select({
      purchaseId: purchases.id,
      purchaseDate: purchases.purchaseDate,
      supplierId: suppliers.id,
      supplierCode: suppliers.code,
      supplierName: suppliers.name,
      phone: suppliers.phone,
      outstandingAmount: outstandingAmount.as("outstanding_amount"),
    })
    .from(purchases)
    .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .leftJoin(allocations, eq(allocations.purchaseId, purchases.id))
    .leftJoin(returns, eq(returns.purchaseId, purchases.id))
    .where(
      and(
        eq(purchases.status, "CONFIRMED"),
        lte(purchases.purchaseDate, query.asOfDate),
        search,
        gt(outstandingAmount, "0"),
      ),
    )
    .as("supplier_aging_outstanding_purchases");
}

/** Builds supplier-level aging buckets from unpaid purchase rows. */
function supplierAgingGroupedSuppliers(
  database: ReportsDatabase,
  query: SupplierAgingRepositoryQuery,
) {
  const purchasesForAging = supplierAgingOutstandingPurchases(database, query);
  const ageInDays = sql<number>`${query.asOfDate}::date - ${purchasesForAging.purchaseDate}`;
  const bucket0To30 = sql<string>`coalesce(sum(case when ${ageInDays} between 0 and 30 then ${purchasesForAging.outstandingAmount} else 0 end), 0)::text`;
  const bucket31To60 = sql<string>`coalesce(sum(case when ${ageInDays} between 31 and 60 then ${purchasesForAging.outstandingAmount} else 0 end), 0)::text`;
  const bucket61To90 = sql<string>`coalesce(sum(case when ${ageInDays} between 61 and 90 then ${purchasesForAging.outstandingAmount} else 0 end), 0)::text`;
  const bucket90Plus = sql<string>`coalesce(sum(case when ${ageInDays} > 90 then ${purchasesForAging.outstandingAmount} else 0 end), 0)::text`;
  const totalPayable = sql<string>`coalesce(sum(${purchasesForAging.outstandingAmount}), 0)::text`;

  return database
    .select({
      supplierId: purchasesForAging.supplierId,
      supplierCode: purchasesForAging.supplierCode,
      supplierName: purchasesForAging.supplierName,
      phone: purchasesForAging.phone,
      bucket0To30: bucket0To30.as("bucket_0_to_30"),
      bucket31To60: bucket31To60.as("bucket_31_to_60"),
      bucket61To90: bucket61To90.as("bucket_61_to_90"),
      bucket90Plus: bucket90Plus.as("bucket_90_plus"),
      totalPayable: totalPayable.as("total_payable"),
    })
    .from(purchasesForAging)
    .groupBy(
      purchasesForAging.supplierId,
      purchasesForAging.supplierCode,
      purchasesForAging.supplierName,
      purchasesForAging.phone,
    )
    .as("supplier_aging_grouped_suppliers");
}

/** Lists one page of suppliers with outstanding purchases grouped by purchase age. */
async function listSupplierAgingRows(
  database: ReportsDatabase,
  query: SupplierAgingRepositoryQuery,
): Promise<SupplierAgingRow[]> {
  const grouped = supplierAgingGroupedSuppliers(database, query);

  return database
    .select()
    .from(grouped)
    .orderBy(
      desc(grouped.totalPayable),
      asc(grouped.supplierName),
      asc(grouped.supplierId),
    )
    .limit(query.pageSize)
    .offset(getReportOffset(query));
}

/** Reads the full filtered Supplier Aging totals without applying page limits. */
async function readSupplierAgingTotals(
  database: ReportsDatabase,
  query: SupplierAgingRepositoryQuery,
): Promise<{ total: number; totals: SupplierAgingTotals }> {
  const grouped = supplierAgingGroupedSuppliers(database, query);
  const rows = await database
    .select({
      total: count(),
      bucket0To30: sql<string>`coalesce(sum(${grouped.bucket0To30}), 0)::text`,
      bucket31To60: sql<string>`coalesce(sum(${grouped.bucket31To60}), 0)::text`,
      bucket61To90: sql<string>`coalesce(sum(${grouped.bucket61To90}), 0)::text`,
      bucket90Plus: sql<string>`coalesce(sum(${grouped.bucket90Plus}), 0)::text`,
      totalPayable: sql<string>`coalesce(sum(${grouped.totalPayable}), 0)::text`,
    })
    .from(grouped);

  const row = rows[0];
  return {
    total: row?.total ?? 0,
    totals: {
      bucket0To30: row?.bucket0To30 ?? "0.00",
      bucket31To60: row?.bucket31To60 ?? "0.00",
      bucket61To90: row?.bucket61To90 ?? "0.00",
      bucket90Plus: row?.bucket90Plus ?? "0.00",
      totalPayable: row?.totalPayable ?? "0.00",
    },
  };
}

/** Reads one Supplier Aging page plus totals for every matching supplier. */
export async function listSupplierAging(
  database: ReportsDatabase,
  query: SupplierAgingRepositoryQuery,
): Promise<SupplierAgingSourcePage> {
  const [items, summary] = await Promise.all([
    listSupplierAgingRows(database, query),
    readSupplierAgingTotals(database, query),
  ]);

  return {
    items,
    total: summary.total,
    totals: summary.totals,
  };
}

/** Contains one Employee Register row with current derived financial balances. */
export interface EmployeeRegisterReportRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  phone: string | null;
  jobTitle: string | null;
  department: string | null;
  employmentType: string;
  joinDate: string;
  leaveDate: string | null;
  isActive: boolean;
  baseMonthlySalary: string;
  salaryPayable: string;
  advanceOutstanding: string;
}

/** Contains one paginated Employee Register source page. */
export interface EmployeeRegisterReportPage {
  items: EmployeeRegisterReportRow[];
  total: number;
}

/** Contains one employee's Attendance Summary counts for a selected date range. */
export interface AttendanceSummaryReportRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  leaveDays: number;
  holidayDays: number;
  weeklyOffDays: number;
  workedHours: string;
}

/** Contains one immutable confirmed payroll item in the Payroll Register. */
export interface PayrollRegisterReportRow {
  payrollRunId: string;
  payrollItemId: string;
  payrollNumber: string;
  periodStart: string;
  periodEnd: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  jobTitle: string | null;
  baseSalary: string;
  grossSalary: string;
  attendanceDeduction: string;
  additionsAmount: string;
  deductionsAmount: string;
  advanceRecoveryAmount: string;
  netSalary: string;
}

/** Contains one employee's current Salary Payable source amounts. */
export interface SalaryPayableReportRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  jobTitle: string | null;
  salaryDueAmount: string;
  salaryPaidAmount: string;
  salaryPayable: string;
}

/** Contains one paginated Salary Payable source page. */
export interface SalaryPayableReportPage {
  items: SalaryPayableReportRow[];
  total: number;
}

/** Contains one employee's current Employee Advance Outstanding source amounts. */
export interface EmployeeAdvanceOutstandingReportRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  advanceOriginalAmount: string;
  advanceRecoveredAmount: string;
  advanceOutstanding: string;
}

/** Contains one paginated Employee Advance Outstanding source page. */
export interface EmployeeAdvanceOutstandingReportPage {
  items: EmployeeAdvanceOutstandingReportRow[];
  total: number;
}

/** Contains one confirmed Payroll Run's labor-cost components. */
export interface LaborCostSummaryReportRow {
  payrollRunId: string;
  payrollNumber: string;
  periodStart: string;
  periodEnd: string;
  employeeCount: number;
  netSalaryAmount: string;
  advanceRecoveryAmount: string;
  laborCostAmount: string;
}

/** Builds a reusable employee search predicate for Employee reports. */
function employeeReportSearch(search: string | undefined): SQL | undefined {
  if (!search) return undefined;

  const pattern = `%${search}%`;
  return or(
    ilike(employees.employeeCode, pattern),
    ilike(employees.name, pattern),
    ilike(employees.phone, pattern),
    ilike(employees.referenceId, pattern),
    ilike(employees.jobTitle, pattern),
    ilike(employees.department, pattern),
  );
}

/** Returns confirmed payroll salary due totals grouped by employee. */
function employeeSalaryDueTotals(database: ReportsDatabase) {
  return database
    .select({
      employeeId: payrollItems.employeeId,
      amount: sql<string>`coalesce(sum(${payrollItems.initialDueAmount}), 0)::text`.as(
        "salary_due_amount",
      ),
    })
    .from(payrollItems)
    .innerJoin(payrollRuns, eq(payrollRuns.id, payrollItems.payrollRunId))
    .where(eq(payrollRuns.status, "CONFIRMED"))
    .groupBy(payrollItems.employeeId)
    .as("employee_report_salary_due");
}

/** Returns non-reversed confirmed salary-payment allocations grouped by employee. */
function employeeSalaryPaidTotals(database: ReportsDatabase) {
  return database
    .select({
      employeeId: payrollItems.employeeId,
      amount: sql<string>`coalesce(sum(${salaryPaymentAllocations.amount}), 0)::text`.as(
        "salary_paid_amount",
      ),
    })
    .from(salaryPaymentAllocations)
    .innerJoin(
      payrollItems,
      eq(payrollItems.id, salaryPaymentAllocations.payrollItemId),
    )
    .innerJoin(
      salaryPayments,
      eq(salaryPayments.id, salaryPaymentAllocations.salaryPaymentId),
    )
    .where(
      and(
        eq(salaryPayments.status, "CONFIRMED"),
        isNull(salaryPayments.reversalOfPaymentId),
      ),
    )
    .groupBy(payrollItems.employeeId)
    .as("employee_report_salary_paid");
}

/** Returns original confirmed Employee Advance totals grouped by employee. */
function employeeAdvanceOriginalTotals(database: ReportsDatabase) {
  return database
    .select({
      employeeId: employeeAdvances.employeeId,
      amount: sql<string>`coalesce(sum(${employeeAdvances.originalAmount}), 0)::text`.as(
        "advance_original_amount",
      ),
    })
    .from(employeeAdvances)
    .groupBy(employeeAdvances.employeeId)
    .as("employee_report_advance_original");
}

/** Returns immutable Employee Advance recovery totals grouped by employee. */
function employeeAdvanceRecoveredTotals(database: ReportsDatabase) {
  return database
    .select({
      employeeId: employeeAdvances.employeeId,
      amount: sql<string>`coalesce(sum(${employeeAdvanceRecoveries.amount}), 0)::text`.as(
        "advance_recovered_amount",
      ),
    })
    .from(employeeAdvanceRecoveries)
    .innerJoin(
      employeeAdvances,
      eq(employeeAdvances.id, employeeAdvanceRecoveries.employeeAdvanceId),
    )
    .groupBy(employeeAdvances.employeeId)
    .as("employee_report_advance_recovered");
}

/** Reads one Employee Register page using the same derived balance sources as Employee List. */
export async function readEmployeeRegisterReportPage(
  database: ReportsDatabase,
  query: EmployeeRegisterReportQuery,
): Promise<EmployeeRegisterReportPage> {
  const salaryDue = employeeSalaryDueTotals(database);
  const salaryPaid = employeeSalaryPaidTotals(database);
  const advanceOriginal = employeeAdvanceOriginalTotals(database);
  const advanceRecovered = employeeAdvanceRecoveredTotals(database);
  const salaryPayable = sql<string>`(coalesce(${salaryDue.amount}, 0) - coalesce(${salaryPaid.amount}, 0))::text`;
  const advanceOutstanding = sql<string>`(coalesce(${advanceOriginal.amount}, 0) - coalesce(${advanceRecovered.amount}, 0))::text`;
  const search = employeeReportSearch(query.search);

  const [items, totalRows] = await Promise.all([
    database
      .select({
        employeeId: employees.id,
        employeeCode: employees.employeeCode,
        employeeName: employees.name,
        phone: employees.phone,
        jobTitle: employees.jobTitle,
        department: employees.department,
        employmentType: employees.employmentType,
        joinDate: employees.joinDate,
        leaveDate: employees.leaveDate,
        isActive: employees.isActive,
        baseMonthlySalary: employees.baseMonthlySalary,
        salaryPayable: salaryPayable.as("salary_payable"),
        advanceOutstanding: advanceOutstanding.as("advance_outstanding"),
      })
      .from(employees)
      .leftJoin(salaryDue, eq(salaryDue.employeeId, employees.id))
      .leftJoin(salaryPaid, eq(salaryPaid.employeeId, employees.id))
      .leftJoin(advanceOriginal, eq(advanceOriginal.employeeId, employees.id))
      .leftJoin(advanceRecovered, eq(advanceRecovered.employeeId, employees.id))
      .where(search)
      .orderBy(asc(employees.name), asc(employees.employeeCode), asc(employees.id))
      .limit(query.pageSize)
      .offset(getReportOffset(query)),
    database.select({ total: count() }).from(employees).where(search),
  ]);

  return { items, total: totalRows[0]?.total ?? 0 };
}

/** Reads Attendance Summary counts grouped by employee for one business-date range. */
export async function readAttendanceSummaryReport(
  database: ReportsDatabase,
  query: AttendanceSummaryReportQuery,
): Promise<AttendanceSummaryReportRow[]> {
  return database
    .select({
      employeeId: employees.id,
      employeeCode: employees.employeeCode,
      employeeName: employees.name,
      presentDays: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'PRESENT')::int`,
      absentDays: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'ABSENT')::int`,
      halfDays: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'HALF_DAY')::int`,
      leaveDays: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'LEAVE')::int`,
      holidayDays: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'HOLIDAY')::int`,
      weeklyOffDays: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'WEEKLY_OFF')::int`,
      workedHours: sql<string>`coalesce(sum(${attendanceRecords.workedHours}), 0)::text`,
    })
    .from(attendanceRecords)
    .innerJoin(employees, eq(employees.id, attendanceRecords.employeeId))
    .where(
      and(
        gte(attendanceRecords.attendanceDate, query.startDate),
        lte(attendanceRecords.attendanceDate, query.endDate),
      ),
    )
    .groupBy(employees.id, employees.employeeCode, employees.name)
    .orderBy(asc(employees.name), asc(employees.employeeCode), asc(employees.id));
}

/** Reads immutable confirmed Payroll Items for the selected Payroll Register range. */
export async function readPayrollRegisterReport(
  database: ReportsDatabase,
  query: PayrollRegisterReportQuery,
): Promise<PayrollRegisterReportRow[]> {
  return database
    .select({
      payrollRunId: payrollRuns.id,
      payrollItemId: payrollItems.id,
      payrollNumber: payrollRuns.payrollNumber,
      periodStart: payrollRuns.periodStart,
      periodEnd: payrollRuns.periodEnd,
      employeeId: payrollItems.employeeId,
      employeeCode: payrollItems.employeeCodeSnapshot,
      employeeName: payrollItems.employeeNameSnapshot,
      jobTitle: payrollItems.jobTitleSnapshot,
      baseSalary: payrollItems.baseSalarySnapshot,
      grossSalary: payrollItems.grossSalary,
      attendanceDeduction: payrollItems.attendanceDeduction,
      additionsAmount: payrollItems.additionsAmount,
      deductionsAmount: payrollItems.deductionsAmount,
      advanceRecoveryAmount: payrollItems.advanceRecoveryAmount,
      netSalary: payrollItems.netSalary,
    })
    .from(payrollItems)
    .innerJoin(payrollRuns, eq(payrollRuns.id, payrollItems.payrollRunId))
    .where(
      and(
        eq(payrollRuns.status, "CONFIRMED"),
        gte(payrollRuns.periodEnd, query.startDate),
        lte(payrollRuns.periodEnd, query.endDate),
      ),
    )
    .orderBy(
      asc(payrollRuns.periodEnd),
      asc(payrollRuns.payrollNumber),
      asc(payrollItems.employeeNameSnapshot),
      asc(payrollItems.id),
    );
}

/** Builds one current Salary Payable source query, preserving the Employee List formula. */
function currentSalaryPayableRows(
  database: ReportsDatabase,
  query: SalaryPayableReportQuery,
) {
  const salaryDue = employeeSalaryDueTotals(database);
  const salaryPaid = employeeSalaryPaidTotals(database);
  const salaryPayable = sql<string>`(coalesce(${salaryDue.amount}, 0) - coalesce(${salaryPaid.amount}, 0))::text`;
  const search = employeeReportSearch(query.search);

  return database
    .select({
      employeeId: employees.id,
      employeeCode: employees.employeeCode,
      employeeName: employees.name,
      jobTitle: employees.jobTitle,
      salaryDueAmount: sql<string>`coalesce(${salaryDue.amount}, 0)::text`.as(
        "salary_due_amount",
      ),
      salaryPaidAmount: sql<string>`coalesce(${salaryPaid.amount}, 0)::text`.as(
        "salary_paid_amount",
      ),
      salaryPayable: salaryPayable.as("salary_payable"),
    })
    .from(employees)
    .leftJoin(salaryDue, eq(salaryDue.employeeId, employees.id))
    .leftJoin(salaryPaid, eq(salaryPaid.employeeId, employees.id))
    .where(and(search, gt(salaryPayable, "0")));
}

/** Reads one current positive Salary Payable page plus its filtered count. */
export async function readSalaryPayableReportPage(
  database: ReportsDatabase,
  query: SalaryPayableReportQuery,
): Promise<SalaryPayableReportPage> {
  const source = currentSalaryPayableRows(database, query).as("salary_payable_rows");
  const [items, totalRows] = await Promise.all([
    database
      .select()
      .from(source)
      .orderBy(desc(source.salaryPayable), asc(source.employeeName), asc(source.employeeId))
      .limit(query.pageSize)
      .offset(getReportOffset(query)),
    database.select({ total: count() }).from(source),
  ]);

  return { items, total: totalRows[0]?.total ?? 0 };
}

/** Builds one current Employee Advance Outstanding source query. */
function currentEmployeeAdvanceOutstandingRows(
  database: ReportsDatabase,
  query: EmployeeAdvanceOutstandingReportQuery,
) {
  const advanceOriginal = employeeAdvanceOriginalTotals(database);
  const advanceRecovered = employeeAdvanceRecoveredTotals(database);
  const advanceOutstanding = sql<string>`(coalesce(${advanceOriginal.amount}, 0) - coalesce(${advanceRecovered.amount}, 0))::text`;
  const search = employeeReportSearch(query.search);

  return database
    .select({
      employeeId: employees.id,
      employeeCode: employees.employeeCode,
      employeeName: employees.name,
      advanceOriginalAmount: sql<string>`coalesce(${advanceOriginal.amount}, 0)::text`.as(
        "advance_original_amount",
      ),
      advanceRecoveredAmount: sql<string>`coalesce(${advanceRecovered.amount}, 0)::text`.as(
        "advance_recovered_amount",
      ),
      advanceOutstanding: advanceOutstanding.as("advance_outstanding"),
    })
    .from(employees)
    .leftJoin(advanceOriginal, eq(advanceOriginal.employeeId, employees.id))
    .leftJoin(advanceRecovered, eq(advanceRecovered.employeeId, employees.id))
    .where(and(search, gt(advanceOutstanding, "0")));
}

/** Reads one current positive Employee Advance Outstanding page plus its filtered count. */
export async function readEmployeeAdvanceOutstandingReportPage(
  database: ReportsDatabase,
  query: EmployeeAdvanceOutstandingReportQuery,
): Promise<EmployeeAdvanceOutstandingReportPage> {
  const source = currentEmployeeAdvanceOutstandingRows(database, query).as(
    "employee_advance_outstanding_rows",
  );
  const [items, totalRows] = await Promise.all([
    database
      .select()
      .from(source)
      .orderBy(
        desc(source.advanceOutstanding),
        asc(source.employeeName),
        asc(source.employeeId),
      )
      .limit(query.pageSize)
      .offset(getReportOffset(query)),
    database.select({ total: count() }).from(source),
  ]);

  return { items, total: totalRows[0]?.total ?? 0 };
}

/** Reads confirmed Payroll Run labor cost while excluding advance recovery from cost. */
export async function readLaborCostSummaryReport(
  database: ReportsDatabase,
  query: LaborCostSummaryReportQuery,
): Promise<LaborCostSummaryReportRow[]> {
  const netSalaryAmount = sql<string>`coalesce(sum(${payrollItems.netSalary}), 0)::text`;
  const advanceRecoveryAmount = sql<string>`coalesce(sum(${payrollItems.advanceRecoveryAmount}), 0)::text`;
  const laborCostAmount = sql<string>`(coalesce(sum(${payrollItems.netSalary}), 0) + coalesce(sum(${payrollItems.advanceRecoveryAmount}), 0))::text`;

  return database
    .select({
      payrollRunId: payrollRuns.id,
      payrollNumber: payrollRuns.payrollNumber,
      periodStart: payrollRuns.periodStart,
      periodEnd: payrollRuns.periodEnd,
      employeeCount: sql<number>`count(${payrollItems.id})::int`,
      netSalaryAmount: netSalaryAmount.as("net_salary_amount"),
      advanceRecoveryAmount: advanceRecoveryAmount.as("advance_recovery_amount"),
      laborCostAmount: laborCostAmount.as("labor_cost_amount"),
    })
    .from(payrollRuns)
    .innerJoin(payrollItems, eq(payrollItems.payrollRunId, payrollRuns.id))
    .where(
      and(
        eq(payrollRuns.status, "CONFIRMED"),
        gte(payrollRuns.periodEnd, query.startDate),
        lte(payrollRuns.periodEnd, query.endDate),
      ),
    )
    .groupBy(
      payrollRuns.id,
      payrollRuns.payrollNumber,
      payrollRuns.periodStart,
      payrollRuns.periodEnd,
    )
    .orderBy(asc(payrollRuns.periodEnd), asc(payrollRuns.payrollNumber));
}
