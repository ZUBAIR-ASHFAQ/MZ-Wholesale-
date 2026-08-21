import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { Dialog } from "../../../components/ui/dialog.tsx";
import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import type {
  EmployeeLeave,
  EmployeeLeaveListFilters,
  EmployeeLeaveStatus,
} from "../api/employees.api.ts";
import { LeaveForm } from "../components/leave-form.tsx";
import { LeaveTypeManager } from "../components/leave-type-manager.tsx";
import {
  useEmployeeLeaves,
  useAllEmployees,
  useLeaveTypes,
} from "../hooks/use-employees.ts";

const pageSize = 20;

type StatusFilter = "" | EmployeeLeaveStatus;

/** Shows Employee Leave records, filters, and the required Leave/Leave Type popups. */
export function LeavePage(): React.JSX.Element {
  const [employeeId, setEmployeeId] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [appliedFilters, setAppliedFilters] = useState<EmployeeLeaveListFilters>({ page: 1, pageSize });
  const [editingLeave, setEditingLeave] = useState<EmployeeLeave | null>(null);
  const [isLeaveOpen, setIsLeaveOpen] = useState(false);
  const [isLeaveTypesOpen, setIsLeaveTypesOpen] = useState(false);

  const employeesQuery = useAllEmployees();
  const leaveTypesQuery = useLeaveTypes();
  const leavesQuery = useEmployeeLeaves(appliedFilters);
  const employees = employeesQuery.data ?? [];
  const leaveTypes = leaveTypesQuery.data?.data ?? [];
  const result = leavesQuery.data?.data;
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  /** Applies visible Leave filters and returns to page one. */
  function applyFilters(): void {
    setPage(1);
    setAppliedFilters({
      employeeId: employeeId || undefined,
      leaveTypeId: leaveTypeId || undefined,
      status: status || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page: 1,
      pageSize,
    });
  }

  /** Clears every Leave filter. */
  function clearFilters(): void {
    setEmployeeId("");
    setLeaveTypeId("");
    setStatus("");
    setStartDate("");
    setEndDate("");
    setPage(1);
    setAppliedFilters({ page: 1, pageSize });
  }

  /** Changes page while preserving the applied Leave filters. */
  function changePage(nextPage: number): void {
    setPage(nextPage);
    setAppliedFilters((current) => ({ ...current, page: nextPage }));
  }

  /** Opens the Add Leave popup with no selected existing row. */
  function openNewLeave(): void {
    setEditingLeave(null);
    setIsLeaveOpen(true);
  }

  /** Opens the same Leave popup for one existing workflow row. */
  function openEditLeave(leave: EmployeeLeave): void {
    setEditingLeave(leave);
    setIsLeaveOpen(true);
  }

  /** Closes the Leave popup and clears its edit target. */
  function closeLeave(): void {
    setIsLeaveOpen(false);
    setEditingLeave(null);
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Employee Management</p>
          <h1>Leave</h1>
          <p>Manage paid/unpaid leave requests and approval status.</p>
        </div>
        <div className="form-actions">
          <Button label="Leave types" onClick={() => setIsLeaveTypesOpen(true)} />
          <Button label="Add leave" onClick={openNewLeave} />
        </div>
      </div>

      <section className="management-card">
        <div className="payment-filter-grid">
          <label className="ui-field">
            <span>Employee</span>
            <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
              <option value="">All employees</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.employeeCode} · {employee.name}</option>
              ))}
            </select>
          </label>

          <label className="ui-field">
            <span>Leave type</span>
            <select value={leaveTypeId} onChange={(event) => setLeaveTypeId(event.target.value)}>
              <option value="">All leave types</option>
              {leaveTypes.map((leaveType) => (
                <option key={leaveType.id} value={leaveType.id}>{leaveType.name}</option>
              ))}
            </select>
          </label>

          <label className="ui-field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
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
          <Button disabled={leavesQuery.isFetching} label="Apply filters" onClick={applyFilters} />
          <Button disabled={leavesQuery.isFetching} label="Clear" onClick={clearFilters} />
        </div>
      </section>

      <section className="management-card employee-list-card">
        {employeesQuery.isError || leaveTypesQuery.isError ? (
          <p className="error-message">Leave filter options could not be loaded.</p>
        ) : null}
        {leavesQuery.isPending ? <p>Loading employee leave...</p> : null}
        {leavesQuery.isError ? <p className="error-message">Could not load employee leave.</p> : null}

        {result && result.items.length === 0 ? <p>No employee leave records found.</p> : null}
        {result && result.items.length > 0 ? (
          <div className="table-scroll">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Employee</th><th>Leave type</th><th>Dates</th><th>Days</th><th>Status</th><th>Reason</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((leave) => (
                  <tr key={leave.id}>
                    <td><strong>{leave.employeeName}</strong><br /><small>{leave.employeeCode}</small></td>
                    <td>{leave.leaveTypeName}<br /><small>{leave.leaveTypeIsPaid ? "Paid" : "Unpaid"}</small></td>
                    <td>{leave.fromDate} → {leave.toDate}</td>
                    <td>{leave.days}</td>
                    <td><StatusBadge status={leave.status} /></td>
                    <td>{leave.reason}</td>
                    <td><Button label="Edit" onClick={() => openEditLeave(leave)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {result ? (
          <div className="pagination-row">
            <p>Page {page} of {totalPages} · {result.total} leave records</p>
            <div className="form-actions">
              <Button disabled={page <= 1 || leavesQuery.isFetching} label="Previous" onClick={() => changePage(Math.max(1, page - 1))} />
              <Button disabled={page >= totalPages || leavesQuery.isFetching} label="Next" onClick={() => changePage(Math.min(totalPages, page + 1))} />
            </div>
          </div>
        ) : null}
      </section>

      <Dialog isOpen={isLeaveTypesOpen} onClose={() => setIsLeaveTypesOpen(false)} title="Leave types" wide>
        <LeaveTypeManager />
      </Dialog>

      <Dialog isOpen={isLeaveOpen} onClose={closeLeave} title={editingLeave ? "Edit leave" : "Add leave"} wide>
        <LeaveForm employees={employees} leave={editingLeave} leaveTypes={leaveTypes} onCancel={closeLeave} onSaved={closeLeave} />
      </Dialog>
    </section>
  );
}
