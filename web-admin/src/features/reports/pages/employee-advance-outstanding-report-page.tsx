import { useState } from "react";

import { formatMoney } from "../../../lib/utils.ts";
import type { EmployeeAdvanceOutstandingReportFilters } from "../api/reports.api.ts";
import { ReportSearchFilter, type ReportSearchFilterValues } from "../components/report-filters.tsx";
import { useEmployeeAdvanceOutstandingReport } from "../hooks/use-reports.ts";

const defaultFilters: ReportSearchFilterValues = { search: "", pageSize: 20 };

function createFilters(values: ReportSearchFilterValues, page: number): EmployeeAdvanceOutstandingReportFilters {
  return { search: values.search.trim() || undefined, page, pageSize: values.pageSize };
}

/** Shows current Employee Advance Outstanding derived from original advances and recoveries. */
export function EmployeeAdvanceOutstandingReportPage(): React.JSX.Element {
  const [draftFilters, setDraftFilters] = useState(defaultFilters);
  const [appliedSearch, setAppliedSearch] = useState("");
  const [pageSize, setPageSize] = useState(defaultFilters.pageSize);
  const [page, setPage] = useState(1);
  const reportQuery = useEmployeeAdvanceOutstandingReport(createFilters({ search: appliedSearch, pageSize }, page));
  const report = reportQuery.data?.data;
  const totalPages = Math.max(1, Math.ceil((report?.total ?? 0) / (report?.pageSize ?? pageSize)));

  function applyFilters(): void { setAppliedSearch(draftFilters.search.trim()); setPageSize(draftFilters.pageSize); setPage(1); }
  function resetFilters(): void { setDraftFilters(defaultFilters); setAppliedSearch(""); setPageSize(defaultFilters.pageSize); setPage(1); }

  return <section>
    <div className="page-heading-row"><div><p className="eyebrow">Reports</p><h1>Employee advance outstanding</h1><p>Review current employee advance balances from immutable advances and recoveries.</p></div></div>
    <section className="management-card"><ReportSearchFilter disabled={reportQuery.isFetching} onApply={applyFilters} onChange={setDraftFilters} onReset={resetFilters} values={draftFilters} /></section>
    <section className="management-card">
      {reportQuery.isPending ? <p>Loading employee advance outstanding...</p> : null}
      {reportQuery.isError ? <p className="error-message">Could not load employee advance outstanding.</p> : null}
      {report ? <><div className="table-scroll"><table className="ui-table"><thead><tr><th>Code</th><th>Employee</th><th>Original advances</th><th>Recovered</th><th>Outstanding</th></tr></thead><tbody>{report.items.map((row) => <tr key={row.employeeId}><td>{row.employeeCode}</td><td>{row.employeeName}</td><td>{formatMoney(row.advanceOriginalAmount)}</td><td>{formatMoney(row.advanceRecoveredAmount)}</td><td><strong>{formatMoney(row.advanceOutstanding)}</strong></td></tr>)}</tbody></table></div>{report.items.length === 0 ? <p>No employee advance balances matched this search.</p> : null}<div className="pagination-row"><p>Page {report.page} of {totalPages} · {report.total} employees</p><div className="form-actions"><button className="secondary-button" disabled={report.page <= 1 || reportQuery.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">Previous</button><button className="secondary-button" disabled={report.page >= totalPages || reportQuery.isFetching} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} type="button">Next</button></div></div></> : null}
    </section>
  </section>;
}
