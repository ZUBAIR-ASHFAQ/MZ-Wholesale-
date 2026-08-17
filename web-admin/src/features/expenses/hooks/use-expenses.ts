import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { paymentQueryKeys } from "../../payments/hooks/use-payments.ts";
import {
  createExpense,
  createExpenseCategory,
  loadExpense,
  loadExpenseCategories,
  loadExpenses,
  reverseExpense,
  updateExpenseCategory,
  type CreateExpenseCategoryInput,
  type CreateExpenseInput,
  type ExpenseListFilters,
  type ReverseExpenseInput,
  type UpdateExpenseCategoryInput,
} from "../api/expenses.api.ts";

/** Stable cache keys used by every Expense Management screen. */
export const expenseQueryKeys = {
  all: ["expenses"] as const,
  categories: ["expenses", "categories"] as const,
  lists: () => ["expenses", "list"] as const,
  list: (filters: ExpenseListFilters) =>
    ["expenses", "list", filters] as const,
  details: () => ["expenses", "detail"] as const,
  detail: (expenseId: string) =>
    ["expenses", "detail", expenseId] as const,
};

/** Loads all expense categories. */
export function useExpenseCategories() {
  return useQuery({
    queryKey: expenseQueryKeys.categories,
    queryFn: loadExpenseCategories,
  });
}

/** Creates one expense category and refreshes category selectors. */
export function useCreateExpenseCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateExpenseCategoryInput) =>
      createExpenseCategory(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: expenseQueryKeys.categories,
      });
    },
  });
}

interface UpdateExpenseCategoryVariables {
  categoryId: string;
  input: UpdateExpenseCategoryInput;
}

/** Renames or activates/deactivates one expense category. */
export function useUpdateExpenseCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ categoryId, input }: UpdateExpenseCategoryVariables) =>
      updateExpenseCategory(categoryId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: expenseQueryKeys.categories,
        }),
        queryClient.invalidateQueries({
          queryKey: expenseQueryKeys.lists(),
        }),
      ]);
    },
  });
}

/** Loads one filtered and paginated expense list. */
export function useExpenses(filters: ExpenseListFilters = {}) {
  return useQuery({
    queryKey: expenseQueryKeys.list(filters),
    queryFn: () => loadExpenses(filters),
  });
}

/** Loads one immutable expense detail when its ID is available. */
export function useExpense(expenseId: string) {
  return useQuery({
    queryKey: expenseQueryKeys.detail(expenseId),
    queryFn: () => loadExpense(expenseId),
    enabled: expenseId.length > 0,
  });
}

interface CreateExpenseVariables {
  input: CreateExpenseInput;
  idempotencyKey: string;
}

/** Creates one confirmed expense and refreshes expense and payment movement data. */
export function useCreateExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ input, idempotencyKey }: CreateExpenseVariables) =>
      createExpense(input, idempotencyKey),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: expenseQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: paymentQueryKeys.all }),
      ]);
    },
  });
}

interface ReverseExpenseVariables {
  expenseId: string;
  input: ReverseExpenseInput;
  idempotencyKey: string;
}

/** Reverses one confirmed expense and refreshes expense and payment movement data. */
export function useReverseExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      expenseId,
      input,
      idempotencyKey,
    }: ReverseExpenseVariables) =>
      reverseExpense(expenseId, input, idempotencyKey),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: expenseQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: paymentQueryKeys.all }),
      ]);
    },
  });
}
