import { AppError } from "../../shared/errors/app-error.js";
import {
  reserveBusinessDocumentNumberInTransaction,
  type BusinessSettingsDatabase,
} from "../business-settings/index.js";
import {
  createExpense as insertExpense,
  createExpenseCategory as insertExpenseCategory,
  findExpenseCategoryById,
  findExpenseCategoryByName,
  findExpenseReversal,
  findExpenseById,
  listExpenseCategories as readExpenseCategories,
  listExpenses as readExpenses,
  lockExpenseForReversal,
  updateExpenseCategory as saveExpenseCategoryChanges,
  type ExpenseCategoryChanges,
  type ExpenseCategoryRecord,
  type ExpenseDetailRecord,
  type ExpenseRecord,
  type ExpensesDatabase,
} from "./expenses.repository.js";
import {
  writeBankInflow,
  writeBankOutflow,
  writeCashInflow,
  writeCashOutflow,
} from "../payments/index.js";
import {
  findBankAccountById,
  findCashAccountById,
} from "../payments/payments.repository.js";
import type {
  CreateExpenseCategoryInput,
  CreateExpenseInput,
  ListExpensesQuery,
  ReverseExpenseInput,
  UpdateExpenseCategoryInput,
} from "./expenses.schema.js";

/** Creates a stable Expense Management error for the shared error handler. */
function expenseError(
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

/** Loads one expense category or throws the approved not-found error. */
async function requireExpenseCategory(
  database: ExpensesDatabase,
  categoryId: string,
): Promise<ExpenseCategoryRecord> {
  const category = await findExpenseCategoryById(database, categoryId);

  if (!category) {
    throw expenseError(
      "EXPENSE_CATEGORY_NOT_FOUND",
      "Expense category was not found.",
      404,
    );
  }

  return category;
}

/** Rejects a category name already used by another expense category. */
async function ensureExpenseCategoryNameIsAvailable(
  database: ExpensesDatabase,
  name: string,
  currentCategoryId?: string,
): Promise<void> {
  const existingCategory = await findExpenseCategoryByName(database, name);

  if (existingCategory && existingCategory.id !== currentCategoryId) {
    throw expenseError(
      "DUPLICATE_EXPENSE_CATEGORY",
      "An expense category with this name already exists.",
      409,
      "name",
    );
  }
}

/** Copies only approved category fields into a repository update object. */
function readExpenseCategoryChanges(
  input: UpdateExpenseCategoryInput,
): ExpenseCategoryChanges {
  const changes: ExpenseCategoryChanges = {};

  if (input.name !== undefined) {
    changes.name = input.name.trim();
  }

  if (input.isActive !== undefined) {
    changes.isActive = input.isActive;
  }

  return changes;
}

/** Ensures the selected category is active before a new expense is created. */
async function requireActiveExpenseCategory(
  database: ExpensesDatabase,
  categoryId: string,
): Promise<ExpenseCategoryRecord> {
  const category = await requireExpenseCategory(database, categoryId);

  if (!category.isActive) {
    throw expenseError(
      "EXPENSE_CATEGORY_INACTIVE",
      "An inactive expense category cannot be used for a new expense.",
      409,
      "expenseCategoryId",
    );
  }

  return category;
}

/** Ensures the selected cash or bank account exists and is active. */
async function requireActiveExpenseAccount(
  database: ExpensesDatabase,
  input: CreateExpenseInput,
): Promise<string> {
  if (input.paymentMethod === "CASH") {
    if (!input.cashAccountId) {
      throw expenseError(
        "ACCOUNT_NOT_FOUND",
        "Cash account is required for a cash expense.",
        400,
        "cashAccountId",
      );
    }

    const account = await findCashAccountById(database, input.cashAccountId);

    if (!account) {
      throw expenseError(
        "ACCOUNT_NOT_FOUND",
        "Cash account was not found.",
        404,
        "cashAccountId",
      );
    }

    if (!account.isActive) {
      throw expenseError(
        "ACCOUNT_INACTIVE",
        "Inactive accounts cannot be used for new expenses.",
        409,
        "cashAccountId",
      );
    }

    return account.id;
  }

  if (!input.bankAccountId) {
    throw expenseError(
      "ACCOUNT_NOT_FOUND",
      "Bank account is required for a bank-transfer expense.",
      400,
      "bankAccountId",
    );
  }

  const account = await findBankAccountById(database, input.bankAccountId);

  if (!account) {
    throw expenseError(
      "ACCOUNT_NOT_FOUND",
      "Bank account was not found.",
      404,
      "bankAccountId",
    );
  }

  if (!account.isActive) {
    throw expenseError(
      "ACCOUNT_INACTIVE",
      "Inactive accounts cannot be used for new expenses.",
      409,
      "bankAccountId",
    );
  }

  return account.id;
}

/** Converts an Asia/Karachi expense date into the UTC instant used by account movements. */
function expenseDateToUtc(expenseDate: string): Date {
  return new Date(`${expenseDate}T00:00:00+05:00`);
}

/** Writes the immutable cash or bank outflow created by one confirmed expense. */
async function writeExpenseOutflow(
  database: ExpensesDatabase,
  expense: ExpenseRecord,
  accountId: string,
  categoryName: string,
): Promise<void> {
  const movement = {
    accountId,
    sourceType: "EXPENSE" as const,
    sourceId: expense.id,
    amount: expense.amount,
    occurredAt: expenseDateToUtc(expense.expenseDate),
    documentNumber: expense.expenseNumber,
    description: `Expense: ${categoryName}`,
  };

  if (expense.paymentMethod === "CASH") {
    await writeCashOutflow(database, movement);
    return;
  }

  await writeBankOutflow(database, movement);
}

/** Formats one reserved EXPENSE sequence value into the saved expense number. */
function formatExpenseNumber(prefix: string, number: number): string {
  return `${prefix}-${number}`;
}

/** Lists all expense categories in the repository's stable name order. */
export async function listExpenseCategories(
  database: ExpensesDatabase,
): Promise<ExpenseCategoryRecord[]> {
  return readExpenseCategories(database);
}

/** Creates one active expense category after checking its normalized name. */
export async function createExpenseCategory(
  database: ExpensesDatabase,
  input: CreateExpenseCategoryInput,
): Promise<ExpenseCategoryRecord> {
  const name = input.name.trim();
  await ensureExpenseCategoryNameIsAvailable(database, name);

  const category = await insertExpenseCategory(database, {
    name,
    isActive: true,
  });

  if (!category) {
    throw expenseError(
      "EXPENSE_CATEGORY_CREATE_FAILED",
      "Expense category could not be created.",
      500,
    );
  }

  return category;
}

/** Renames or activates/deactivates an existing expense category. */
export async function updateExpenseCategory(
  database: ExpensesDatabase,
  categoryId: string,
  input: UpdateExpenseCategoryInput,
): Promise<ExpenseCategoryRecord> {
  await requireExpenseCategory(database, categoryId);

  if (input.name !== undefined) {
    await ensureExpenseCategoryNameIsAvailable(
      database,
      input.name.trim(),
      categoryId,
    );
  }

  const category = await saveExpenseCategoryChanges(
    database,
    categoryId,
    readExpenseCategoryChanges(input),
  );

  if (!category) {
    throw expenseError(
      "EXPENSE_CATEGORY_UPDATE_FAILED",
      "Expense category could not be updated.",
      500,
    );
  }

  return category;
}

/**
 * Reserves the next EXPENSE number inside the caller-owned transaction.
 * The shared Business Settings sequence stays the single source of truth.
 */
export async function reserveExpenseNumberInTransaction(
  database: BusinessSettingsDatabase,
): Promise<string> {
  const reservedNumber = await reserveBusinessDocumentNumberInTransaction(
    database,
    "EXPENSE",
  );

  return formatExpenseNumber(reservedNumber.prefix, reservedNumber.number);
}

/** Lists expenses using only the approved category/date/page filters. */
export async function listExpenses(
  database: ExpensesDatabase,
  query: ListExpensesQuery,
): Promise<ExpenseDetailRecord[]> {
  return readExpenses(database, query);
}

/** Loads one immutable expense detail or throws the approved not-found error. */
export async function getExpense(
  database: ExpensesDatabase,
  expenseId: string,
): Promise<ExpenseDetailRecord> {
  const expense = await findExpenseById(database, expenseId);

  if (!expense) {
    throw expenseError("EXPENSE_NOT_FOUND", "Expense was not found.", 404);
  }

  return expense;
}

/** Creates one confirmed expense inside a caller-owned transaction. */
export async function createExpenseInTransaction(
  transaction: ExpensesDatabase,
  input: CreateExpenseInput,
): Promise<ExpenseRecord> {
  const category = await requireActiveExpenseCategory(
    transaction,
    input.expenseCategoryId,
  );
  const accountId = await requireActiveExpenseAccount(transaction, input);
  const expenseNumber = await reserveExpenseNumberInTransaction(transaction);

  const expense = await insertExpense(transaction, {
    expenseNumber,
    expenseCategoryId: input.expenseCategoryId,
    expenseDate: input.expenseDate,
    amount: input.amount,
    paymentMethod: input.paymentMethod,
    cashAccountId: input.paymentMethod === "CASH" ? accountId : null,
    bankAccountId: input.paymentMethod === "BANK_TRANSFER" ? accountId : null,
    note: input.note ?? null,
    receiptUrl: input.receiptUrl ?? null,
    reversalOfExpenseId: null,
    reversalReason: null,
  });

  if (!expense) {
    throw expenseError(
      "EXPENSE_CREATE_FAILED",
      "Expense could not be created.",
      500,
    );
  }

  await writeExpenseOutflow(transaction, expense, accountId, category.name);
  return expense;
}

/** Returns today's business date in the fixed Asia/Karachi reporting timezone. */
function currentKarachiDate(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw expenseError(
      "EXPENSE_REVERSAL_FAILED",
      "Expense reversal date could not be created.",
      500,
    );
  }

  return `${year}-${month}-${day}`;
}

/** Writes the opposite cash or bank movement for one expense reversal. */
async function writeExpenseReversalInflow(
  database: ExpensesDatabase,
  reversal: ExpenseRecord,
  originalExpenseNumber: string,
): Promise<void> {
  const accountId = reversal.cashAccountId ?? reversal.bankAccountId;

  if (!accountId) {
    throw expenseError(
      "ACCOUNT_NOT_FOUND",
      "The original expense does not have a payment account.",
      409,
    );
  }

  const movement = {
    accountId,
    sourceType: "EXPENSE_REVERSAL" as const,
    sourceId: reversal.id,
    amount: reversal.amount,
    occurredAt: expenseDateToUtc(reversal.expenseDate),
    documentNumber: reversal.expenseNumber,
    description: `Reversal of expense ${originalExpenseNumber}`,
  };

  if (reversal.paymentMethod === "CASH") {
    await writeCashInflow(database, movement);
    return;
  }

  await writeBankInflow(database, movement);
}

/** Reverses one immutable expense inside the caller-owned idempotency transaction. */
export async function reverseExpenseInTransaction(
  transaction: ExpensesDatabase,
  expenseId: string,
  input: ReverseExpenseInput,
): Promise<ExpenseRecord> {
  const originalExpense = await lockExpenseForReversal(transaction, expenseId);

  if (!originalExpense) {
    throw expenseError("EXPENSE_NOT_FOUND", "Expense was not found.", 404);
  }

  if (originalExpense.reversalOfExpenseId) {
    throw expenseError(
      "EXPENSE_ALREADY_REVERSED",
      "A reversal expense cannot be reversed again.",
      409,
    );
  }

  if (await findExpenseReversal(transaction, originalExpense.id)) {
    throw expenseError(
      "EXPENSE_ALREADY_REVERSED",
      "Expense was already reversed.",
      409,
    );
  }

  const expenseNumber = await reserveExpenseNumberInTransaction(transaction);
  const reversal = await insertExpense(transaction, {
    expenseNumber,
    expenseCategoryId: originalExpense.expenseCategoryId,
    expenseDate: currentKarachiDate(),
    amount: originalExpense.amount,
    paymentMethod: originalExpense.paymentMethod,
    cashAccountId: originalExpense.cashAccountId,
    bankAccountId: originalExpense.bankAccountId,
    note: `Reversal of ${originalExpense.expenseNumber}`,
    receiptUrl: null,
    reversalOfExpenseId: originalExpense.id,
    reversalReason: input.reason.trim(),
  });

  if (!reversal) {
    throw expenseError(
      "EXPENSE_REVERSAL_FAILED",
      "Expense reversal could not be created.",
      500,
    );
  }

  await writeExpenseReversalInflow(
    transaction,
    reversal,
    originalExpense.expenseNumber,
  );

  return reversal;
}
