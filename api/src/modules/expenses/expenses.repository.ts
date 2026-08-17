import { and, asc, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  bankAccounts,
  cashAccounts,
  expenseCategories,
  expenses,
} from "../../database/schema/index.js";
import type { ListExpensesQuery } from "./expenses.schema.js";

/** Contains the database methods used by the Expense repository. */
export type ExpensesDatabase = Pick<
  NodePgDatabase,
  "select" | "insert" | "update" | "execute"
> & {
  transaction?: NodePgDatabase["transaction"];
};

/** Represents one saved expense-category row. */
export type ExpenseCategoryRecord = typeof expenseCategories.$inferSelect;

/** Contains the fields needed to create one expense category. */
export type NewExpenseCategory = typeof expenseCategories.$inferInsert;

/** Contains expense-category fields that may be changed. */
export interface ExpenseCategoryChanges {
  name?: string;
  isActive?: boolean;
}

/** Represents one saved expense row. */
export type ExpenseRecord = typeof expenses.$inferSelect;

/** Contains the fields needed to create one expense. */
export type NewExpense = typeof expenses.$inferInsert;

/** Represents an expense together with the names of its category and payment account. */
export interface ExpenseDetailRecord extends ExpenseRecord {
  categoryName: string;
  cashAccountName: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  reversedByExpenseId: string | null;
}

/** Builds the approved category and expense-date list filters. */
function buildExpenseFilters(query: ListExpensesQuery): SQL[] {
  const filters: SQL[] = [];

  if (query.categoryId) {
    filters.push(eq(expenses.expenseCategoryId, query.categoryId));
  }

  if (query.startDate) {
    filters.push(gte(expenses.expenseDate, query.startDate));
  }

  if (query.endDate) {
    filters.push(lte(expenses.expenseDate, query.endDate));
  }

  return filters;
}

/** Lists expense categories in stable name order. */
export async function listExpenseCategories(
  database: ExpensesDatabase,
): Promise<ExpenseCategoryRecord[]> {
  return database
    .select()
    .from(expenseCategories)
    .orderBy(asc(expenseCategories.name), asc(expenseCategories.id));
}

/** Reads one expense category by UUID. */
export async function findExpenseCategoryById(
  database: ExpensesDatabase,
  categoryId: string,
): Promise<ExpenseCategoryRecord | null> {
  const rows = await database
    .select()
    .from(expenseCategories)
    .where(eq(expenseCategories.id, categoryId))
    .limit(1);

  return rows[0] ?? null;
}

/** Reads one expense category by its normalized case-insensitive name. */
export async function findExpenseCategoryByName(
  database: ExpensesDatabase,
  name: string,
): Promise<ExpenseCategoryRecord | null> {
  const rows = await database
    .select()
    .from(expenseCategories)
    .where(
      eq(
        sql`lower(trim(${expenseCategories.name}))`,
        name.trim().toLowerCase(),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/** Creates one expense category and returns the saved row. */
export async function createExpenseCategory(
  database: ExpensesDatabase,
  input: NewExpenseCategory,
): Promise<ExpenseCategoryRecord | null> {
  const rows = await database
    .insert(expenseCategories)
    .values(input)
    .returning();

  return rows[0] ?? null;
}

/** Renames or activates/deactivates one expense category. */
export async function updateExpenseCategory(
  database: ExpensesDatabase,
  categoryId: string,
  changes: ExpenseCategoryChanges,
): Promise<ExpenseCategoryRecord | null> {
  const rows = await database
    .update(expenseCategories)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(expenseCategories.id, categoryId))
    .returning();

  return rows[0] ?? null;
}

/** Lists expenses with category/account details using approved filters and pagination. */
export async function listExpenses(
  database: ExpensesDatabase,
  query: ListExpensesQuery,
): Promise<ExpenseDetailRecord[]> {
  const filters = buildExpenseFilters(query);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;

  return database
    .select({
      id: expenses.id,
      expenseNumber: expenses.expenseNumber,
      expenseCategoryId: expenses.expenseCategoryId,
      expenseDate: expenses.expenseDate,
      amount: expenses.amount,
      paymentMethod: expenses.paymentMethod,
      cashAccountId: expenses.cashAccountId,
      bankAccountId: expenses.bankAccountId,
      note: expenses.note,
      receiptUrl: expenses.receiptUrl,
      reversalOfExpenseId: expenses.reversalOfExpenseId,
      reversalReason: expenses.reversalReason,
      createdAt: expenses.createdAt,
      categoryName: expenseCategories.name,
      cashAccountName: cashAccounts.name,
      bankName: bankAccounts.bankName,
      bankAccountName: bankAccounts.accountName,
      bankAccountNumber: bankAccounts.accountNumber,
      reversedByExpenseId: sql<string | null>`(
        select "reversed_expense"."id"::text
        from "expenses" as "reversed_expense"
        where "reversed_expense"."reversal_of_expense_id" = ${expenses.id}
        limit 1
      )`,
    })
    .from(expenses)
    .innerJoin(
      expenseCategories,
      eq(expenseCategories.id, expenses.expenseCategoryId),
    )
    .leftJoin(cashAccounts, eq(cashAccounts.id, expenses.cashAccountId))
    .leftJoin(bankAccounts, eq(bankAccounts.id, expenses.bankAccountId))
    .where(where)
    .orderBy(
      desc(expenses.expenseDate),
      desc(expenses.createdAt),
      desc(expenses.id),
    )
    .limit(query.pageSize)
    .offset(offset);
}

/** Reads one expense by UUID with category and payment-account details. */
export async function findExpenseById(
  database: ExpensesDatabase,
  expenseId: string,
): Promise<ExpenseDetailRecord | null> {
  const rows = await database
    .select({
      id: expenses.id,
      expenseNumber: expenses.expenseNumber,
      expenseCategoryId: expenses.expenseCategoryId,
      expenseDate: expenses.expenseDate,
      amount: expenses.amount,
      paymentMethod: expenses.paymentMethod,
      cashAccountId: expenses.cashAccountId,
      bankAccountId: expenses.bankAccountId,
      note: expenses.note,
      receiptUrl: expenses.receiptUrl,
      reversalOfExpenseId: expenses.reversalOfExpenseId,
      reversalReason: expenses.reversalReason,
      createdAt: expenses.createdAt,
      categoryName: expenseCategories.name,
      cashAccountName: cashAccounts.name,
      bankName: bankAccounts.bankName,
      bankAccountName: bankAccounts.accountName,
      bankAccountNumber: bankAccounts.accountNumber,
      reversedByExpenseId: sql<string | null>`(
        select "reversed_expense"."id"::text
        from "expenses" as "reversed_expense"
        where "reversed_expense"."reversal_of_expense_id" = ${expenses.id}
        limit 1
      )`,
    })
    .from(expenses)
    .innerJoin(
      expenseCategories,
      eq(expenseCategories.id, expenses.expenseCategoryId),
    )
    .leftJoin(cashAccounts, eq(cashAccounts.id, expenses.cashAccountId))
    .leftJoin(bankAccounts, eq(bankAccounts.id, expenses.bankAccountId))
    .where(eq(expenses.id, expenseId))
    .limit(1);

  return rows[0] ?? null;
}

/** Creates one immutable expense row and returns the saved database record. */
export async function createExpense(
  database: ExpensesDatabase,
  input: NewExpense,
): Promise<ExpenseRecord | null> {
  const rows = await database.insert(expenses).values(input).returning();
  return rows[0] ?? null;
}


/** Locks one expense before reversal so two requests cannot reverse it together. */
export async function lockExpenseForReversal(
  database: ExpensesDatabase,
  expenseId: string,
): Promise<ExpenseRecord | null> {
  const rows = await database
    .select()
    .from(expenses)
    .where(eq(expenses.id, expenseId))
    .limit(1)
    .for("update");

  return rows[0] ?? null;
}

/** Finds an existing reversal linked to one original expense. */
export async function findExpenseReversal(
  database: ExpensesDatabase,
  originalExpenseId: string,
): Promise<ExpenseRecord | null> {
  const rows = await database
    .select()
    .from(expenses)
    .where(eq(expenses.reversalOfExpenseId, originalExpenseId))
    .limit(1);

  return rows[0] ?? null;
}

