import { useState } from "react";

import type { SupplierAgingReportFilters } from "../api/reports.api.ts";
import { useSupplierAgingReport } from "../hooks/use-reports.ts";

interface SupplierAgingFilterValues {
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

/** Converts visible controls into the Supplier Aging API query. */
function createSupplierAgingFilters(
  values: SupplierAgingFilterValues,
  page: number,
): SupplierAgingReportFilters {
  return {
    asOfDate: values.asOfDate,
    search: values.search.trim() || undefined,
    page,
    pageSize: values.pageSize,
  };
}

/** Shows supplier payables grouped by how long each purchase has remained unpaid. */
export function SupplierAgingReportPage(): React.JSX.Element {
  const defaultFilters: SupplierAgingFilterValues = {
    asOfDate: getTodayBusinessDate(),
    search: "",
    pageSize: 20,
  };
  const [draftFilters, setDraftFilters] =
    useState<SupplierAgingFilterValues>(defaultFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<SupplierAgingFilterValues>(defaultFilters);
  const [page, setPage] = useState(1);

  const reportQuery = useSupplierAgingReport(
    createSupplierAgingFilters(appliedFilters, page),
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
    const resetValues: SupplierAgingFilterValues = {
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
          <h1>Supplier aging</h1>
          <p>
            Review unpaid supplier purchases by age as of the selected business date.
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
              placeholder="Supplier code, name, or phone"
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
        {reportQuery.isPending ? <p>Loading supplier aging report...</p> : null}
        {reportQuery.isError ? (
          <p className="error-message">Could not load the supplier aging report.</p>
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
                <span>Total payable</span>
                <strong>PKR {report.totals.totalPayable}</strong>
              </article>
            </div>

            <div className="table-scroll">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>Supplier code</th>
                    <th>Supplier</th>
                    <th>Phone</th>
                    <th>0–30</th>
                    <th>31–60</th>
                    <th>61–90</th>
                    <th>90+</th>
                    <th>Total payable</th>
                  </tr>
                </thead>
                <tbody>
                  {report.items.map((row) => (
                    <tr key={row.supplierId}>
                      <td>{row.supplierCode}</td>
                      <td>{row.supplierName}</td>
                      <td>{row.phone ?? "-"}</td>
                      <td>PKR {row.bucket0To30}</td>
                      <td>PKR {row.bucket31To60}</td>
                      <td>PKR {row.bucket61To90}</td>
                      <td>PKR {row.bucket90Plus}</td>
                      <td>PKR {row.totalPayable}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {report.items.length === 0 ? (
              <p>No supplier payables matched the selected aging filters.</p>
            ) : null}

            <div className="pagination-row">
              <p>
                Page {report.page} of {totalPages} · {report.total} suppliers
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
