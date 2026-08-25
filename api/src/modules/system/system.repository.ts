import { and, asc, count, desc, eq, ne, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  adminUsers,
  auditLogs,
  brands,
  cashBankMovements,
  customerLedgerEntries,
  customers,
  importJobErrors,
  importJobs,
  productCategories,
  products,
  productUnits,
  purchases,
  supplierLedgerEntries,
  suppliers,
  stockMovements,
} from "../../database/schema/index.js";
import type {
  SystemAuditLogQuery,
  SystemImportStatus,
  SystemImportType,
} from "./system.schema.js";

/** Contains the database methods used by the System repository. */
export type SystemDatabase = Pick<
  NodePgDatabase,
  "select" | "insert" | "update" | "delete" | "execute"
>;

/** Represents one saved import job. */
export type ImportJobRecord = typeof importJobs.$inferSelect;

/** Contains the values needed to create one import job. */
export type NewImportJob = typeof importJobs.$inferInsert;

/** Represents one saved row-level import validation error. */
export type ImportJobErrorRecord = typeof importJobErrors.$inferSelect;

/** Contains the values needed to save one row-level import validation error. */
export type NewImportJobError = typeof importJobErrors.$inferInsert;

/** Contains the approved filters and pagination for import-job history. */
export interface ImportJobListOptions {
  type?: SystemImportType;
  status?: SystemImportStatus;
  page: number;
  pageSize: number;
}

/** Represents one import-job list row without the internal validated-data snapshot. */
export type ImportJobListRecord = Omit<ImportJobRecord, "validatedData">;

/** Contains one page of import jobs and the matching total count. */
export interface PaginatedImportJobs {
  items: ImportJobListRecord[];
  total: number;
}

/** Contains pagination settings for the read-only audit-log history. */
export interface AuditLogListOptions extends SystemAuditLogQuery {
  pageSize: number;
}

/** Contains one audit-log row plus the admin identity shown to the owner. */
export interface AuditLogListRecord {
  id: string;
  adminUserId: string | null;
  adminName: string | null;
  adminEmail: string | null;
  requestId: string;
  ipAddress: string | null;
  device: string | null;
  action: string;
  entity: string;
  beforeData: unknown;
  afterData: unknown;
  createdAt: Date;
}

/** Contains one page of audit logs and the matching total count. */
export interface PaginatedAuditLogs {
  items: AuditLogListRecord[];
  total: number;
}

/** Contains the existing product master data needed to validate a product import in batches. */
export interface ProductImportReferenceData {
  products: Array<{ sku: string; barcode: string | null }>;
  categories: Array<{ id: string; name: string; isActive: boolean }>;
  brands: Array<{ id: string; name: string; isActive: boolean }>;
}

/** Contains existing customer codes needed for import uniqueness checks. */
export interface CustomerImportReferenceData {
  customers: Array<{ code: string; isWalkIn: boolean }>;
}

/** Contains existing supplier codes needed for import uniqueness checks. */
export interface SupplierImportReferenceData {
  suppliers: Array<{ code: string }>;
}

/** Contains product identity and movement state needed to validate opening stock. */
export interface OpeningStockImportReferenceData {
  products: Array<{ id: string; sku: string; isActive: boolean }>;
  productIdsWithNormalTransactions: string[];
}

/** Contains party identity, existing opening entries, and setup-lock state for opening-balance validation. */
export interface OpeningBalanceImportReferenceData {
  customers: Array<{ id: string; code: string; isWalkIn: boolean }>;
  suppliers: Array<{ id: string; code: string }>;
  customerIdsWithOpeningBalance: string[];
  supplierIdsWithOpeningBalance: string[];
  normalBusinessActivityExists: boolean;
}

/** Contains the import-job fields that may change as validation/import finishes. */
export type NewImportedProduct = typeof products.$inferInsert;
export type NewImportedProductUnit = typeof productUnits.$inferInsert;
export type NewImportedCustomer = typeof customers.$inferInsert;
export type NewImportedSupplier = typeof suppliers.$inferInsert;

export interface ImportJobStatusChanges {
  status: SystemImportStatus;
  totalRows?: number;
  validRows?: number;
  errorRows?: number;
  importedRows?: number;
  errorSummary?: string | null;
  completedAt?: Date | null;
}

/** Builds the approved audit-log filters, using Asia/Karachi for business-date filtering. */
function buildAuditLogFilters(query: SystemAuditLogQuery): SQL[] {
  const filters: SQL[] = [];

  if (query.action) {
    filters.push(eq(auditLogs.action, query.action));
  }

  if (query.entity) {
    filters.push(eq(auditLogs.entity, query.entity));
  }

  if (query.startDate) {
    filters.push(
      sql`(${auditLogs.createdAt} at time zone 'Asia/Karachi')::date >= ${query.startDate}::date`,
    );
  }

  if (query.endDate) {
    filters.push(
      sql`(${auditLogs.createdAt} at time zone 'Asia/Karachi')::date <= ${query.endDate}::date`,
    );
  }

  return filters;
}

function buildImportJobFilters(query: ImportJobListOptions): SQL[] {
  const filters: SQL[] = [];

  if (query.type) {
    filters.push(eq(importJobs.type, query.type));
  }

  if (query.status) {
    filters.push(eq(importJobs.status, query.status));
  }

  return filters;
}


/** Contains the values stored for one important admin audit event. */
export type NewAuditLog = typeof auditLogs.$inferInsert;

/** Writes one immutable audit event. This is internal-only; there is no public create route. */
export async function createAuditLog(
  database: SystemDatabase,
  values: NewAuditLog,
): Promise<void> {
  await database.insert(auditLogs).values(values);
}

/** Creates one import job before validation results are returned to the admin. */
export async function createImportJob(
  database: SystemDatabase,
  values: NewImportJob,
): Promise<ImportJobRecord> {
  const rows = await database.insert(importJobs).values(values).returning();
  return rows[0]!;
}

/** Reads one import job by UUID. */
export async function getImportJobById(
  database: SystemDatabase,
  importJobId: string,
): Promise<ImportJobRecord | null> {
  const rows = await database
    .select()
    .from(importJobs)
    .where(eq(importJobs.id, importJobId))
    .limit(1);

  return rows[0] ?? null;
}

/** Lists import jobs using the approved type, status and pagination filters. */
export async function listImportJobs(
  database: SystemDatabase,
  query: ImportJobListOptions,
): Promise<PaginatedImportJobs> {
  const filters = buildImportJobFilters(query);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;

  // The page rows and total count are independent reads, so run them together.
  const [items, totalRows] = await Promise.all([
    database
      .select({
        id: importJobs.id,
        type: importJobs.type,
        status: importJobs.status,
        fileName: importJobs.fileName,
        totalRows: importJobs.totalRows,
        validRows: importJobs.validRows,
        errorRows: importJobs.errorRows,
        importedRows: importJobs.importedRows,
        errorSummary: importJobs.errorSummary,
        startedAt: importJobs.startedAt,
        completedAt: importJobs.completedAt,
      })
      .from(importJobs)
      .where(where)
      .orderBy(desc(importJobs.startedAt), desc(importJobs.id))
      .limit(query.pageSize)
      .offset(offset),
    database
      .select({ total: count() })
      .from(importJobs)
      .where(where),
  ]);

  return {
    items,
    total: totalRows[0]?.total ?? 0,
  };
}

/** Lists immutable audit records using the approved filters and pagination. */
export async function listAuditLogs(
  database: SystemDatabase,
  query: AuditLogListOptions,
): Promise<PaginatedAuditLogs> {
  const filters = buildAuditLogFilters(query);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;

  // The page rows and total count are independent reads, so run them together.
  const [items, totalRows] = await Promise.all([
    database
      .select({
        id: auditLogs.id,
        adminUserId: auditLogs.adminUserId,
        adminName: adminUsers.name,
        adminEmail: adminUsers.email,
        requestId: auditLogs.requestId,
        ipAddress: auditLogs.ipAddress,
        device: auditLogs.device,
        action: auditLogs.action,
        entity: auditLogs.entity,
        beforeData: auditLogs.beforeData,
        afterData: auditLogs.afterData,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(adminUsers, eq(adminUsers.id, auditLogs.adminUserId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(query.pageSize)
      .offset(offset),
    database
      .select({ total: count() })
      .from(auditLogs)
      .where(where),
  ]);

  return {
    items,
    total: totalRows[0]?.total ?? 0,
  };
}

/** Updates the persisted result of one import validation or confirmation workflow. */
export async function updateImportJobStatus(
  database: SystemDatabase,
  importJobId: string,
  changes: ImportJobStatusChanges,
): Promise<ImportJobRecord | null> {
  const rows = await database
    .update(importJobs)
    .set(changes)
    .where(eq(importJobs.id, importJobId))
    .returning();

  return rows[0] ?? null;
}

/** Atomically claims one validated product import so it cannot be confirmed twice. */
export async function claimValidatedProductImport(
  database: SystemDatabase,
  importJobId: string,
): Promise<ImportJobRecord | null> {
  const rows = await database
    .update(importJobs)
    .set({
      status: "IMPORTED",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(importJobs.id, importJobId),
        eq(importJobs.type, "products"),
        eq(importJobs.status, "VALIDATED"),
      ),
    )
    .returning();

  return rows[0] ?? null;
}

/** Atomically claims one validated customer or supplier import so it cannot be confirmed twice. */
export async function claimValidatedPartyImport(
  database: SystemDatabase,
  importJobId: string,
  type: "customers" | "suppliers",
): Promise<ImportJobRecord | null> {
  const rows = await database
    .update(importJobs)
    .set({
      status: "IMPORTED",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(importJobs.id, importJobId),
        eq(importJobs.type, type),
        eq(importJobs.status, "VALIDATED"),
      ),
    )
    .returning();

  return rows[0] ?? null;
}

/** Atomically claims one validated opening-stock import so it cannot be confirmed twice. */
export async function claimValidatedOpeningStockImport(
  database: SystemDatabase,
  importJobId: string,
): Promise<ImportJobRecord | null> {
  const rows = await database
    .update(importJobs)
    .set({
      status: "IMPORTED",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(importJobs.id, importJobId),
        eq(importJobs.type, "opening-stock"),
        eq(importJobs.status, "VALIDATED"),
      ),
    )
    .returning();

  return rows[0] ?? null;
}

/** Atomically claims one validated opening-balance import so it cannot be confirmed twice. */
export async function claimValidatedOpeningBalanceImport(
  database: SystemDatabase,
  importJobId: string,
): Promise<ImportJobRecord | null> {
  const rows = await database
    .update(importJobs)
    .set({
      status: "IMPORTED",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(importJobs.id, importJobId),
        eq(importJobs.type, "opening-balances"),
        eq(importJobs.status, "VALIDATED"),
      ),
    )
    .returning();

  return rows[0] ?? null;
}

/** Creates one customer row as part of an already validated import transaction. */
export async function createImportedCustomer(
  database: SystemDatabase,
  values: NewImportedCustomer,
) {
  const rows = await database.insert(customers).values(values).returning();
  return rows[0] ?? null;
}

/** Creates one supplier row as part of an already validated import transaction. */
export async function createImportedSupplier(
  database: SystemDatabase,
  values: NewImportedSupplier,
) {
  const rows = await database.insert(suppliers).values(values).returning();
  return rows[0] ?? null;
}

/** Creates one product row as part of an already validated import transaction. */
export async function createImportedProduct(
  database: SystemDatabase,
  values: NewImportedProduct,
) {
  const rows = await database.insert(products).values(values).returning();
  return rows[0] ?? null;
}

/** Creates all unit rows for one imported product in the same transaction. */
export async function createImportedProductUnits(
  database: SystemDatabase,
  values: NewImportedProductUnit[],
) {
  if (values.length === 0) {
    return [];
  }

  return database.insert(productUnits).values(values).returning();
}

/** Saves row-level validation errors for one import job in a single insert. */
export async function createImportJobErrors(
  database: SystemDatabase,
  errors: NewImportJobError[],
): Promise<ImportJobErrorRecord[]> {
  if (errors.length === 0) {
    return [];
  }

  return database.insert(importJobErrors).values(errors).returning();
}

/** Lists all row-level validation errors for one import job in row order. */
export async function getImportJobErrors(
  database: SystemDatabase,
  importJobId: string,
): Promise<ImportJobErrorRecord[]> {
  return database
    .select()
    .from(importJobErrors)
    .where(eq(importJobErrors.importJobId, importJobId))
    .orderBy(importJobErrors.rowNumber, importJobErrors.id);
}

/** Loads product uniqueness and category/brand references in a few set-based reads. */
export async function getProductImportReferenceData(
  database: SystemDatabase,
): Promise<ProductImportReferenceData> {
  const [savedProducts, categories, savedBrands] = await Promise.all([
    database
      .select({ sku: products.sku, barcode: products.barcode })
      .from(products)
      .orderBy(asc(products.sku)),
    database
      .select({
        id: productCategories.id,
        name: productCategories.name,
        isActive: productCategories.isActive,
      })
      .from(productCategories)
      .orderBy(asc(productCategories.name)),
    database
      .select({ id: brands.id, name: brands.name, isActive: brands.isActive })
      .from(brands)
      .orderBy(asc(brands.name)),
  ]);

  return {
    products: savedProducts,
    categories,
    brands: savedBrands,
  };
}

/** Loads existing customer codes in one read for customer import validation. */
export async function getCustomerImportReferenceData(
  database: SystemDatabase,
): Promise<CustomerImportReferenceData> {
  const savedCustomers = await database
    .select({ code: customers.code, isWalkIn: customers.isWalkIn })
    .from(customers)
    .orderBy(asc(customers.code));

  return { customers: savedCustomers };
}

/** Loads existing supplier codes in one read for supplier import validation. */
export async function getSupplierImportReferenceData(
  database: SystemDatabase,
): Promise<SupplierImportReferenceData> {
  const savedSuppliers = await database
    .select({ code: suppliers.code })
    .from(suppliers)
    .orderBy(asc(suppliers.code));

  return { suppliers: savedSuppliers };
}


/** Loads products and normal-transaction state in set-based reads for opening-stock validation. */
export async function getOpeningStockImportReferenceData(
  database: SystemDatabase,
): Promise<OpeningStockImportReferenceData> {
  const [savedProducts, normalMovements] = await Promise.all([
    database
      .select({ id: products.id, sku: products.sku, isActive: products.isActive })
      .from(products)
      .orderBy(asc(products.sku)),
    database
      .select({ productId: stockMovements.productId })
      .from(stockMovements)
      .where(ne(stockMovements.movementType, "OPENING_STOCK"))
      .groupBy(stockMovements.productId),
  ]);

  return {
    products: savedProducts,
    productIdsWithNormalTransactions: [
      ...new Set(normalMovements.map((movement) => movement.productId)),
    ],
  };
}


/** Loads party references and setup-lock state in set-based reads for opening-balance validation. */
export async function getOpeningBalanceImportReferenceData(
  database: SystemDatabase,
): Promise<OpeningBalanceImportReferenceData> {
  const [
    savedCustomers,
    savedSuppliers,
    customerOpeningEntries,
    supplierOpeningEntries,
    confirmedPurchases,
    normalStockMovements,
    normalMoneyMovements,
  ] = await Promise.all([
    database
      .select({ id: customers.id, code: customers.code, isWalkIn: customers.isWalkIn })
      .from(customers)
      .orderBy(asc(customers.code)),
    database
      .select({ id: suppliers.id, code: suppliers.code })
      .from(suppliers)
      .orderBy(asc(suppliers.code)),
    database
      .select({ customerId: customerLedgerEntries.customerId })
      .from(customerLedgerEntries)
      .where(eq(customerLedgerEntries.referenceType, "OPENING_BALANCE"))
      .groupBy(customerLedgerEntries.customerId),
    database
      .select({ supplierId: supplierLedgerEntries.supplierId })
      .from(supplierLedgerEntries)
      .where(eq(supplierLedgerEntries.referenceType, "OPENING_BALANCE"))
      .groupBy(supplierLedgerEntries.supplierId),
    database
      .select({ id: purchases.id })
      .from(purchases)
      .where(eq(purchases.status, "CONFIRMED"))
      .limit(1),
    database
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(ne(stockMovements.movementType, "OPENING_STOCK"))
      .limit(1),
    database
      .select({ id: cashBankMovements.id })
      .from(cashBankMovements)
      .where(ne(cashBankMovements.sourceType, "OPENING_BALANCE"))
      .limit(1),
  ]);

  return {
    customers: savedCustomers,
    suppliers: savedSuppliers,
    customerIdsWithOpeningBalance: [
      ...new Set(customerOpeningEntries.map((entry) => entry.customerId)),
    ],
    supplierIdsWithOpeningBalance: [
      ...new Set(supplierOpeningEntries.map((entry) => entry.supplierId)),
    ],
    normalBusinessActivityExists:
      confirmedPurchases.length > 0 ||
      normalStockMovements.length > 0 ||
      normalMoneyMovements.length > 0,
  };
}
