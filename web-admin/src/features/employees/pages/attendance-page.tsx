import { useMemo, useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import { currentBusinessDate, formatStatusLabel } from "../../../lib/utils.ts";
import type { AttendanceRecord, AttendanceStatus, CreateAttendanceInput, Employee } from "../api/employees.api.ts";
import { useAttendanceForEmployees, useCreateAttendanceBulk, useEmployees } from "../hooks/use-employees.ts";

const pageSize = 25;

const attendanceStatuses: AttendanceStatus[] = [
  "PRESENT",
  "ABSENT",
  "HALF_DAY",
  "LEAVE",
  "HOLIDAY",
  "WEEKLY_OFF",
];

interface AttendanceDraft {
  status: AttendanceStatus;
  checkIn: string;
  checkOut: string;
  workedHours: string;
  notes: string;
}

/** Returns the default manual attendance values for an unrecorded employee. */
function defaultDraft(): AttendanceDraft {
  return {
    status: "PRESENT",
    checkIn: "",
    checkOut: "",
    workedHours: "",
    notes: "",
  };
}

/** Reads one API error without hiding the backend's business message. */
function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Attendance could not be saved.";
}

/** Renders one row in the daily attendance grid. */
function AttendanceRow({
  attendanceDate,
  employee,
  existing,
  draft,
  onChange,
}: {
  attendanceDate: string;
  employee: Employee;
  existing: AttendanceRecord | null;
  draft: AttendanceDraft;
  onChange: (changes: Partial<AttendanceDraft>) => void;
}): React.JSX.Element {
  const disabled = existing !== null;
  const values: AttendanceDraft = existing
    ? {
        status: existing.status,
        checkIn: existing.checkIn?.slice(0, 5) ?? "",
        checkOut: existing.checkOut?.slice(0, 5) ?? "",
        workedHours: existing.workedHours ?? "",
        notes: existing.notes ?? "",
      }
    : draft;

  return (
    <tr>
      <td>{employee.employeeCode}</td>
      <td>{employee.name}</td>
      <td>{employee.department ?? "—"}</td>
      <td>
        <select
          aria-label={`Attendance status for ${employee.name} on ${attendanceDate}`}
          disabled={disabled}
          onChange={(event) => onChange({ status: event.target.value as AttendanceStatus })}
          value={values.status}
        >
          {attendanceStatuses.map((status) => (
            <option key={status} value={status}>{formatStatusLabel(status)}</option>
          ))}
        </select>
      </td>
      <td><input disabled={disabled} onChange={(event) => onChange({ checkIn: event.target.value })} type="time" value={values.checkIn} /></td>
      <td><input disabled={disabled} onChange={(event) => onChange({ checkOut: event.target.value })} type="time" value={values.checkOut} /></td>
      <td><input disabled={disabled} max="24" min="0" onChange={(event) => onChange({ workedHours: event.target.value })} step="0.25" type="number" value={values.workedHours} /></td>
      <td><input disabled={disabled} maxLength={500} onChange={(event) => onChange({ notes: event.target.value })} type="text" value={values.notes} /></td>
      <td>{existing ? "Saved" : "New"}</td>
    </tr>
  );
}

/** Shows the paginated daily attendance grid for employees valid on the selected business date. */
export function AttendancePage(): React.JSX.Element {
  const [attendanceDate, setAttendanceDate] = useState(currentBusinessDate());
  const [page, setPage] = useState(1);
  const [drafts, setDrafts] = useState<Record<string, AttendanceDraft>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const employeesQuery = useEmployees({ employmentDate: attendanceDate, page, pageSize });
  const result = employeesQuery.data?.data;
  const employees = result?.items ?? [];
  const attendanceQueries = useAttendanceForEmployees(
    employees.map((employee) => employee.id),
    attendanceDate,
  );
  const createBulk = useCreateAttendanceBulk();
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));
  const attendancePending = attendanceQueries.some((query) => query.isPending);
  const attendanceFailed = attendanceQueries.some((query) => query.isError);
  const existingByEmployee = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();

    employees.forEach((employee, index) => {
      const record = attendanceQueries[index]?.data?.data.items[0];
      if (record) map.set(employee.id, record);
    });

    return map;
  }, [attendanceQueries, employees]);
  const unrecordedEmployees = employees.filter((employee) => !existingByEmployee.has(employee.id));

  /** Reads the date-specific draft so values never leak between attendance dates. */
  function readDraft(employeeId: string): AttendanceDraft {
    return drafts[`${attendanceDate}:${employeeId}`] ?? defaultDraft();
  }

  /** Saves one field change for the selected date and employee. */
  function updateDraft(employeeId: string, changes: Partial<AttendanceDraft>): void {
    const key = `${attendanceDate}:${employeeId}`;
    setDrafts((current) => ({
      ...current,
      [key]: { ...(current[key] ?? defaultDraft()), ...changes },
    }));
  }

  /** Converts one grid draft into the strict API contract. */
  function toInput(employee: Employee): CreateAttendanceInput {
    const draft = readDraft(employee.id);
    return {
      employeeId: employee.id,
      attendanceDate,
      status: draft.status,
      checkIn: draft.checkIn || null,
      checkOut: draft.checkOut || null,
      workedHours: draft.workedHours || null,
      notes: draft.notes.trim() || null,
    };
  }

  /** Saves only rows that do not already have attendance for the selected date. */
  async function saveAttendance(): Promise<void> {
    setSaveError(null);

    try {
      await createBulk.mutateAsync(unrecordedEmployees.map(toInput));
    } catch (error) {
      setSaveError(errorMessage(error));
    }
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Employee Management</p>
          <h1>Attendance</h1>
          <p>Record daily attendance for employees valid on the selected business date.</p>
        </div>
        <Button
          disabled={attendanceDate.length === 0 || employees.length === 0 || unrecordedEmployees.length === 0 || attendancePending || attendanceFailed || createBulk.isPending}
          label={createBulk.isPending ? "Saving..." : "Save attendance"}
          onClick={() => void saveAttendance()}
        />
      </div>

      <section className="management-card employee-attendance-card">
        <div className="employee-attendance-controls">
          <label className="ui-field">
            <span>Attendance date</span>
            <input
              onChange={(event) => {
                setAttendanceDate(event.target.value);
                setPage(1);
                setSaveError(null);
              }}
              type="date"
              value={attendanceDate}
            />
          </label>
          <p>{result ? `${result.total} employees in employment range` : ""}</p>
        </div>

        {employeesQuery.isPending ? <p>Loading employees...</p> : null}
        {employeesQuery.isError ? <p className="error-message">Could not load employees.</p> : null}
        {attendancePending && employees.length > 0 ? <p>Loading saved attendance...</p> : null}
        {attendanceFailed ? <p className="error-message">Could not load saved attendance.</p> : null}
        {saveError ? <p className="error-message">{saveError}</p> : null}

        {result && employees.length === 0 ? <p>No employees are valid for this attendance date.</p> : null}
        {employees.length > 0 ? (
          <div className="table-scroll">
            <table className="ui-table employee-attendance-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Check in</th>
                  <th>Check out</th>
                  <th>Worked hours</th>
                  <th>Notes</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <AttendanceRow
                    attendanceDate={attendanceDate}
                    draft={readDraft(employee.id)}
                    employee={employee}
                    existing={existingByEmployee.get(employee.id) ?? null}
                    key={employee.id}
                    onChange={(changes) => updateDraft(employee.id, changes)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {result ? (
          <div className="pagination-row">
            <p>Page {page} of {totalPages}</p>
            <div className="form-actions">
              <Button disabled={page <= 1 || employeesQuery.isFetching} label="Previous" onClick={() => setPage((current) => Math.max(1, current - 1))} />
              <Button disabled={page >= totalPages || employeesQuery.isFetching} label="Next" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} />
            </div>
          </div>
        ) : null}
      </section>
    </section>
  );
}
