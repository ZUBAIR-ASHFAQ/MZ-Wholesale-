import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import { formatBusinessDate, formatMoney } from "../../../lib/utils.ts";
import type { PayrollRunListFilters, PayrollStatus } from "../api/employees.api.ts";
import { usePayrollRuns } from "../hooks/use-employees.ts";

const pageSize = 20;
type StatusFilter = "" | PayrollStatus;

/** Lists Payroll Runs and provides the single Payroll entry point in Employee navigation. */
export function PayrollPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusFilter>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<PayrollRunListFilters>({ page: 1, pageSize });
  const payrollQuery = usePayrollRuns(filters);
  const result = payrollQuery.data?.data;
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  /** Applies the visible Payroll Run filters. */
  function applyFilters(): void {
    setPage(1);
    setFilters({
      status: status || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page: 1,
      pageSize,
    });
  }

  /** Clears all Payroll Run filters. */
  function clearFilters(): void {
    setStatus("");
    setStartDate("");
    setEndDate("");
    setPage(1);
    setFilters({ page: 1, pageSize });
  }

  /** Changes the current page while preserving active filters. */
  function changePage(nextPage: number): void {
    setPage(nextPage);
    setFilters((current) => ({ ...current, page: nextPage }));
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Employee Management</p>
          <h1>Payroll</h1>
          <p>Create, recalculate and confirm payroll before paying salary from Payroll Detail.</p>
        </div>
        <Button label="New payroll draft" onClick={() => void navigate({ to: "/employees/payroll/new" })} />
      </div>

      <section className="management-card">
        <div className="payment-filter-grid">
          <label className="ui-field">
            <span>Status</span>
            <select onChange={(event) => setStatus(event.target.value as StatusFilter)} value={status}>
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="CONFIRMED">Confirmed</option>
            </select>
          </label>
          <label className="ui-field">
            <span>Period from</span>
            <input onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} />
          </label>
          <label className="ui-field">
            <span>Period to</span>
            <input onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} />
          </label>
        </div>
        <div className="form-actions">
          <Button disabled={payrollQuery.isFetching} label="Apply filters" onClick={applyFilters} />
          <Button disabled={payrollQuery.isFetching} label="Clear" onClick={clearFilters} />
        </div>
      </section>

      <section className="management-card employee-list-card">
        {payrollQuery.isPending ? <p>Loading payroll runs...</p> : null}
        {payrollQuery.isError ? <p className="error-message">Could not load payroll runs.</p> : null}
        {result?.items.length === 0 ? <p>No payroll runs found.</p> : null}
        {result && result.items.length > 0 ? (
          <div className="table-scroll">
            <table className="ui-table payroll-list-table">
              <thead>
                <tr><th>Payroll</th><th>Period</th><th>Status</th><th>Gross</th><th>Deductions</th><th>Advance recovery</th><th>Net salary</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {result.items.map((run) => (
                  <tr key={run.id}>
                    <td><strong>{run.payrollNumber}</strong></td>
                    <td>{formatBusinessDate(run.periodStart)} – {formatBusinessDate(run.periodEnd)}</td>
                    <td><StatusBadge status={run.status} /></td>
                    <td>{formatMoney(run.grossTotal)}</td>
                    <td>{formatMoney(run.attendanceDeductionTotal)}</td>
                    <td>{formatMoney(run.advanceRecoveryTotal)}</td>
                    <td><strong>{formatMoney(run.netTotal)}</strong></td>
                    <td>
                      <Link className="text-link" params={{ payrollRunId: run.id }} to="/employees/payroll/$payrollRunId">
                        {run.status === "DRAFT" ? "Open draft" : "View"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {result ? (
          <div className="pagination-row">
            <p>Page {page} of {totalPages} · {result.total} payroll runs</p>
            <div className="form-actions">
              <Button disabled={page <= 1 || payrollQuery.isFetching} label="Previous" onClick={() => changePage(Math.max(1, page - 1))} />
              <Button disabled={page >= totalPages || payrollQuery.isFetching} label="Next" onClick={() => changePage(Math.min(totalPages, page + 1))} />
            </div>
          </div>
        ) : null}
      </section>
    </section>
  );
}
