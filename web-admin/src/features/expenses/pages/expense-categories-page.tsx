import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { ApiError } from "../../../lib/api-types.ts";
import type { ExpenseCategory } from "../api/expenses.api.ts";
import { ExpenseCategoryForm } from "../components/expense-category-form.tsx";
import { ExpenseCategoryTable } from "../components/expense-category-table.tsx";
import {
  useExpenseCategories,
  useUpdateExpenseCategory,
} from "../hooks/use-expenses.ts";

/** Returns a readable category action error for the page. */
function readCategoryError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "The expense category could not be updated.";
}

interface ExpenseCategoriesPageProps {
  embedded?: boolean;
}

/** Lets the admin create, rename, activate, and deactivate Expense categories. */
export function ExpenseCategoriesPage({
  embedded = false,
}: ExpenseCategoriesPageProps = {}): React.JSX.Element {
  const categoriesQuery = useExpenseCategories();
  const updateCategory = useUpdateExpenseCategory();
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [changingCategoryId, setChangingCategoryId] = useState<string | null>(null);
  const [pageError, setPageError] = useState("");
  const categories = categoriesQuery.data?.data ?? [];

  /** Activates or deactivates one Expense category without deleting it. */
  async function toggleCategory(category: ExpenseCategory): Promise<void> {
    if (category.isActive && !window.confirm(`Deactivate ${category.name}?`)) {
      return;
    }

    setPageError("");
    setChangingCategoryId(category.id);

    try {
      await updateCategory.mutateAsync({
        categoryId: category.id,
        input: { isActive: !category.isActive },
      });
    } catch (error) {
      setPageError(readCategoryError(error));
    } finally {
      setChangingCategoryId(null);
    }
  }

  return (
    <section>
      {!embedded ? (
        <div className="page-heading-row">
          <div>
            <p className="eyebrow">Expense Management</p>
            <h1>Expense categories</h1>
            <p>Create, rename, activate, or deactivate categories used by expenses.</p>
          </div>
          <Link className="primary-link" to="/expenses">
            Back to expenses
          </Link>
        </div>
      ) : null}

      {pageError ? <p className="error-message">{pageError}</p> : null}

      <section className="management-card">
        <ExpenseCategoryForm
          category={editingCategory}
          onFinished={() => setEditingCategory(null)}
        />

        <h2>Categories</h2>
        {categoriesQuery.isPending ? <p>Loading expense categories...</p> : null}
        {categoriesQuery.isError ? (
          <p className="error-message">Could not load expense categories.</p>
        ) : null}
        {!categoriesQuery.isPending && !categoriesQuery.isError ? (
          <ExpenseCategoryTable
            categories={categories}
            changingCategoryId={changingCategoryId}
            onEdit={setEditingCategory}
            onToggleActive={(category) => void toggleCategory(category)}
          />
        ) : null}
      </section>
    </section>
  );
}
