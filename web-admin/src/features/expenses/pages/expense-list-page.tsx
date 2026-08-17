import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import type { ExpenseListFilters } from "../api/expenses.api.ts";
import { ExpenseTable } from "../components/expense-table.tsx";
import {
  useExpenseCategories,
  useExpenses,
} from "../hooks/use-expenses.ts";

const pageSize = 20;

/** Shows the filtered and paginated Expense list. */
export function ExpenseListPage(): React.JSX.Element {
  const [categoryId, setCategoryId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<ExpenseListFilters>({
    page: 1,
    pageSize,
  });

  const categoriesQuery = useExpenseCategories();
  const expensesQuery = useExpenses(appliedFilters);
  const categories = categoriesQuery.data?.data ?? [];
  const expenses = expensesQuery.data?.data ?? [];
  const currentPage = appliedFilters.page ?? 1;
  const hasNextPage = expenses.length === pageSize;

  /** Applies the visible Expense filters and returns to the first page. */
  function applyFilters(): void {
    setAppliedFilters({
      categoryId: categoryId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page: 1,
      pageSize,
    });
  }

  /** Clears every Expense filter and returns to the first page. */
  function clearFilters(): void {
    setCategoryId("");
    setStartDate("");
    setEndDate("");
    setAppliedFilters({ page: 1, pageSize });
  }

  /** Opens another Expense page while preserving the applied filters. */
  function changePage(page: number): void {
    setAppliedFilters((filters) => ({ ...filters, page }));
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Expense Management</p>
          <h1>Expenses</h1>
          <p>View confirmed cash and bank expenses by category and date.</p>
        </div>
        <div className="form-actions">
          <Link className="primary-link" to="/expenses/categories">
            Manage categories
          </Link>
          <Link className="primary-link" to="/expenses/new">
            New expense
          </Link>
        </div>
      </div>

      <section className="management-card">
        <div className="payment-filter-grid">
          <label className="ui-field">
            <span>Category</span>
            <select
              disabled={categoriesQuery.isPending}
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="ui-field">
            <span>Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>

          <label className="ui-field">
            <span>End date</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
        </div>

        <div className="form-actions">
          <Button
            disabled={expensesQuery.isFetching}
            label="Apply filters"
            onClick={applyFilters}
          />
          <Button
            disabled={expensesQuery.isFetching}
            label="Clear"
            onClick={clearFilters}
          />
        </div>
      </section>

      <section className="management-card">
        {categoriesQuery.isError ? (
          <p className="error-message">
            Expense category filter options could not be loaded.
          </p>
        ) : null}

        {expensesQuery.isPending ? <p>Loading expenses...</p> : null}
        {expensesQuery.isError ? (
          <p className="error-message">Could not load expenses.</p>
        ) : null}

        {!expensesQuery.isPending && !expensesQuery.isError ? (
          <ExpenseTable expenses={expenses} />
        ) : null}

        {!expensesQuery.isPending && !expensesQuery.isError ? (
          <div className="pagination-row">
            <p>Page {currentPage}</p>
            <div className="form-actions">
              <Button
                disabled={currentPage <= 1 || expensesQuery.isFetching}
                label="Previous"
                onClick={() => changePage(Math.max(1, currentPage - 1))}
              />
              <Button
                disabled={!hasNextPage || expensesQuery.isFetching}
                label="Next"
                onClick={() => changePage(currentPage + 1)}
              />
            </div>
          </div>
        ) : null}
      </section>
    </section>
  );
}
