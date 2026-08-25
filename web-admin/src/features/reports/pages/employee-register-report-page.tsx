import { useState } from "react";

import { formatBusinessDate, formatMoney } from "../../../lib/utils.ts";
import type { EmployeeRegisterReportFilters } from "../api/reports.api.ts";
import {
  ReportSearchFilter,
  type ReportSearchFilterValues,
} from "../components/report-filters.tsx";
import { useEmployeeRegisterReport } from "../hooks/use-reports.ts";

const defaultFilters: ReportSearchFilterValues = { search: "", pageSize: 20 };

function createFilters(
  values: ReportSearchFilterValues,
  page: number,
): EmployeeRegisterReportFilters {
  return {
    search: values.search.trim() || undefined,
    page,
    pageSize: values.pageSize,
  };
}

/** Shows the Employee Register with current derived salary and advance balances. */
export function EmployeeRegisterReportPage(): React.JSX.Element {
  const [draftFilters, setDraftFilters] = useState(defaultFilters);
  const [appliedSearch, setAppliedSearch] = useState("");
  const [pageSize, setPageSize] = useState(defaultFilters.pageSize);
  const [page, setPage] = useState(1);
  const reportQuery = useEmployeeRegisterReport(
    createFilters({ search: appliedSearch, pageSize }, page),
  );
  const report = reportQuery.data?.data;
  const totalPages = Math.max(
    1,
    Math.ceil((report?.total ?? 0) / (report?.pageSize ?? pageSize)),
  );

  function applyFilters(): void {
    setAppliedSearch(draftFilters.search.trim());
    setPageSize(draftFilters.pageSize);
    setPage(1);
  }

  function resetFilters(): void {
    setDraftFilters(defaultFilters);
    setAppliedSearch("");
    setPageSize(defaultFilters.pageSize);
    setPage(1);
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Employee register</h1>
          <p>Review employee master data with current derived salary payable and advance outstanding.</p>
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
        {reportQuery.isPending ? <p>Loading employee register...</p> : null}
        {reportQuery.isError ? <p className="error-message">Could not load the employee register.</p> : null}
        {report ? (
          <>
            <div className="table-scroll">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>Code</th><th>Employee</th><th>Job title</th><th>Department</th><th>Join date</th><th>Status</th><th>Base salary</th><th>Salary payable</th><th>Advance outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {report.items.map((row) => (
                    <tr key={row.employeeId}>
                      <td>{row.employeeCode}</td>
                      <td>{row.employeeName}</td>
                      <td>{row.jobTitle ?? "-"}</td>
                      <td>{row.department ?? "-"}</td>
                      <td>{formatBusinessDate(row.joinDate)}</td>
                      <td>{row.isActive ? "Active" : "Inactive"}</td>
                      <td>{formatMoney(row.baseMonthlySalary)}</td>
                      <td>{formatMoney(row.salaryPayable)}</td>
                      <td>{formatMoney(row.advanceOutstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.items.length === 0 ? <p>No employees matched this search.</p> : null}
            <div className="pagination-row">
              <p>Page {report.page} of {totalPages} · {report.total} employees</p>
              <div className="form-actions">
                <button className="secondary-button" disabled={report.page <= 1 || reportQuery.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">Previous</button>
                <button className="secondary-button" disabled={report.page >= totalPages || reportQuery.isFetching} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} type="button">Next</button>
              </div>
            </div>
          </>
        ) : null}
      </section>
    </section>
  );
}
