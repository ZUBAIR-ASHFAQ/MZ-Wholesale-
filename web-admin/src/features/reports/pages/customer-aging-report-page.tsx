import { useState } from "react";

import type { CustomerAgingReportFilters } from "../api/reports.api.ts";
import { useCustomerAgingReport } from "../hooks/use-reports.ts";

interface CustomerAgingFilterValues {
  asOfDate: string;
  search: string;
  pageSize: number;
}

/** Returns today's Asia/Karachi business date in YYYY-MM-DD format. */
function getTodayBusinessDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** Converts visible controls into the Customer Aging API query. */
function createCustomerAgingFilters(
  values: CustomerAgingFilterValues,
  page: number,
): CustomerAgingReportFilters {
  return {
    asOfDate: values.asOfDate,
    search: values.search.trim() || undefined,
    page,
    pageSize: values.pageSize,
  };
}

/** Shows customer receivables grouped by how long each invoice has remained unpaid. */
export function CustomerAgingReportPage(): React.JSX.Element {
  const defaultFilters: CustomerAgingFilterValues = {
    asOfDate: getTodayBusinessDate(),
    search: "",
    pageSize: 20,
  };
  const [draftFilters, setDraftFilters] =
    useState<CustomerAgingFilterValues>(defaultFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<CustomerAgingFilterValues>(defaultFilters);
  const [page, setPage] = useState(1);

  const reportQuery = useCustomerAgingReport(
    createCustomerAgingFilters(appliedFilters, page),
  );
  const report = reportQuery.data?.data;
  const totalPages = Math.max(
    1,
    Math.ceil(
      (report?.total ?? 0) / (report?.pageSize ?? appliedFilters.pageSize),
    ),
  );

  /** Applies the selected aging date, search, and page size. */
  function applyFilters(): void {
    setAppliedFilters(draftFilters);
    setPage(1);
  }

  /** Restores today's business date and default search/pagination. */
  function resetFilters(): void {
    const resetValues: CustomerAgingFilterValues = {
      asOfDate: getTodayBusinessDate(),
      search: "",
      pageSize: 20,
    };
    setDraftFilters(resetValues);
    setAppliedFilters(resetValues);
    setPage(1);
  }

  /** Moves to the previous page without going below page one. */
  function showPreviousPage(): void {
    setPage((currentPage) => Math.max(1, currentPage - 1));
  }

  /** Moves to the next page without going beyond the final page. */
  function showNextPage(): void {
    setPage((currentPage) => Math.min(totalPages, currentPage + 1));
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Customer aging</h1>
          <p>
            Review unpaid customer invoices by age as of the selected business date.
          </p>
        </div>
      </div>

      <section className="management-card">
        <div className="payment-filter-grid">
          <label className="ui-field">
            <span>As-of date</span>
            <input
              disabled={reportQuery.isFetching}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  asOfDate: event.target.value,
                }))
              }
              type="date"
              value={draftFilters.asOfDate}
            />
          </label>

          <label className="ui-field">
            <span>Search</span>
            <input
              disabled={reportQuery.isFetching}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              placeholder="Customer code, name, or phone"
              type="search"
              value={draftFilters.search}
            />
          </label>

          <label className="ui-field">
            <span>Rows per page</span>
            <select
              disabled={reportQuery.isFetching}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  pageSize: Number(event.target.value),
                }))
              }
              value={draftFilters.pageSize}
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
        </div>

        <div className="form-actions">
          <button
            className="primary-button"
            disabled={reportQuery.isFetching || !draftFilters.asOfDate}
            onClick={applyFilters}
            type="button"
          >
            Apply filters
          </button>
          <button
            className="secondary-button"
            disabled={reportQuery.isFetching}
            onClick={resetFilters}
            type="button"
          >
            Reset
          </button>
        </div>
      </section>

      <section className="management-card">
        {reportQuery.isPending ? <p>Loading customer aging report...</p> : null}
        {reportQuery.isError ? (
          <p className="error-message">Could not load the customer aging report.</p>
        ) : null}

        {report ? (
          <>
            <div className="summary-grid">
              <article className="summary-card">
                <span>0–30 days</span>
                <strong>PKR {report.totals.bucket0To30}</strong>
              </article>
              <article className="summary-card">
                <span>31–60 days</span>
                <strong>PKR {report.totals.bucket31To60}</strong>
              </article>
              <article className="summary-card">
                <span>61–90 days</span>
                <strong>PKR {report.totals.bucket61To90}</strong>
              </article>
              <article className="summary-card">
                <span>90+ days</span>
                <strong>PKR {report.totals.bucket90Plus}</strong>
              </article>
              <article className="summary-card">
                <span>Total outstanding</span>
                <strong>PKR {report.totals.totalOutstanding}</strong>
              </article>
            </div>

            <div className="table-scroll">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>Customer code</th>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>0–30</th>
                    <th>31–60</th>
                    <th>61–90</th>
                    <th>90+</th>
                    <th>Total outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {report.items.map((row) => (
                    <tr key={row.customerId}>
                      <td>{row.customerCode}</td>
                      <td>{row.customerName}</td>
                      <td>{row.phone ?? "-"}</td>
                      <td>PKR {row.bucket0To30}</td>
                      <td>PKR {row.bucket31To60}</td>
                      <td>PKR {row.bucket61To90}</td>
                      <td>PKR {row.bucket90Plus}</td>
                      <td>PKR {row.totalOutstanding}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {report.items.length === 0 ? (
              <p>No customer dues matched the selected aging filters.</p>
            ) : null}

            <div className="pagination-row">
              <p>
                Page {report.page} of {totalPages} · {report.total} customers
              </p>
              <div className="form-actions">
                <button
                  className="secondary-button"
                  disabled={report.page <= 1 || reportQuery.isFetching}
                  onClick={showPreviousPage}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="secondary-button"
                  disabled={report.page >= totalPages || reportQuery.isFetching}
                  onClick={showNextPage}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : null}
      </section>
    </section>
  );
}
