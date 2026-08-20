import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

import { AppError } from "../../shared/errors/app-error.js";
import {
  isDecimalGreaterThanZero,
  isDecimalOne,
  isDecimalZero,
  isMoneyWithinDatabaseRange,
  isQuantityWithinDatabaseRange,
} from "../../shared/utils/decimal-validation.js";
import { recordOpeningStockItem } from "../inventory/inventory.service.js";
import { writeCustomerDebit, writeSupplierCredit } from "../ledgers/index.js";
import {
  getCashBankReport,
  getCustomerOutstandingReport,
  getExpenseReport,
  getInventoryReport,
  getProductProfitReport,
  getProfitSummaryReport,
  getPurchasesReport,
  getSalesReport,
  getSupplierPayableReport,
} from "../reports/reports.service.js";
import {
  cashBankReportQuerySchema,
  customerOutstandingReportQuerySchema,
  expenseReportQuerySchema,
  inventoryReportQuerySchema,
  productProfitReportQuerySchema,
  profitSummaryReportQuerySchema,
  purchasesReportQuerySchema,
  salesReportQuerySchema,
  supplierPayableReportQuerySchema,
} from "../reports/reports.schema.js";
import {
  createAuditLog,
  createImportJob,
  createImportJobErrors,
  createImportedCustomer,
  createImportedProduct,
  createImportedProductUnits,
  createImportedSupplier,
  getCustomerImportReferenceData,
  getOpeningBalanceImportReferenceData,
  getOpeningStockImportReferenceData,
  getProductImportReferenceData,
  getImportJobById,
  getImportJobErrors,
  listAuditLogs as listAuditLogRecords,
  listImportJobs as listImportJobRecords,
  claimValidatedOpeningBalanceImport,
  claimValidatedOpeningStockImport,
  claimValidatedPartyImport,
  claimValidatedProductImport,
  updateImportJobStatus,
  getSupplierImportReferenceData,
  type SystemDatabase,
} from "./system.repository.js";
import type {
  SystemAuditLogQuery,
  SystemImportListQuery,
  SystemImportType,
  SystemExportQuery,
  SystemExportType,
} from "./system.schema.js";

/** Describes one downloadable import template file. */
export interface ImportTemplateFile {
  fileName: string;
  contentType: string;
  content: string;
}

/** Describes one safely parsed CSV upload before business validation starts. */
export interface ParsedImportFile {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
}


const IMPORT_HISTORY_PAGE_SIZE = 20;
const AUDIT_LOG_PAGE_SIZE = 20;

/** Contains request metadata attached to one immutable audit record. */
export interface AuditRequestContext {
  adminUserId: string | null;
  requestId: string;
  ipAddress: string | null;
  device: string | null;
}

const sensitiveAuditKeyPattern = /(password|token|secret|cookie|authorization|csrf)/i;

/** Removes secret-like fields before immutable audit payloads are stored. */
function sanitizeAuditValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  if (seen.has(value)) {
    return "[CIRCULAR]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item, seen));
  }

  const safeObject: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    safeObject[key] = sensitiveAuditKeyPattern.test(key)
      ? "[REDACTED]"
      : sanitizeAuditValue(item, seen);
  }
  return safeObject;
}

/** Saves one important action without allowing audit failure to undo an already-completed business action. */
export async function recordAuditLog(
  database: SystemDatabase,
  context: AuditRequestContext,
  action: string,
  entity: string,
  beforeData: unknown = null,
  afterData: unknown = null,
): Promise<boolean> {
  try {
    await createAuditLog(database, {
      adminUserId: context.adminUserId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      device: context.device,
      action,
      entity,
      beforeData: sanitizeAuditValue(beforeData),
      afterData: sanitizeAuditValue(afterData),
    });
    return true;
  } catch {
    return false;
  }
}

/** Returns one import job without the internal validated-data snapshot. */
function toImportJobResponse(job: Awaited<ReturnType<typeof getImportJobById>>) {
  if (!job) {
    return null;
  }

  const { validatedData: _validatedData, ...safeJob } = job;
  return safeJob;
}

/** Lists import jobs using the approved type/status filters and fixed pagination size. */
export async function listSystemImports(
  database: SystemDatabase,
  query: SystemImportListQuery,
) {
  const result = await listImportJobRecords(database, {
    type: query.type,
    status: query.status,
    page: query.page,
    pageSize: IMPORT_HISTORY_PAGE_SIZE,
  });

  return {
    items: result.items,
    page: query.page,
    pageSize: IMPORT_HISTORY_PAGE_SIZE,
    total: result.total,
  };
}

/** Lists important immutable audit records using the approved filters. */
export async function listSystemAuditLogs(
  database: SystemDatabase,
  query: SystemAuditLogQuery,
) {
  const result = await listAuditLogRecords(database, {
    ...query,
    pageSize: AUDIT_LOG_PAGE_SIZE,
  });

  return {
    items: result.items,
    page: query.page,
    pageSize: AUDIT_LOG_PAGE_SIZE,
    total: result.total,
  };
}

const EXPORT_PAGE_SIZE = 100;

/** Contains the source report data used by later CSV/Excel/PDF formatting passes. */
export interface SystemExportSource {
  type: SystemExportType;
  fileNameBase: string;
  data: unknown;
}

/** Keeps only report filter values before a report-specific Zod schema validates them. */
function definedExportFilters(query: SystemExportQuery): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(query).filter(
      ([key, value]) => key !== "format" && value !== undefined,
    ),
  );
}

/** Loads every page of customer outstanding data so exports are not silently truncated. */
async function getAllCustomerOutstandingRows(
  database: SystemDatabase,
  search?: string,
) {
  const first = await getCustomerOutstandingReport(database, {
    search,
    page: 1,
    pageSize: EXPORT_PAGE_SIZE,
  });
  const items = [...first.items];
  const totalPages = Math.ceil(first.total / EXPORT_PAGE_SIZE);

  // After page 1 gives the total, the remaining pages are independent reads.
  if (totalPages > 1) {
    const remainingPages = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, index) =>
        getCustomerOutstandingReport(database, {
          search,
          page: index + 2,
          pageSize: EXPORT_PAGE_SIZE,
        }),
      ),
    );
    for (const page of remainingPages) items.push(...page.items);
  }

  return { items, total: first.total };
}

/** Loads every page of supplier payable data so exports are not silently truncated. */
async function getAllSupplierPayableRows(
  database: SystemDatabase,
  search?: string,
) {
  const first = await getSupplierPayableReport(database, {
    search,
    page: 1,
    pageSize: EXPORT_PAGE_SIZE,
  });
  const items = [...first.items];
  const totalPages = Math.ceil(first.total / EXPORT_PAGE_SIZE);

  // After page 1 gives the total, the remaining pages are independent reads.
  if (totalPages > 1) {
    const remainingPages = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, index) =>
        getSupplierPayableReport(database, {
          search,
          page: index + 2,
          pageSize: EXPORT_PAGE_SIZE,
        }),
      ),
    );
    for (const page of remainingPages) items.push(...page.items);
  }

  return { items, total: first.total };
}

/** Loads every page of product-profit data so exports contain the complete selected report. */
async function getAllProductProfitRows(
  database: SystemDatabase,
  query: { startDate: string; endDate: string; productId?: string },
) {
  const first = await getProductProfitReport(database, {
    ...query,
    page: 1,
    pageSize: EXPORT_PAGE_SIZE,
  });
  const items = [...first.items];
  const totalPages = Math.ceil(first.total / EXPORT_PAGE_SIZE);

  // After page 1 gives the total, the remaining pages are independent reads.
  if (totalPages > 1) {
    const remainingPages = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, index) =>
        getProductProfitReport(database, {
          ...query,
          page: index + 2,
          pageSize: EXPORT_PAGE_SIZE,
        }),
      ),
    );
    for (const page of remainingPages) items.push(...page.items);
  }

  return { items, total: first.total };
}

/** Reuses the approved Reports module calculations as the single source for System exports. */
export async function getSystemExportSource(
  database: SystemDatabase,
  type: SystemExportType,
  query: SystemExportQuery,
): Promise<SystemExportSource> {
  const filters = definedExportFilters(query);

  if (type === "sales") {
    const parsed = salesReportQuerySchema.parse(filters);
    return { type, fileNameBase: "sales-report", data: await getSalesReport(database, parsed) };
  }

  if (type === "purchases") {
    const parsed = purchasesReportQuerySchema.parse(filters);
    return { type, fileNameBase: "purchases-report", data: await getPurchasesReport(database, parsed) };
  }

  if (type === "inventory") {
    const parsed = inventoryReportQuerySchema.parse(filters);
    return { type, fileNameBase: "inventory-report", data: await getInventoryReport(database, parsed) };
  }

  if (type === "customer-outstanding") {
    const parsed = customerOutstandingReportQuerySchema.parse({
      ...filters,
      page: 1,
      pageSize: EXPORT_PAGE_SIZE,
    });
    return {
      type,
      fileNameBase: "customer-outstanding-report",
      data: await getAllCustomerOutstandingRows(database, parsed.search),
    };
  }

  if (type === "supplier-payable") {
    const parsed = supplierPayableReportQuerySchema.parse({
      ...filters,
      page: 1,
      pageSize: EXPORT_PAGE_SIZE,
    });
    return {
      type,
      fileNameBase: "supplier-payable-report",
      data: await getAllSupplierPayableRows(database, parsed.search),
    };
  }

  if (type === "cash-bank") {
    const parsed = cashBankReportQuerySchema.parse(filters);
    return { type, fileNameBase: "cash-bank-report", data: await getCashBankReport(database, parsed) };
  }

  if (type === "expenses") {
    const parsed = expenseReportQuerySchema.parse(filters);
    return { type, fileNameBase: "expenses-report", data: await getExpenseReport(database, parsed) };
  }

  if (type === "profit-summary") {
    const parsed = profitSummaryReportQuerySchema.parse(filters);
    return { type, fileNameBase: "profit-summary-report", data: await getProfitSummaryReport(database, parsed) };
  }

  const parsed = productProfitReportQuerySchema.parse({
    ...filters,
    page: 1,
    pageSize: EXPORT_PAGE_SIZE,
  });
  return {
    type,
    fileNameBase: "product-profit-report",
    data: await getAllProductProfitRows(database, {
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      productId: parsed.productId,
    }),
  };
}


/** Describes one downloadable System export file. */
export interface SystemExportFile {
  fileName: string;
  contentType: string;
  content: string | Buffer;
}

interface SystemExportTable {
  columns: readonly string[];
  rows: Record<string, unknown>[];
}

/** Converts approved Reports data into one simple table shared by CSV and Excel exports. */
function getSystemExportTable(source: SystemExportSource): SystemExportTable {
  const data = source.data as Record<string, any>;

  if (source.type === "sales") {
    const columns = [
      "documentType", "documentNumber", "documentDate", "customerCode", "customerName",
      "productSku", "productName", "unitName", "quantity", "baseQuantity", "unitPrice", "amount",
      "salesAmount", "returnAmount", "netSalesAmount",
    ];
    const rows = (data.rows ?? []).map((row: Record<string, unknown>) => ({ ...row }));
    rows.push({ documentType: "TOTALS", ...(data.totals ?? {}) });
    return { columns, rows };
  }

  if (source.type === "purchases") {
    const columns = [
      "documentType", "documentNumber", "documentDate", "supplierCode", "supplierName",
      "productSku", "productName", "unitName", "quantity", "baseQuantity", "unitCost", "amount",
      "purchasesAmount", "returnAmount", "netPurchasesAmount",
    ];
    const rows = (data.rows ?? []).map((row: Record<string, unknown>) => ({ ...row }));
    rows.push({ documentType: "TOTALS", ...(data.totals ?? {}) });
    return { columns, rows };
  }

  if (source.type === "inventory") {
    const columns = [
      "recordType", "productSku", "productName", "categoryName", "brandName", "baseUnitName",
      "reorderLevel", "sellableQuantity", "damagedQuantity", "expiredQuantity", "weightedAverageCost",
      "isLowStock", "occurredAt", "movementType", "stockCondition", "direction", "quantity",
      "unitCost", "allocatedExtraCost", "sourceType", "sourceId", "reason", "notes",
    ];
    const rows: Record<string, unknown>[] = [];
    for (const row of data.stock ?? []) rows.push({ recordType: "STOCK", ...row });
    for (const row of data.movements ?? []) rows.push({ recordType: "MOVEMENT", ...row });
    return { columns, rows };
  }

  if (source.type === "customer-outstanding") {
    return {
      columns: ["customerCode", "customerName", "phone", "outstandingAmount"],
      rows: data.items ?? [],
    };
  }

  if (source.type === "supplier-payable") {
    return {
      columns: ["supplierCode", "supplierName", "phone", "payableAmount"],
      rows: data.items ?? [],
    };
  }

  if (source.type === "cash-bank") {
    const columns = [
      "recordType", "accountType", "accountName", "accountReference", "openingBalance", "inflowAmount",
      "outflowAmount", "closingBalance", "businessDate", "occurredAt", "direction", "sourceType",
      "sourceId", "amount", "documentNumber", "description",
    ];
    const rows: Record<string, unknown>[] = [];
    for (const account of data.accounts ?? []) {
      rows.push({ recordType: "ACCOUNT", ...account, movements: undefined });
      for (const movement of account.movements ?? []) {
        rows.push({
          recordType: "MOVEMENT",
          accountType: account.accountType,
          accountName: account.accountName,
          accountReference: account.accountReference,
          ...movement,
        });
      }
    }
    return { columns, rows };
  }

  if (source.type === "expenses") {
    const columns = [
      "documentType", "expenseNumber", "documentDate", "categoryName", "paymentMethod", "accountName",
      "amount", "note", "receiptUrl", "reversalReason", "expenseAmount", "reversalAmount", "netExpenseAmount",
    ];
    const rows = (data.rows ?? []).map((row: Record<string, unknown>) => ({ ...row }));
    rows.push({ documentType: "TOTALS", ...(data.totals ?? {}) });
    return { columns, rows };
  }

  if (source.type === "profit-summary") {
    return {
      columns: [
        "salesAmount", "salesReturnAmount", "netSalesAmount", "costOfGoodsSoldAmount", "returnedCostAmount",
        "netCostAmount", "grossProfitAmount", "expenseAmount", "expenseReversalAmount", "netExpenseAmount",
        "estimatedProfitAmount",
      ],
      rows: [data],
    };
  }

  return {
    columns: [
      "productSku", "productName", "soldBaseQuantity", "returnedBaseQuantity", "netBaseQuantity",
      "salesAmount", "returnAmount", "netSalesAmount", "costOfGoodsSoldAmount", "returnedCostAmount",
      "netCostAmount", "estimatedProfitAmount",
    ],
    rows: data.items ?? [],
  };
}

/** Prefixes formula-like spreadsheet text while leaving normal signed numbers unchanged. */
function sanitizeSpreadsheetText(text: string): string {
  const trimmed = text.trimStart();
  const isSignedNumber = /^[+-]?\d+(?:\.\d+)?$/.test(trimmed);
  if (!isSignedNumber && /^[=+@-]/.test(trimmed)) {
    return `'${text}`;
  }
  return text;
}

/** Escapes one value according to the CSV format while preserving decimal strings exactly. */
function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";

  const rawText = typeof value === "string" ? value : String(value);
  const text = typeof value === "string" ? sanitizeSpreadsheetText(rawText) : rawText;
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Converts a list of simple records into UTF-8 CSV text with a fixed column order. */
function recordsToCsv(
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
): string {
  const lines = [columns.map(escapeCsvValue).join(",")];

  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsvValue(row[column])).join(","));
  }

  // UTF-8 BOM keeps common spreadsheet programs from misreading non-ASCII names.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** Builds a UTF-8 CSV file from the approved Reports module export source. */
export function buildSystemCsvExport(source: SystemExportSource): SystemExportFile {
  const table = getSystemExportTable(source);
  return {
    fileName: `${source.fileNameBase}.csv`,
    contentType: "text/csv; charset=utf-8",
    content: recordsToCsv(table.columns, table.rows),
  };
}

/** Converts an unknown report value into a safe Excel cell value. */
function toExcelCellValue(value: unknown): string | number | boolean | Date {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) return value;
  return JSON.stringify(value);
}

/** Builds one simple XLSX workbook from the same approved data used by CSV exports. */
export async function buildSystemExcelExport(
  source: SystemExportSource,
): Promise<SystemExportFile> {
  const table = getSystemExportTable(source);
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Report");

  worksheet.addRow([...table.columns]);
  for (const row of table.rows) {
    worksheet.addRow(
      table.columns.map((column) => toExcelCellValue(row[column])),
    );
  }

  const header = worksheet.getRow(1);
  header.font = { bold: true };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: table.columns.length },
  };

  for (let columnIndex = 1; columnIndex <= table.columns.length; columnIndex += 1) {
    const column = worksheet.getColumn(columnIndex);
    let width = String(table.columns[columnIndex - 1]).length + 2;

    column.eachCell({ includeEmpty: false }, (cell) => {
      width = Math.max(width, String(cell.value ?? "").length + 2);
    });

    column.width = Math.min(Math.max(width, 12), 40);
  }

  const content = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    fileName: `${source.fileNameBase}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    content,
  };
}


/** Converts one report value into readable text without changing decimal strings. */
function toPdfText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/** Turns a camelCase export column into a readable PDF label. */
function toPdfLabel(column: string): string {
  const spaced = column.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Collects a PDFKit stream into one Buffer for the Fastify download response. */
function collectPdfBuffer(document: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
}

/** Adds page numbers after all report rows have been laid out. */
function addPdfPageNumbers(document: PDFKit.PDFDocument): void {
  const range = document.bufferedPageRange();

  for (let index = 0; index < range.count; index += 1) {
    document.switchToPage(range.start + index);
    document
      .font("Helvetica")
      .fontSize(8)
      .text(
        `Page ${index + 1} of ${range.count}`,
        40,
        document.page.height - 28,
        { align: "center", width: document.page.width - 80 },
      );
  }
}

/** Builds a simple printable PDF from the same approved table used by CSV and Excel exports. */
export async function buildSystemPdfExport(
  source: SystemExportSource,
): Promise<SystemExportFile> {
  const table = getSystemExportTable(source);
  const document = new PDFDocument({
    size: "A4",
    margin: 40,
    bufferPages: true,
    info: { title: source.fileNameBase },
  });
  const contentPromise = collectPdfBuffer(document);

  document
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(source.fileNameBase.replace(/-/g, " "), { align: "center" });
  document.moveDown(0.5);
  document
    .font("Helvetica")
    .fontSize(9)
    .text(`Records: ${table.rows.length}`, { align: "center" });
  document.moveDown();

  if (table.rows.length === 0) {
    document.fontSize(10).text("No records match the selected filters.");
  }

  table.rows.forEach((row, rowIndex) => {
    if (document.y > document.page.height - 90) {
      document.addPage();
    }

    document
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(`Record ${rowIndex + 1}`);

    for (const column of table.columns) {
      document
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(`${toPdfLabel(column)}: `, { continued: true })
        .font("Helvetica")
        .text(toPdfText(row[column]));
    }

    document.moveDown(0.4);
    document
      .strokeColor("#D0D0D0")
      .moveTo(40, document.y)
      .lineTo(document.page.width - 40, document.y)
      .stroke();
    document.moveDown(0.6);
  });

  addPdfPageNumbers(document);
  document.end();

  return {
    fileName: `${source.fileNameBase}.pdf`,
    contentType: "application/pdf",
    content: await contentPromise,
  };
}

/** Returns one import job together with its saved row-level validation errors. */
export async function getSystemImport(
  database: SystemDatabase,
  importJobId: string,
) {
  const [job, errors] = await Promise.all([
    getImportJobById(database, importJobId),
    getImportJobErrors(database, importJobId),
  ]);

  if (!job) {
    throw new AppError("IMPORT_JOB_NOT_FOUND", "Import job was not found.", 404);
  }

  return {
    job: toImportJobResponse(job),
    errors,
  };
}

/** Lists the CSV columns for each approved opening/master-data import type. */
const importTemplateColumns: Record<SystemImportType, readonly string[]> = {
  products: [
    "sku",
    "barcode",
    "name",
    "categoryName",
    "brandName",
    "reorderLevel",
    "referencePurchasePrice",
    "referenceSalePrice",
    "unitName",
    "conversionToBase",
    "isBaseUnit",
  ],
  customers: [
    "code",
    "name",
    "phone",
    "email",
    "address",
    "creditLimit",
  ],
  suppliers: [
    "code",
    "name",
    "phone",
    "email",
    "address",
  ],
  "opening-stock": [
    "productSku",
    "stockCondition",
    "quantity",
    "unitCost",
  ],
  "opening-balances": [
    "partyType",
    "partyCode",
    "openingBalance",
  ],
};

/** Builds a header-only CSV template so the admin can enter import data safely. */
export function getImportTemplate(type: SystemImportType): ImportTemplateFile {
  const columns = importTemplateColumns[type];

  return {
    fileName: `${type}-import-template.csv`,
    contentType: "text/csv; charset=utf-8",
    content: `${columns.join(",")}\n`,
  };
}

/** Parses CSV text while supporting quoted commas, escaped quotes and line breaks. */
function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (quoted) {
      if (character === '"') {
        if (content[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        value += character;
      }

      continue;
    }

    if (character === '"') {
      quoted = true;
      continue;
    }

    if (character === ",") {
      row.push(value);
      value = "";
      continue;
    }

    if (character === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    if (character !== "\r") {
      value += character;
    }
  }

  if (quoted) {
    throw new AppError(
      "INVALID_FILE_FORMAT",
      "The CSV file contains an unclosed quoted value.",
      400,
    );
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

/** Removes blank trailing rows without hiding blank cells inside real rows. */
function removeBlankRows(rows: string[][]): string[][] {
  return rows.filter((row) => row.some((value) => value.trim().length > 0));
}

/** Normalizes a CSV header without changing the approved business field name. */
function normalizeHeader(value: string, index: number): string {
  const withoutBom = index === 0 ? value.replace(/^\uFEFF/, "") : value;
  return withoutBom.trim();
}

/** Validates normalized headers before any business row validation runs. */
function validateHeaders(headers: string[]): void {
  if (headers.length === 0 || headers.every((header) => header.length === 0)) {
    throw new AppError(
      "INVALID_FILE_FORMAT",
      "The CSV file must contain a header row.",
      400,
    );
  }

  if (headers.some((header) => header.length === 0)) {
    throw new AppError(
      "INVALID_FILE_FORMAT",
      "CSV column names cannot be blank.",
      400,
    );
  }

  const uniqueHeaders = new Set(headers);
  if (uniqueHeaders.size !== headers.length) {
    throw new AppError(
      "INVALID_FILE_FORMAT",
      "CSV column names must be unique.",
      400,
    );
  }
}

/** Converts parsed CSV cells into simple objects keyed by normalized headers. */
function mapRowsToObjects(
  headers: string[],
  rows: string[][],
): Record<string, string>[] {
  return rows.map((row, rowIndex) => {
    if (row.length !== headers.length) {
      throw new AppError(
        "INVALID_FILE_FORMAT",
        `CSV row ${rowIndex + 2} has ${row.length} columns; ${headers.length} are required.`,
        400,
      );
    }

    const record: Record<string, string> = {};
    for (let index = 0; index < headers.length; index += 1) {
      record[headers[index]] = row[index].trim();
    }

    return record;
  });
}

/** Parses one uploaded CSV file without writing business data or validating business rules yet. */
export function parseImportCsv(
  fileName: string,
  content: Buffer,
): ParsedImportFile {
  if (!fileName.toLowerCase().endsWith(".csv")) {
    throw new AppError(
      "INVALID_FILE_FORMAT",
      "Only CSV import files are supported.",
      400,
    );
  }

  if (content.length === 0) {
    throw new AppError(
      "INVALID_FILE_FORMAT",
      "The uploaded CSV file is empty.",
      400,
    );
  }

  if (content.includes(0)) {
    throw new AppError(
      "INVALID_FILE_FORMAT",
      "The uploaded file is not a valid text CSV file.",
      400,
    );
  }

  const parsedRows = removeBlankRows(parseCsvRows(content.toString("utf8")));
  if (parsedRows.length === 0) {
    throw new AppError(
      "INVALID_FILE_FORMAT",
      "The uploaded CSV file is empty.",
      400,
    );
  }

  const headers = parsedRows[0].map(normalizeHeader);
  validateHeaders(headers);

  const rows = mapRowsToObjects(headers, parsedRows.slice(1));

  return {
    fileName,
    headers,
    rows,
    rowCount: rows.length,
  };
}

/** Represents one product-import validation error before it is attached to an import job. */
interface ProductImportValidationError {
  rowNumber: number;
  columnName: string;
  errorCode: string;
  message: string;
  rawRow: Record<string, string>;
}

/** Describes the saved result returned after validating a product CSV import. */
export interface ProductImportValidationResult {
  job: {
    id: string;
    type: string;
    status: string;
    fileName: string;
    totalRows: number;
    validRows: number;
    errorRows: number;
    importedRows: number;
    errorSummary: string | null;
  };
  errors: Array<{
    rowNumber: number;
    columnName: string;
    errorCode: string;
    message: string;
  }>;
}

const requiredProductImportHeaders = importTemplateColumns.products;
const requiredProductImportHeaderSet = new Set<string>(requiredProductImportHeaders);

/** Normalizes business keys used for case-insensitive import comparisons. */
function normalizeImportKey(value: string): string {
  return value.trim().toLowerCase();
}

/** Adds one row-level product validation error. */
function addProductImportError(
  errors: ProductImportValidationError[],
  rowNumber: number,
  columnName: string,
  errorCode: string,
  message: string,
  rawRow: Record<string, string>,
): void {
  errors.push({ rowNumber, columnName, errorCode, message, rawRow });
}

/** Validates the exact columns required by the approved product import template. */
function validateProductImportHeaders(
  parsed: ParsedImportFile,
): ProductImportValidationError[] {
  const errors: ProductImportValidationError[] = [];
  const headerSet = new Set(parsed.headers);
  const headerRow = Object.fromEntries(parsed.headers.map((header) => [header, header]));

  for (const header of requiredProductImportHeaders) {
    if (!headerSet.has(header)) {
      addProductImportError(
        errors,
        1,
        header,
        "MISSING_COLUMN",
        `Required product import column '${header}' is missing.`,
        headerRow,
      );
    }
  }

  for (const header of parsed.headers) {
    if (!requiredProductImportHeaderSet.has(header)) {
      addProductImportError(
        errors,
        1,
        header,
        "UNSUPPORTED_COLUMN",
        `Column '${header}' is not part of the approved product import template.`,
        headerRow,
      );
    }
  }

  return errors;
}

/** Validates the simple field rules that apply to one product CSV row. */
function validateProductImportRow(
  row: Record<string, string>,
  rowNumber: number,
  errors: ProductImportValidationError[],
): void {
  const requiredTextFields = [
    ["sku", "SKU is required.", 64],
    ["name", "Product name is required.", 200],
    ["categoryName", "Category name is required.", 120],
    ["unitName", "Unit name is required.", 80],
  ] as const;

  for (const [field, message, maxLength] of requiredTextFields) {
    const value = row[field] ?? "";
    if (value.length === 0) {
      addProductImportError(errors, rowNumber, field, "REQUIRED_FIELD", message, row);
    } else if (value.length > maxLength) {
      addProductImportError(
        errors,
        rowNumber,
        field,
        "VALUE_TOO_LONG",
        `${field} must be ${maxLength} characters or fewer.`,
        row,
      );
    }
  }

  if ((row.barcode ?? "").length > 128) {
    addProductImportError(
      errors,
      rowNumber,
      "barcode",
      "VALUE_TOO_LONG",
      "Barcode must be 128 characters or fewer.",
      row,
    );
  }

  if ((row.brandName ?? "").length > 120) {
    addProductImportError(
      errors,
      rowNumber,
      "brandName",
      "VALUE_TOO_LONG",
      "Brand name must be 120 characters or fewer.",
      row,
    );
  }

  const reorderLevel = row.reorderLevel ?? "";
  if (
    reorderLevel.length > 0 &&
    !isQuantityWithinDatabaseRange(reorderLevel)
  ) {
    addProductImportError(
      errors,
      rowNumber,
      "reorderLevel",
      "INVALID_REORDER_LEVEL",
      "Reorder level must be a non-negative quantity with up to three decimal places.",
      row,
    );
  }

  for (const field of ["referencePurchasePrice", "referenceSalePrice"] as const) {
    const value = row[field] ?? "";
    if (value.length > 0 && !isMoneyWithinDatabaseRange(value)) {
      addProductImportError(
        errors,
        rowNumber,
        field,
        "INVALID_PRICE",
        "Reference price must be a non-negative amount with up to two decimal places.",
        row,
      );
    }
  }

  const conversion = row.conversionToBase ?? "";
  if (!isQuantityWithinDatabaseRange(conversion) || !isDecimalGreaterThanZero(conversion)) {
    addProductImportError(
      errors,
      rowNumber,
      "conversionToBase",
      "INVALID_UNIT_CONVERSION",
      "Conversion to base must be greater than zero with up to three decimal places.",
      row,
    );
  }

  if (row.isBaseUnit !== "true" && row.isBaseUnit !== "false") {
    addProductImportError(
      errors,
      rowNumber,
      "isBaseUnit",
      "INVALID_BASE_UNIT_FLAG",
      "isBaseUnit must be true or false.",
      row,
    );
  }
}

/** Returns true when repeated rows for one SKU use the same product-level value. */
function sameProductValue(
  firstRow: Record<string, string>,
  row: Record<string, string>,
  field: string,
): boolean {
  return (firstRow[field] ?? "").trim() === (row[field] ?? "").trim();
}

/** Validates product-level uniqueness, references and unit rules without inserting products. */
async function collectProductImportErrors(
  database: SystemDatabase,
  parsed: ParsedImportFile,
): Promise<ProductImportValidationError[]> {
  const headerErrors = validateProductImportHeaders(parsed);
  if (headerErrors.length > 0) {
    return headerErrors;
  }

  const errors: ProductImportValidationError[] = [];
  if (parsed.rows.length === 0) {
    addProductImportError(
      errors,
      1,
      "file",
      "NO_DATA_ROWS",
      "The product import file must contain at least one product row.",
      {},
    );
    return errors;
  }

  for (let index = 0; index < parsed.rows.length; index += 1) {
    validateProductImportRow(parsed.rows[index], index + 2, errors);
  }

  const references = await getProductImportReferenceData(database);
  const existingSkus = new Set(references.products.map((row) => normalizeImportKey(row.sku)));
  const existingBarcodes = new Set(
    references.products
      .map((row) => row.barcode?.trim())
      .filter((barcode): barcode is string => Boolean(barcode)),
  );
  const categories = new Map(
    references.categories.map((category) => [normalizeImportKey(category.name), category]),
  );
  const brands = new Map(
    references.brands.map((brand) => [normalizeImportKey(brand.name), brand]),
  );
  const productRows = new Map<string, Array<{ row: Record<string, string>; rowNumber: number }>>();

  for (let index = 0; index < parsed.rows.length; index += 1) {
    const row = parsed.rows[index];
    const skuKey = normalizeImportKey(row.sku ?? "");
    if (!skuKey) {
      continue;
    }

    const rows = productRows.get(skuKey) ?? [];
    rows.push({ row, rowNumber: index + 2 });
    productRows.set(skuKey, rows);
  }

  const barcodeOwners = new Map<string, string>();

  for (const [skuKey, rows] of productRows) {
    const first = rows[0];
    const firstRow = first.row;

    if (existingSkus.has(skuKey)) {
      addProductImportError(
        errors,
        first.rowNumber,
        "sku",
        "DUPLICATE_SKU",
        "SKU already exists in Product Management.",
        firstRow,
      );
    }

    const productFields = [
      "barcode",
      "name",
      "categoryName",
      "brandName",
      "reorderLevel",
      "referencePurchasePrice",
      "referenceSalePrice",
    ];

    for (const entry of rows.slice(1)) {
      for (const field of productFields) {
        if (!sameProductValue(firstRow, entry.row, field)) {
          addProductImportError(
            errors,
            entry.rowNumber,
            field,
            "INCONSISTENT_PRODUCT_DATA",
            `All rows for SKU '${firstRow.sku}' must use the same ${field}.`,
            entry.row,
          );
        }
      }
    }

    const barcode = (firstRow.barcode ?? "").trim();
    if (barcode) {
      if (existingBarcodes.has(barcode)) {
        addProductImportError(
          errors,
          first.rowNumber,
          "barcode",
          "DUPLICATE_BARCODE",
          "Barcode already exists in Product Management.",
          firstRow,
        );
      }

      const owner = barcodeOwners.get(barcode);
      if (owner && owner !== skuKey) {
        addProductImportError(
          errors,
          first.rowNumber,
          "barcode",
          "DUPLICATE_BARCODE",
          "Barcode appears on more than one product in this import file.",
          firstRow,
        );
      } else {
        barcodeOwners.set(barcode, skuKey);
      }
    }

    const category = categories.get(normalizeImportKey(firstRow.categoryName ?? ""));
    if (!category) {
      addProductImportError(
        errors,
        first.rowNumber,
        "categoryName",
        "CATEGORY_NOT_FOUND",
        "Product category was not found.",
        firstRow,
      );
    } else if (!category.isActive) {
      addProductImportError(
        errors,
        first.rowNumber,
        "categoryName",
        "CATEGORY_INACTIVE",
        "An inactive category cannot be assigned to a new product.",
        firstRow,
      );
    }

    const brandName = (firstRow.brandName ?? "").trim();
    if (brandName) {
      const brand = brands.get(normalizeImportKey(brandName));
      if (!brand) {
        addProductImportError(
          errors,
          first.rowNumber,
          "brandName",
          "BRAND_NOT_FOUND",
          "Product brand was not found.",
          firstRow,
        );
      } else if (!brand.isActive) {
        addProductImportError(
          errors,
          first.rowNumber,
          "brandName",
          "BRAND_INACTIVE",
          "An inactive brand cannot be assigned to a new product.",
          firstRow,
        );
      }
    }

    const unitNames = new Map<string, number>();
    const baseRows = rows.filter((entry) => entry.row.isBaseUnit === "true");

    if (baseRows.length !== 1) {
      addProductImportError(
        errors,
        first.rowNumber,
        "isBaseUnit",
        "INVALID_BASE_UNIT_COUNT",
        "Each product must have exactly one base unit row.",
        firstRow,
      );
    } else if (!isDecimalOne(baseRows[0].row.conversionToBase)) {
      addProductImportError(
        errors,
        baseRows[0].rowNumber,
        "conversionToBase",
        "INVALID_BASE_UNIT_CONVERSION",
        "The base unit conversion must be 1.000.",
        baseRows[0].row,
      );
    }

    for (const entry of rows) {
      const unitKey = normalizeImportKey(entry.row.unitName ?? "");
      if (!unitKey) {
        continue;
      }

      if (unitNames.has(unitKey)) {
        addProductImportError(
          errors,
          entry.rowNumber,
          "unitName",
          "DUPLICATE_PRODUCT_UNIT",
          "Unit name appears more than once for this product.",
          entry.row,
        );
      } else {
        unitNames.set(unitKey, entry.rowNumber);
      }
    }
  }

  return errors;
}

/** Validates a product CSV and persists only the import job and its validation errors. */
export async function validateProductImport(
  database: SystemDatabase,
  parsed: ParsedImportFile,
): Promise<ProductImportValidationResult> {
  const errors = await collectProductImportErrors(database, parsed);
  const invalidRows = new Set(
    errors.filter((error) => error.rowNumber >= 2).map((error) => error.rowNumber),
  );
  const invalidSkus = new Set(
    errors
      .map((error) => normalizeImportKey(error.rawRow.sku ?? ""))
      .filter((sku) => sku.length > 0),
  );

  for (let index = 0; index < parsed.rows.length; index += 1) {
    const sku = normalizeImportKey(parsed.rows[index].sku ?? "");
    if (sku && invalidSkus.has(sku)) {
      invalidRows.add(index + 2);
    }
  }

  const hasHeaderError = errors.some((error) => error.rowNumber === 1);
  const errorRows = hasHeaderError ? parsed.rowCount : invalidRows.size;
  const validRows = Math.max(0, parsed.rowCount - errorRows);
  const status = errors.length === 0 ? "VALIDATED" : "FAILED";
  const errorSummary =
    errors.length === 0
      ? null
      : `${errors.length} validation error(s) found across ${errorRows} data row(s).`;

  const job = await createImportJob(database, {
    type: "products",
    status,
    fileName: parsed.fileName,
    totalRows: parsed.rowCount,
    validRows,
    errorRows,
    importedRows: 0,
    errorSummary,
    validatedData: status === "VALIDATED" ? parsed.rows : null,
    completedAt: new Date(),
  });

  await createImportJobErrors(
    database,
    errors.map((error) => ({
      importJobId: job.id,
      rowNumber: error.rowNumber,
      columnName: error.columnName,
      errorCode: error.errorCode,
      message: error.message,
      rawRow: error.rawRow,
    })),
  );

  return {
    job: {
      id: job.id,
      type: job.type,
      status: job.status,
      fileName: job.fileName,
      totalRows: job.totalRows,
      validRows: job.validRows,
      errorRows: job.errorRows,
      importedRows: job.importedRows,
      errorSummary: job.errorSummary,
    },
    errors: errors.map(({ rowNumber, columnName, errorCode, message }) => ({
      rowNumber,
      columnName,
      errorCode,
      message,
    })),
  };
}

/** Converts confirmation-time import drift into safe field errors for the API response. */
function toImportConfirmationFields(
  errors: readonly { columnName: string; message: string }[],
) {
  return errors.slice(0, 50).map((error) => ({
    field: error.columnName,
    message: error.message,
  }));
}

export interface ProductImportConfirmationResult {
  job: {
    id: string;
    type: string;
    status: string;
    totalRows: number;
    importedRows: number;
  };
  productsCreated: number;
}

/** Confirms one validated product import inside the caller-owned idempotency transaction. */
export async function confirmProductImport(
  database: SystemDatabase,
  importJobId: string,
): Promise<ProductImportConfirmationResult> {
  const job = await getImportJobById(database, importJobId);

  if (!job) {
    throw new AppError("IMPORT_JOB_NOT_FOUND", "Import job was not found.", 404);
  }

  if (job.type !== "products") {
    throw new AppError(
      "UNSUPPORTED_IMPORT_TYPE",
      "This confirmation pass currently supports product imports only.",
      400,
    );
  }

  if (job.status !== "VALIDATED") {
    throw new AppError(
      "IMPORT_JOB_NOT_VALIDATED",
      job.status === "IMPORTED"
        ? "This import job has already been imported."
        : "Only a VALIDATED import job can be confirmed.",
      409,
    );
  }

  const rows = job.validatedData;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new AppError(
      "IMPORT_VALIDATION_DATA_MISSING",
      "The validated import data is missing. Validate the file again before confirming it.",
      409,
    );
  }

  const parsed: ParsedImportFile = {
    fileName: job.fileName,
    headers: [...requiredProductImportHeaders],
    rows,
    rowCount: rows.length,
  };

  // Re-check current master data so a stale validation cannot overwrite a newly created product.
  const confirmationErrors = await collectProductImportErrors(database, parsed);
  if (confirmationErrors.length > 0) {
    // The caller owns the idempotency transaction. Throwing rolls that transaction back,
    // so do not write FAILED/error rows here and then pretend they were persisted.
    // Return the precise drift errors directly and require a fresh validation job.
    throw new AppError(
      "IMPORT_VALIDATION_FAILED",
      "Product data changed after validation. Validate the file again before confirming it.",
      409,
      toImportConfirmationFields(confirmationErrors),
    );
  }

  // Claim the job before inserts; the surrounding transaction rolls this back if any insert fails.
  const claimedJob = await claimValidatedProductImport(database, importJobId);
  if (!claimedJob) {
    throw new AppError(
      "IMPORT_JOB_NOT_VALIDATED",
      "The import job is no longer available for confirmation.",
      409,
    );
  }

  const references = await getProductImportReferenceData(database);
  const categories = new Map(
    references.categories.map((category) => [normalizeImportKey(category.name), category]),
  );
  const brands = new Map(
    references.brands.map((brand) => [normalizeImportKey(brand.name), brand]),
  );
  const groupedRows = new Map<string, Record<string, string>[]>();

  for (const row of rows) {
    const key = normalizeImportKey(row.sku ?? "");
    const productRows = groupedRows.get(key) ?? [];
    productRows.push(row);
    groupedRows.set(key, productRows);
  }

  let productsCreated = 0;
  for (const productRows of groupedRows.values()) {
    const first = productRows[0];
    const category = categories.get(normalizeImportKey(first.categoryName ?? ""));
    const brandName = (first.brandName ?? "").trim();
    const brand = brandName ? brands.get(normalizeImportKey(brandName)) : undefined;

    if (!category) {
      throw new AppError("CATEGORY_NOT_FOUND", "Product category was not found.", 409);
    }

    const product = await createImportedProduct(database, {
      sku: first.sku.trim(),
      barcode: first.barcode?.trim() || null,
      name: first.name.trim(),
      categoryId: category.id,
      brandId: brand?.id ?? null,
      reorderLevel: first.reorderLevel?.trim() || "0.000",
      referencePurchasePrice: first.referencePurchasePrice?.trim() || null,
      referenceSalePrice: first.referenceSalePrice?.trim() || null,
      isActive: true,
    });

    if (!product) {
      throw new AppError("PRODUCT_IMPORT_FAILED", "Imported product could not be created.", 500);
    }

    await createImportedProductUnits(
      database,
      productRows.map((row) => ({
        productId: product.id,
        unitName: row.unitName.trim(),
        conversionToBase: row.conversionToBase.trim(),
        isBaseUnit: row.isBaseUnit === "true",
        isActive: true,
      })),
    );

    productsCreated += 1;
  }

  const completedJob = await updateImportJobStatus(database, importJobId, {
    status: "IMPORTED",
    importedRows: rows.length,
    completedAt: new Date(),
  });

  return {
    job: {
      id: importJobId,
      type: "products",
      status: "IMPORTED",
      totalRows: completedJob?.totalRows ?? claimedJob.totalRows,
      importedRows: completedJob?.importedRows ?? rows.length,
    },
    productsCreated,
  };
}

/** Represents one customer/supplier validation error before it is attached to an import job. */
interface PartyImportValidationError {
  rowNumber: number;
  columnName: string;
  errorCode: string;
  message: string;
  rawRow: Record<string, string>;
}

/** Describes the saved result returned after validating customer or supplier master data. */
export interface PartyImportValidationResult {
  job: {
    id: string;
    type: string;
    status: string;
    fileName: string;
    totalRows: number;
    validRows: number;
    errorRows: number;
    importedRows: number;
    errorSummary: string | null;
  };
  errors: Array<{
    rowNumber: number;
    columnName: string;
    errorCode: string;
    message: string;
  }>;
}

const phonePattern = /^\+?[0-9][0-9 ()-]*[0-9]$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Adds one row-level customer or supplier validation error. */
function addPartyImportError(
  errors: PartyImportValidationError[],
  rowNumber: number,
  columnName: string,
  errorCode: string,
  message: string,
  rawRow: Record<string, string>,
): void {
  errors.push({ rowNumber, columnName, errorCode, message, rawRow });
}

/** Validates that a master-data CSV contains exactly its approved template columns. */
function validatePartyImportHeaders(
  parsed: ParsedImportFile,
  type: "customers" | "suppliers",
): PartyImportValidationError[] {
  const requiredHeaders = importTemplateColumns[type];
  const approvedHeaders = new Set<string>(requiredHeaders);
  const actualHeaders = new Set(parsed.headers);
  const headerRow = Object.fromEntries(
    parsed.headers.map((header) => [header, header]),
  );
  const errors: PartyImportValidationError[] = [];

  for (const header of requiredHeaders) {
    if (!actualHeaders.has(header)) {
      addPartyImportError(
        errors,
        1,
        header,
        "MISSING_COLUMN",
        `Required ${type.slice(0, -1)} import column '${header}' is missing.`,
        headerRow,
      );
    }
  }

  for (const header of parsed.headers) {
    if (!approvedHeaders.has(header)) {
      addPartyImportError(
        errors,
        1,
        header,
        "UNSUPPORTED_COLUMN",
        `Column '${header}' is not part of the approved ${type.slice(0, -1)} import template.`,
        headerRow,
      );
    }
  }

  return errors;
}

/** Validates fields shared by one customer or supplier master-data row. */
function validatePartyImportRow(
  row: Record<string, string>,
  rowNumber: number,
  type: "customers" | "suppliers",
  errors: PartyImportValidationError[],
): void {
  const partyLabel = type === "customers" ? "Customer" : "Supplier";
  const code = row.code ?? "";
  const name = row.name ?? "";
  const phone = row.phone ?? "";
  const email = row.email ?? "";
  const address = row.address ?? "";

  if (code.length === 0) {
    addPartyImportError(errors, rowNumber, "code", "REQUIRED_FIELD", `${partyLabel} code is required.`, row);
  } else if (code.length > 32) {
    addPartyImportError(errors, rowNumber, "code", "VALUE_TOO_LONG", `${partyLabel} code must be 32 characters or fewer.`, row);
  }

  if (name.length === 0) {
    addPartyImportError(errors, rowNumber, "name", "REQUIRED_FIELD", `${partyLabel} name is required.`, row);
  } else if (name.length > 160) {
    addPartyImportError(errors, rowNumber, "name", "VALUE_TOO_LONG", `${partyLabel} name must be 160 characters or fewer.`, row);
  }

  if (phone.length > 0) {
    if (phone.length < 7 || phone.length > 32 || !phonePattern.test(phone)) {
      addPartyImportError(
        errors,
        rowNumber,
        "phone",
        "INVALID_PHONE",
        "Phone number must be 7 to 32 characters and contain only approved phone characters.",
        row,
      );
    }
  }

  if (email.length > 0 && (email.length > 254 || !emailPattern.test(email))) {
    addPartyImportError(
      errors,
      rowNumber,
      "email",
      "INVALID_EMAIL",
      "Email address is invalid or longer than 254 characters.",
      row,
    );
  }

  if (address.length > 500) {
    addPartyImportError(errors, rowNumber, "address", "VALUE_TOO_LONG", "Address must be 500 characters or fewer.", row);
  }

  if (type === "customers") {
    const creditLimit = row.creditLimit ?? "";
    if (creditLimit.length > 0 && !isMoneyWithinDatabaseRange(creditLimit)) {
      addPartyImportError(
        errors,
        rowNumber,
        "creditLimit",
        "INVALID_CREDIT_LIMIT",
        "Credit limit must be a non-negative amount with up to two decimal places.",
        row,
      );
    }
  }
}

/** Validates customer rows and code uniqueness without inserting customer master data. */
async function collectCustomerImportErrors(
  database: SystemDatabase,
  parsed: ParsedImportFile,
): Promise<PartyImportValidationError[]> {
  const headerErrors = validatePartyImportHeaders(parsed, "customers");
  if (headerErrors.length > 0) {
    return headerErrors;
  }

  const errors: PartyImportValidationError[] = [];
  if (parsed.rows.length === 0) {
    addPartyImportError(errors, 1, "file", "NO_DATA_ROWS", "The customer import file must contain at least one customer row.", {});
    return errors;
  }

  const references = await getCustomerImportReferenceData(database);
  const existingCustomers = new Map(
    references.customers.map((customer) => [normalizeImportKey(customer.code), customer]),
  );
  const fileCodes = new Map<string, number>();

  for (let index = 0; index < parsed.rows.length; index += 1) {
    const row = parsed.rows[index];
    const rowNumber = index + 2;
    validatePartyImportRow(row, rowNumber, "customers", errors);

    const codeKey = normalizeImportKey(row.code ?? "");
    if (!codeKey) {
      continue;
    }

    const existingCustomer = existingCustomers.get(codeKey);
    if (existingCustomer?.isWalkIn) {
      addPartyImportError(
        errors,
        rowNumber,
        "code",
        "SYSTEM_CUSTOMER_PROTECTED",
        "The protected Walk-in Customer cannot be imported or replaced.",
        row,
      );
    } else if (existingCustomer) {
      addPartyImportError(
        errors,
        rowNumber,
        "code",
        "DUPLICATE_CUSTOMER_CODE",
        "Customer code already exists.",
        row,
      );
    }

    const firstRow = fileCodes.get(codeKey);
    if (firstRow !== undefined) {
      addPartyImportError(errors, rowNumber, "code", "DUPLICATE_CUSTOMER_CODE", `Customer code duplicates CSV row ${firstRow}.`, row);
    } else {
      fileCodes.set(codeKey, rowNumber);
    }
  }

  return errors;
}

/** Validates supplier rows and code uniqueness without inserting supplier master data. */
async function collectSupplierImportErrors(
  database: SystemDatabase,
  parsed: ParsedImportFile,
): Promise<PartyImportValidationError[]> {
  const headerErrors = validatePartyImportHeaders(parsed, "suppliers");
  if (headerErrors.length > 0) {
    return headerErrors;
  }

  const errors: PartyImportValidationError[] = [];
  if (parsed.rows.length === 0) {
    addPartyImportError(errors, 1, "file", "NO_DATA_ROWS", "The supplier import file must contain at least one supplier row.", {});
    return errors;
  }

  const references = await getSupplierImportReferenceData(database);
  const existingCodes = new Set(
    references.suppliers.map((supplier) => normalizeImportKey(supplier.code)),
  );
  const fileCodes = new Map<string, number>();

  for (let index = 0; index < parsed.rows.length; index += 1) {
    const row = parsed.rows[index];
    const rowNumber = index + 2;
    validatePartyImportRow(row, rowNumber, "suppliers", errors);

    const codeKey = normalizeImportKey(row.code ?? "");
    if (!codeKey) {
      continue;
    }

    if (existingCodes.has(codeKey)) {
      addPartyImportError(errors, rowNumber, "code", "DUPLICATE_SUPPLIER_CODE", "Supplier code already exists.", row);
    }

    const firstRow = fileCodes.get(codeKey);
    if (firstRow !== undefined) {
      addPartyImportError(errors, rowNumber, "code", "DUPLICATE_SUPPLIER_CODE", `Supplier code duplicates CSV row ${firstRow}.`, row);
    } else {
      fileCodes.set(codeKey, rowNumber);
    }
  }

  return errors;
}

/** Persists one customer/supplier validation result without writing master business data. */
async function savePartyImportValidation(
  database: SystemDatabase,
  parsed: ParsedImportFile,
  type: "customers" | "suppliers",
  errors: PartyImportValidationError[],
): Promise<PartyImportValidationResult> {
  const invalidRows = new Set(
    errors.filter((error) => error.rowNumber >= 2).map((error) => error.rowNumber),
  );
  const hasHeaderError = errors.some((error) => error.rowNumber === 1);
  const errorRows = hasHeaderError ? parsed.rowCount : invalidRows.size;
  const validRows = Math.max(0, parsed.rowCount - errorRows);
  const status = errors.length === 0 ? "VALIDATED" : "FAILED";
  const errorSummary =
    errors.length === 0
      ? null
      : `${errors.length} validation error(s) found across ${errorRows} data row(s).`;

  const job = await createImportJob(database, {
    type,
    status,
    fileName: parsed.fileName,
    totalRows: parsed.rowCount,
    validRows,
    errorRows,
    importedRows: 0,
    errorSummary,
    validatedData: status === "VALIDATED" ? parsed.rows : null,
    completedAt: new Date(),
  });

  await createImportJobErrors(
    database,
    errors.map((error) => ({
      importJobId: job.id,
      rowNumber: error.rowNumber,
      columnName: error.columnName,
      errorCode: error.errorCode,
      message: error.message,
      rawRow: error.rawRow,
    })),
  );

  return {
    job: {
      id: job.id,
      type: job.type,
      status: job.status,
      fileName: job.fileName,
      totalRows: job.totalRows,
      validRows: job.validRows,
      errorRows: job.errorRows,
      importedRows: job.importedRows,
      errorSummary: job.errorSummary,
    },
    errors: errors.map(({ rowNumber, columnName, errorCode, message }) => ({
      rowNumber,
      columnName,
      errorCode,
      message,
    })),
  };
}

/** Validates a customer CSV and persists only the import job and validation errors. */
export async function validateCustomerImport(
  database: SystemDatabase,
  parsed: ParsedImportFile,
): Promise<PartyImportValidationResult> {
  const errors = await collectCustomerImportErrors(database, parsed);
  return savePartyImportValidation(database, parsed, "customers", errors);
}

/** Validates a supplier CSV and persists only the import job and validation errors. */
export async function validateSupplierImport(
  database: SystemDatabase,
  parsed: ParsedImportFile,
): Promise<PartyImportValidationResult> {
  const errors = await collectSupplierImportErrors(database, parsed);
  return savePartyImportValidation(database, parsed, "suppliers", errors);
}

export interface PartyImportConfirmationResult {
  job: {
    id: string;
    type: "customers" | "suppliers";
    status: string;
    totalRows: number;
    importedRows: number;
  };
  recordsCreated: number;
}

/** Confirms one validated customer or supplier import inside the caller-owned transaction. */
export async function confirmPartyImport(
  database: SystemDatabase,
  importJobId: string,
): Promise<PartyImportConfirmationResult> {
  const job = await getImportJobById(database, importJobId);

  if (!job) {
    throw new AppError("IMPORT_JOB_NOT_FOUND", "Import job was not found.", 404);
  }

  if (job.type !== "customers" && job.type !== "suppliers") {
    throw new AppError(
      "UNSUPPORTED_IMPORT_TYPE",
      "This confirmation workflow supports customer or supplier imports only.",
      400,
    );
  }

  if (job.status !== "VALIDATED") {
    throw new AppError(
      "IMPORT_JOB_NOT_VALIDATED",
      job.status === "IMPORTED"
        ? "This import job has already been imported."
        : "Only a VALIDATED import job can be confirmed.",
      409,
    );
  }

  const rows = job.validatedData;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new AppError(
      "IMPORT_VALIDATION_DATA_MISSING",
      "The validated import data is missing. Validate the file again before confirming it.",
      409,
    );
  }

  const parsed: ParsedImportFile = {
    fileName: job.fileName,
    headers: [...importTemplateColumns[job.type]],
    rows,
    rowCount: rows.length,
  };

  // Re-check uniqueness because master data may have changed after the file was validated.
  const confirmationErrors =
    job.type === "customers"
      ? await collectCustomerImportErrors(database, parsed)
      : await collectSupplierImportErrors(database, parsed);

  if (confirmationErrors.length > 0) {
    throw new AppError(
      "IMPORT_VALIDATION_FAILED",
      `${job.type === "customers" ? "Customer" : "Supplier"} data changed after validation. Validate the file again before confirming it.`,
      409,
      toImportConfirmationFields(confirmationErrors),
    );
  }

  // Claim first; the surrounding idempotency transaction rolls back the claim if an insert fails.
  const claimedJob = await claimValidatedPartyImport(database, importJobId, job.type);
  if (!claimedJob) {
    throw new AppError(
      "IMPORT_JOB_NOT_VALIDATED",
      "The import job is no longer available for confirmation.",
      409,
    );
  }

  let recordsCreated = 0;

  for (const row of rows) {
    if (job.type === "customers") {
      const customer = await createImportedCustomer(database, {
        code: row.code.trim(),
        name: row.name.trim(),
        phone: row.phone?.trim() || null,
        email: row.email?.trim() || null,
        address: row.address?.trim() || null,
        creditLimit: row.creditLimit?.trim() || "0.00",
        isWalkIn: false,
        isActive: true,
      });

      if (!customer) {
        throw new AppError(
          "CUSTOMER_IMPORT_FAILED",
          "Imported customer could not be created.",
          500,
        );
      }
    } else {
      const supplier = await createImportedSupplier(database, {
        code: row.code.trim(),
        name: row.name.trim(),
        phone: row.phone?.trim() || null,
        email: row.email?.trim() || null,
        address: row.address?.trim() || null,
        isActive: true,
      });

      if (!supplier) {
        throw new AppError(
          "SUPPLIER_IMPORT_FAILED",
          "Imported supplier could not be created.",
          500,
        );
      }
    }

    recordsCreated += 1;
  }

  const completedJob = await updateImportJobStatus(database, importJobId, {
    status: "IMPORTED",
    importedRows: rows.length,
    completedAt: new Date(),
  });

  return {
    job: {
      id: importJobId,
      type: job.type,
      status: "IMPORTED",
      totalRows: completedJob?.totalRows ?? claimedJob.totalRows,
      importedRows: completedJob?.importedRows ?? rows.length,
    },
    recordsCreated,
  };
}

/** Describes the result of one confirmed opening-stock import. */
export interface OpeningStockImportConfirmationResult {
  job: {
    id: string;
    type: "opening-stock";
    status: "IMPORTED";
    totalRows: number;
    importedRows: number;
  };
  movementsCreated: number;
}

/** Confirms validated opening stock through the existing Inventory business rules. */
export async function confirmOpeningStockImport(
  database: SystemDatabase,
  importJobId: string,
): Promise<OpeningStockImportConfirmationResult> {
  const job = await getImportJobById(database, importJobId);

  if (!job) {
    throw new AppError("IMPORT_JOB_NOT_FOUND", "Import job was not found.", 404);
  }

  if (job.type !== "opening-stock") {
    throw new AppError(
      "IMPORT_TYPE_MISMATCH",
      "This import job is not an opening-stock import.",
      400,
    );
  }

  if (job.status !== "VALIDATED") {
    throw new AppError(
      "IMPORT_JOB_NOT_VALIDATED",
      job.status === "IMPORTED"
        ? "This import job has already been imported."
        : "Only a VALIDATED import job can be confirmed.",
      409,
    );
  }

  const rows = job.validatedData;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new AppError(
      "IMPORT_VALIDATION_DATA_MISSING",
      "The validated import data is missing. Validate the file again before confirming it.",
      409,
    );
  }

  const parsed: ParsedImportFile = {
    fileName: job.fileName,
    headers: [...importTemplateColumns["opening-stock"]],
    rows,
    rowCount: rows.length,
  };
  const confirmationErrors = await collectOpeningStockImportErrors(database, parsed);

  if (confirmationErrors.length > 0) {
    throw new AppError(
      "IMPORT_VALIDATION_FAILED",
      "Opening-stock data changed after validation. Validate the file again before confirming it.",
      409,
      toImportConfirmationFields(confirmationErrors),
    );
  }

  const references = await getOpeningStockImportReferenceData(database);
  const productsBySku = new Map(
    references.products.map((product) => [normalizeImportKey(product.sku), product]),
  );
  const claimedJob = await claimValidatedOpeningStockImport(database, importJobId);

  if (!claimedJob) {
    throw new AppError(
      "IMPORT_JOB_NOT_VALIDATED",
      "The import job is no longer available for confirmation.",
      409,
    );
  }

  const items = rows
    .map((row) => {
      const product = productsBySku.get(normalizeImportKey(row.productSku ?? ""));

      if (!product) {
        throw new AppError(
          "PRODUCT_NOT_FOUND",
          "An opening-stock product no longer exists.",
          409,
        );
      }

      return {
        productId: product.id,
        stockCondition: row.stockCondition as "SELLABLE" | "DAMAGED" | "EXPIRED",
        quantity: row.quantity.trim(),
        unitCost: row.unitCost.trim(),
      };
    })
    .sort((left, right) => {
      const productOrder = left.productId.localeCompare(right.productId);
      return productOrder || left.stockCondition.localeCompare(right.stockCondition);
    });

  let movementsCreated = 0;
  for (const item of items) {
    await recordOpeningStockItem(database, item, "Opening stock import");
    movementsCreated += 1;
  }

  const completedJob = await updateImportJobStatus(database, importJobId, {
    status: "IMPORTED",
    importedRows: rows.length,
    completedAt: new Date(),
  });

  return {
    job: {
      id: importJobId,
      type: "opening-stock",
      status: "IMPORTED",
      totalRows: completedJob?.totalRows ?? claimedJob.totalRows,
      importedRows: completedJob?.importedRows ?? rows.length,
    },
    movementsCreated,
  };
}

/** Describes the saved result returned after confirming opening balances. */
export interface OpeningBalanceImportConfirmationResult {
  job: {
    id: string;
    type: "opening-balances";
    status: "IMPORTED";
    totalRows: number;
    importedRows: number;
  };
  customerEntriesCreated: number;
  supplierEntriesCreated: number;
}

/** Confirms one validated opening-balance import by creating immutable ledger entries. */
export async function confirmOpeningBalanceImport(
  database: SystemDatabase,
  importJobId: string,
): Promise<OpeningBalanceImportConfirmationResult> {
  const job = await getImportJobById(database, importJobId);

  if (!job) {
    throw new AppError("IMPORT_JOB_NOT_FOUND", "Import job was not found.", 404);
  }

  if (job.type !== "opening-balances") {
    throw new AppError(
      "IMPORT_TYPE_MISMATCH",
      "This import job is not an opening-balances import.",
      400,
    );
  }

  if (job.status !== "VALIDATED") {
    throw new AppError(
      "IMPORT_JOB_NOT_VALIDATED",
      job.status === "IMPORTED"
        ? "This import job has already been imported."
        : "Only a VALIDATED import job can be confirmed.",
      409,
    );
  }

  const rows = job.validatedData;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new AppError(
      "IMPORT_VALIDATION_DATA_MISSING",
      "The validated import data is missing. Validate the file again before confirming it.",
      409,
    );
  }

  const parsed: ParsedImportFile = {
    fileName: job.fileName,
    headers: [...importTemplateColumns["opening-balances"]],
    rows,
    rowCount: rows.length,
  };
  const confirmationErrors = await collectOpeningBalanceImportErrors(database, parsed);

  if (confirmationErrors.length > 0) {
    throw new AppError(
      "IMPORT_VALIDATION_FAILED",
      "Opening-balance data changed after validation. Validate the file again before confirming it.",
      409,
      toImportConfirmationFields(confirmationErrors),
    );
  }

  const references = await getOpeningBalanceImportReferenceData(database);
  const customersByCode = new Map(
    references.customers.map((customer) => [normalizeImportKey(customer.code), customer]),
  );
  const suppliersByCode = new Map(
    references.suppliers.map((supplier) => [normalizeImportKey(supplier.code), supplier]),
  );

  // Claim first; the surrounding idempotency transaction rolls back the claim if any ledger write fails.
  const claimedJob = await claimValidatedOpeningBalanceImport(database, importJobId);
  if (!claimedJob) {
    throw new AppError(
      "IMPORT_JOB_NOT_VALIDATED",
      "The import job is no longer available for confirmation.",
      409,
    );
  }

  let customerEntriesCreated = 0;
  let supplierEntriesCreated = 0;
  const occurredAt = new Date();

  for (const row of rows) {
    const amount = row.openingBalance.trim();

    // Zero is a valid opening value but needs no ledger entry, matching normal master-data creation.
    if (isDecimalZero(amount)) {
      continue;
    }

    if ((row.partyType ?? "").toUpperCase() === "CUSTOMER") {
      const customer = customersByCode.get(normalizeImportKey(row.partyCode ?? ""));
      if (!customer) {
        throw new AppError("CUSTOMER_NOT_FOUND", "An opening-balance customer no longer exists.", 409);
      }

      await writeCustomerDebit(database, {
        customerId: customer.id,
        occurredAt,
        referenceType: "OPENING_BALANCE",
        amount,
        notes: "Opening customer balance import",
      });
      customerEntriesCreated += 1;
      continue;
    }

    const supplier = suppliersByCode.get(normalizeImportKey(row.partyCode ?? ""));
    if (!supplier) {
      throw new AppError("SUPPLIER_NOT_FOUND", "An opening-balance supplier no longer exists.", 409);
    }

    await writeSupplierCredit(database, {
      supplierId: supplier.id,
      occurredAt,
      referenceType: "OPENING_BALANCE",
      amount,
      notes: "Opening supplier payable import",
    });
    supplierEntriesCreated += 1;
  }

  const completedJob = await updateImportJobStatus(database, importJobId, {
    status: "IMPORTED",
    importedRows: rows.length,
    completedAt: new Date(),
  });

  return {
    job: {
      id: importJobId,
      type: "opening-balances",
      status: "IMPORTED",
      totalRows: completedJob?.totalRows ?? claimedJob.totalRows,
      importedRows: completedJob?.importedRows ?? rows.length,
    },
    customerEntriesCreated,
    supplierEntriesCreated,
  };
}

/** Confirms the import types implemented through the current pass. */
export async function confirmImport(
  database: SystemDatabase,
  importJobId: string,
): Promise<
  | ProductImportConfirmationResult
  | PartyImportConfirmationResult
  | OpeningStockImportConfirmationResult
  | OpeningBalanceImportConfirmationResult
> {
  const job = await getImportJobById(database, importJobId);

  if (!job) {
    throw new AppError("IMPORT_JOB_NOT_FOUND", "Import job was not found.", 404);
  }

  if (job.type === "products") {
    return confirmProductImport(database, importJobId);
  }

  if (job.type === "customers" || job.type === "suppliers") {
    return confirmPartyImport(database, importJobId);
  }

  if (job.type === "opening-stock") {
    return confirmOpeningStockImport(database, importJobId);
  }

  if (job.type === "opening-balances") {
    return confirmOpeningBalanceImport(database, importJobId);
  }

  throw new AppError(
    "UNSUPPORTED_IMPORT_TYPE",
    "Confirmation for this import type is added in a later pass.",
    400,
  );
}

/** Represents one opening-stock validation error before it is attached to an import job. */
interface OpeningStockImportValidationError {
  rowNumber: number;
  columnName: string;
  errorCode: string;
  message: string;
  rawRow: Record<string, string>;
}

/** Describes the saved result returned after validating opening stock. */
export interface OpeningStockImportValidationResult {
  job: {
    id: string;
    type: string;
    status: string;
    fileName: string;
    totalRows: number;
    validRows: number;
    errorRows: number;
    importedRows: number;
    errorSummary: string | null;
  };
  errors: Array<{
    rowNumber: number;
    columnName: string;
    errorCode: string;
    message: string;
  }>;
}

const requiredOpeningStockImportHeaders = importTemplateColumns["opening-stock"];
const requiredOpeningStockImportHeaderSet = new Set<string>(
  requiredOpeningStockImportHeaders,
);
const openingStockConditions = new Set(["SELLABLE", "DAMAGED", "EXPIRED"]);

/** Adds one row-level opening-stock validation error. */
function addOpeningStockImportError(
  errors: OpeningStockImportValidationError[],
  rowNumber: number,
  columnName: string,
  errorCode: string,
  message: string,
  rawRow: Record<string, string>,
): void {
  errors.push({ rowNumber, columnName, errorCode, message, rawRow });
}

/** Validates that opening stock uses exactly the approved template columns. */
function validateOpeningStockImportHeaders(
  parsed: ParsedImportFile,
): OpeningStockImportValidationError[] {
  const errors: OpeningStockImportValidationError[] = [];
  const headerSet = new Set(parsed.headers);
  const headerRow = Object.fromEntries(
    parsed.headers.map((header) => [header, header]),
  );

  for (const header of requiredOpeningStockImportHeaders) {
    if (!headerSet.has(header)) {
      addOpeningStockImportError(
        errors,
        1,
        header,
        "MISSING_COLUMN",
        `Required opening-stock import column '${header}' is missing.`,
        headerRow,
      );
    }
  }

  for (const header of parsed.headers) {
    if (!requiredOpeningStockImportHeaderSet.has(header)) {
      addOpeningStockImportError(
        errors,
        1,
        header,
        "UNSUPPORTED_COLUMN",
        `Column '${header}' is not part of the approved opening-stock import template.`,
        headerRow,
      );
    }
  }

  return errors;
}

/** Validates simple field rules for one opening-stock CSV row. */
function validateOpeningStockImportRow(
  row: Record<string, string>,
  rowNumber: number,
  errors: OpeningStockImportValidationError[],
): void {
  const productSku = row.productSku ?? "";
  const stockCondition = row.stockCondition ?? "";
  const quantity = row.quantity ?? "";
  const unitCost = row.unitCost ?? "";

  if (productSku.length === 0) {
    addOpeningStockImportError(
      errors,
      rowNumber,
      "productSku",
      "REQUIRED_FIELD",
      "Product SKU is required.",
      row,
    );
  } else if (productSku.length > 64) {
    addOpeningStockImportError(
      errors,
      rowNumber,
      "productSku",
      "VALUE_TOO_LONG",
      "Product SKU must be 64 characters or fewer.",
      row,
    );
  }

  if (!openingStockConditions.has(stockCondition)) {
    addOpeningStockImportError(
      errors,
      rowNumber,
      "stockCondition",
      "INVALID_STOCK_CONDITION",
      "Stock condition must be SELLABLE, DAMAGED or EXPIRED.",
      row,
    );
  }

  if (!isQuantityWithinDatabaseRange(quantity) || !isDecimalGreaterThanZero(quantity)) {
    addOpeningStockImportError(
      errors,
      rowNumber,
      "quantity",
      "INVALID_QUANTITY",
      "Opening stock quantity must be greater than zero with up to three decimal places.",
      row,
    );
  }

  if (!isMoneyWithinDatabaseRange(unitCost) || !isDecimalGreaterThanZero(unitCost)) {
    addOpeningStockImportError(
      errors,
      rowNumber,
      "unitCost",
      "INVALID_UNIT_COST",
      "Opening stock unit cost must be greater than zero with up to two decimal places.",
      row,
    );
  }
}

/** Validates opening-stock product references, lock state and duplicate condition rows. */
async function collectOpeningStockImportErrors(
  database: SystemDatabase,
  parsed: ParsedImportFile,
): Promise<OpeningStockImportValidationError[]> {
  const headerErrors = validateOpeningStockImportHeaders(parsed);
  if (headerErrors.length > 0) {
    return headerErrors;
  }

  const errors: OpeningStockImportValidationError[] = [];
  if (parsed.rows.length === 0) {
    addOpeningStockImportError(
      errors,
      1,
      "file",
      "NO_DATA_ROWS",
      "The opening-stock import file must contain at least one stock row.",
      {},
    );
    return errors;
  }

  const references = await getOpeningStockImportReferenceData(database);
  const productsBySku = new Map(
    references.products.map((product) => [normalizeImportKey(product.sku), product]),
  );
  const normalTransactionsExist =
    references.productIdsWithNormalTransactions.length > 0;
  const fileProductConditions = new Map<string, number>();

  for (let index = 0; index < parsed.rows.length; index += 1) {
    const row = parsed.rows[index];
    const rowNumber = index + 2;
    validateOpeningStockImportRow(row, rowNumber, errors);

    const skuKey = normalizeImportKey(row.productSku ?? "");
    if (!skuKey) {
      continue;
    }

    const product = productsBySku.get(skuKey);
    if (!product) {
      addOpeningStockImportError(
        errors,
        rowNumber,
        "productSku",
        "PRODUCT_NOT_FOUND",
        "Product SKU does not exist in Product Management.",
        row,
      );
      continue;
    }

    if (!product.isActive) {
      addOpeningStockImportError(
        errors,
        rowNumber,
        "productSku",
        "PRODUCT_INACTIVE",
        "Opening stock can only be imported for an active product.",
        row,
      );
    }

    if (normalTransactionsExist) {
      addOpeningStockImportError(
        errors,
        rowNumber,
        "productSku",
        "OPENING_STOCK_LOCKED",
        "Opening stock import is locked after normal inventory transactions have started.",
        row,
      );
    }

    const condition = row.stockCondition ?? "";
    if (openingStockConditions.has(condition)) {
      const key = `${skuKey}:${condition}`;
      const firstRow = fileProductConditions.get(key);

      if (firstRow !== undefined) {
        addOpeningStockImportError(
          errors,
          rowNumber,
          "productSku",
          "DUPLICATE_OPENING_STOCK_ROW",
          `This product and stock condition already appear on CSV row ${firstRow}.`,
          row,
        );
      } else {
        fileProductConditions.set(key, rowNumber);
      }
    }
  }

  return errors;
}

/** Validates opening stock and persists only the import job and row-level errors. */
export async function validateOpeningStockImport(
  database: SystemDatabase,
  parsed: ParsedImportFile,
): Promise<OpeningStockImportValidationResult> {
  const errors = await collectOpeningStockImportErrors(database, parsed);
  const invalidRows = new Set(
    errors.filter((error) => error.rowNumber >= 2).map((error) => error.rowNumber),
  );
  const hasHeaderError = errors.some((error) => error.rowNumber === 1);
  const errorRows = hasHeaderError ? parsed.rowCount : invalidRows.size;
  const validRows = Math.max(0, parsed.rowCount - errorRows);
  const status = errors.length === 0 ? "VALIDATED" : "FAILED";
  const errorSummary =
    errors.length === 0
      ? null
      : `${errors.length} validation error(s) found across ${errorRows} data row(s).`;

  const job = await createImportJob(database, {
    type: "opening-stock",
    status,
    fileName: parsed.fileName,
    totalRows: parsed.rowCount,
    validRows,
    errorRows,
    importedRows: 0,
    errorSummary,
    validatedData: status === "VALIDATED" ? parsed.rows : null,
    completedAt: new Date(),
  });

  await createImportJobErrors(
    database,
    errors.map((error) => ({
      importJobId: job.id,
      rowNumber: error.rowNumber,
      columnName: error.columnName,
      errorCode: error.errorCode,
      message: error.message,
      rawRow: error.rawRow,
    })),
  );

  return {
    job: {
      id: job.id,
      type: job.type,
      status: job.status,
      fileName: job.fileName,
      totalRows: job.totalRows,
      validRows: job.validRows,
      errorRows: job.errorRows,
      importedRows: job.importedRows,
      errorSummary: job.errorSummary,
    },
    errors: errors.map(({ rowNumber, columnName, errorCode, message }) => ({
      rowNumber,
      columnName,
      errorCode,
      message,
    })),
  };
}


/** Represents one opening-balance validation error before it is attached to an import job. */
interface OpeningBalanceImportValidationError {
  rowNumber: number;
  columnName: string;
  errorCode: string;
  message: string;
  rawRow: Record<string, string>;
}

/** Describes the saved result returned after validating customer/supplier opening balances. */
export interface OpeningBalanceImportValidationResult {
  job: {
    id: string;
    type: string;
    status: string;
    fileName: string;
    totalRows: number;
    validRows: number;
    errorRows: number;
    importedRows: number;
    errorSummary: string | null;
  };
  errors: Array<{
    rowNumber: number;
    columnName: string;
    errorCode: string;
    message: string;
  }>;
}

const requiredOpeningBalanceImportHeaders = importTemplateColumns["opening-balances"];
const requiredOpeningBalanceImportHeaderSet = new Set<string>(
  requiredOpeningBalanceImportHeaders,
);
const openingBalancePartyTypes = new Set(["CUSTOMER", "SUPPLIER"]);

/** Adds one row-level opening-balance validation error. */
function addOpeningBalanceImportError(
  errors: OpeningBalanceImportValidationError[],
  rowNumber: number,
  columnName: string,
  errorCode: string,
  message: string,
  rawRow: Record<string, string>,
): void {
  errors.push({ rowNumber, columnName, errorCode, message, rawRow });
}

/** Validates that opening balances use exactly the approved template columns. */
function validateOpeningBalanceImportHeaders(
  parsed: ParsedImportFile,
): OpeningBalanceImportValidationError[] {
  const errors: OpeningBalanceImportValidationError[] = [];
  const headerSet = new Set(parsed.headers);
  const headerRow = Object.fromEntries(
    parsed.headers.map((header) => [header, header]),
  );

  for (const header of requiredOpeningBalanceImportHeaders) {
    if (!headerSet.has(header)) {
      addOpeningBalanceImportError(
        errors,
        1,
        header,
        "MISSING_COLUMN",
        `Required opening-balances import column '${header}' is missing.`,
        headerRow,
      );
    }
  }

  for (const header of parsed.headers) {
    if (!requiredOpeningBalanceImportHeaderSet.has(header)) {
      addOpeningBalanceImportError(
        errors,
        1,
        header,
        "UNSUPPORTED_COLUMN",
        `Column '${header}' is not part of the approved opening-balances import template.`,
        headerRow,
      );
    }
  }

  return errors;
}

/** Validates simple field rules for one opening-balance CSV row. */
function validateOpeningBalanceImportRow(
  row: Record<string, string>,
  rowNumber: number,
  errors: OpeningBalanceImportValidationError[],
): void {
  const partyType = (row.partyType ?? "").toUpperCase();
  const partyCode = row.partyCode ?? "";
  const openingBalance = row.openingBalance ?? "";

  if (!openingBalancePartyTypes.has(partyType)) {
    addOpeningBalanceImportError(
      errors,
      rowNumber,
      "partyType",
      "INVALID_PARTY_TYPE",
      "Party type must be CUSTOMER or SUPPLIER.",
      row,
    );
  }

  if (partyCode.length === 0) {
    addOpeningBalanceImportError(
      errors,
      rowNumber,
      "partyCode",
      "REQUIRED_FIELD",
      "Party code is required.",
      row,
    );
  } else if (partyCode.length > 32) {
    addOpeningBalanceImportError(
      errors,
      rowNumber,
      "partyCode",
      "VALUE_TOO_LONG",
      "Party code must be 32 characters or fewer.",
      row,
    );
  }

  if (!isMoneyWithinDatabaseRange(openingBalance)) {
    addOpeningBalanceImportError(
      errors,
      rowNumber,
      "openingBalance",
      "INVALID_OPENING_BALANCE",
      "Opening balance must be a non-negative amount with up to two decimal places.",
      row,
    );
  }
}

/** Validates party references, duplicate rows, prior openings, and the setup lock. */
async function collectOpeningBalanceImportErrors(
  database: SystemDatabase,
  parsed: ParsedImportFile,
): Promise<OpeningBalanceImportValidationError[]> {
  const headerErrors = validateOpeningBalanceImportHeaders(parsed);
  if (headerErrors.length > 0) {
    return headerErrors;
  }

  const errors: OpeningBalanceImportValidationError[] = [];
  if (parsed.rows.length === 0) {
    addOpeningBalanceImportError(
      errors,
      1,
      "file",
      "NO_DATA_ROWS",
      "The opening-balances import file must contain at least one balance row.",
      {},
    );
    return errors;
  }

  const references = await getOpeningBalanceImportReferenceData(database);
  const customersByCode = new Map(
    references.customers.map((customer) => [normalizeImportKey(customer.code), customer]),
  );
  const suppliersByCode = new Map(
    references.suppliers.map((supplier) => [normalizeImportKey(supplier.code), supplier]),
  );
  const customerOpeningIds = new Set(references.customerIdsWithOpeningBalance);
  const supplierOpeningIds = new Set(references.supplierIdsWithOpeningBalance);
  const fileParties = new Map<string, number>();

  for (let index = 0; index < parsed.rows.length; index += 1) {
    const row = parsed.rows[index];
    const rowNumber = index + 2;
    validateOpeningBalanceImportRow(row, rowNumber, errors);

    const partyType = (row.partyType ?? "").toUpperCase();
    const partyCodeKey = normalizeImportKey(row.partyCode ?? "");

    if (!openingBalancePartyTypes.has(partyType) || !partyCodeKey) {
      continue;
    }

    const duplicateKey = `${partyType}:${partyCodeKey}`;
    const firstRow = fileParties.get(duplicateKey);
    if (firstRow !== undefined) {
      addOpeningBalanceImportError(
        errors,
        rowNumber,
        "partyCode",
        "DUPLICATE_OPENING_BALANCE_ROW",
        `This ${partyType.toLowerCase()} already appears on CSV row ${firstRow}.`,
        row,
      );
    } else {
      fileParties.set(duplicateKey, rowNumber);
    }

    if (references.normalBusinessActivityExists) {
      addOpeningBalanceImportError(
        errors,
        rowNumber,
        "openingBalance",
        "OPENING_IMPORT_LOCKED",
        "Opening balances can only be imported before normal transactions begin.",
        row,
      );
    }

    if (partyType === "CUSTOMER") {
      const customer = customersByCode.get(partyCodeKey);
      if (!customer) {
        addOpeningBalanceImportError(
          errors,
          rowNumber,
          "partyCode",
          "CUSTOMER_NOT_FOUND",
          "Customer code does not exist in Customer Management.",
          row,
        );
        continue;
      }

      if (customer.isWalkIn && isDecimalGreaterThanZero(row.openingBalance ?? "0")) {
        addOpeningBalanceImportError(
          errors,
          rowNumber,
          "openingBalance",
          "SYSTEM_CUSTOMER_PROTECTED",
          "Walk-in Customer cannot receive an opening due balance.",
          row,
        );
      }

      if (customerOpeningIds.has(customer.id)) {
        addOpeningBalanceImportError(
          errors,
          rowNumber,
          "partyCode",
          "OPENING_BALANCE_EXISTS",
          "This customer already has an opening-balance ledger entry.",
          row,
        );
      }

      continue;
    }

    const supplier = suppliersByCode.get(partyCodeKey);
    if (!supplier) {
      addOpeningBalanceImportError(
        errors,
        rowNumber,
        "partyCode",
        "SUPPLIER_NOT_FOUND",
        "Supplier code does not exist in Supplier Management.",
        row,
      );
      continue;
    }

    if (supplierOpeningIds.has(supplier.id)) {
      addOpeningBalanceImportError(
        errors,
        rowNumber,
        "partyCode",
        "OPENING_BALANCE_EXISTS",
        "This supplier already has an opening-balance ledger entry.",
        row,
      );
    }
  }

  return errors;
}

/** Validates opening balances and persists only the import job and row-level errors. */
export async function validateOpeningBalanceImport(
  database: SystemDatabase,
  parsed: ParsedImportFile,
): Promise<OpeningBalanceImportValidationResult> {
  const errors = await collectOpeningBalanceImportErrors(database, parsed);
  const invalidRows = new Set(
    errors.filter((error) => error.rowNumber >= 2).map((error) => error.rowNumber),
  );
  const hasHeaderError = errors.some((error) => error.rowNumber === 1);
  const errorRows = hasHeaderError ? parsed.rowCount : invalidRows.size;
  const validRows = Math.max(0, parsed.rowCount - errorRows);
  const status = errors.length === 0 ? "VALIDATED" : "FAILED";
  const errorSummary =
    errors.length === 0
      ? null
      : `${errors.length} validation error(s) found across ${errorRows} data row(s).`;

  const job = await createImportJob(database, {
    type: "opening-balances",
    status,
    fileName: parsed.fileName,
    totalRows: parsed.rowCount,
    validRows,
    errorRows,
    importedRows: 0,
    errorSummary,
    validatedData: status === "VALIDATED" ? parsed.rows : null,
    completedAt: new Date(),
  });

  await createImportJobErrors(
    database,
    errors.map((error) => ({
      importJobId: job.id,
      rowNumber: error.rowNumber,
      columnName: error.columnName,
      errorCode: error.errorCode,
      message: error.message,
      rawRow: error.rawRow,
    })),
  );

  return {
    job: {
      id: job.id,
      type: job.type,
      status: job.status,
      fileName: job.fileName,
      totalRows: job.totalRows,
      validRows: job.validRows,
      errorRows: job.errorRows,
      importedRows: job.importedRows,
      errorSummary: job.errorSummary,
    },
    errors: errors.map(({ rowNumber, columnName, errorCode, message }) => ({
      rowNumber,
      columnName,
      errorCode,
      message,
    })),
  };
}

/** Represents the shared result shape returned by every validation-only import upload. */
export type ImportValidationResult =
  | ProductImportValidationResult
  | PartyImportValidationResult
  | OpeningStockImportValidationResult
  | OpeningBalanceImportValidationResult;

/** Runs the approved validation workflow for one import type without writing business data. */
export async function validateImportFile(
  database: SystemDatabase,
  type: SystemImportType,
  parsed: ParsedImportFile,
): Promise<ImportValidationResult> {
  if (type === "products") {
    return validateProductImport(database, parsed);
  }

  if (type === "customers") {
    return validateCustomerImport(database, parsed);
  }

  if (type === "suppliers") {
    return validateSupplierImport(database, parsed);
  }

  if (type === "opening-stock") {
    return validateOpeningStockImport(database, parsed);
  }

  return validateOpeningBalanceImport(database, parsed);
}

