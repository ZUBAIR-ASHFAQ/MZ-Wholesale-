import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { Dialog } from "../../../components/ui/dialog.tsx";
import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import { formatBusinessDate, formatMoney } from "../../../lib/utils.ts";
import { EmployeeForm } from "../components/employee-form.tsx";
import { useEmployee } from "../hooks/use-employees.ts";

interface EmployeeDetailPageProps {
  employeeId: string;
}

/** Displays a nullable employee value without exposing technical null values. */
function displayValue(value: string | null): string {
  return value ?? "—";
}

/** Shows one employee master record and the edit/deactivate popup. */
export function EmployeeDetailPage({ employeeId }: EmployeeDetailPageProps): React.JSX.Element {
  const employeeQuery = useEmployee(employeeId);
  const [isEditOpen, setIsEditOpen] = useState(false);

  if (employeeQuery.isPending) {
    return <p>Loading employee...</p>;
  }

  if (employeeQuery.isError || !employeeQuery.data) {
    return <p className="error-message">Could not load this employee.</p>;
  }

  const employee = employeeQuery.data.data;

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Employee Management</p>
          <h1>{employee.name}</h1>
          <p>{employee.employeeCode} · Employee master profile</p>
        </div>
        <div className="form-actions">
          <Button label="Edit / deactivate" onClick={() => setIsEditOpen(true)} />
          <Link className="secondary-link" to="/employees">Back to employees</Link>
        </div>
      </div>

      <div className="employee-detail-grid">
        <section className="management-card">
          <h2>Employment</h2>
          <dl className="detail-list">
            <div><dt>Status</dt><dd><StatusBadge status={employee.isActive ? "ACTIVE" : "INACTIVE"} /></dd></div>
            <div><dt>Employee code</dt><dd>{employee.employeeCode}</dd></div>
            <div><dt>Job title</dt><dd>{displayValue(employee.jobTitle)}</dd></div>
            <div><dt>Department</dt><dd>{displayValue(employee.department)}</dd></div>
            <div><dt>Employment type</dt><dd>{employee.employmentType}</dd></div>
            <div><dt>Join date</dt><dd>{formatBusinessDate(employee.joinDate)}</dd></div>
            <div><dt>Leave date</dt><dd>{formatBusinessDate(employee.leaveDate)}</dd></div>
            <div><dt>Base monthly salary</dt><dd>{formatMoney(employee.baseMonthlySalary)}</dd></div>
          </dl>
        </section>

        <section className="management-card">
          <h2>Contact & identity</h2>
          <dl className="detail-list">
            <div><dt>Father / spouse</dt><dd>{displayValue(employee.fatherSpouseName)}</dd></div>
            <div><dt>Phone</dt><dd>{displayValue(employee.phone)}</dd></div>
            <div><dt>Email</dt><dd>{displayValue(employee.email)}</dd></div>
            <div><dt>CNIC / reference ID</dt><dd>{displayValue(employee.referenceId)}</dd></div>
            <div><dt>Emergency contact</dt><dd>{displayValue(employee.emergencyContact)}</dd></div>
            <div><dt>Address</dt><dd>{displayValue(employee.address)}</dd></div>
          </dl>
        </section>
      </div>

      <Dialog
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit employee"
        wide
      >
        <EmployeeForm
          employee={employee}
          onCancel={() => setIsEditOpen(false)}
          onSaved={() => setIsEditOpen(false)}
        />
      </Dialog>
    </section>
  );
}
