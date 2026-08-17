import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { useExpenseCategories } from "../../expenses/hooks/use-expenses.ts";
import type { ExpenseReportFilters } from "../api/reports.api.ts";
import {
  ReportDateRangeFilter,
  type ReportDateRangeFilterValues,
} from "../components/report-filters.tsx";
import { useExpenseReport } from "../hooks/use-reports.ts";

/** Returns today's Asia/Karachi business date in the YYYY-MM-DD format required by the API. */
function today(): string {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Karachi",
    year: "numeric",
  }).formatToParts(new Date());

  const year = dateParts.find((part) => part.type === "year")?.value ?? "";
  const month = dateParts.find((part) => part.type === "month")?.value ?? "";
  const day = dateParts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

/** Returns the first day of the current Karachi business month in YYYY-MM-DD format. */
function firstDayOfCurrentMonth(): string {
  return `${today().slice(0, 7)}-01`;
}

const defaultDates: ReportDateRangeFilterValues = {
  startDate: firstDayOfCurrentMonth(),
  endDate: today(),
};

/** Converts the visible Expense Report controls into the backend filter contract. */
function createExpenseFilters(
  dates: ReportDateRangeFilterValues,
  categoryId: string,
): ExpenseReportFilters {
  return {
    startDate: dates.startDate,
    endDate: dates.endDate,
    categoryId: categoryId || undefined,
  };
}

/** Returns a readable label for the payment method stored on an expense. */
function paymentMethodLabel(method: "CASH" | "BANK_TRANSFER"): string {
  return method === "CASH" ? "Cash" : "Bank transfer";
}

/** Shows the expense document number as a link to its immutable detail record. */
function expenseDocument(expenseId: string, expenseNumber: string): React.JSX.Element {
  return (
    <Link className="table-link" params={{ expenseId }} to="/expenses/$expenseId">
      {expenseNumber}
    </Link>
  );
}

/** Links a reversal row back to the original expense it corrects. */
function relatedExpense(reversalOfExpenseId: string | null): React.JSX.Element | string {
  if (!reversalOfExpenseId) return "—";

  return (
    <Link
      className="table-link"
      params={{ expenseId: reversalOfExpenseId }}
      to="/expenses/$expenseId"
    >
      Original expense
    </Link>
  );
}

/** Shows expense totals, linked reversals, and immutable expense detail rows. */
export function ExpenseReportPage(): React.JSX.Element {
  const [draftDates, setDraftDates] =
    useState<ReportDateRangeFilterValues>(defaultDates);
  const [draftCategoryId, setDraftCategoryId] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<ExpenseReportFilters>(
    () => createExpenseFilters(defaultDates, ""),
  );

  const categoriesQuery = useExpenseCategories();
  const reportQuery = useExpenseReport(appliedFilters);
  const report = reportQuery.data?.data;
  const categories = categoriesQuery.data?.data ?? [];

  /** Applies the selected date range and optional category filter. */
  function applyFilters(): void {
    setAppliedFilters(createExpenseFilters(draftDates, draftCategoryId));
  }

  /** Restores the current-month range and clears the category filter. */
  function resetFilters(): void {
    const nextDates = {
      startDate: firstDayOfCurrentMonth(),
      endDate: today(),
    };

    setDraftDates(nextDates);
    setDraftCategoryId("");
    setAppliedFilters(createExpenseFilters(nextDates, ""));
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Expense report</h1>
          <p>
            Review confirmed expenses and linked reversals for the selected period.
          </p>
        </div>
      </div>

      <section className="management-card">
        <ReportDateRangeFilter
          disabled={reportQuery.isFetching}
          onApply={applyFilters}
          onChange={setDraftDates}
          onReset={resetFilters}
          values={draftDates}
        />

        <div className="payment-filter-grid">
          <label className="ui-field">
            <span>Expense category</span>
            <select
              disabled={categoriesQuery.isPending || reportQuery.isFetching}
              onChange={(event) => setDraftCategoryId(event.target.value)}
              value={draftCategoryId}
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {categoriesQuery.isError ? (
          <p className="error-message">Expense category filters could not be loaded.</p>
        ) : null}
      </section>

      <section className="management-card">
        {reportQuery.isPending ? <p>Loading expense report...</p> : null}
        {reportQuery.isError ? (
          <p className="error-message">Could not load the expense report.</p>
        ) : null}

        {report ? (
          <>
            <div className="summary-grid">
              <article className="summary-card">
                <span>Expenses</span>
                <strong>PKR {report.totals.expenseAmount}</strong>
              </article>
              <article className="summary-card">
                <span>Reversals</span>
                <strong>PKR {report.totals.reversalAmount}</strong>
              </article>
              <article className="summary-card">
                <span>Net expenses</span>
                <strong>PKR {report.totals.netExpenseAmount}</strong>
              </article>
            </div>

            <div className="table-scroll">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Document</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th>Payment</th>
                    <th>Account</th>
                    <th>Amount</th>
                    <th>Related expense</th>
                    <th>Note / reversal reason</th>
                    <th>Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.expenseId}>
                      <td>{row.documentDate}</td>
                      <td>{expenseDocument(row.expenseId, row.expenseNumber)}</td>
                      <td>{row.documentType === "EXPENSE" ? "Expense" : "Reversal"}</td>
                      <td>{row.categoryName}</td>
                      <td>{paymentMethodLabel(row.paymentMethod)}</td>
                      <td>{row.accountName || "-"}</td>
                      <td>PKR {row.amount}</td>
                      <td>{relatedExpense(row.reversalOfExpenseId)}</td>
                      <td>{row.reversalReason ?? row.note ?? "-"}</td>
                      <td>
                        {row.receiptUrl ? (
                          <a href={row.receiptUrl} rel="noreferrer" target="_blank">
                            View receipt
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {report.rows.length === 0 ? (
              <p>No expenses matched the selected report filters.</p>
            ) : null}
          </>
        ) : null}
      </section>
    </section>
  );
}
