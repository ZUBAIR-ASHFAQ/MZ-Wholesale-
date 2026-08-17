import { useState } from "react";

import type { ProfitSummaryReportFilters } from "../api/reports.api.ts";
import {
  ReportDateRangeFilter,
  type ReportDateRangeFilterValues,
} from "../components/report-filters.tsx";
import { useProfitSummaryReport } from "../hooks/use-reports.ts";

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

/** Converts visible date controls into the backend Profit Summary filter contract. */
function createProfitSummaryFilters(
  dates: ReportDateRangeFilterValues,
): ProfitSummaryReportFilters {
  return {
    startDate: dates.startDate,
    endDate: dates.endDate,
  };
}

/** Shows the basic estimated profit calculation for the selected date range. */
export function ProfitSummaryReportPage(): React.JSX.Element {
  const [draftDates, setDraftDates] =
    useState<ReportDateRangeFilterValues>(defaultDates);
  const [appliedFilters, setAppliedFilters] =
    useState<ProfitSummaryReportFilters>(() =>
      createProfitSummaryFilters(defaultDates),
    );

  const reportQuery = useProfitSummaryReport(appliedFilters);
  const report = reportQuery.data?.data;

  /** Applies the selected report date range. */
  function applyFilters(): void {
    setAppliedFilters(createProfitSummaryFilters(draftDates));
  }

  /** Restores the current-month report date range. */
  function resetFilters(): void {
    const nextDates = {
      startDate: firstDayOfCurrentMonth(),
      endDate: today(),
    };

    setDraftDates(nextDates);
    setAppliedFilters(createProfitSummaryFilters(nextDates));
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Profit summary</h1>
          <p>
            Review estimated profit from confirmed sales, historical cost
            snapshots, returns, and expenses.
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
      </section>

      <section className="management-card">
        {reportQuery.isPending ? <p>Loading profit summary...</p> : null}
        {reportQuery.isError ? (
          <p className="error-message">Could not load the profit summary.</p>
        ) : null}

        {report ? (
          <div className="summary-grid">
            <article className="summary-card">
              <span>Sales</span>
              <strong>PKR {report.salesAmount}</strong>
            </article>
            <article className="summary-card">
              <span>Sales returns</span>
              <strong>PKR {report.salesReturnAmount}</strong>
            </article>
            <article className="summary-card">
              <span>Net sales</span>
              <strong>PKR {report.netSalesAmount}</strong>
            </article>
            <article className="summary-card">
              <span>Cost of goods sold</span>
              <strong>PKR {report.costOfGoodsSoldAmount}</strong>
            </article>
            <article className="summary-card">
              <span>Returned cost</span>
              <strong>PKR {report.returnedCostAmount}</strong>
            </article>
            <article className="summary-card">
              <span>Net cost</span>
              <strong>PKR {report.netCostAmount}</strong>
            </article>
            <article className="summary-card">
              <span>Gross profit</span>
              <strong>PKR {report.grossProfitAmount}</strong>
            </article>
            <article className="summary-card">
              <span>Expenses</span>
              <strong>PKR {report.expenseAmount}</strong>
            </article>
            <article className="summary-card">
              <span>Expense reversals</span>
              <strong>PKR {report.expenseReversalAmount}</strong>
            </article>
            <article className="summary-card">
              <span>Net expenses</span>
              <strong>PKR {report.netExpenseAmount}</strong>
            </article>
            <article className="summary-card">
              <span>Estimated profit</span>
              <strong>PKR {report.estimatedProfitAmount}</strong>
            </article>
          </div>
        ) : null}
      </section>
    </section>
  );
}
