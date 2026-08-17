import { randomUUID } from "node:crypto";

import { AppError } from "../../shared/errors/app-error.js";
import { isDecimalGreaterThanZero } from "../../shared/utils/decimal-validation.js";
import { getSupplierCurrentPayable, writeSupplierCredit } from "../ledgers/index.js";
import {
  createSupplier as insertSupplier,
  findSupplierById,
  hasNormalBusinessActivity,
  listRecentSupplierPurchases,
  listSupplierOpenPurchases,
  listSuppliers as readSuppliers,
  updateSupplier as saveSupplierChanges,
  type PaginatedSupplierRecords,
  type SupplierChanges,
  type SupplierRecentPurchaseRecord,
  type SupplierRecord,
  type SuppliersDatabase,
} from "./suppliers.repository.js";
import type {
  CreateSupplierInput,
  ListSuppliersQuery,
  SupplierOpenPurchasesQuery,
  UpdateSupplierInput,
} from "./suppliers.schema.js";

/** Contains the supplier profile, current payable and latest confirmed purchases. */
export interface SupplierProfile {
  supplier: SupplierRecord;
  financialSummaryAvailable: boolean;
  currentPayable: string | null;
  recentPurchasesAvailable: boolean;
  recentPurchases: SupplierRecentPurchaseRecord[];
}

/** Removes surrounding spaces and converts blank optional text to null. */
function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

/** Creates a stable Supplier Management error for the shared error handler. */
function supplierError(
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

/** Creates a readable supplier code without exposing a database ID. */
function createSupplierCode(): string {
  return `SUP-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
}

/** Reads a PostgreSQL error code without trusting the thrown value. */
function readPostgresCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  return typeof error.code === "string" ? error.code : null;
}

/** Reads a PostgreSQL constraint name without trusting the thrown value. */
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

/** Checks whether an insert failed only because the generated supplier code already exists. */
function isSupplierCodeConflict(error: unknown): boolean {
  return (
    readPostgresCode(error) === "23505" &&
    readPostgresConstraint(error) === "suppliers_code_normalized_unique"
  );
}

/** Loads one supplier or throws the approved not-found error. */
async function requireSupplier(
  database: SuppliersDatabase,
  supplierId: string,
): Promise<SupplierRecord> {
  const supplier = await findSupplierById(database, supplierId);

  if (!supplier) {
    throw supplierError(
      "SUPPLIER_NOT_FOUND",
      "Supplier was not found.",
      404,
    );
  }

  return supplier;
}

/** Copies only approved supplier fields into a repository update object. */
function readSupplierChanges(input: UpdateSupplierInput): SupplierChanges {
  const changes: SupplierChanges = {};

  if (input.name !== undefined) {
    changes.name = input.name.trim();
  }

  if (input.phone !== undefined) {
    changes.phone = normalizeOptionalText(input.phone);
  }

  if (input.email !== undefined) {
    changes.email = normalizeOptionalText(input.email);
  }

  if (input.address !== undefined) {
    changes.address = normalizeOptionalText(input.address);
  }

  if (input.taxId !== undefined) {
    changes.taxId = normalizeOptionalText(input.taxId);
  }

  if (input.isActive !== undefined) {
    changes.isActive = input.isActive;
  }

  return changes;
}

async function requireTransaction<T>(database: SuppliersDatabase, work: (tx: SuppliersDatabase) => Promise<T>): Promise<T> {
  if (!database.transaction) {
    throw supplierError("DATABASE_TRANSACTION_REQUIRED", "Opening balance requires a database transaction.", 500);
  }
  return database.transaction(async (tx) => work(tx as unknown as SuppliersDatabase));
}

/** Lists suppliers with the approved search, status and pagination fields. */
export async function listSuppliers(
  database: SuppliersDatabase,
  query: ListSuppliersQuery,
): Promise<PaginatedSupplierRecords> {
  return readSuppliers(database, query);
}

/** Creates one supplier and retries only generated-code conflicts. */
export async function createSupplier(
  database: SuppliersDatabase,
  input: CreateSupplierInput,
): Promise<SupplierRecord> {
  const supplierInput = {
    name: input.name.trim(),
    phone: normalizeOptionalText(input.phone),
    email: normalizeOptionalText(input.email),
    address: normalizeOptionalText(input.address),
    taxId: normalizeOptionalText(input.taxId),
    isActive: true,
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const createWithDatabase = async (tx: SuppliersDatabase): Promise<SupplierRecord | null> => {
        if (
          isDecimalGreaterThanZero(input.openingBalance) &&
          await hasNormalBusinessActivity(tx)
        ) {
          throw supplierError(
            "OPENING_BALANCE_LOCKED",
            "Opening supplier payable can only be entered before normal transactions begin.",
            409,
          );
        }

        const supplier = await insertSupplier(tx, {
          ...supplierInput,
          code: createSupplierCode(),
        });

        if (supplier && isDecimalGreaterThanZero(input.openingBalance)) {
          await writeSupplierCredit(tx, {
            supplierId: supplier.id,
            occurredAt: new Date(),
            referenceType: "OPENING_BALANCE",
            amount: input.openingBalance,
            notes: "Opening supplier payable",
          });
        }

        return supplier;
      };

      const supplier = isDecimalGreaterThanZero(input.openingBalance)
        ? await requireTransaction(database, createWithDatabase)
        : await createWithDatabase(database);

      if (!supplier) {
        throw supplierError(
          "SUPPLIER_CREATE_FAILED",
          "Supplier could not be created.",
          500,
        );
      }

      return supplier;
    } catch (error) {
      if (!isSupplierCodeConflict(error)) {
        throw error;
      }
    }
  }

  throw supplierError(
    "SUPPLIER_CODE_GENERATION_FAILED",
    "A unique supplier code could not be generated.",
    500,
  );
}

/** Loads a supplier profile with the current payable calculated from ledger entries. */
export async function getSupplierProfile(
  database: SuppliersDatabase,
  supplierId: string,
): Promise<SupplierProfile> {
  const supplier = await requireSupplier(database, supplierId);
  const currentPayable = await getSupplierCurrentPayable(database, supplierId);
  const recentPurchases = await listRecentSupplierPurchases(database, supplierId);

  return {
    supplier,
    financialSummaryAvailable: true,
    currentPayable,
    recentPurchasesAvailable: true,
    recentPurchases,
  };
}

/** Updates approved supplier fields while preserving historical records. */
export async function updateSupplier(
  database: SuppliersDatabase,
  supplierId: string,
  input: UpdateSupplierInput,
): Promise<SupplierRecord> {
  await requireSupplier(database, supplierId);

  const updatedSupplier = await saveSupplierChanges(
    database,
    supplierId,
    readSupplierChanges(input),
  );

  if (!updatedSupplier) {
    throw supplierError(
      "SUPPLIER_UPDATE_FAILED",
      "Supplier could not be updated.",
      500,
    );
  }

  return updatedSupplier;
}

/** Lists confirmed purchases that still accept payment allocation for one supplier. */
export async function getSupplierOpenPurchases(
  database: SuppliersDatabase,
  supplierId: string,
  query: SupplierOpenPurchasesQuery,
) {
  await requireSupplier(database, supplierId);
  const page = await listSupplierOpenPurchases(database, supplierId, query);

  return {
    ...page,
    page: query.page,
    pageSize: query.pageSize,
  };
}
