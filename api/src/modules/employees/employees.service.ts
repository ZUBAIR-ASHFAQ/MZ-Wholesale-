import { AppError } from "../../shared/errors/app-error.js";
import {
  createAttendanceRecord as insertAttendanceRecord,
  createAttendanceRecords as insertAttendanceRecords,
  createEmployee as insertEmployee,
  findEmployeeById,
  findEmployeesByIds,
  listEmployeeAttendance as readEmployeeAttendance,
  listEmployees as readEmployees,
  updateEmployee as saveEmployeeChanges,
  type AttendanceRecord,
  type EmployeeChanges,
  type EmployeeRecord,
  type EmployeesDatabase,
  type PaginatedAttendanceRecords,
  type PaginatedEmployeeRecords,
} from "./employees.repository.js";
import type {
  CreateAttendanceBulkInput,
  CreateAttendanceInput,
  CreateEmployeeInput,
  ListEmployeeAttendanceQuery,
  ListEmployeesQuery,
  UpdateEmployeeInput,
} from "./employees.schema.js";

/** Removes surrounding spaces and converts blank optional text to null. */
function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

/** Creates a stable Employee Management error for the shared error handler. */
function employeeError(
  code: string,
  message: string,
  statusCode = 400,
  field?: string,
): AppError {
  return new AppError(
    code,
    message,
    statusCode,
    field ? [{ field, message }] : undefined,
  );
}

/** Loads one employee or throws the approved not-found error. */
async function requireEmployee(
  database: EmployeesDatabase,
  employeeId: string,
): Promise<EmployeeRecord> {
  const employee = await findEmployeeById(database, employeeId);

  if (!employee) {
    throw employeeError("EMPLOYEE_NOT_FOUND", "Employee was not found.", 404);
  }

  return employee;
}

/** Rejects an effective employment date range where leave date precedes join date. */
function validateEffectiveEmploymentDates(
  joinDate: string,
  leaveDate: string | null,
): void {
  if (leaveDate && leaveDate < joinDate) {
    throw employeeError(
      "INVALID_EMPLOYMENT_DATES",
      "Leave date cannot be before join date.",
      400,
      "leaveDate",
    );
  }
}


/** Reads a PostgreSQL error code without trusting the thrown value. */
function readPostgresCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  return typeof error.code === "string" ? error.code : null;
}

/** Reads a PostgreSQL constraint name without trusting the thrown value. */
function readPostgresConstraint(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("constraint" in error)) {
    return null;
  }

  return typeof error.constraint === "string" ? error.constraint : null;
}

/** Checks whether attendance already exists for the same employee and business date. */
function isAttendanceDuplicate(error: unknown): boolean {
  return (
    readPostgresCode(error) === "23505" &&
    readPostgresConstraint(error) === "attendance_records_employee_date_unique"
  );
}

/** Rejects attendance outside one employee's valid employment dates. */
function validateAttendanceEmploymentDate(
  employee: EmployeeRecord,
  attendanceDate: string,
  field = "attendanceDate",
): void {
  if (attendanceDate < employee.joinDate || (employee.leaveDate && attendanceDate > employee.leaveDate)) {
    throw employeeError(
      "ATTENDANCE_OUTSIDE_EMPLOYMENT_DATES",
      "Attendance date must fall within the employee's employment dates.",
      400,
      field,
    );
  }
}

/** Normalizes optional attendance text without converting numeric or time strings. */
function normalizeAttendanceText(value: string | null | undefined): string | null {
  return normalizeOptionalText(value);
}

/** Converts validated attendance input into the existing attendance table shape. */
function toAttendanceInsert(input: CreateAttendanceInput) {
  return {
    employeeId: input.employeeId,
    attendanceDate: input.attendanceDate,
    status: input.status,
    checkIn: input.checkIn ?? null,
    checkOut: input.checkOut ?? null,
    workedHours: input.workedHours ?? null,
    notes: normalizeAttendanceText(input.notes),
    source: "MANUAL",
  };
}

/** Copies only approved employee fields into a repository update object. */
function readEmployeeChanges(input: UpdateEmployeeInput): EmployeeChanges {
  const changes: EmployeeChanges = {};

  if (input.employeeCode !== undefined) changes.employeeCode = input.employeeCode.trim();
  if (input.name !== undefined) changes.name = input.name.trim();
  if (input.fatherSpouseName !== undefined) changes.fatherSpouseName = normalizeOptionalText(input.fatherSpouseName);
  if (input.phone !== undefined) changes.phone = normalizeOptionalText(input.phone);
  if (input.email !== undefined) changes.email = normalizeOptionalText(input.email);
  if (input.referenceId !== undefined) changes.referenceId = normalizeOptionalText(input.referenceId);
  if (input.address !== undefined) changes.address = normalizeOptionalText(input.address);
  if (input.emergencyContact !== undefined) changes.emergencyContact = normalizeOptionalText(input.emergencyContact);
  if (input.jobTitle !== undefined) changes.jobTitle = normalizeOptionalText(input.jobTitle);
  if (input.department !== undefined) changes.department = normalizeOptionalText(input.department);
  if (input.joinDate !== undefined) changes.joinDate = input.joinDate;
  if (input.leaveDate !== undefined) changes.leaveDate = input.leaveDate;
  if (input.employmentType !== undefined) changes.employmentType = input.employmentType.trim();
  if (input.baseMonthlySalary !== undefined) changes.baseMonthlySalary = input.baseMonthlySalary;
  if (input.isActive !== undefined) changes.isActive = input.isActive;

  return changes;
}

/** Lists employees with the approved search, status and pagination fields. */
export async function listEmployees(
  database: EmployeesDatabase,
  query: ListEmployeesQuery,
): Promise<PaginatedEmployeeRecords> {
  return readEmployees(database, query);
}

/** Creates one employee master record without creating any financial effect. */
export async function createEmployee(
  database: EmployeesDatabase,
  input: CreateEmployeeInput,
): Promise<EmployeeRecord> {
  validateEffectiveEmploymentDates(input.joinDate, input.leaveDate ?? null);

  const employee = await insertEmployee(database, {
    employeeCode: input.employeeCode.trim(),
    name: input.name.trim(),
    fatherSpouseName: normalizeOptionalText(input.fatherSpouseName),
    phone: normalizeOptionalText(input.phone),
    email: normalizeOptionalText(input.email),
    referenceId: normalizeOptionalText(input.referenceId),
    address: normalizeOptionalText(input.address),
    emergencyContact: normalizeOptionalText(input.emergencyContact),
    jobTitle: normalizeOptionalText(input.jobTitle),
    department: normalizeOptionalText(input.department),
    joinDate: input.joinDate,
    leaveDate: input.leaveDate ?? null,
    employmentType: input.employmentType.trim(),
    baseMonthlySalary: input.baseMonthlySalary,
    isActive: true,
  });

  if (!employee) {
    throw employeeError(
      "EMPLOYEE_CREATE_FAILED",
      "Employee could not be created.",
      500,
    );
  }

  return employee;
}

/** Loads one employee master record. */
export async function getEmployee(
  database: EmployeesDatabase,
  employeeId: string,
): Promise<EmployeeRecord> {
  return requireEmployee(database, employeeId);
}

/** Updates approved employee master fields or changes active status. */
export async function updateEmployee(
  database: EmployeesDatabase,
  employeeId: string,
  input: UpdateEmployeeInput,
): Promise<EmployeeRecord> {
  const existingEmployee = await requireEmployee(database, employeeId);
  const effectiveJoinDate = input.joinDate ?? existingEmployee.joinDate;
  const effectiveLeaveDate = input.leaveDate !== undefined
    ? input.leaveDate
    : existingEmployee.leaveDate;

  validateEffectiveEmploymentDates(effectiveJoinDate, effectiveLeaveDate);

  const updatedEmployee = await saveEmployeeChanges(
    database,
    employeeId,
    readEmployeeChanges(input),
  );

  if (!updatedEmployee) {
    throw employeeError(
      "EMPLOYEE_UPDATE_FAILED",
      "Employee could not be updated.",
      500,
    );
  }

  return updatedEmployee;
}

/** Lists one employee's attendance history after confirming the employee exists. */
export async function listEmployeeAttendance(
  database: EmployeesDatabase,
  employeeId: string,
  query: ListEmployeeAttendanceQuery,
): Promise<PaginatedAttendanceRecords> {
  await requireEmployee(database, employeeId);
  return readEmployeeAttendance(database, employeeId, query);
}

/** Creates one attendance row and rejects duplicate employee/date entries. */
export async function createAttendance(
  database: EmployeesDatabase,
  input: CreateAttendanceInput,
): Promise<AttendanceRecord> {
  const employee = await requireEmployee(database, input.employeeId);
  validateAttendanceEmploymentDate(employee, input.attendanceDate);

  try {
    const record = await insertAttendanceRecord(database, toAttendanceInsert(input));

    if (!record) {
      throw employeeError("ATTENDANCE_CREATE_FAILED", "Attendance could not be created.", 500);
    }

    return record;
  } catch (error) {
    if (isAttendanceDuplicate(error)) {
      throw employeeError(
        "DUPLICATE_ATTENDANCE",
        "Attendance already exists for this employee and date.",
        409,
        "attendanceDate",
      );
    }

    throw error;
  }
}

/** Creates one attendance batch after validating every employee/date before the insert. */
export async function createAttendanceBulk(
  database: EmployeesDatabase,
  input: CreateAttendanceBulkInput,
): Promise<AttendanceRecord[]> {
  const employeeIds = [...new Set(input.records.map((record) => record.employeeId))];
  const employees = await findEmployeesByIds(database, employeeIds);
  const employeesById = new Map(employees.map((employee) => [employee.id, employee]));

  input.records.forEach((record, index) => {
    const employee = employeesById.get(record.employeeId);

    if (!employee) {
      throw employeeError(
        "EMPLOYEE_NOT_FOUND",
        "Employee was not found.",
        404,
        `records.${index}.employeeId`,
      );
    }

    validateAttendanceEmploymentDate(employee, record.attendanceDate, `records.${index}.attendanceDate`);
  });

  try {
    const records = await insertAttendanceRecords(
      database,
      input.records.map(toAttendanceInsert),
    );

    if (records.length !== input.records.length) {
      throw employeeError("ATTENDANCE_BULK_CREATE_FAILED", "Attendance batch could not be created.", 500);
    }

    return records;
  } catch (error) {
    if (isAttendanceDuplicate(error)) {
      throw employeeError(
        "DUPLICATE_ATTENDANCE",
        "Attendance already exists for at least one employee and date.",
        409,
      );
    }

    throw error;
  }
}
