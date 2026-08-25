import { useMemo, useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import { currentBusinessDate, formatStatusLabel } from "../../../lib/utils.ts";
import type { AttendanceRecord, AttendanceStatus, CreateAttendanceInput, Employee, UpdateAttendanceInput } from "../api/employees.api.ts";
import { useAttendanceForEmployees, useCreateAttendanceBulk, useEmployees, useUpdateAttendance } from "../hooks/use-employees.ts";

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

/** Returns true when an attendance status represents time actually worked. */
function isWorkingAttendanceStatus(status: AttendanceStatus): boolean {
  return status === "PRESENT" || status === "HALF_DAY";
}

/** Converts one HH:MM time value into minutes after midnight for local validation. */
function attendanceTimeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

/** Returns the first attendance-detail problem that would contradict the selected status. */
function attendanceDraftError(draft: AttendanceDraft): string | null {
  if (!isWorkingAttendanceStatus(draft.status)) {
    if (draft.checkIn || draft.checkOut || draft.workedHours) {
      return `${formatStatusLabel(draft.status)} attendance cannot contain check-in, check-out, or worked hours.`;
    }
    return null;
  }

  if (!draft.checkIn) return "Check-in time is required for present and half-day attendance.";
  if (!draft.checkOut) return "Check-out time is required for present and half-day attendance.";

  const workedHours = Number(draft.workedHours);
  if (!draft.workedHours || !Number.isFinite(workedHours) || workedHours <= 0) {
    return "Worked hours must be greater than zero for present and half-day attendance.";
  }

  const checkInMinutes = attendanceTimeToMinutes(draft.checkIn);
  const checkOutMinutes = attendanceTimeToMinutes(draft.checkOut);
  if (checkOutMinutes <= checkInMinutes) return "Check-out time must be later than check-in time.";

  if (workedHours * 60 > checkOutMinutes - checkInMinutes) {
    return "Worked hours cannot exceed the time between check-in and check-out.";
  }

  return null;
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

/** Converts one saved attendance row into editable grid values. */
function attendanceToDraft(attendance: AttendanceRecord): AttendanceDraft {
  const workingStatus = isWorkingAttendanceStatus(attendance.status);
  return {
    status: attendance.status,
    checkIn: workingStatus ? attendance.checkIn?.slice(0, 5) ?? "" : "",
    checkOut: workingStatus ? attendance.checkOut?.slice(0, 5) ?? "" : "",
    workedHours: workingStatus ? attendance.workedHours ?? "" : "",
    notes: attendance.notes ?? "",
  };
}

/** Reads one API error without hiding the backend's business message. */
function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Attendance could not be saved.";
}

/** Renders one editable row in the daily attendance grid. */
function AttendanceRow({
  attendanceDate,
  employee,
  existing,
  draft,
  hasChanges,
  correctionPending,
  onChange,
  onSaveCorrection,
}: {
  attendanceDate: string;
  employee: Employee;
  existing: AttendanceRecord | null;
  draft: AttendanceDraft;
  hasChanges: boolean;
  correctionPending: boolean;
  onChange: (changes: Partial<AttendanceDraft>) => void;
  onSaveCorrection: () => void;
}): React.JSX.Element {
  const workDetailsDisabled = correctionPending || !isWorkingAttendanceStatus(draft.status);

  return (
    <tr>
      <td>{employee.employeeCode}</td>
      <td>{employee.name}</td>
      <td>{employee.department ?? "—"}</td>
      <td>
        <select
          aria-label={`Attendance status for ${employee.name} on ${attendanceDate}`}
          disabled={correctionPending}
          onChange={(event) => {
            const status = event.target.value as AttendanceStatus;
            onChange(isWorkingAttendanceStatus(status)
              ? { status }
              : { status, checkIn: "", checkOut: "", workedHours: "" });
          }}
          value={draft.status}
        >
          {attendanceStatuses.map((status) => (
            <option key={status} value={status}>{formatStatusLabel(status)}</option>
          ))}
        </select>
      </td>
      <td><input disabled={workDetailsDisabled} onChange={(event) => onChange({ checkIn: event.target.value })} type="time" value={draft.checkIn} /></td>
      <td><input disabled={workDetailsDisabled} onChange={(event) => onChange({ checkOut: event.target.value })} type="time" value={draft.checkOut} /></td>
      <td><input disabled={workDetailsDisabled} max="24" min="0" onChange={(event) => onChange({ workedHours: event.target.value })} step="0.25" type="number" value={draft.workedHours} /></td>
      <td><input disabled={correctionPending} maxLength={500} onChange={(event) => onChange({ notes: event.target.value })} type="text" value={draft.notes} /></td>
      <td>
        {existing ? (
          <Button
            disabled={!hasChanges || correctionPending}
            label={correctionPending ? "Saving..." : "Save correction"}
            onClick={onSaveCorrection}
          />
        ) : "New"}
      </td>
    </tr>
  );
}

/** Shows the paginated daily attendance grid for employees valid on the selected business date. */
export function AttendancePage(): React.JSX.Element {
  const today = currentBusinessDate();
  const [attendanceDate, setAttendanceDate] = useState(today);
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
  const updateAttendance = useUpdateAttendance();
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

  /** Reads the date-specific draft so saved rows begin with their persisted values. */
  function readDraft(employeeId: string): AttendanceDraft {
    const key = `${attendanceDate}:${employeeId}`;
    const existing = existingByEmployee.get(employeeId);
    return drafts[key] ?? (existing ? attendanceToDraft(existing) : defaultDraft());
  }

  /** Returns true after one saved attendance row has been edited locally. */
  function hasDraftChanges(employeeId: string): boolean {
    return drafts[`${attendanceDate}:${employeeId}`] !== undefined;
  }

  /** Saves one field change for the selected date and employee. */
  function updateDraft(employeeId: string, changes: Partial<AttendanceDraft>): void {
    const key = `${attendanceDate}:${employeeId}`;
    const existing = existingByEmployee.get(employeeId);
    setDrafts((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? (existing ? attendanceToDraft(existing) : defaultDraft())),
        ...changes,
      },
    }));
  }

  /** Converts one grid draft into the strict create API contract. */
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

  /** Converts one edited saved row into the correction API contract. */
  function toUpdateInput(employeeId: string): UpdateAttendanceInput {
    const draft = readDraft(employeeId);
    return {
      status: draft.status,
      checkIn: draft.checkIn || null,
      checkOut: draft.checkOut || null,
      workedHours: draft.workedHours || null,
      notes: draft.notes.trim() || null,
    };
  }

  /** Saves one correction and clears only that row's local draft after success. */
  async function saveCorrection(employee: Employee, attendanceId: string): Promise<void> {
    setSaveError(null);
    const draft = readDraft(employee.id);
    const validationError = attendanceDraftError(draft);

    if (validationError) {
      setSaveError(`${employee.employeeCode}: ${validationError}`);
      return;
    }

    try {
      await updateAttendance.mutateAsync({
        attendanceId,
        input: toUpdateInput(employee.id),
      });
      const key = `${attendanceDate}:${employee.id}`;
      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    } catch (error) {
      setSaveError(errorMessage(error));
    }
  }

  /** Saves only rows that do not already have attendance for the selected date. */
  async function saveAttendance(): Promise<void> {
    setSaveError(null);

    for (const employee of unrecordedEmployees) {
      const validationError = attendanceDraftError(readDraft(employee.id));
      if (validationError) {
        setSaveError(`${employee.employeeCode}: ${validationError}`);
        return;
      }
    }

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
          disabled={attendanceDate.length === 0 || attendanceDate > today || employees.length === 0 || unrecordedEmployees.length === 0 || attendancePending || attendanceFailed || createBulk.isPending}
          label={createBulk.isPending ? "Saving..." : "Save attendance"}
          onClick={() => void saveAttendance()}
        />
      </div>

      <section className="management-card employee-attendance-card">
        <div className="employee-attendance-controls">
          <label className="ui-field">
            <span>Attendance date</span>
            <input
              max={today}
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
                    correctionPending={updateAttendance.isPending}
                    draft={readDraft(employee.id)}
                    employee={employee}
                    existing={existingByEmployee.get(employee.id) ?? null}
                    hasChanges={hasDraftChanges(employee.id)}
                    key={employee.id}
                    onChange={(changes) => updateDraft(employee.id, changes)}
                    onSaveCorrection={() => {
                      const existing = existingByEmployee.get(employee.id);
                      if (existing) void saveCorrection(employee, existing.id);
                    }}
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
