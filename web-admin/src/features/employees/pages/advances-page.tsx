import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { Dialog } from "../../../components/ui/dialog.tsx";
import type {
  EmployeeAdvance,
  EmployeeAdvanceListFilters,
} from "../api/employees.api.ts";
import { AdvanceForm } from "../components/advance-form.tsx";
import { AdvanceRecoveryForm } from "../components/advance-recovery-form.tsx";
import { useAllEmployees, useEmployeeAdvances } from "../hooks/use-employees.ts";

const pageSize = 20;

/** Shows Employee Advances, derived outstanding balances and direct recovery actions. */
export function AdvancesPage(): React.JSX.Element {
  const [employeeId, setEmployeeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [appliedFilters, setAppliedFilters] = useState<EmployeeAdvanceListFilters>({
    page: 1,
    pageSize,
  });
  const [isAdvanceOpen, setIsAdvanceOpen] = useState(false);
  const [recoveryAdvance, setRecoveryAdvance] = useState<EmployeeAdvance | null>(null);

  const employeesQuery = useAllEmployees();
  const advancesQuery = useEmployeeAdvances(appliedFilters);
  const employees = employeesQuery.data ?? [];
  const result = advancesQuery.data?.data;
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  /** Applies visible advance filters and returns to page one. */
  function applyFilters(): void {
    setPage(1);
    setAppliedFilters({
      employeeId: employeeId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page: 1,
      pageSize,
    });
  }

  /** Clears every advance filter. */
  function clearFilters(): void {
    setEmployeeId("");
    setStartDate("");
    setEndDate("");
    setPage(1);
    setAppliedFilters({ page: 1, pageSize });
  }

  /** Changes page while preserving the applied filters. */
  function changePage(nextPage: number): void {
    setPage(nextPage);
    setAppliedFilters((current) => ({ ...current, page: nextPage }));
  }

  /** Closes the direct recovery popup. */
  function closeRecovery(): void {
    setRecoveryAdvance(null);
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Employee Management</p>
          <h1>Advances</h1>
          <p>Track employee advances and their derived outstanding amounts.</p>
        </div>
        <Button label="New advance" onClick={() => setIsAdvanceOpen(true)} />
      </div>

      <section className="management-card">
        <div className="payment-filter-grid">
          <label className="ui-field">
            <span>Employee</span>
            <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
              <option value="">All employees</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.employeeCode} · {employee.name}
                </option>
              ))}
            </select>
          </label>

          <label className="ui-field">
            <span>Start date</span>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>

          <label className="ui-field">
            <span>End date</span>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
        </div>

        <div className="form-actions">
          <Button disabled={advancesQuery.isFetching} label="Apply filters" onClick={applyFilters} />
          <Button disabled={advancesQuery.isFetching} label="Clear" onClick={clearFilters} />
        </div>
      </section>

      <section className="management-card employee-list-card">
        {employeesQuery.isError ? (
          <p className="error-message">Employee filter options could not be loaded.</p>
        ) : null}
        {advancesQuery.isPending ? <p>Loading employee advances...</p> : null}
        {advancesQuery.isError ? <p className="error-message">Could not load employee advances.</p> : null}

        {result && result.items.length === 0 ? <p>No employee advances found.</p> : null}
        {result && result.items.length > 0 ? (
          <div className="table-scroll">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Advance</th>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Original</th>
                  <th>Recovered</th>
                  <th>Outstanding</th>
                  <th>Method</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((advance) => (
                  <tr key={advance.id}>
                    <td><strong>{advance.advanceNumber}</strong></td>
                    <td><strong>{advance.employeeName}</strong><br /><small>{advance.employeeCode}</small></td>
                    <td>{advance.advanceDate}</td>
                    <td>PKR {advance.originalAmount}</td>
                    <td>PKR {advance.recoveredAmount}</td>
                    <td><strong>PKR {advance.outstandingAmount}</strong></td>
                    <td>{advance.paymentMethod === "CASH" ? "Cash" : "Bank transfer"}</td>
                    <td>
                      <Button
                        disabled={advance.outstandingAmount === "0.00"}
                        label="Recover"
                        onClick={() => setRecoveryAdvance(advance)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {result ? (
          <div className="pagination-row">
            <p>Page {page} of {totalPages} · {result.total} advances</p>
            <div className="form-actions">
              <Button
                disabled={page <= 1 || advancesQuery.isFetching}
                label="Previous"
                onClick={() => changePage(Math.max(1, page - 1))}
              />
              <Button
                disabled={page >= totalPages || advancesQuery.isFetching}
                label="Next"
                onClick={() => changePage(Math.min(totalPages, page + 1))}
              />
            </div>
          </div>
        ) : null}
      </section>

      <Dialog
        isOpen={isAdvanceOpen}
        onClose={() => setIsAdvanceOpen(false)}
        title="New advance"
        wide
      >
        <AdvanceForm
          employees={employees}
          onCancel={() => setIsAdvanceOpen(false)}
          onSaved={() => setIsAdvanceOpen(false)}
        />
      </Dialog>

      <Dialog
        isOpen={recoveryAdvance !== null}
        onClose={closeRecovery}
        title="Recover advance"
        wide
      >
        {recoveryAdvance ? (
          <AdvanceRecoveryForm
            advance={recoveryAdvance}
            onCancel={closeRecovery}
            onSaved={closeRecovery}
          />
        ) : null}
      </Dialog>
    </section>
  );
}
