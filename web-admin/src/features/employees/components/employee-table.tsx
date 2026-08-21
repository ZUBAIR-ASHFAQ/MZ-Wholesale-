import { Link } from "@tanstack/react-router";

import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import { formatMoney } from "../../../lib/utils.ts";
import type { Employee } from "../api/employees.api.ts";

interface EmployeeTableProps {
  employees: Employee[];
}

/** Displays nullable employee text without exposing technical null values. */
function displayValue(value: string | null): string {
  return value ?? "—";
}

/** Displays Employee Master rows and their detail action. */
export function EmployeeTable({ employees }: EmployeeTableProps): React.JSX.Element {
  if (employees.length === 0) {
    return <p>No employees match the selected filters.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="ui-table employee-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Job title</th>
            <th>Department</th>
            <th>Phone</th>
            <th>Base salary</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <tr key={employee.id}>
              <td>{employee.employeeCode}</td>
              <td>{employee.name}</td>
              <td>{displayValue(employee.jobTitle)}</td>
              <td>{displayValue(employee.department)}</td>
              <td>{displayValue(employee.phone)}</td>
              <td>{formatMoney(employee.baseMonthlySalary)}</td>
              <td><StatusBadge status={employee.isActive ? "ACTIVE" : "INACTIVE"} /></td>
              <td>
                <Link
                  className="text-link"
                  params={{ employeeId: employee.id }}
                  to="/employees/$employeeId"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
