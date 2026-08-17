import { randomUUID } from "node:crypto";

import { AppError } from "../../shared/errors/app-error.js";
import { isDecimalGreaterThanZero } from "../../shared/utils/decimal-validation.js";
import { getCustomerCurrentDue, writeCustomerDebit } from "../ledgers/index.js";
import {
  createCustomer as insertCustomer,
  createWalkInCustomerIfMissing,
  findCustomerById,
  findWalkInCustomer,
  hasNormalBusinessActivity,
  listCustomerOpenInvoices,
  listRecentCustomerInvoices,
  listCustomers as readCustomers,
  updateCustomer as saveCustomerChanges,
  type CustomerChanges,
  type CustomerRecord,
  type CustomerRecentInvoiceRecord,
  type CustomersDatabase,
  type PaginatedCustomerRecords,
} from "./customers.repository.js";
import type {
  CreateCustomerInput,
  CustomerOpenInvoicesQuery,
  ListCustomersQuery,
  UpdateCustomerInput,
} from "./customers.schema.js";

/** Contains customer details, calculated due and Sales data when available. */
export interface CustomerProfile {
  customer: CustomerRecord;
  financialSummaryAvailable: boolean;
  currentDue: string | null;
  recentInvoicesAvailable: boolean;
  recentInvoices: CustomerRecentInvoiceRecord[];
}

/** Removes surrounding spaces and converts blank optional text to null. */
function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

/** Creates a stable Customer Management error for the shared error handler. */
function customerError(
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

/** Creates a readable customer code without exposing a database ID. */
function createCustomerCode(): string {
  return `CUS-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
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

/** Checks whether an insert failed only because the generated customer code already exists. */
function isCustomerCodeConflict(error: unknown): boolean {
  return (
    readPostgresCode(error) === "23505" &&
    readPostgresConstraint(error) === "customers_code_normalized_unique"
  );
}

/** Loads one customer or throws the approved not-found error. */
async function requireCustomer(
  database: CustomersDatabase,
  customerId: string,
): Promise<CustomerRecord> {
  const customer = await findCustomerById(database, customerId);

  if (!customer) {
    throw customerError(
      "CUSTOMER_NOT_FOUND",
      "Customer was not found.",
      404,
    );
  }

  return customer;
}

/** Rejects changes to the protected Walk-in Customer. */
function ensureCustomerCanBeChanged(customer: CustomerRecord): void {
  if (customer.isWalkIn) {
    throw customerError(
      "SYSTEM_CUSTOMER_PROTECTED",
      "The Walk-in Customer cannot be edited or deactivated.",
      409,
    );
  }
}

/** Copies only approved customer fields into a repository update object. */
function readCustomerChanges(input: UpdateCustomerInput): CustomerChanges {
  const changes: CustomerChanges = {};

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

  if (input.creditLimit !== undefined) {
    changes.creditLimit = input.creditLimit;
  }

  if (input.isActive !== undefined) {
    changes.isActive = input.isActive;
  }

  return changes;
}

async function requireTransaction<T>(database: CustomersDatabase, work: (tx: CustomersDatabase) => Promise<T>): Promise<T> {
  if (!database.transaction) {
    throw customerError("DATABASE_TRANSACTION_REQUIRED", "Opening balance requires a database transaction.", 500);
  }
  return database.transaction(async (tx) => work(tx as unknown as CustomersDatabase));
}

/** Lists customers with the approved search, status and pagination fields. */
export async function listCustomers(
  database: CustomersDatabase,
  query: ListCustomersQuery,
): Promise<PaginatedCustomerRecords> {
  return readCustomers(database, query);
}

/** Creates one regular customer and retries only generated-code conflicts. */
export async function createCustomer(
  database: CustomersDatabase,
  input: CreateCustomerInput,
): Promise<CustomerRecord> {
  const customerInput = {
    name: input.name.trim(),
    phone: normalizeOptionalText(input.phone),
    email: normalizeOptionalText(input.email),
    address: normalizeOptionalText(input.address),
    taxId: normalizeOptionalText(input.taxId),
    creditLimit: input.creditLimit,
    isWalkIn: false,
    isActive: true,
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const createWithDatabase = async (tx: CustomersDatabase): Promise<CustomerRecord | null> => {
        if (
          isDecimalGreaterThanZero(input.openingBalance) &&
          await hasNormalBusinessActivity(tx)
        ) {
          throw customerError(
            "OPENING_BALANCE_LOCKED",
            "Opening customer balance can only be entered before normal transactions begin.",
            409,
          );
        }

        const customer = await insertCustomer(tx, {
          ...customerInput,
          code: createCustomerCode(),
        });

        if (customer && isDecimalGreaterThanZero(input.openingBalance)) {
          await writeCustomerDebit(tx, {
            customerId: customer.id,
            occurredAt: new Date(),
            referenceType: "OPENING_BALANCE",
            amount: input.openingBalance,
            notes: "Opening customer balance",
          });
        }

        return customer;
      };

      const customer = isDecimalGreaterThanZero(input.openingBalance)
        ? await requireTransaction(database, createWithDatabase)
        : await createWithDatabase(database);

      if (!customer) {
        throw customerError(
          "CUSTOMER_CREATE_FAILED",
          "Customer could not be created.",
          500,
        );
      }

      return customer;
    } catch (error) {
      if (!isCustomerCodeConflict(error)) {
        throw error;
      }
    }
  }

  throw customerError(
    "CUSTOMER_CODE_GENERATION_FAILED",
    "A unique customer code could not be generated.",
    500,
  );
}

/** Loads a customer profile with the current due calculated from ledger entries. */
export async function getCustomerProfile(
  database: CustomersDatabase,
  customerId: string,
): Promise<CustomerProfile> {
  const customer = await requireCustomer(database, customerId);
  const currentDue = await getCustomerCurrentDue(database, customerId);
  const recentInvoices = await listRecentCustomerInvoices(database, customerId);

  return {
    customer,
    financialSummaryAvailable: true,
    currentDue,
    recentInvoicesAvailable: true,
    recentInvoices,
  };
}

/** Updates a regular customer while protecting the Walk-in Customer. */
export async function updateCustomer(
  database: CustomersDatabase,
  customerId: string,
  input: UpdateCustomerInput,
): Promise<CustomerRecord> {
  const existingCustomer = await requireCustomer(database, customerId);
  ensureCustomerCanBeChanged(existingCustomer);

  const updatedCustomer = await saveCustomerChanges(
    database,
    customerId,
    readCustomerChanges(input),
  );

  if (!updatedCustomer) {
    throw customerError(
      "CUSTOMER_UPDATE_FAILED",
      "Customer could not be updated.",
      500,
    );
  }

  return updatedCustomer;
}

/** Lists confirmed customer invoices that still accept receipt allocation. */
export async function getCustomerOpenInvoices(
  database: CustomersDatabase,
  customerId: string,
  query: CustomerOpenInvoicesQuery,
) {
  await requireCustomer(database, customerId);
  const page = await listCustomerOpenInvoices(database, customerId, query);

  return {
    ...page,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** Creates the protected Walk-in Customer when installation data does not contain one. */
export async function ensureWalkInCustomerExists(
  database: CustomersDatabase,
): Promise<CustomerRecord> {
  const existingCustomer = await findWalkInCustomer(database);

  if (existingCustomer) {
    return existingCustomer;
  }

  await createWalkInCustomerIfMissing(database);
  const customer = await findWalkInCustomer(database);

  if (!customer) {
    throw customerError(
      "WALK_IN_CUSTOMER_CREATE_FAILED",
      "The Walk-in Customer could not be created.",
      500,
    );
  }

  return customer;
}
