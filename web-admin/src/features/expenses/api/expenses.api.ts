import { requestApi } from "../../../lib/api-client.ts";
import type { ApiSuccess } from "../../../lib/api-types.ts";

export type ExpensePaymentMethod = "CASH" | "BANK_TRANSFER";

/** One reusable expense category returned by the Expense API. */
export interface ExpenseCategory {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Fields accepted when creating one expense category. */
export interface CreateExpenseCategoryInput {
  name: string;
}

/** Fields accepted when renaming or activating/deactivating one category. */
export interface UpdateExpenseCategoryInput {
  name?: string;
  isActive?: boolean;
}

/** One immutable confirmed expense returned by the Expense API. */
export interface Expense {
  id: string;
  expenseNumber: string;
  expenseCategoryId: string;
  expenseDate: string;
  amount: string;
  paymentMethod: ExpensePaymentMethod;
  cashAccountId: string | null;
  bankAccountId: string | null;
  note: string | null;
  receiptUrl: string | null;
  reversalOfExpenseId: string | null;
  reversalReason: string | null;
  createdAt: string;
}

/** Expense list/detail row enriched with category and payment-account names. */
export interface ExpenseDetail extends Expense {
  categoryName: string;
  cashAccountName: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  reversedByExpenseId: string | null;
}

/** Filters accepted by GET /expenses. */
export interface ExpenseListFilters {
  categoryId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

/** Fields accepted when creating one confirmed expense. */
export interface CreateExpenseInput {
  expenseCategoryId: string;
  expenseDate: string;
  amount: string;
  paymentMethod: ExpensePaymentMethod;
  cashAccountId?: string;
  bankAccountId?: string;
  note?: string | null;
  receiptUrl?: string | null;
}

/** Fields accepted when reversing one immutable confirmed expense. */
export interface ReverseExpenseInput {
  reason: string;
}

/** Adds one optional text filter to an Expense query string. */
function addTextFilter(
  params: URLSearchParams,
  name: string,
  value: string | undefined,
): void {
  const trimmedValue = value?.trim();

  if (trimmedValue) {
    params.set(name, trimmedValue);
  }
}

/** Adds optional Expense pagination values to a query string. */
function addPagination(
  params: URLSearchParams,
  filters: { page?: number; pageSize?: number },
): void {
  if (filters.page !== undefined) {
    params.set("page", String(filters.page));
  }

  if (filters.pageSize !== undefined) {
    params.set("pageSize", String(filters.pageSize));
  }
}

/** Converts URL parameters into an optional query-string suffix. */
function createQueryString(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Builds the approved category/date/page query accepted by GET /expenses. */
function buildExpenseListQuery(filters: ExpenseListFilters): string {
  const params = new URLSearchParams();
  addTextFilter(params, "categoryId", filters.categoryId);
  addTextFilter(params, "startDate", filters.startDate);
  addTextFilter(params, "endDate", filters.endDate);
  addPagination(params, filters);
  return createQueryString(params);
}

/** Loads all expense categories in stable backend order. */
export function loadExpenseCategories(): Promise<ApiSuccess<ExpenseCategory[]>> {
  return requestApi<ApiSuccess<ExpenseCategory[]>>("/expense-categories");
}

/** Creates one expense category. */
export function createExpenseCategory(
  input: CreateExpenseCategoryInput,
): Promise<ApiSuccess<ExpenseCategory>> {
  return requestApi<ApiSuccess<ExpenseCategory>>("/expense-categories", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Renames or activates/deactivates one expense category. */
export function updateExpenseCategory(
  categoryId: string,
  input: UpdateExpenseCategoryInput,
): Promise<ApiSuccess<ExpenseCategory>> {
  return requestApi<ApiSuccess<ExpenseCategory>>(
    `/expense-categories/${categoryId}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

/** Loads expenses using only the approved category/date/page filters. */
export function loadExpenses(
  filters: ExpenseListFilters = {},
): Promise<ApiSuccess<ExpenseDetail[]>> {
  return requestApi<ApiSuccess<ExpenseDetail[]>>(
    `/expenses${buildExpenseListQuery(filters)}`,
  );
}

/** Loads one immutable expense detail. */
export function loadExpense(
  expenseId: string,
): Promise<ApiSuccess<ExpenseDetail>> {
  return requestApi<ApiSuccess<ExpenseDetail>>(`/expenses/${expenseId}`);
}

/** Creates one confirmed expense using the required explicit idempotency key. */
export function createExpense(
  input: CreateExpenseInput,
  idempotencyKey: string,
): Promise<ApiSuccess<Expense>> {
  return requestApi<ApiSuccess<Expense>>("/expenses", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}

/** Reverses one confirmed expense using the required explicit idempotency key. */
export function reverseExpense(
  expenseId: string,
  input: ReverseExpenseInput,
  idempotencyKey: string,
): Promise<ApiSuccess<Expense>> {
  return requestApi<ApiSuccess<Expense>>(`/expenses/${expenseId}/reverse`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}
