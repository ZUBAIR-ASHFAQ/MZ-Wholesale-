import { useState } from "react";

import type { SupplierPayableReportFilters } from "../api/reports.api.ts";
import {
  ReportSearchFilter,
  type ReportSearchFilterValues,
} from "../components/report-filters.tsx";
import { useSupplierPayableReport } from "../hooks/use-reports.ts";

const defaultFilters: ReportSearchFilterValues = {
  search: "",
  pageSize: 20,
};

/** Converts the visible search controls into the backend Supplier Payable Report filters. */
function createSupplierPayableFilters(
  values: ReportSearchFilterValues,
  page: number,
): SupplierPayableReportFilters {
  return {
    search: values.search.trim() || undefined,
    page,
    pageSize: values.pageSize,
  };
}

/** Shows suppliers with a positive payable ledger balance. */
export function SupplierPayableReportPage(): React.JSX.Element {
  const [draftFilters, setDraftFilters] =
    useState<ReportSearchFilterValues>(defaultFilters);
  const [appliedSearch, setAppliedSearch] = useState("");
  const [pageSize, setPageSize] = useState(defaultFilters.pageSize);
  const [page, setPage] = useState(1);

  const reportQuery = useSupplierPayableReport(
    createSupplierPayableFilters(
      { search: appliedSearch, pageSize },
      page,
    ),
  );
  const report = reportQuery.data?.data;
  const totalPages = Math.max(
    1,
    Math.ceil((report?.total ?? 0) / (report?.pageSize ?? pageSize)),
  );

  /** Applies search and page-size changes and returns to the first page. */
  function applyFilters(): void {
    setAppliedSearch(draftFilters.search.trim());
    setPageSize(draftFilters.pageSize);
    setPage(1);
  }

  /** Clears the search and restores the default page size. */
  function resetFilters(): void {
    setDraftFilters(defaultFilters);
    setAppliedSearch("");
    setPageSize(defaultFilters.pageSize);
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
          <h1>Supplier payable report</h1>
          <p>Review suppliers with a positive payable balance calculated from ledger entries.</p>
        </div>
      </div>

      <section className="management-card">
        <ReportSearchFilter
          disabled={reportQuery.isFetching}
          onApply={applyFilters}
          onChange={setDraftFilters}
          onReset={resetFilters}
          values={draftFilters}
        />
      </section>

      <section className="management-card">
        {reportQuery.isPending ? <p>Loading supplier payable report...</p> : null}
        {reportQuery.isError ? (
          <p className="error-message">Could not load the supplier payable report.</p>
        ) : null}

        {report ? (
          <>
            <div className="table-scroll">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>Supplier code</th>
                    <th>Supplier</th>
                    <th>Phone</th>
                    <th>Payable</th>
                  </tr>
                </thead>
                <tbody>
                  {report.items.map((row) => (
                    <tr key={row.supplierId}>
                      <td>{row.supplierCode}</td>
                      <td>{row.supplierName}</td>
                      <td>{row.phone ?? "-"}</td>
                      <td>PKR {row.payableAmount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {report.items.length === 0 ? (
              <p>No suppliers with payable balances matched this search.</p>
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
