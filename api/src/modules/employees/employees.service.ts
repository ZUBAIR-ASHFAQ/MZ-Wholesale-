import { AppError } from "../../shared/errors/app-error.js";
import { currentBusinessDate } from "../../shared/utils/business-date.js";
import { reserveBusinessDocumentNumberInTransaction } from "../business-settings/index.js";
import { writeBankInflow, writeBankOutflow, writeCashInflow, writeCashOutflow } from "../payments/index.js";
import {
  createAttendanceRecord as insertAttendanceRecord,
  createAttendanceRecords as insertAttendanceRecords,
  createEmployee as insertEmployee,
  createEmployeeAdvance as insertEmployeeAdvance,
  createEmployeeAdvanceRecovery as insertEmployeeAdvanceRecovery,
  createEmployeeLedgerEntry as insertEmployeeLedgerEntry,
  createEmployeeLeave as insertEmployeeLeave,
  createLeaveType as insertLeaveType,
  confirmPayrollRun as markPayrollRunConfirmed,
  createPayrollItems as insertPayrollItems,
  createPayrollRun as insertPayrollRun,
  createSalaryPayment as insertSalaryPayment,
  createSalaryPaymentAllocations as insertSalaryPaymentAllocations,
  createSalaryPaymentSplits as insertSalaryPaymentSplits,
  deletePayrollItemsByRun,
  findApprovedLeaveOverlap,
  findConfirmedPayrollRunOverlap,
  findEmployeeById,
  findEmployeeLeaveById,
  findEmployeesByIds,
  findLeaveTypeById,
  findLeaveTypeByName,
  findPayrollEmployeesForPeriod,
  findPayrollRunById,
  findSalaryPaymentById,
  findSalaryPaymentReversal,
  listEmployeeAdvances as readEmployeeAdvances,
  listEmployeeAttendance as readEmployeeAttendance,
  listEmployeeLeaves as readEmployeeLeaves,
  listEmployeeFinancialTotals,
  listEmployees as readEmployees,
  listLeaveTypes as readLeaveTypes,
  listPayrollAdvanceRecoveryTotals,
  listPayrollAdvancesForEmployeeForUpdate,
  listPayrollAdvancesForEmployees,
  listPayrollApprovedLeaveClassifications,
  listPayrollAttendanceForPeriod,
  listPayrollItemsByRun,
  listPayrollRuns as readPayrollRuns,
  listSalaryPaymentAllocationTotalsByPayrollItems,
  listSalaryPaymentAllocations,
  listSalaryPayments as readSalaryPayments,
  listSalaryPaymentSplits,
  lockEmployeeAdvanceById,
  lockPayrollConfirmationScope,
  lockPayrollRunById,
  lockSalaryPaymentById,
  lockSalaryPaymentPayrollItems,
  markSalaryPaymentReversed,
  readEmployeeAdvanceRecoveredAmount,
  updateEmployee as saveEmployeeChanges,
  updateEmployeeLeave as saveEmployeeLeaveChanges,
  updateLeaveType as saveLeaveTypeChanges,
  updatePayrollRun as savePayrollRunChanges,
  type AttendanceRecord,
  type EmployeeAdvanceDetailRecord,
  type EmployeeAdvanceRecord,
  type EmployeeAdvanceRecoveryRecord,
  type EmployeeChanges,
  type EmployeeLeaveChanges,
  type EmployeeLeaveRecord,
  type EmployeeRecord,
  type EmployeesDatabase,
  type LeaveTypeChanges,
  type LeaveTypeRecord,
  type PaginatedAttendanceRecords,
  type PaginatedEmployeeAdvanceRecords,
  type PaginatedEmployeeLeaveRecords,
  type PaginatedPayrollRunRecords,
  type NewPayrollItem,
  type PayrollItemRecord,
  type PayrollRunRecord,
  type PaginatedSalaryPaymentRecords,
  type SalaryPaymentAllocationDetailRecord,
  type SalaryPaymentRecord,
  type SalaryPaymentSplitRecord,
} from "./employees.repository.js";
import type {
  CreateAttendanceBulkInput,
  CreateAttendanceInput,
  CreateEmployeeAdvanceInput,
  CreateEmployeeInput,
  CreateEmployeeLeaveInput,
  CreateLeaveTypeInput,
  CreatePayrollRunInput,
  CreateSalaryPaymentInput,
  ListEmployeeAdvancesQuery,
  ListEmployeeAttendanceQuery,
  ListEmployeeLeavesQuery,
  ListEmployeesQuery,
  ListPayrollRunsQuery,
  ListSalaryPaymentsQuery,
  RecoverEmployeeAdvanceInput,
  ReverseSalaryPaymentInput,
  UpdateEmployeeInput,
  UpdateEmployeeLeaveInput,
  UpdateLeaveTypeInput,
  UpdatePayrollItemInput,
  UpdatePayrollRunInput,
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

/** Converts a two-decimal money string into exact integer cents. */
function moneyToCents(value: string): bigint {
  const [wholePart, decimalPart = ""] = value.split(".");
  return BigInt(wholePart) * 100n + BigInt(decimalPart.padEnd(2, "0").slice(0, 2));
}

/** Converts exact integer cents back into a two-decimal money string. */
function centsToMoney(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

/** Converts an Asia/Karachi business date into the UTC timestamp used by financial records. */
function employeeBusinessDateToUtc(date: string): Date {
  return new Date(`${date}T00:00:00+05:00`);
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

/** Loads one Leave Type or throws a stable not-found error. */
async function requireLeaveType(
  database: EmployeesDatabase,
  leaveTypeId: string,
): Promise<LeaveTypeRecord> {
  const leaveType = await findLeaveTypeById(database, leaveTypeId);

  if (!leaveType) {
    throw employeeError("LEAVE_TYPE_NOT_FOUND", "Leave type was not found.", 404);
  }

  return leaveType;
}

/** Loads one Employee Leave row or throws a stable not-found error. */
async function requireEmployeeLeave(
  database: EmployeesDatabase,
  employeeLeaveId: string,
): Promise<EmployeeLeaveRecord> {
  const leave = await findEmployeeLeaveById(database, employeeLeaveId);

  if (!leave) {
    throw employeeError("EMPLOYEE_LEAVE_NOT_FOUND", "Employee leave was not found.", 404);
  }

  return leave;
}

/** Rejects a Leave Type name already used by another normalized row. */
async function ensureLeaveTypeNameIsAvailable(
  database: EmployeesDatabase,
  name: string,
  excludeLeaveTypeId?: string,
): Promise<void> {
  const existing = await findLeaveTypeByName(database, name);

  if (existing && existing.id !== excludeLeaveTypeId) {
    throw employeeError(
      "DUPLICATE_LEAVE_TYPE",
      "A leave type with this name already exists.",
      409,
      "name",
    );
  }
}

/** Checks whether PostgreSQL rejected the normalized Leave Type unique index. */
function isLeaveTypeDuplicate(error: unknown): boolean {
  return (
    readPostgresCode(error) === "23505" &&
    readPostgresConstraint(error) === "leave_types_name_normalized_unique"
  );
}

/** Rejects leave dates outside one employee's employment period. */
function validateLeaveEmploymentDates(
  employee: EmployeeRecord,
  fromDate: string,
  toDate: string,
): void {
  if (toDate < fromDate) {
    throw employeeError(
      "INVALID_LEAVE_DATES",
      "To date cannot be before from date.",
      400,
      "toDate",
    );
  }

  if (fromDate < employee.joinDate || (employee.leaveDate && toDate > employee.leaveDate)) {
    throw employeeError(
      "LEAVE_OUTSIDE_EMPLOYMENT_DATES",
      "Leave dates must fall within the employee's employment dates.",
      400,
      "fromDate",
    );
  }
}

/** Rejects an approved leave that overlaps another approved leave for the employee. */
async function ensureApprovedLeaveDoesNotOverlap(
  database: EmployeesDatabase,
  employeeId: string,
  fromDate: string,
  toDate: string,
  excludeLeaveId?: string,
): Promise<void> {
  const overlap = await findApprovedLeaveOverlap(
    database,
    employeeId,
    fromDate,
    toDate,
    excludeLeaveId,
  );

  if (overlap) {
    throw employeeError(
      "OVERLAPPING_APPROVED_LEAVE",
      "Approved leave overlaps another approved leave for this employee.",
      409,
      "fromDate",
    );
  }
}

/** Copies only approved Leave Type fields into a repository update object. */
function readLeaveTypeChanges(input: UpdateLeaveTypeInput): LeaveTypeChanges {
  const changes: LeaveTypeChanges = {};

  if (input.name !== undefined) changes.name = input.name.trim();
  if (input.isPaid !== undefined) changes.isPaid = input.isPaid;
  if (input.isActive !== undefined) changes.isActive = input.isActive;

  return changes;
}

/** Copies only approved Employee Leave fields into a repository update object. */
function readEmployeeLeaveChanges(input: UpdateEmployeeLeaveInput): EmployeeLeaveChanges {
  const changes: EmployeeLeaveChanges = {};

  if (input.employeeId !== undefined) changes.employeeId = input.employeeId;
  if (input.leaveTypeId !== undefined) changes.leaveTypeId = input.leaveTypeId;
  if (input.fromDate !== undefined) changes.fromDate = input.fromDate;
  if (input.toDate !== undefined) changes.toDate = input.toDate;
  if (input.days !== undefined) changes.days = input.days;
  if (input.reason !== undefined) changes.reason = input.reason.trim();
  if (input.status !== undefined) changes.status = input.status;
  if (input.notes !== undefined) changes.notes = normalizeOptionalText(input.notes);

  return changes;
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

/** Employee master row enriched with balances derived from immutable financial history. */
export interface EmployeeWithBalances extends EmployeeRecord {
  salaryPayable: string;
  advanceOutstanding: string;
}

/** Contains one Employee page enriched with current derived balances. */
export interface PaginatedEmployeesWithBalances {
  items: EmployeeWithBalances[];
  total: number;
}

/** Adds derived salary payable and advance outstanding without storing mutable balances. */
async function enrichEmployeesWithBalances(
  database: EmployeesDatabase,
  employeesToEnrich: EmployeeRecord[],
): Promise<EmployeeWithBalances[]> {
  const totals = await listEmployeeFinancialTotals(
    database,
    employeesToEnrich.map((employee) => employee.id),
  );
  const totalsByEmployee = new Map(totals.map((row) => [row.employeeId, row]));

  return employeesToEnrich.map((employee) => {
    const source = totalsByEmployee.get(employee.id);
    const salaryPayableCents = moneyToCents(source?.salaryDueAmount ?? "0.00")
      - moneyToCents(source?.salaryPaidAmount ?? "0.00");
    const advanceOutstandingCents = moneyToCents(source?.advanceOriginalAmount ?? "0.00")
      - moneyToCents(source?.advanceRecoveredAmount ?? "0.00");

    if (salaryPayableCents < 0n || advanceOutstandingCents < 0n) {
      throw employeeError(
        "EMPLOYEE_BALANCE_INVALID",
        "Employee financial history contains payments or recoveries above the originating balance.",
        500,
      );
    }

    return {
      ...employee,
      salaryPayable: centsToMoney(salaryPayableCents),
      advanceOutstanding: centsToMoney(advanceOutstandingCents),
    };
  });
}

/** Lists employees with the approved search, status and pagination fields. */
export async function listEmployees(
  database: EmployeesDatabase,
  query: ListEmployeesQuery,
): Promise<PaginatedEmployeesWithBalances> {
  const result = await readEmployees(database, query);
  return {
    ...result,
    items: await enrichEmployeesWithBalances(database, result.items),
  };
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
): Promise<EmployeeWithBalances> {
  const employee = await requireEmployee(database, employeeId);
  const enriched = await enrichEmployeesWithBalances(database, [employee]);
  return enriched[0];
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

/** Lists all Leave Types in stable name order. */
export async function listLeaveTypes(
  database: EmployeesDatabase,
): Promise<LeaveTypeRecord[]> {
  return readLeaveTypes(database);
}

/** Creates one active Leave Type with a unique normalized name. */
export async function createLeaveType(
  database: EmployeesDatabase,
  input: CreateLeaveTypeInput,
): Promise<LeaveTypeRecord> {
  const name = input.name.trim();
  await ensureLeaveTypeNameIsAvailable(database, name);

  try {
    const leaveType = await insertLeaveType(database, {
      name,
      isPaid: input.isPaid,
      isActive: true,
    });

    if (!leaveType) {
      throw employeeError("LEAVE_TYPE_CREATE_FAILED", "Leave type could not be created.", 500);
    }

    return leaveType;
  } catch (error) {
    if (isLeaveTypeDuplicate(error)) {
      throw employeeError(
        "DUPLICATE_LEAVE_TYPE",
        "A leave type with this name already exists.",
        409,
        "name",
      );
    }

    throw error;
  }
}

/** Renames, reclassifies, or activates/deactivates one Leave Type. */
export async function updateLeaveType(
  database: EmployeesDatabase,
  leaveTypeId: string,
  input: UpdateLeaveTypeInput,
): Promise<LeaveTypeRecord> {
  await requireLeaveType(database, leaveTypeId);

  if (input.name !== undefined) {
    await ensureLeaveTypeNameIsAvailable(database, input.name.trim(), leaveTypeId);
  }

  try {
    const leaveType = await saveLeaveTypeChanges(
      database,
      leaveTypeId,
      readLeaveTypeChanges(input),
    );

    if (!leaveType) {
      throw employeeError("LEAVE_TYPE_UPDATE_FAILED", "Leave type could not be updated.", 500);
    }

    return leaveType;
  } catch (error) {
    if (isLeaveTypeDuplicate(error)) {
      throw employeeError(
        "DUPLICATE_LEAVE_TYPE",
        "A leave type with this name already exists.",
        409,
        "name",
      );
    }

    throw error;
  }
}

/** Lists Employee Leave records using only approved filters. */
export async function listEmployeeLeaves(
  database: EmployeesDatabase,
  query: ListEmployeeLeavesQuery,
): Promise<PaginatedEmployeeLeaveRecords> {
  return readEmployeeLeaves(database, query);
}

/** Creates one Employee Leave record after employment/type/overlap validation. */
export async function createEmployeeLeave(
  database: EmployeesDatabase,
  input: CreateEmployeeLeaveInput,
): Promise<EmployeeLeaveRecord> {
  const employee = await requireEmployee(database, input.employeeId);
  const leaveType = await requireLeaveType(database, input.leaveTypeId);

  if (!leaveType.isActive) {
    throw employeeError("INACTIVE_LEAVE_TYPE", "Inactive leave types cannot be used for new leave.", 400, "leaveTypeId");
  }

  validateLeaveEmploymentDates(employee, input.fromDate, input.toDate);
  const status = input.status ?? "PENDING";

  if (status === "APPROVED") {
    await ensureApprovedLeaveDoesNotOverlap(
      database,
      input.employeeId,
      input.fromDate,
      input.toDate,
    );
  }

  const leave = await insertEmployeeLeave(database, {
    employeeId: input.employeeId,
    leaveTypeId: input.leaveTypeId,
    fromDate: input.fromDate,
    toDate: input.toDate,
    days: input.days,
    reason: input.reason.trim(),
    status,
    notes: normalizeOptionalText(input.notes),
  });

  if (!leave) {
    throw employeeError("EMPLOYEE_LEAVE_CREATE_FAILED", "Employee leave could not be created.", 500);
  }

  return leave;
}

/** Updates one Employee Leave record and revalidates its effective approved range. */
export async function updateEmployeeLeave(
  database: EmployeesDatabase,
  employeeLeaveId: string,
  input: UpdateEmployeeLeaveInput,
): Promise<EmployeeLeaveRecord> {
  const existingLeave = await requireEmployeeLeave(database, employeeLeaveId);
  const employeeId = input.employeeId ?? existingLeave.employeeId;
  const leaveTypeId = input.leaveTypeId ?? existingLeave.leaveTypeId;
  const fromDate = input.fromDate ?? existingLeave.fromDate;
  const toDate = input.toDate ?? existingLeave.toDate;
  const status = input.status ?? existingLeave.status;
  const employee = await requireEmployee(database, employeeId);

  validateLeaveEmploymentDates(employee, fromDate, toDate);

  if (leaveTypeId !== existingLeave.leaveTypeId) {
    const leaveType = await requireLeaveType(database, leaveTypeId);

    if (!leaveType.isActive) {
      throw employeeError("INACTIVE_LEAVE_TYPE", "Inactive leave types cannot be assigned to leave.", 400, "leaveTypeId");
    }
  }

  if (status === "APPROVED") {
    await ensureApprovedLeaveDoesNotOverlap(
      database,
      employeeId,
      fromDate,
      toDate,
      employeeLeaveId,
    );
  }

  const leave = await saveEmployeeLeaveChanges(
    database,
    employeeLeaveId,
    readEmployeeLeaveChanges(input),
  );

  if (!leave) {
    throw employeeError("EMPLOYEE_LEAVE_UPDATE_FAILED", "Employee leave could not be updated.", 500);
  }

  return leave;
}

/** Employee Advance list row with a derived outstanding amount. */
export type EmployeeAdvanceListItem = EmployeeAdvanceDetailRecord & {
  outstandingAmount: string;
};

/** Lists Employee Advances and derives outstanding amounts without mutable balance fields. */
export async function listEmployeeAdvances(
  database: EmployeesDatabase,
  query: ListEmployeeAdvancesQuery,
): Promise<Omit<PaginatedEmployeeAdvanceRecords, "items"> & { items: EmployeeAdvanceListItem[] }> {
  const result = await readEmployeeAdvances(database, query);

  return {
    total: result.total,
    items: result.items.map((advance) => ({
      ...advance,
      outstandingAmount: centsToMoney(
        moneyToCents(advance.originalAmount) - moneyToCents(advance.recoveredAmount),
      ),
    })),
  };
}

/** Creates one Employee Advance, employee-ledger debit and cash/bank outflow atomically. */
export async function createEmployeeAdvanceInTransaction(
  database: EmployeesDatabase,
  input: CreateEmployeeAdvanceInput,
): Promise<EmployeeAdvanceRecord> {
  const employee = await requireEmployee(database, input.employeeId);

  if (!employee.isActive) {
    throw employeeError(
      "EMPLOYEE_INACTIVE",
      "Inactive employees cannot receive a new advance.",
      409,
      "employeeId",
    );
  }

  if (input.advanceDate < employee.joinDate || (employee.leaveDate && input.advanceDate > employee.leaveDate)) {
    throw employeeError(
      "ADVANCE_OUTSIDE_EMPLOYMENT_DATES",
      "Advance date must fall within the employee's employment dates.",
      400,
      "advanceDate",
    );
  }

  const reservedNumber = await reserveBusinessDocumentNumberInTransaction(database, "EMPLOYEE_ADVANCE");
  const advanceNumber = `${reservedNumber.prefix}-${reservedNumber.number}`;
  const advance = await insertEmployeeAdvance(database, {
    advanceNumber,
    employeeId: input.employeeId,
    advanceDate: input.advanceDate,
    originalAmount: input.amount,
    paymentMethod: input.paymentMethod,
    cashAccountId: input.paymentMethod === "CASH" ? input.cashAccountId ?? null : null,
    bankAccountId: input.paymentMethod === "BANK_TRANSFER" ? input.bankAccountId ?? null : null,
    note: normalizeOptionalText(input.note),
    status: "CONFIRMED",
  });

  if (!advance) {
    throw employeeError("EMPLOYEE_ADVANCE_CREATE_FAILED", "Employee advance could not be created.", 500);
  }

  const occurredAt = employeeBusinessDateToUtc(advance.advanceDate);
  await insertEmployeeLedgerEntry(database, {
    employeeId: advance.employeeId,
    occurredAt,
    referenceType: "EMPLOYEE_ADVANCE",
    referenceId: advance.id,
    documentNumber: advance.advanceNumber,
    description: "Employee advance paid",
    debit: advance.originalAmount,
    credit: "0.00",
    notes: advance.note,
  });

  const movement = {
    accountId: (advance.cashAccountId ?? advance.bankAccountId) as string,
    sourceType: "EMPLOYEE_ADVANCE" as const,
    sourceId: advance.id,
    amount: advance.originalAmount,
    occurredAt,
    documentNumber: advance.advanceNumber,
    description: `Employee advance: ${employee.employeeCode} · ${employee.name}`,
  };

  if (advance.paymentMethod === "CASH") {
    await writeCashOutflow(database, movement);
  } else {
    await writeBankOutflow(database, movement);
  }

  return advance;
}

/** Directly recovers an Employee Advance and creates the matching ledger credit/account inflow atomically. */
export async function recoverEmployeeAdvanceInTransaction(
  database: EmployeesDatabase,
  employeeAdvanceId: string,
  input: RecoverEmployeeAdvanceInput,
): Promise<EmployeeAdvanceRecoveryRecord> {
  const advance = await lockEmployeeAdvanceById(database, employeeAdvanceId);

  if (!advance) {
    throw employeeError("EMPLOYEE_ADVANCE_NOT_FOUND", "Employee advance was not found.", 404);
  }

  if (input.recoveryDate < advance.advanceDate) {
    throw employeeError(
      "RECOVERY_BEFORE_ADVANCE",
      "Recovery date cannot be before the advance date.",
      400,
      "recoveryDate",
    );
  }

  const recoveredAmount = await readEmployeeAdvanceRecoveredAmount(database, advance.id);
  const outstandingCents = moneyToCents(advance.originalAmount) - moneyToCents(recoveredAmount);
  const recoveryCents = moneyToCents(input.amount);

  if (outstandingCents <= 0n) {
    throw employeeError(
      "EMPLOYEE_ADVANCE_ALREADY_RECOVERED",
      "This employee advance has no outstanding amount.",
      409,
    );
  }

  if (recoveryCents > outstandingCents) {
    throw employeeError(
      "EMPLOYEE_ADVANCE_RECOVERY_EXCEEDED",
      "Recovery amount cannot exceed the outstanding advance amount.",
      409,
      "amount",
    );
  }

  const reservedNumber = await reserveBusinessDocumentNumberInTransaction(database, "ADVANCE_RECOVERY");
  const recoveryNumber = `${reservedNumber.prefix}-${reservedNumber.number}`;
  const recovery = await insertEmployeeAdvanceRecovery(database, {
    employeeAdvanceId: advance.id,
    payrollItemId: null,
    recoveryNumber,
    recoveryDate: input.recoveryDate,
    amount: input.amount,
    paymentMethod: input.paymentMethod,
    cashAccountId: input.paymentMethod === "CASH" ? input.cashAccountId ?? null : null,
    bankAccountId: input.paymentMethod === "BANK_TRANSFER" ? input.bankAccountId ?? null : null,
    note: normalizeOptionalText(input.note),
  });

  if (!recovery) {
    throw employeeError("EMPLOYEE_ADVANCE_RECOVERY_FAILED", "Employee advance recovery could not be created.", 500);
  }

  const occurredAt = employeeBusinessDateToUtc(recovery.recoveryDate);
  await insertEmployeeLedgerEntry(database, {
    employeeId: advance.employeeId,
    occurredAt,
    referenceType: "ADVANCE_RECOVERY",
    referenceId: recovery.id,
    documentNumber: recovery.recoveryNumber,
    description: `Recovery of ${advance.advanceNumber}`,
    debit: "0.00",
    credit: recovery.amount,
    notes: recovery.note,
  });

  const movement = {
    accountId: (recovery.cashAccountId ?? recovery.bankAccountId) as string,
    sourceType: "ADVANCE_RECOVERY" as const,
    sourceId: recovery.id,
    amount: recovery.amount,
    occurredAt,
    documentNumber: recovery.recoveryNumber,
    description: `Employee advance recovery: ${advance.advanceNumber}`,
  };

  if (recovery.paymentMethod === "CASH") {
    await writeCashInflow(database, movement);
  } else {
    await writeBankInflow(database, movement);
  }

  return recovery;
}

/** One Payroll Item enriched with its currently paid and remaining salary payable. */
export interface PayrollRunItemDetail extends PayrollItemRecord {
  paidAmount: string;
  remainingDueAmount: string;
}

/** Contains a Payroll Run header and its calculated employee rows. */
export interface PayrollRunDetail {
  run: PayrollRunRecord;
  items: PayrollRunItemDetail[];
}

interface DraftPayrollAdjustment {
  additionsAmount: string;
  additionsReason: string | null;
  deductionsAmount: string;
  deductionsReason: string | null;
  advanceRecoveryAmount: string;
}

interface DraftPayrollCalculation {
  items: NewPayrollItem[];
  grossTotal: string;
  attendanceDeductionTotal: string;
  additionsTotal: string;
  deductionsTotal: string;
  advanceRecoveryTotal: string;
  netTotal: string;
}

const ZERO_PAYROLL_ADJUSTMENT: DraftPayrollAdjustment = {
  additionsAmount: "0.00",
  additionsReason: null,
  deductionsAmount: "0.00",
  deductionsReason: null,
  advanceRecoveryAmount: "0.00",
};

const MAX_DATABASE_MONEY_CENTS = 99_999_999_999_999n;

/** Divides non-negative integers using standard half-up rounding. */
function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

/** Formats hundredths of one day as the decimal string used by numeric(14,2). */
function dayUnitsToDecimal(dayUnits: bigint): string {
  return `${dayUnits / 100n}.${(dayUnits % 100n).toString().padStart(2, "0")}`;
}

/** Rejects a calculated money value that cannot fit numeric(14,2). */
function ensurePayrollMoneyFitsDatabase(value: bigint, field: string): void {
  if (value < 0n || value > MAX_DATABASE_MONEY_CENTS) {
    throw employeeError(
      "PAYROLL_AMOUNT_OUT_OF_RANGE",
      "Calculated payroll amount is outside the supported money range.",
      409,
      field,
    );
  }
}

/** Loads one Payroll Run or throws a stable not-found error. */
async function requirePayrollRun(
  database: EmployeesDatabase,
  payrollRunId: string,
): Promise<PayrollRunRecord> {
  const payrollRun = await findPayrollRunById(database, payrollRunId);

  if (!payrollRun) {
    throw employeeError("PAYROLL_RUN_NOT_FOUND", "Payroll run was not found.", 404);
  }

  return payrollRun;
}

/** Converts stored draft item adjustments into an editable map keyed by employee. */
function readExistingPayrollAdjustments(
  items: PayrollItemRecord[],
): Map<string, DraftPayrollAdjustment> {
  return new Map(items.map((item) => [
    item.employeeId,
    {
      additionsAmount: item.additionsAmount,
      additionsReason: item.additionsReason,
      deductionsAmount: item.deductionsAmount,
      deductionsReason: item.deductionsReason,
      advanceRecoveryAmount: item.advanceRecoveryAmount,
    },
  ]));
}

/** Applies one partial draft adjustment without losing unchanged values. */
function mergePayrollAdjustment(
  current: DraftPayrollAdjustment,
  input: UpdatePayrollItemInput,
): DraftPayrollAdjustment {
  return {
    additionsAmount: input.additionsAmount ?? current.additionsAmount,
    additionsReason: input.additionsReason !== undefined
      ? normalizeOptionalText(input.additionsReason)
      : current.additionsReason,
    deductionsAmount: input.deductionsAmount ?? current.deductionsAmount,
    deductionsReason: input.deductionsReason !== undefined
      ? normalizeOptionalText(input.deductionsReason)
      : current.deductionsReason,
    advanceRecoveryAmount: input.advanceRecoveryAmount ?? current.advanceRecoveryAmount,
  };
}

/** Builds the effective draft adjustment map for one Payroll Run update. */
function buildPayrollAdjustmentMap(
  currentItems: PayrollItemRecord[],
  inputItems: UpdatePayrollItemInput[] | undefined,
): Map<string, DraftPayrollAdjustment> {
  const adjustments = readExistingPayrollAdjustments(currentItems);

  for (const input of inputItems ?? []) {
    adjustments.set(
      input.employeeId,
      mergePayrollAdjustment(adjustments.get(input.employeeId) ?? ZERO_PAYROLL_ADJUSTMENT, input),
    );
  }

  return adjustments;
}

/** Returns current derived advance outstanding by employee for payroll validation. */
async function readPayrollAdvanceOutstandingByEmployee(
  database: EmployeesDatabase,
  employeeIds: string[],
  periodEnd: string,
): Promise<Map<string, bigint>> {
  const advances = await listPayrollAdvancesForEmployees(database, employeeIds, periodEnd);
  const recoveryTotals = await listPayrollAdvanceRecoveryTotals(
    database,
    advances.map((advance) => advance.id),
  );
  const recoveredByAdvanceId = new Map(
    recoveryTotals.map((row) => [row.employeeAdvanceId, moneyToCents(row.recoveredAmount)]),
  );
  const outstandingByEmployee = new Map<string, bigint>();

  for (const advance of advances) {
    const outstanding = moneyToCents(advance.originalAmount) - (recoveredByAdvanceId.get(advance.id) ?? 0n);

    if (outstanding < 0n) {
      throw employeeError(
        "EMPLOYEE_ADVANCE_BALANCE_INVALID",
        "Employee advance recoveries exceed the original advance amount.",
        500,
      );
    }

    outstandingByEmployee.set(
      advance.employeeId,
      (outstandingByEmployee.get(advance.employeeId) ?? 0n) + outstanding,
    );
  }

  return outstandingByEmployee;
}

/** Finds the single approved leave classification covering one attendance LEAVE date. */
function classifyPayrollLeaveDay(
  employee: EmployeeRecord,
  attendanceDate: string,
  leaveRanges: Array<{ fromDate: string; toDate: string; isPaid: boolean }>,
): boolean {
  const matches = leaveRanges.filter(
    (leave) => leave.fromDate <= attendanceDate && leave.toDate >= attendanceDate,
  );

  if (matches.length === 0) {
    throw employeeError(
      "PAYROLL_LEAVE_NOT_APPROVED",
      `${employee.employeeCode} has LEAVE attendance on ${attendanceDate} without a matching approved leave record.`,
      409,
    );
  }

  if (matches.length > 1) {
    throw employeeError(
      "PAYROLL_LEAVE_OVERLAP",
      `${employee.employeeCode} has overlapping approved leave records on ${attendanceDate}.`,
      409,
    );
  }

  return matches[0].isPaid;
}

/** Validates reasons and advance recovery before calculating one draft Payroll Item. */
function validateDraftPayrollAdjustment(
  employee: EmployeeRecord,
  adjustment: DraftPayrollAdjustment,
  outstandingAdvanceCents: bigint,
): void {
  const additionsCents = moneyToCents(adjustment.additionsAmount);
  const deductionsCents = moneyToCents(adjustment.deductionsAmount);
  const advanceRecoveryCents = moneyToCents(adjustment.advanceRecoveryAmount);

  if (additionsCents > 0n && !normalizeOptionalText(adjustment.additionsReason)) {
    throw employeeError(
      "PAYROLL_ADDITION_REASON_REQUIRED",
      `Addition reason is required for ${employee.employeeCode}.`,
      400,
      "additionsReason",
    );
  }

  if (deductionsCents > 0n && !normalizeOptionalText(adjustment.deductionsReason)) {
    throw employeeError(
      "PAYROLL_DEDUCTION_REASON_REQUIRED",
      `Deduction reason is required for ${employee.employeeCode}.`,
      400,
      "deductionsReason",
    );
  }

  if (advanceRecoveryCents > outstandingAdvanceCents) {
    throw employeeError(
      "PAYROLL_ADVANCE_RECOVERY_EXCEEDED",
      `Advance recovery for ${employee.employeeCode} cannot exceed the employee's outstanding advance.`,
      409,
      "advanceRecoveryAmount",
    );
  }
}

/** Calculates one Payroll Item using exact cents and hundredths-of-a-day arithmetic. */
function calculateDraftPayrollItem(
  payrollRunId: string,
  employee: EmployeeRecord,
  attendance: AttendanceRecord[],
  leaveRanges: Array<{ fromDate: string; toDate: string; isPaid: boolean }>,
  adjustment: DraftPayrollAdjustment,
  outstandingAdvanceCents: bigint,
): NewPayrollItem {
  validateDraftPayrollAdjustment(employee, adjustment, outstandingAdvanceCents);

  let workingDayUnits = 0n;
  let presentDayUnits = 0n;
  let paidLeaveDayUnits = 0n;
  let unpaidLeaveDayUnits = 0n;
  let absentDayUnits = 0n;
  let halfDayUnits = 0n;
  let deductionDayUnits = 0n;

  for (const record of attendance) {
    switch (record.status) {
      case "PRESENT":
        workingDayUnits += 100n;
        presentDayUnits += 100n;
        break;
      case "ABSENT":
        workingDayUnits += 100n;
        absentDayUnits += 100n;
        deductionDayUnits += 100n;
        break;
      case "HALF_DAY":
        workingDayUnits += 100n;
        halfDayUnits += 100n;
        deductionDayUnits += 50n;
        break;
      case "LEAVE":
        workingDayUnits += 100n;
        if (classifyPayrollLeaveDay(employee, record.attendanceDate, leaveRanges)) {
          paidLeaveDayUnits += 100n;
        } else {
          unpaidLeaveDayUnits += 100n;
          deductionDayUnits += 100n;
        }
        break;
      case "HOLIDAY":
      case "WEEKLY_OFF":
        break;
    }
  }

  if (workingDayUnits === 0n) {
    throw employeeError(
      "PAYROLL_WORKING_DAYS_REQUIRED",
      `Payroll cannot be calculated for ${employee.employeeCode} because no working attendance exists in the selected period.`,
      409,
    );
  }

  const payableDayUnits = workingDayUnits - deductionDayUnits;
  const grossCents = moneyToCents(employee.baseMonthlySalary);
  const attendanceDeductionCents = divideRoundHalfUp(
    grossCents * deductionDayUnits,
    workingDayUnits,
  );
  const additionsCents = moneyToCents(adjustment.additionsAmount);
  const deductionsCents = moneyToCents(adjustment.deductionsAmount);
  const advanceRecoveryCents = moneyToCents(adjustment.advanceRecoveryAmount);
  const netCents = grossCents
    - attendanceDeductionCents
    + additionsCents
    - deductionsCents
    - advanceRecoveryCents;

  if (netCents < 0n) {
    throw employeeError(
      "PAYROLL_NET_NEGATIVE",
      `Payroll adjustments make net salary negative for ${employee.employeeCode}.`,
      409,
    );
  }

  ensurePayrollMoneyFitsDatabase(grossCents, "grossSalary");
  ensurePayrollMoneyFitsDatabase(attendanceDeductionCents, "attendanceDeduction");
  ensurePayrollMoneyFitsDatabase(netCents, "netSalary");

  return {
    payrollRunId,
    employeeId: employee.id,
    employeeCodeSnapshot: employee.employeeCode,
    employeeNameSnapshot: employee.name,
    jobTitleSnapshot: employee.jobTitle,
    baseSalarySnapshot: employee.baseMonthlySalary,
    workingDays: dayUnitsToDecimal(workingDayUnits),
    payableDays: dayUnitsToDecimal(payableDayUnits),
    presentDays: dayUnitsToDecimal(presentDayUnits),
    paidLeaveDays: dayUnitsToDecimal(paidLeaveDayUnits),
    unpaidLeaveDays: dayUnitsToDecimal(unpaidLeaveDayUnits),
    absentDays: dayUnitsToDecimal(absentDayUnits),
    halfDays: dayUnitsToDecimal(halfDayUnits),
    grossSalary: centsToMoney(grossCents),
    attendanceDeduction: centsToMoney(attendanceDeductionCents),
    additionsAmount: centsToMoney(additionsCents),
    additionsReason: additionsCents > 0n ? normalizeOptionalText(adjustment.additionsReason) : null,
    deductionsAmount: centsToMoney(deductionsCents),
    deductionsReason: deductionsCents > 0n ? normalizeOptionalText(adjustment.deductionsReason) : null,
    advanceRecoveryAmount: centsToMoney(advanceRecoveryCents),
    netSalary: centsToMoney(netCents),
    initialPaidAmount: "0.00",
    initialDueAmount: centsToMoney(netCents),
  };
}

/** Recalculates all employee rows and totals for one DRAFT Payroll Run. */
async function calculateDraftPayroll(
  database: EmployeesDatabase,
  payrollRunId: string,
  periodStart: string,
  periodEnd: string,
  adjustments: Map<string, DraftPayrollAdjustment>,
  explicitlyAdjustedEmployeeIds: Set<string>,
): Promise<DraftPayrollCalculation> {
  const employees = await findPayrollEmployeesForPeriod(database, periodStart, periodEnd);

  if (employees.length === 0) {
    throw employeeError(
      "PAYROLL_NO_EMPLOYEES",
      "No employees are eligible for the selected payroll period.",
      409,
    );
  }

  const eligibleEmployeeIds = new Set(employees.map((employee) => employee.id));
  for (const employeeId of explicitlyAdjustedEmployeeIds) {
    if (!eligibleEmployeeIds.has(employeeId)) {
      throw employeeError(
        "PAYROLL_EMPLOYEE_NOT_ELIGIBLE",
        "Payroll adjustments contain an employee outside the selected employment period.",
        400,
        "employeeId",
      );
    }
  }

  const employeeIds = employees.map((employee) => employee.id);
  const [attendanceRows, leaveClassifications, outstandingAdvanceByEmployee] = await Promise.all([
    listPayrollAttendanceForPeriod(database, employeeIds, periodStart, periodEnd),
    listPayrollApprovedLeaveClassifications(database, employeeIds, periodStart, periodEnd),
    readPayrollAdvanceOutstandingByEmployee(database, employeeIds, periodEnd),
  ]);

  const attendanceByEmployee = new Map<string, AttendanceRecord[]>();
  for (const record of attendanceRows) {
    const rows = attendanceByEmployee.get(record.employeeId) ?? [];
    rows.push(record);
    attendanceByEmployee.set(record.employeeId, rows);
  }

  const leaveRangesByEmployee = new Map<string, Array<{ fromDate: string; toDate: string; isPaid: boolean }>>();
  for (const leave of leaveClassifications) {
    const ranges = leaveRangesByEmployee.get(leave.employeeId) ?? [];
    ranges.push({ fromDate: leave.fromDate, toDate: leave.toDate, isPaid: leave.isPaid });
    leaveRangesByEmployee.set(leave.employeeId, ranges);
  }

  const items = employees.map((employee) => calculateDraftPayrollItem(
    payrollRunId,
    employee,
    attendanceByEmployee.get(employee.id) ?? [],
    leaveRangesByEmployee.get(employee.id) ?? [],
    adjustments.get(employee.id) ?? ZERO_PAYROLL_ADJUSTMENT,
    outstandingAdvanceByEmployee.get(employee.id) ?? 0n,
  ));

  let grossTotalCents = 0n;
  let attendanceDeductionTotalCents = 0n;
  let additionsTotalCents = 0n;
  let deductionsTotalCents = 0n;
  let advanceRecoveryTotalCents = 0n;
  let netTotalCents = 0n;

  for (const item of items) {
    grossTotalCents += moneyToCents(item.grossSalary);
    attendanceDeductionTotalCents += moneyToCents(item.attendanceDeduction);
    additionsTotalCents += moneyToCents(item.additionsAmount ?? "0.00");
    deductionsTotalCents += moneyToCents(item.deductionsAmount ?? "0.00");
    advanceRecoveryTotalCents += moneyToCents(item.advanceRecoveryAmount ?? "0.00");
    netTotalCents += moneyToCents(item.netSalary);
  }

  ensurePayrollMoneyFitsDatabase(grossTotalCents, "grossTotal");
  ensurePayrollMoneyFitsDatabase(attendanceDeductionTotalCents, "attendanceDeductionTotal");
  ensurePayrollMoneyFitsDatabase(additionsTotalCents, "additionsTotal");
  ensurePayrollMoneyFitsDatabase(deductionsTotalCents, "deductionsTotal");
  ensurePayrollMoneyFitsDatabase(advanceRecoveryTotalCents, "advanceRecoveryTotal");
  ensurePayrollMoneyFitsDatabase(netTotalCents, "netTotal");

  return {
    items,
    grossTotal: centsToMoney(grossTotalCents),
    attendanceDeductionTotal: centsToMoney(attendanceDeductionTotalCents),
    additionsTotal: centsToMoney(additionsTotalCents),
    deductionsTotal: centsToMoney(deductionsTotalCents),
    advanceRecoveryTotal: centsToMoney(advanceRecoveryTotalCents),
    netTotal: centsToMoney(netTotalCents),
  };
}

/** Adds derived salary-payment totals to Payroll Items for detail and payment UX. */
async function buildPayrollRunDetail(
  database: EmployeesDatabase,
  run: PayrollRunRecord,
  items: PayrollItemRecord[],
): Promise<PayrollRunDetail> {
  const totals = await listSalaryPaymentAllocationTotalsByPayrollItems(
    database,
    items.map((item) => item.id),
  );
  const paidByItem = new Map(totals.map((row) => [row.payrollItemId, moneyToCents(row.paidAmount)]));

  return {
    run,
    items: items.map((item) => {
      const paidCents = paidByItem.get(item.id) ?? 0n;
      const dueCents = moneyToCents(item.initialDueAmount);

      if (paidCents > dueCents) {
        throw employeeError(
          "SALARY_PAYABLE_INVALID",
          `Payroll ${run.payrollNumber} has salary payments above its initial payable.`,
          500,
        );
      }

      return {
        ...item,
        paidAmount: centsToMoney(paidCents),
        remainingDueAmount: centsToMoney(dueCents - paidCents),
      };
    }),
  };
}

/** Returns Payroll Runs using the approved status/date/pagination filters. */
export async function listPayrollRuns(
  database: EmployeesDatabase,
  query: ListPayrollRunsQuery,
): Promise<PaginatedPayrollRunRecords> {
  return readPayrollRuns(database, query);
}

/** Loads one Payroll Run with its calculated employee rows. */
export async function getPayrollRun(
  database: EmployeesDatabase,
  payrollRunId: string,
): Promise<PayrollRunDetail> {
  const run = await requirePayrollRun(database, payrollRunId);
  const items = await listPayrollItemsByRun(database, payrollRunId);
  return buildPayrollRunDetail(database, run, items);
}

/** Creates and calculates one DRAFT Payroll Run inside the caller's transaction. */
export async function createPayrollRunInTransaction(
  database: EmployeesDatabase,
  input: CreatePayrollRunInput,
): Promise<PayrollRunDetail> {
  const reservedNumber = await reserveBusinessDocumentNumberInTransaction(database, "PAYROLL");
  const payrollNumber = `${reservedNumber.prefix}-${reservedNumber.number}`;
  const run = await insertPayrollRun(database, {
    payrollNumber,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    status: "DRAFT",
    grossTotal: "0.00",
    attendanceDeductionTotal: "0.00",
    additionsTotal: "0.00",
    deductionsTotal: "0.00",
    advanceRecoveryTotal: "0.00",
    netTotal: "0.00",
    notes: normalizeOptionalText(input.notes),
    confirmedAt: null,
  });

  if (!run) {
    throw employeeError("PAYROLL_RUN_CREATE_FAILED", "Payroll run could not be created.", 500);
  }

  const calculation = await calculateDraftPayroll(
    database,
    run.id,
    run.periodStart,
    run.periodEnd,
    new Map(),
    new Set(),
  );
  const items = await insertPayrollItems(database, calculation.items);
  const updatedRun = await savePayrollRunChanges(database, run.id, {
    grossTotal: calculation.grossTotal,
    attendanceDeductionTotal: calculation.attendanceDeductionTotal,
    additionsTotal: calculation.additionsTotal,
    deductionsTotal: calculation.deductionsTotal,
    advanceRecoveryTotal: calculation.advanceRecoveryTotal,
    netTotal: calculation.netTotal,
  });

  if (!updatedRun || items.length !== calculation.items.length) {
    throw employeeError("PAYROLL_RUN_CREATE_FAILED", "Payroll run could not be calculated.", 500);
  }

  return buildPayrollRunDetail(database, updatedRun, items);
}

/** Recalculates editable DRAFT Payroll Run fields inside the caller's transaction. */
export async function updatePayrollRunInTransaction(
  database: EmployeesDatabase,
  payrollRunId: string,
  input: UpdatePayrollRunInput,
): Promise<PayrollRunDetail> {
  const run = await lockPayrollRunById(database, payrollRunId);

  if (!run) {
    throw employeeError("PAYROLL_RUN_NOT_FOUND", "Payroll run was not found.", 404);
  }

  if (run.status !== "DRAFT") {
    throw employeeError(
      "PAYROLL_RUN_IMMUTABLE",
      "Confirmed payroll cannot be edited.",
      409,
    );
  }

  const periodStart = input.periodStart ?? run.periodStart;
  const periodEnd = input.periodEnd ?? run.periodEnd;

  if (periodEnd < periodStart) {
    throw employeeError(
      "INVALID_PAYROLL_PERIOD",
      "Period end cannot be before period start.",
      400,
      "periodEnd",
    );
  }

  const currentItems = await listPayrollItemsByRun(database, run.id);
  const adjustments = buildPayrollAdjustmentMap(currentItems, input.items);
  const calculation = await calculateDraftPayroll(
    database,
    run.id,
    periodStart,
    periodEnd,
    adjustments,
    new Set((input.items ?? []).map((item) => item.employeeId)),
  );

  await deletePayrollItemsByRun(database, run.id);
  const items = await insertPayrollItems(database, calculation.items);
  const updatedRun = await savePayrollRunChanges(database, run.id, {
    periodStart,
    periodEnd,
    notes: input.notes !== undefined ? normalizeOptionalText(input.notes) : run.notes,
    grossTotal: calculation.grossTotal,
    attendanceDeductionTotal: calculation.attendanceDeductionTotal,
    additionsTotal: calculation.additionsTotal,
    deductionsTotal: calculation.deductionsTotal,
    advanceRecoveryTotal: calculation.advanceRecoveryTotal,
    netTotal: calculation.netTotal,
  });

  if (!updatedRun || items.length !== calculation.items.length) {
    throw employeeError("PAYROLL_RUN_UPDATE_FAILED", "Payroll run could not be updated.", 500);
  }

  return buildPayrollRunDetail(database, updatedRun, items);
}

/** Confirms one draft recovery amount by allocating it across the employee's locked advances. */
async function confirmPayrollAdvanceRecovery(
  database: EmployeesDatabase,
  run: PayrollRunRecord,
  item: PayrollItemRecord,
  occurredAt: Date,
): Promise<void> {
  let remainingCents = moneyToCents(item.advanceRecoveryAmount);

  if (remainingCents === 0n) {
    return;
  }

  const advances = await listPayrollAdvancesForEmployeeForUpdate(
    database,
    item.employeeId,
    run.periodEnd,
  );

  for (const advance of advances) {
    if (remainingCents === 0n) {
      break;
    }

    const recoveredCents = moneyToCents(
      await readEmployeeAdvanceRecoveredAmount(database, advance.id),
    );
    const outstandingCents = moneyToCents(advance.originalAmount) - recoveredCents;

    if (outstandingCents < 0n) {
      throw employeeError(
        "EMPLOYEE_ADVANCE_BALANCE_INVALID",
        "Employee advance recoveries exceed the original advance amount.",
        500,
      );
    }

    if (outstandingCents === 0n) {
      continue;
    }

    const recoveryCents = remainingCents < outstandingCents
      ? remainingCents
      : outstandingCents;
    const recovery = await insertEmployeeAdvanceRecovery(database, {
      employeeAdvanceId: advance.id,
      payrollItemId: item.id,
      recoveryNumber: null,
      recoveryDate: run.periodEnd,
      amount: centsToMoney(recoveryCents),
      paymentMethod: null,
      cashAccountId: null,
      bankAccountId: null,
      note: `Payroll ${run.payrollNumber}`,
    });

    if (!recovery) {
      throw employeeError(
        "PAYROLL_ADVANCE_RECOVERY_FAILED",
        "Payroll advance recovery could not be created.",
        500,
      );
    }

    await insertEmployeeLedgerEntry(database, {
      employeeId: item.employeeId,
      occurredAt,
      referenceType: "ADVANCE_RECOVERY",
      referenceId: recovery.id,
      documentNumber: run.payrollNumber,
      description: `Payroll advance recovery: ${run.payrollNumber}`,
      debit: "0.00",
      credit: recovery.amount,
      notes: run.notes,
    });

    remainingCents -= recoveryCents;
  }

  if (remainingCents > 0n) {
    throw employeeError(
      "PAYROLL_ADVANCE_RECOVERY_EXCEEDED",
      `Advance recovery for ${item.employeeCodeSnapshot} exceeds the current outstanding advance.`,
      409,
    );
  }
}

/** Confirms one DRAFT Payroll Run and creates salary payable without any cash/bank movement. */
export async function confirmPayrollRunInTransaction(
  database: EmployeesDatabase,
  payrollRunId: string,
): Promise<PayrollRunDetail> {
  const run = await lockPayrollRunById(database, payrollRunId);

  if (!run) {
    throw employeeError("PAYROLL_RUN_NOT_FOUND", "Payroll run was not found.", 404);
  }

  if (run.status !== "DRAFT") {
    throw employeeError(
      "PAYROLL_RUN_IMMUTABLE",
      "Only a draft payroll run can be confirmed.",
      409,
    );
  }

  await lockPayrollConfirmationScope(database);

  const overlap = await findConfirmedPayrollRunOverlap(
    database,
    run.id,
    run.periodStart,
    run.periodEnd,
  );

  if (overlap) {
    throw employeeError(
      "PAYROLL_PERIOD_OVERLAP",
      "This payroll period overlaps an already confirmed payroll run.",
      409,
    );
  }

  const items = await listPayrollItemsByRun(database, run.id);

  if (items.length === 0) {
    throw employeeError(
      "PAYROLL_ITEMS_NOT_FOUND",
      "Payroll run has no calculated employee rows to confirm.",
      409,
    );
  }

  const occurredAt = employeeBusinessDateToUtc(run.periodEnd);
  const orderedItems = [...items].sort((left, right) =>
    left.employeeId.localeCompare(right.employeeId));

  for (const item of orderedItems) {
    await confirmPayrollAdvanceRecovery(database, run, item, occurredAt);

    if (moneyToCents(item.initialDueAmount) > 0n) {
      await insertEmployeeLedgerEntry(database, {
        employeeId: item.employeeId,
        occurredAt,
        referenceType: "PAYROLL",
        referenceId: item.id,
        documentNumber: run.payrollNumber,
        description: `Salary payable: ${run.payrollNumber}`,
        debit: "0.00",
        credit: item.initialDueAmount,
        notes: run.notes,
      });
    }
  }

  const confirmedRun = await markPayrollRunConfirmed(database, run.id, new Date());

  if (!confirmedRun) {
    throw employeeError(
      "PAYROLL_CONFIRMATION_FAILED",
      "Payroll run could not be confirmed.",
      500,
    );
  }

  return buildPayrollRunDetail(database, confirmedRun, items);
}

/** Contains one Salary Payment header with employee labels, splits, and Payroll Item allocations. */
export interface SalaryPaymentDetail extends SalaryPaymentRecord {
  employeeCode: string;
  employeeName: string;
  splits: SalaryPaymentSplitRecord[];
  allocations: SalaryPaymentAllocationDetailRecord[];
}

/** Loads one Salary Payment detail without recalculating immutable historical rows. */
async function buildSalaryPaymentDetail(
  database: EmployeesDatabase,
  payment: SalaryPaymentRecord,
): Promise<SalaryPaymentDetail> {
  const [employee, splits, allocations] = await Promise.all([
    requireEmployee(database, payment.employeeId),
    listSalaryPaymentSplits(database, payment.id),
    listSalaryPaymentAllocations(database, payment.id),
  ]);

  return {
    ...payment,
    employeeCode: employee.employeeCode,
    employeeName: employee.name,
    splits,
    allocations,
  };
}

/** Lists immutable Salary Payment headers using employee/date filters. */
export async function listSalaryPayments(
  database: EmployeesDatabase,
  query: ListSalaryPaymentsQuery,
): Promise<PaginatedSalaryPaymentRecords> {
  return readSalaryPayments(database, query);
}

/** Loads one Salary Payment with its immutable splits and Payroll Item allocations. */
export async function getSalaryPayment(
  database: EmployeesDatabase,
  salaryPaymentId: string,
): Promise<SalaryPaymentDetail> {
  const payment = await findSalaryPaymentById(database, salaryPaymentId);

  if (!payment) {
    throw employeeError("SALARY_PAYMENT_NOT_FOUND", "Salary payment was not found.", 404);
  }

  return buildSalaryPaymentDetail(database, payment);
}

/** Validates one salary payment against locked confirmed Payroll Items and their remaining payable. */
async function validateSalaryPaymentRequest(
  database: EmployeesDatabase,
  input: CreateSalaryPaymentInput,
): Promise<void> {
  const payrollItems = await lockSalaryPaymentPayrollItems(
    database,
    input.allocations.map((allocation) => allocation.payrollItemId),
  );

  if (payrollItems.length !== input.allocations.length) {
    throw employeeError(
      "SALARY_PAYROLL_ITEM_NOT_FOUND",
      "Every salary allocation must reference a confirmed Payroll Item.",
      404,
      "allocations",
    );
  }

  const itemsById = new Map(payrollItems.map((item) => [item.id, item]));
  let allocationTotalCents = 0n;

  for (const allocation of input.allocations) {
    const item = itemsById.get(allocation.payrollItemId);

    if (!item) {
      throw employeeError(
        "SALARY_PAYROLL_ITEM_NOT_FOUND",
        "A salary allocation Payroll Item was not found.",
        404,
        "allocations",
      );
    }

    if (item.employeeId !== input.employeeId) {
      throw employeeError(
        "SALARY_PAYMENT_EMPLOYEE_MISMATCH",
        "Every allocated Payroll Item must belong to the selected employee.",
        400,
        "allocations",
      );
    }

    if (input.paymentDate < item.periodEnd) {
      throw employeeError(
        "SALARY_PAYMENT_BEFORE_PAYROLL",
        `Payment date cannot be before payroll ${item.payrollNumber} ends (${item.periodEnd}).`,
        400,
        "paymentDate",
      );
    }

    const remainingCents = moneyToCents(item.initialDueAmount) - moneyToCents(item.allocatedAmount);
    const allocationCents = moneyToCents(allocation.amount);

    if (remainingCents < 0n) {
      throw employeeError(
        "SALARY_PAYABLE_INVALID",
        `Payroll ${item.payrollNumber} has allocations above its initial salary payable.`,
        500,
      );
    }

    if (remainingCents === 0n || allocationCents > remainingCents) {
      throw employeeError(
        "SALARY_ALLOCATION_EXCEEDS_PAYABLE",
        `Allocation for payroll ${item.payrollNumber} cannot exceed its remaining salary payable.`,
        409,
        "allocations",
      );
    }

    allocationTotalCents += allocationCents;
  }

  const splitTotalCents = input.splits.reduce(
    (total, split) => total + moneyToCents(split.amount),
    0n,
  );

  if (splitTotalCents !== allocationTotalCents) {
    throw employeeError(
      "SALARY_PAYMENT_TOTAL_MISMATCH",
      "Salary payment split total must equal payroll allocation total.",
      400,
      "allocations",
    );
  }
}

/** Creates a Salary Payment, allocations, employee-ledger debit, and account outflows atomically. */
export async function createSalaryPaymentInTransaction(
  database: EmployeesDatabase,
  input: CreateSalaryPaymentInput,
): Promise<SalaryPaymentDetail> {
  const employee = await requireEmployee(database, input.employeeId);
  await validateSalaryPaymentRequest(database, input);

  const totalAmount = centsToMoney(
    input.splits.reduce((total, split) => total + moneyToCents(split.amount), 0n),
  );
  const reservedNumber = await reserveBusinessDocumentNumberInTransaction(database, "SALARY_PAYMENT");
  const documentNumber = `${reservedNumber.prefix}-${reservedNumber.number}`;
  const payment = await insertSalaryPayment(database, {
    employeeId: input.employeeId,
    documentNumber,
    paymentDate: input.paymentDate,
    totalAmount,
    notes: normalizeOptionalText(input.notes),
  });

  if (!payment) {
    throw employeeError("SALARY_PAYMENT_CREATE_FAILED", "Salary payment could not be created.", 500);
  }

  const splits = await insertSalaryPaymentSplits(
    database,
    input.splits.map((split) => ({
      salaryPaymentId: payment.id,
      method: split.method,
      amount: split.amount,
      cashAccountId: split.method === "CASH" ? split.cashAccountId ?? null : null,
      bankAccountId: split.method === "BANK_TRANSFER" ? split.bankAccountId ?? null : null,
    })),
  );
  const allocations = await insertSalaryPaymentAllocations(
    database,
    input.allocations.map((allocation) => ({
      salaryPaymentId: payment.id,
      payrollItemId: allocation.payrollItemId,
      amount: allocation.amount,
    })),
  );

  if (splits.length !== input.splits.length || allocations.length !== input.allocations.length) {
    throw employeeError(
      "SALARY_PAYMENT_CREATE_FAILED",
      "Salary payment splits or allocations could not be created.",
      500,
    );
  }

  const occurredAt = employeeBusinessDateToUtc(payment.paymentDate);
  await insertEmployeeLedgerEntry(database, {
    employeeId: payment.employeeId,
    occurredAt,
    referenceType: "SALARY_PAYMENT",
    referenceId: payment.id,
    documentNumber: payment.documentNumber,
    description: `Salary payment ${payment.documentNumber}`,
    debit: payment.totalAmount,
    credit: "0.00",
    notes: payment.notes,
  });

  for (const split of splits) {
    const movement = {
      accountId: (split.cashAccountId ?? split.bankAccountId) as string,
      sourceType: "SALARY_PAYMENT" as const,
      sourceId: payment.id,
      amount: split.amount,
      occurredAt,
      documentNumber: payment.documentNumber,
      description: `Salary payment: ${employee.employeeCode} · ${employee.name}`,
    };

    if (split.method === "CASH") {
      await writeCashOutflow(database, movement);
    } else {
      await writeBankOutflow(database, movement);
    }
  }

  return buildSalaryPaymentDetail(database, payment);
}

/** Reverses one Salary Payment, restores salary payable, and writes matching account inflows atomically. */
export async function reverseSalaryPaymentInTransaction(
  database: EmployeesDatabase,
  salaryPaymentId: string,
  input: ReverseSalaryPaymentInput,
): Promise<SalaryPaymentDetail> {
  const payment = await lockSalaryPaymentById(database, salaryPaymentId);

  if (!payment) {
    throw employeeError("SALARY_PAYMENT_NOT_FOUND", "Salary payment was not found.", 404);
  }

  if (payment.status !== "CONFIRMED" || payment.reversalOfPaymentId) {
    throw employeeError(
      "INVALID_SALARY_PAYMENT_STATUS",
      "Only an unreversed Salary Payment can be reversed.",
      409,
    );
  }

  if (await findSalaryPaymentReversal(database, payment.id)) {
    throw employeeError("SALARY_PAYMENT_ALREADY_REVERSED", "Salary payment was already reversed.", 409);
  }

  const [splits, allocations] = await Promise.all([
    listSalaryPaymentSplits(database, payment.id),
    listSalaryPaymentAllocations(database, payment.id),
  ]);

  if (splits.length === 0 || allocations.length === 0) {
    throw employeeError(
      "SALARY_PAYMENT_HISTORY_INVALID",
      "Salary payment is missing immutable split or allocation history.",
      500,
    );
  }

  const lockedItems = await lockSalaryPaymentPayrollItems(
    database,
    allocations.map((allocation) => allocation.payrollItemId),
  );

  if (lockedItems.length !== allocations.length) {
    throw employeeError(
      "SALARY_PAYMENT_HISTORY_INVALID",
      "Salary payment allocation history no longer matches confirmed Payroll Items.",
      500,
    );
  }

  const reversalDate = currentBusinessDate();
  const reservedNumber = await reserveBusinessDocumentNumberInTransaction(database, "SALARY_PAYMENT");
  const documentNumber = `${reservedNumber.prefix}-${reservedNumber.number}`;
  const reversal = await insertSalaryPayment(database, {
    employeeId: payment.employeeId,
    documentNumber,
    paymentDate: reversalDate,
    totalAmount: payment.totalAmount,
    reversalOfPaymentId: payment.id,
    reversalReason: input.reason.trim(),
    notes: `Reversal of ${payment.documentNumber}`,
  });

  if (!reversal) {
    throw employeeError("SALARY_PAYMENT_REVERSAL_FAILED", "Salary payment reversal could not be created.", 500);
  }

  const reversalSplits = await insertSalaryPaymentSplits(
    database,
    splits.map((split) => ({
      salaryPaymentId: reversal.id,
      method: split.method,
      amount: split.amount,
      cashAccountId: split.cashAccountId,
      bankAccountId: split.bankAccountId,
    })),
  );
  const reversalAllocations = await insertSalaryPaymentAllocations(
    database,
    allocations.map((allocation) => ({
      salaryPaymentId: reversal.id,
      payrollItemId: allocation.payrollItemId,
      amount: allocation.amount,
    })),
  );

  if (reversalSplits.length !== splits.length || reversalAllocations.length !== allocations.length) {
    throw employeeError(
      "SALARY_PAYMENT_REVERSAL_FAILED",
      "Salary payment reversal history could not be created.",
      500,
    );
  }

  const occurredAt = employeeBusinessDateToUtc(reversal.paymentDate);
  await insertEmployeeLedgerEntry(database, {
    employeeId: payment.employeeId,
    occurredAt,
    referenceType: "SALARY_PAYMENT_REVERSAL",
    referenceId: reversal.id,
    documentNumber: reversal.documentNumber,
    description: `Reversal of salary payment ${payment.documentNumber}`,
    debit: "0.00",
    credit: payment.totalAmount,
    notes: input.reason.trim(),
  });

  for (const split of reversalSplits) {
    const movement = {
      accountId: (split.cashAccountId ?? split.bankAccountId) as string,
      sourceType: "SALARY_PAYMENT_REVERSAL" as const,
      sourceId: reversal.id,
      amount: split.amount,
      occurredAt,
      documentNumber: reversal.documentNumber,
      description: `Reversal of salary payment ${payment.documentNumber}`,
    };

    if (split.method === "CASH") {
      await writeCashInflow(database, movement);
    } else {
      await writeBankInflow(database, movement);
    }
  }

  const reversedPayment = await markSalaryPaymentReversed(database, payment.id, reversal.id);

  if (!reversedPayment) {
    throw employeeError("SALARY_PAYMENT_REVERSAL_FAILED", "Original Salary Payment could not be marked reversed.", 500);
  }

  return buildSalaryPaymentDetail(database, reversedPayment);
}
