import { trimDecimalZeros } from "../../../lib/utils.ts";
import { useState } from "react";

import { formatMoney } from "../../../lib/utils.ts";

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
    <section className="profit-summary-page">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Profit summary</h1>
          <p>
            Review estimated profit from confirmed sales, historical cost
            snapshots, returns, expenses, and payroll labor cost.
          </p>
        </div>
      </div>

      <section className="management-card profit-summary-filter-card">
        <ReportDateRangeFilter
          disabled={reportQuery.isFetching}
          onApply={applyFilters}
          onChange={setDraftDates}
          onReset={resetFilters}
          values={draftDates}
        />
      </section>

      <section className="management-card profit-summary-result-card">
        {reportQuery.isPending ? <p>Loading profit summary...</p> : null}
        {reportQuery.isError ? (
          <p className="error-message">Could not load the profit summary.</p>
        ) : null}

        {report ? (
          <>
            <div className="profit-summary-result-heading">
              <div>
                <span>Applied period</span>
                <h2>Profit at a glance</h2>
                <p>
                  {appliedFilters.startDate} <span aria-hidden="true">→</span>{" "}
                  {appliedFilters.endDate}
                </p>
              </div>
              <small>Asia/Karachi business dates</small>
            </div>

            <div className="summary-grid profit-summary-kpi-grid">
              <article className="summary-card">
                <span>Net sales</span>
                <strong>{formatMoney(report.netSalesAmount)}</strong>
                <small>Sales less confirmed returns</small>
              </article>
              <article className="summary-card">
                <span>Gross profit</span>
                <strong>{formatMoney(report.grossProfitAmount)}</strong>
                <small>Net sales less net inventory cost</small>
              </article>
              <article className="summary-card profit-summary-primary-kpi">
                <span>Estimated profit</span>
                <strong>{formatMoney(report.estimatedProfitAmount)}</strong>
                <small>After net expenses and labor cost</small>
              </article>
            </div>

            <div className="profit-summary-breakdown-grid">
              <article className="summary-card profit-summary-detail-card">
                <div className="profit-summary-detail-heading">
                  <span>Revenue</span>
                  <h3>Sales</h3>
                </div>
                <div className="profit-summary-detail-list">
                  <div>
                    <span>Confirmed sales</span>
                    <strong>{formatMoney(report.salesAmount)}</strong>
                  </div>
                  <div>
                    <span>Sales returns</span>
                    <strong>− {formatMoney(report.salesReturnAmount)}</strong>
                  </div>
                  <div className="profit-summary-detail-total">
                    <span>Net sales</span>
                    <strong>{formatMoney(report.netSalesAmount)}</strong>
                  </div>
                </div>
              </article>

              <article className="summary-card profit-summary-detail-card">
                <div className="profit-summary-detail-heading">
                  <span>Cost of sales</span>
                  <h3>Inventory cost</h3>
                </div>
                <div className="profit-summary-detail-list">
                  <div>
                    <span>Cost of goods sold</span>
                    <strong>{formatMoney(report.costOfGoodsSoldAmount)}</strong>
                  </div>
                  <div>
                    <span>Returned cost</span>
                    <strong>− {formatMoney(report.returnedCostAmount)}</strong>
                  </div>
                  <div>
                    <span>Net cost</span>
                    <strong>{formatMoney(report.netCostAmount)}</strong>
                  </div>
                  <div className="profit-summary-detail-total">
                    <span>Gross profit</span>
                    <strong>{formatMoney(report.grossProfitAmount)}</strong>
                  </div>
                </div>
              </article>

              <article className="summary-card profit-summary-detail-card">
                <div className="profit-summary-detail-heading">
                  <span>Operating costs</span>
                  <h3>Expenses &amp; labor</h3>
                </div>
                <div className="profit-summary-detail-list">
                  <div>
                    <span>Expenses</span>
                    <strong>{formatMoney(report.expenseAmount)}</strong>
                  </div>
                  <div>
                    <span>Expense reversals</span>
                    <strong>− {formatMoney(report.expenseReversalAmount)}</strong>
                  </div>
                  <div>
                    <span>Net expenses</span>
                    <strong>{formatMoney(report.netExpenseAmount)}</strong>
                  </div>
                  <div>
                    <span>Labor cost</span>
                    <strong>{formatMoney(report.laborCostAmount)}</strong>
                  </div>
                  <div className="profit-summary-detail-total">
                    <span>Estimated profit</span>
                    <strong>{formatMoney(report.estimatedProfitAmount)}</strong>
                  </div>
                </div>
              </article>
            </div>
          </>
        ) : null}
      </section>
    </section>
  );
}
