import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { Dialog } from "../../../components/ui/dialog.tsx";
import type { EmployeeListFilters } from "../api/employees.api.ts";
import { EmployeeForm } from "../components/employee-form.tsx";
import { EmployeeTable } from "../components/employee-table.tsx";
import { useEmployees } from "../hooks/use-employees.ts";

const pageSize = 20;

type ActiveFilter = "all" | "active" | "inactive";

/** Shows the searchable, paginated Employee Master list and Add Employee popup. */
export function EmployeeListPage(): React.JSX.Element {
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [page, setPage] = useState(1);
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);

  const filters: EmployeeListFilters = {
    search: search || undefined,
    active: activeFilter === "all" ? undefined : activeFilter === "active",
    page,
    pageSize,
  };
  const employeesQuery = useEmployees(filters);
  const result = employeesQuery.data?.data;
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  /** Applies the current employee search text. */
  function applySearch(): void {
    setSearch(draftSearch.trim());
    setPage(1);
  }

  /** Clears employee filters and returns to the first page. */
  function resetFilters(): void {
    setDraftSearch("");
    setSearch("");
    setActiveFilter("all");
    setPage(1);
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Employee Management</p>
          <h1>Employees</h1>
          <p>Maintain employee master data for attendance, leave, advances, and payroll.</p>
        </div>
        <Button label="Add employee" onClick={() => setIsAddEmployeeOpen(true)} />
      </div>

      <section className="management-card employee-list-card">
        <div className="employee-filters">
          <label className="ui-field">
            <span>Search</span>
            <input
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder="Code, name, phone, CNIC, job title, department"
              type="search"
              value={draftSearch}
            />
          </label>

          <label className="ui-field">
            <span>Status</span>
            <select
              onChange={(event) => {
                setActiveFilter(event.target.value as ActiveFilter);
                setPage(1);
              }}
              value={activeFilter}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>

          <div className="form-actions">
            <Button disabled={employeesQuery.isFetching} label="Search" onClick={applySearch} />
            <Button disabled={employeesQuery.isFetching} label="Reset" onClick={resetFilters} />
          </div>
        </div>

        {employeesQuery.isPending ? <p>Loading employees...</p> : null}
        {employeesQuery.isError ? <p className="error-message">Could not load employees.</p> : null}
        {result ? <EmployeeTable employees={result.items} /> : null}

        {result ? (
          <div className="pagination-row">
            <p>Page {page} of {totalPages} · {result.total} employees</p>
            <div className="form-actions">
              <Button
                disabled={page <= 1 || employeesQuery.isFetching}
                label="Previous"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              />
              <Button
                disabled={page >= totalPages || employeesQuery.isFetching}
                label="Next"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              />
            </div>
          </div>
        ) : null}
      </section>

      <Dialog
        isOpen={isAddEmployeeOpen}
        onClose={() => setIsAddEmployeeOpen(false)}
        title="Add employee"
        wide
      >
        <EmployeeForm
          onCancel={() => setIsAddEmployeeOpen(false)}
          onSaved={() => setIsAddEmployeeOpen(false)}
        />
      </Dialog>
    </section>
  );
}
