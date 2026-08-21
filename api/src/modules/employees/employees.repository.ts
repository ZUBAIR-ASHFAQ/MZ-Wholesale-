import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  attendanceRecords,
  employeeAdvanceRecoveries,
  employeeAdvances,
  employeeLedgerEntries,
  employeeLeaves,
  employees,
  leaveTypes,
  payrollItems,
  payrollRuns,
  salaryPaymentAllocations,
  salaryPaymentSplits,
  salaryPayments,
} from "../../database/schema/index.js";
import type {
  ListEmployeeAttendanceQuery,
  ListEmployeeAdvancesQuery,
  ListEmployeeLeavesQuery,
  ListEmployeesQuery,
  ListPayrollRunsQuery,
  ListSalaryPaymentsQuery,
} from "./employees.schema.js";

/** Contains the database methods used by the Employee repository. */
export type EmployeesDatabase = Pick<NodePgDatabase, "select" | "insert" | "update" | "delete" | "execute">;

/** Represents one employee row saved in PostgreSQL. */
export type EmployeeRecord = typeof employees.$inferSelect;

/** Contains the fields needed to create one employee row. */
export type NewEmployee = typeof employees.$inferInsert;

/** Contains the employee master fields that may be changed. */
export interface EmployeeChanges {
  employeeCode?: string;
  name?: string;
  fatherSpouseName?: string | null;
  phone?: string | null;
  email?: string | null;
  referenceId?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  joinDate?: string;
  leaveDate?: string | null;
  employmentType?: string;
  baseMonthlySalary?: string;
  isActive?: boolean;
}

/** Contains one page of employee records and the matching total count. */
export interface PaginatedEmployeeRecords {
  items: EmployeeRecord[];
  total: number;
}

/** Builds employee-list filters from the approved query fields. */
function buildEmployeeFilters(query: ListEmployeesQuery): SQL[] {
  const filters: SQL[] = [];

  if (query.active !== undefined) {
    filters.push(eq(employees.isActive, query.active));
  }

  if (query.employmentDate) {
    filters.push(lte(employees.joinDate, query.employmentDate));
    const employmentEndFilter = or(
      gte(employees.leaveDate, query.employmentDate),
      and(isNull(employees.leaveDate), eq(employees.isActive, true)),
    );

    if (employmentEndFilter) {
      filters.push(employmentEndFilter);
    }
  }

  if (query.search) {
    const searchPattern = `%${query.search}%`;
    const searchFilter = or(
      ilike(employees.employeeCode, searchPattern),
      ilike(employees.name, searchPattern),
      ilike(employees.phone, searchPattern),
      ilike(employees.referenceId, searchPattern),
      ilike(employees.jobTitle, searchPattern),
      ilike(employees.department, searchPattern),
    );

    if (searchFilter) {
      filters.push(searchFilter);
    }
  }

  return filters;
}

/** Lists employees using search, active status and pagination. */
export async function listEmployees(
  database: EmployeesDatabase,
  query: ListEmployeesQuery,
): Promise<PaginatedEmployeeRecords> {
  const filters = buildEmployeeFilters(query);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;

  const items = await database
    .select()
    .from(employees)
    .where(where)
    .orderBy(asc(employees.name), asc(employees.employeeCode), asc(employees.id))
    .limit(query.pageSize)
    .offset(offset);

  const totalRows = await database
    .select({ total: count() })
    .from(employees)
    .where(where);

  return {
    items,
    total: totalRows[0]?.total ?? 0,
  };
}

/** Source totals used to derive current employee salary payable and advance outstanding. */
export interface EmployeeFinancialTotalsRecord {
  employeeId: string;
  salaryDueAmount: string;
  salaryPaidAmount: string;
  advanceOriginalAmount: string;
  advanceRecoveredAmount: string;
}

/** Batch-loads financial source totals for employee list/detail balance display. */
export async function listEmployeeFinancialTotals(
  database: EmployeesDatabase,
  employeeIds: string[],
): Promise<EmployeeFinancialTotalsRecord[]> {
  if (employeeIds.length === 0) return [];

  const salaryDueRows = await database
    .select({
      employeeId: payrollItems.employeeId,
      amount: sql<string>`coalesce(sum(${payrollItems.initialDueAmount}), 0)::text`,
    })
    .from(payrollItems)
    .innerJoin(payrollRuns, eq(payrollItems.payrollRunId, payrollRuns.id))
    .where(and(
      inArray(payrollItems.employeeId, employeeIds),
      eq(payrollRuns.status, "CONFIRMED"),
    ))
    .groupBy(payrollItems.employeeId);

  const salaryPaidRows = await database
    .select({
      employeeId: payrollItems.employeeId,
      amount: sql<string>`coalesce(sum(${salaryPaymentAllocations.amount}), 0)::text`,
    })
    .from(salaryPaymentAllocations)
    .innerJoin(payrollItems, eq(salaryPaymentAllocations.payrollItemId, payrollItems.id))
    .innerJoin(salaryPayments, eq(salaryPaymentAllocations.salaryPaymentId, salaryPayments.id))
    .where(and(
      inArray(payrollItems.employeeId, employeeIds),
      eq(salaryPayments.status, "CONFIRMED"),
      isNull(salaryPayments.reversalOfPaymentId),
    ))
    .groupBy(payrollItems.employeeId);

  const advanceRows = await database
    .select({
      employeeId: employeeAdvances.employeeId,
      amount: sql<string>`coalesce(sum(${employeeAdvances.originalAmount}), 0)::text`,
    })
    .from(employeeAdvances)
    .where(inArray(employeeAdvances.employeeId, employeeIds))
    .groupBy(employeeAdvances.employeeId);

  const recoveryRows = await database
    .select({
      employeeId: employeeAdvances.employeeId,
      amount: sql<string>`coalesce(sum(${employeeAdvanceRecoveries.amount}), 0)::text`,
    })
    .from(employeeAdvanceRecoveries)
    .innerJoin(employeeAdvances, eq(employeeAdvanceRecoveries.employeeAdvanceId, employeeAdvances.id))
    .where(inArray(employeeAdvances.employeeId, employeeIds))
    .groupBy(employeeAdvances.employeeId);

  const salaryDue = new Map(salaryDueRows.map((row) => [row.employeeId, row.amount]));
  const salaryPaid = new Map(salaryPaidRows.map((row) => [row.employeeId, row.amount]));
  const advanceOriginal = new Map(advanceRows.map((row) => [row.employeeId, row.amount]));
  const advanceRecovered = new Map(recoveryRows.map((row) => [row.employeeId, row.amount]));

  return employeeIds.map((employeeId) => ({
    employeeId,
    salaryDueAmount: salaryDue.get(employeeId) ?? "0.00",
    salaryPaidAmount: salaryPaid.get(employeeId) ?? "0.00",
    advanceOriginalAmount: advanceOriginal.get(employeeId) ?? "0.00",
    advanceRecoveredAmount: advanceRecovered.get(employeeId) ?? "0.00",
  }));
}

/** Reads one employee by UUID. */
export async function findEmployeeById(
  database: EmployeesDatabase,
  employeeId: string,
): Promise<EmployeeRecord | null> {
  const rows = await database
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  return rows[0] ?? null;
}

/** Inserts one employee master record. */
export async function createEmployee(
  database: EmployeesDatabase,
  input: NewEmployee,
): Promise<EmployeeRecord | null> {
  const rows = await database.insert(employees).values(input).returning();
  return rows[0] ?? null;
}

/** Saves approved employee master changes and updates the row timestamp. */
export async function updateEmployee(
  database: EmployeesDatabase,
  employeeId: string,
  changes: EmployeeChanges,
): Promise<EmployeeRecord | null> {
  const rows = await database
    .update(employees)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(employees.id, employeeId))
    .returning();

  return rows[0] ?? null;
}

/** Represents one attendance row saved in PostgreSQL. */
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;

/** Contains the fields needed to create one attendance row. */
export type NewAttendanceRecord = typeof attendanceRecords.$inferInsert;

/** Contains one page of attendance rows and the matching total count. */
export interface PaginatedAttendanceRecords {
  items: AttendanceRecord[];
  total: number;
}

/** Loads the employee rows needed to validate one bulk attendance request. */
export async function findEmployeesByIds(
  database: EmployeesDatabase,
  employeeIds: string[],
): Promise<EmployeeRecord[]> {
  if (employeeIds.length === 0) {
    return [];
  }

  return database
    .select()
    .from(employees)
    .where(inArray(employees.id, employeeIds));
}

/** Lists one employee's attendance history using optional business-date filters. */
export async function listEmployeeAttendance(
  database: EmployeesDatabase,
  employeeId: string,
  query: ListEmployeeAttendanceQuery,
): Promise<PaginatedAttendanceRecords> {
  const filters = [eq(attendanceRecords.employeeId, employeeId)];

  if (query.startDate) {
    filters.push(gte(attendanceRecords.attendanceDate, query.startDate));
  }

  if (query.endDate) {
    filters.push(lte(attendanceRecords.attendanceDate, query.endDate));
  }

  const where = and(...filters);
  const offset = (query.page - 1) * query.pageSize;
  const items = await database
    .select()
    .from(attendanceRecords)
    .where(where)
    .orderBy(desc(attendanceRecords.attendanceDate), desc(attendanceRecords.createdAt))
    .limit(query.pageSize)
    .offset(offset);
  const totalRows = await database
    .select({ total: count() })
    .from(attendanceRecords)
    .where(where);

  return {
    items,
    total: totalRows[0]?.total ?? 0,
  };
}

/** Inserts one attendance record. */
export async function createAttendanceRecord(
  database: EmployeesDatabase,
  input: NewAttendanceRecord,
): Promise<AttendanceRecord | null> {
  const rows = await database.insert(attendanceRecords).values(input).returning();
  return rows[0] ?? null;
}

/** Inserts one validated attendance batch in a single atomic SQL statement. */
export async function createAttendanceRecords(
  database: EmployeesDatabase,
  inputs: NewAttendanceRecord[],
): Promise<AttendanceRecord[]> {
  if (inputs.length === 0) {
    return [];
  }

  return database.insert(attendanceRecords).values(inputs).returning();
}

/** Represents one reusable Leave Type row saved in PostgreSQL. */
export type LeaveTypeRecord = typeof leaveTypes.$inferSelect;

/** Contains the fields needed to create one Leave Type. */
export type NewLeaveType = typeof leaveTypes.$inferInsert;

/** Contains Leave Type fields that may be changed. */
export interface LeaveTypeChanges {
  name?: string;
  isPaid?: boolean;
  isActive?: boolean;
}

/** Represents one Employee Leave row saved in PostgreSQL. */
export type EmployeeLeaveRecord = typeof employeeLeaves.$inferSelect;

/** Contains the fields needed to create one Employee Leave row. */
export type NewEmployeeLeave = typeof employeeLeaves.$inferInsert;

/** Contains Employee Leave fields that may be changed. */
export interface EmployeeLeaveChanges {
  employeeId?: string;
  leaveTypeId?: string;
  fromDate?: string;
  toDate?: string;
  days?: string;
  reason?: string;
  status?: EmployeeLeaveRecord["status"];
  notes?: string | null;
}

/** Employee Leave list row enriched with employee and Leave Type labels. */
export type EmployeeLeaveDetailRecord = EmployeeLeaveRecord & {
  employeeCode: string;
  employeeName: string;
  leaveTypeName: string;
  leaveTypeIsPaid: boolean;
};

/** Contains one page of Employee Leave rows and the matching total count. */
export interface PaginatedEmployeeLeaveRecords {
  items: EmployeeLeaveDetailRecord[];
  total: number;
}

/** Lists Leave Types in stable name order. */
export async function listLeaveTypes(
  database: EmployeesDatabase,
): Promise<LeaveTypeRecord[]> {
  return database
    .select()
    .from(leaveTypes)
    .orderBy(asc(leaveTypes.name), asc(leaveTypes.id));
}

/** Reads one Leave Type by UUID. */
export async function findLeaveTypeById(
  database: EmployeesDatabase,
  leaveTypeId: string,
): Promise<LeaveTypeRecord | null> {
  const rows = await database
    .select()
    .from(leaveTypes)
    .where(eq(leaveTypes.id, leaveTypeId))
    .limit(1);

  return rows[0] ?? null;
}

/** Reads one Leave Type by its normalized case-insensitive name. */
export async function findLeaveTypeByName(
  database: EmployeesDatabase,
  name: string,
): Promise<LeaveTypeRecord | null> {
  const rows = await database
    .select()
    .from(leaveTypes)
    .where(eq(sql`lower(trim(${leaveTypes.name}))`, name.trim().toLowerCase()))
    .limit(1);

  return rows[0] ?? null;
}

/** Creates one Leave Type. */
export async function createLeaveType(
  database: EmployeesDatabase,
  input: NewLeaveType,
): Promise<LeaveTypeRecord | null> {
  const rows = await database.insert(leaveTypes).values(input).returning();
  return rows[0] ?? null;
}

/** Updates one Leave Type without deleting historical references. */
export async function updateLeaveType(
  database: EmployeesDatabase,
  leaveTypeId: string,
  changes: LeaveTypeChanges,
): Promise<LeaveTypeRecord | null> {
  const rows = await database
    .update(leaveTypes)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(leaveTypes.id, leaveTypeId))
    .returning();

  return rows[0] ?? null;
}

/** Lists Employee Leave rows using employee/type/status/date filters and pagination. */
export async function listEmployeeLeaves(
  database: EmployeesDatabase,
  query: ListEmployeeLeavesQuery,
): Promise<PaginatedEmployeeLeaveRecords> {
  const filters: SQL[] = [];

  if (query.employeeId) filters.push(eq(employeeLeaves.employeeId, query.employeeId));
  if (query.leaveTypeId) filters.push(eq(employeeLeaves.leaveTypeId, query.leaveTypeId));
  if (query.status) filters.push(eq(employeeLeaves.status, query.status));
  if (query.startDate) filters.push(gte(employeeLeaves.toDate, query.startDate));
  if (query.endDate) filters.push(lte(employeeLeaves.fromDate, query.endDate));

  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;
  const rows = await database
    .select({
      leave: employeeLeaves,
      employeeCode: employees.employeeCode,
      employeeName: employees.name,
      leaveTypeName: leaveTypes.name,
      leaveTypeIsPaid: leaveTypes.isPaid,
    })
    .from(employeeLeaves)
    .innerJoin(employees, eq(employeeLeaves.employeeId, employees.id))
    .innerJoin(leaveTypes, eq(employeeLeaves.leaveTypeId, leaveTypes.id))
    .where(where)
    .orderBy(desc(employeeLeaves.fromDate), desc(employeeLeaves.createdAt))
    .limit(query.pageSize)
    .offset(offset);
  const totalRows = await database
    .select({ total: count() })
    .from(employeeLeaves)
    .where(where);

  return {
    items: rows.map((row) => ({
      ...row.leave,
      employeeCode: row.employeeCode,
      employeeName: row.employeeName,
      leaveTypeName: row.leaveTypeName,
      leaveTypeIsPaid: row.leaveTypeIsPaid,
    })),
    total: totalRows[0]?.total ?? 0,
  };
}

/** Reads one Employee Leave row by UUID. */
export async function findEmployeeLeaveById(
  database: EmployeesDatabase,
  employeeLeaveId: string,
): Promise<EmployeeLeaveRecord | null> {
  const rows = await database
    .select()
    .from(employeeLeaves)
    .where(eq(employeeLeaves.id, employeeLeaveId))
    .limit(1);

  return rows[0] ?? null;
}

/** Serializes approved-leave overlap checks for one employee inside a transaction. */
export async function lockEmployeeLeaveApprovalScope(
  database: EmployeesDatabase,
  employeeId: string,
): Promise<void> {
  await database.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`employee_leave:${employeeId}`}, 0))`,
  );
}

/** Finds an approved leave whose date range overlaps the proposed range. */
export async function findApprovedLeaveOverlap(
  database: EmployeesDatabase,
  employeeId: string,
  fromDate: string,
  toDate: string,
  excludeLeaveId?: string,
): Promise<EmployeeLeaveRecord | null> {
  const filters: SQL[] = [
    eq(employeeLeaves.employeeId, employeeId),
    eq(employeeLeaves.status, "APPROVED"),
    lte(employeeLeaves.fromDate, toDate),
    gte(employeeLeaves.toDate, fromDate),
  ];

  if (excludeLeaveId) {
    filters.push(ne(employeeLeaves.id, excludeLeaveId));
  }

  const rows = await database
    .select()
    .from(employeeLeaves)
    .where(and(...filters))
    .limit(1);

  return rows[0] ?? null;
}

/** Creates one Employee Leave row. */
export async function createEmployeeLeave(
  database: EmployeesDatabase,
  input: NewEmployeeLeave,
): Promise<EmployeeLeaveRecord | null> {
  const rows = await database.insert(employeeLeaves).values(input).returning();
  return rows[0] ?? null;
}

/** Updates one Employee Leave workflow record. */
export async function updateEmployeeLeave(
  database: EmployeesDatabase,
  employeeLeaveId: string,
  changes: EmployeeLeaveChanges,
): Promise<EmployeeLeaveRecord | null> {
  const rows = await database
    .update(employeeLeaves)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(employeeLeaves.id, employeeLeaveId))
    .returning();

  return rows[0] ?? null;
}

/** Represents one confirmed employee advance saved in PostgreSQL. */
export type EmployeeAdvanceRecord = typeof employeeAdvances.$inferSelect;

/** Contains the fields needed to create one confirmed employee advance. */
export type NewEmployeeAdvance = typeof employeeAdvances.$inferInsert;

/** Represents one immutable employee advance recovery row. */
export type EmployeeAdvanceRecoveryRecord = typeof employeeAdvanceRecoveries.$inferSelect;

/** Contains the fields needed to create one advance recovery row. */
export type NewEmployeeAdvanceRecovery = typeof employeeAdvanceRecoveries.$inferInsert;

/** Contains the fields needed to create one employee ledger row. */
export type NewEmployeeLedgerEntry = typeof employeeLedgerEntries.$inferInsert;

/** One Employee Advance list row enriched with employee labels and recovered amount. */
export interface EmployeeAdvanceDetailRecord extends EmployeeAdvanceRecord {
  employeeCode: string;
  employeeName: string;
  recoveredAmount: string;
}

/** Contains one page of Employee Advance rows and the matching total count. */
export interface PaginatedEmployeeAdvanceRecords {
  items: EmployeeAdvanceDetailRecord[];
  total: number;
}

/** Lists Employee Advances using employee/date filters and pagination. */
export async function listEmployeeAdvances(
  database: EmployeesDatabase,
  query: ListEmployeeAdvancesQuery,
): Promise<PaginatedEmployeeAdvanceRecords> {
  const filters: SQL[] = [];

  if (query.employeeId) filters.push(eq(employeeAdvances.employeeId, query.employeeId));
  if (query.startDate) filters.push(gte(employeeAdvances.advanceDate, query.startDate));
  if (query.endDate) filters.push(lte(employeeAdvances.advanceDate, query.endDate));

  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;
  const rows = await database
    .select({
      advance: employeeAdvances,
      employeeCode: employees.employeeCode,
      employeeName: employees.name,
    })
    .from(employeeAdvances)
    .innerJoin(employees, eq(employeeAdvances.employeeId, employees.id))
    .where(where)
    .orderBy(desc(employeeAdvances.advanceDate), desc(employeeAdvances.createdAt), desc(employeeAdvances.id))
    .limit(query.pageSize)
    .offset(offset);

  const advanceIds = rows.map((row) => row.advance.id);
  const recoveryRows = advanceIds.length === 0
    ? []
    : await database
        .select({
          employeeAdvanceId: employeeAdvanceRecoveries.employeeAdvanceId,
          recoveredAmount: sql<string>`coalesce(sum(${employeeAdvanceRecoveries.amount}), 0)::text`,
        })
        .from(employeeAdvanceRecoveries)
        .where(inArray(employeeAdvanceRecoveries.employeeAdvanceId, advanceIds))
        .groupBy(employeeAdvanceRecoveries.employeeAdvanceId);
  const recoveredByAdvanceId = new Map(
    recoveryRows.map((row) => [row.employeeAdvanceId, row.recoveredAmount]),
  );

  const totalRows = await database
    .select({ total: count() })
    .from(employeeAdvances)
    .where(where);

  return {
    items: rows.map((row) => ({
      ...row.advance,
      employeeCode: row.employeeCode,
      employeeName: row.employeeName,
      recoveredAmount: recoveredByAdvanceId.get(row.advance.id) ?? "0.00",
    })),
    total: totalRows[0]?.total ?? 0,
  };
}

/** Locks one Employee Advance so concurrent recoveries cannot over-recover it. */
export async function lockEmployeeAdvanceById(
  database: EmployeesDatabase,
  employeeAdvanceId: string,
): Promise<EmployeeAdvanceRecord | null> {
  const rows = await database
    .select()
    .from(employeeAdvances)
    .where(eq(employeeAdvances.id, employeeAdvanceId))
    .for("update")
    .limit(1);

  return rows[0] ?? null;
}

/** Returns the exact total already recovered against one Employee Advance. */
export async function readEmployeeAdvanceRecoveredAmount(
  database: EmployeesDatabase,
  employeeAdvanceId: string,
): Promise<string> {
  const rows = await database
    .select({
      amount: sql<string>`coalesce(sum(${employeeAdvanceRecoveries.amount}), 0)::text`,
    })
    .from(employeeAdvanceRecoveries)
    .where(eq(employeeAdvanceRecoveries.employeeAdvanceId, employeeAdvanceId));

  return rows[0]?.amount ?? "0.00";
}

/** Inserts one confirmed Employee Advance. */
export async function createEmployeeAdvance(
  database: EmployeesDatabase,
  input: NewEmployeeAdvance,
): Promise<EmployeeAdvanceRecord | null> {
  const rows = await database.insert(employeeAdvances).values(input).returning();
  return rows[0] ?? null;
}

/** Inserts one immutable direct or payroll Employee Advance recovery. */
export async function createEmployeeAdvanceRecovery(
  database: EmployeesDatabase,
  input: NewEmployeeAdvanceRecovery,
): Promise<EmployeeAdvanceRecoveryRecord | null> {
  const rows = await database.insert(employeeAdvanceRecoveries).values(input).returning();
  return rows[0] ?? null;
}

/** Inserts one immutable employee salary/advance ledger entry. */
export async function createEmployeeLedgerEntry(
  database: EmployeesDatabase,
  input: NewEmployeeLedgerEntry,
): Promise<void> {
  await database.insert(employeeLedgerEntries).values(input);
}

/** Represents one Payroll Run header saved in PostgreSQL. */
export type PayrollRunRecord = typeof payrollRuns.$inferSelect;

/** Contains fields needed to create one DRAFT Payroll Run. */
export type NewPayrollRun = typeof payrollRuns.$inferInsert;

/** Contains Payroll Run header fields editable while the run remains DRAFT. */
export interface PayrollRunChanges {
  periodStart?: string;
  periodEnd?: string;
  grossTotal?: string;
  attendanceDeductionTotal?: string;
  additionsTotal?: string;
  deductionsTotal?: string;
  advanceRecoveryTotal?: string;
  netTotal?: string;
  notes?: string | null;
}

/** Represents one employee row inside a Payroll Run. */
export type PayrollItemRecord = typeof payrollItems.$inferSelect;

/** Contains fields needed to create one draft Payroll Item. */
export type NewPayrollItem = typeof payrollItems.$inferInsert;

/** Contains one page of Payroll Run headers and the matching total count. */
export interface PaginatedPayrollRunRecords {
  items: PayrollRunRecord[];
  total: number;
}

/** Classifies an approved leave range as paid or unpaid for payroll. */
export interface PayrollLeaveClassificationRecord {
  employeeId: string;
  fromDate: string;
  toDate: string;
  isPaid: boolean;
}

/** Contains the Employee Advance fields needed to validate draft payroll recovery. */
export interface PayrollAdvanceRecord {
  id: string;
  employeeId: string;
  originalAmount: string;
}

/** Lists Payroll Runs using status/date filters and pagination. */
export async function listPayrollRuns(
  database: EmployeesDatabase,
  query: ListPayrollRunsQuery,
): Promise<PaginatedPayrollRunRecords> {
  const filters: SQL[] = [];

  if (query.status) filters.push(eq(payrollRuns.status, query.status));
  if (query.startDate) filters.push(gte(payrollRuns.periodEnd, query.startDate));
  if (query.endDate) filters.push(lte(payrollRuns.periodStart, query.endDate));

  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;
  const items = await database
    .select()
    .from(payrollRuns)
    .where(where)
    .orderBy(desc(payrollRuns.periodStart), desc(payrollRuns.createdAt), desc(payrollRuns.id))
    .limit(query.pageSize)
    .offset(offset);
  const totalRows = await database
    .select({ total: count() })
    .from(payrollRuns)
    .where(where);

  return {
    items,
    total: totalRows[0]?.total ?? 0,
  };
}

/** Reads one Payroll Run header by UUID. */
export async function findPayrollRunById(
  database: EmployeesDatabase,
  payrollRunId: string,
): Promise<PayrollRunRecord | null> {
  const rows = await database
    .select()
    .from(payrollRuns)
    .where(eq(payrollRuns.id, payrollRunId))
    .limit(1);

  return rows[0] ?? null;
}

/** Locks one Payroll Run so concurrent draft edits cannot overwrite each other. */
export async function lockPayrollRunById(
  database: EmployeesDatabase,
  payrollRunId: string,
): Promise<PayrollRunRecord | null> {
  const rows = await database
    .select()
    .from(payrollRuns)
    .where(eq(payrollRuns.id, payrollRunId))
    .for("update")
    .limit(1);

  return rows[0] ?? null;
}

/** Serializes Payroll confirmations so overlapping periods cannot confirm concurrently. */
export async function lockPayrollConfirmationScope(
  database: EmployeesDatabase,
): Promise<void> {
  await database.execute(sql`select pg_advisory_xact_lock(16, 7)`);
}

/** Finds one already-confirmed Payroll Run whose period overlaps the supplied run. */
export async function findConfirmedPayrollRunOverlap(
  database: EmployeesDatabase,
  payrollRunId: string,
  periodStart: string,
  periodEnd: string,
): Promise<PayrollRunRecord | null> {
  const rows = await database
    .select()
    .from(payrollRuns)
    .where(and(
      ne(payrollRuns.id, payrollRunId),
      eq(payrollRuns.status, "CONFIRMED"),
      lte(payrollRuns.periodStart, periodEnd),
      gte(payrollRuns.periodEnd, periodStart),
    ))
    .limit(1);

  return rows[0] ?? null;
}

/** Lists the employee rows belonging to one Payroll Run in stable employee order. */
export async function listPayrollItemsByRun(
  database: EmployeesDatabase,
  payrollRunId: string,
): Promise<PayrollItemRecord[]> {
  return database
    .select()
    .from(payrollItems)
    .where(eq(payrollItems.payrollRunId, payrollRunId))
    .orderBy(asc(payrollItems.employeeNameSnapshot), asc(payrollItems.employeeCodeSnapshot), asc(payrollItems.id));
}

/** Inserts one new DRAFT Payroll Run header. */
export async function createPayrollRun(
  database: EmployeesDatabase,
  input: NewPayrollRun,
): Promise<PayrollRunRecord | null> {
  const rows = await database.insert(payrollRuns).values(input).returning();
  return rows[0] ?? null;
}

/** Updates one locked DRAFT Payroll Run header. */
export async function updatePayrollRun(
  database: EmployeesDatabase,
  payrollRunId: string,
  changes: PayrollRunChanges,
): Promise<PayrollRunRecord | null> {
  const rows = await database
    .update(payrollRuns)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(payrollRuns.id, payrollRunId))
    .returning();

  return rows[0] ?? null;
}

/** Deletes draft Payroll Items before recalculating the same unconfirmed run. */
export async function deletePayrollItemsByRun(
  database: EmployeesDatabase,
  payrollRunId: string,
): Promise<void> {
  await database.delete(payrollItems).where(eq(payrollItems.payrollRunId, payrollRunId));
}

/** Inserts the complete calculated employee set for one DRAFT Payroll Run. */
export async function createPayrollItems(
  database: EmployeesDatabase,
  inputs: NewPayrollItem[],
): Promise<PayrollItemRecord[]> {
  if (inputs.length === 0) {
    return [];
  }

  return database.insert(payrollItems).values(inputs).returning();
}

/** Marks one locked Payroll Run confirmed after all confirmation-side financial rows are written. */
export async function confirmPayrollRun(
  database: EmployeesDatabase,
  payrollRunId: string,
  confirmedAt: Date,
): Promise<PayrollRunRecord | null> {
  const rows = await database
    .update(payrollRuns)
    .set({
      status: "CONFIRMED",
      confirmedAt,
      updatedAt: confirmedAt,
    })
    .where(eq(payrollRuns.id, payrollRunId))
    .returning();

  return rows[0] ?? null;
}

/** Finds employees whose effective employment overlaps a payroll period. */
export async function findPayrollEmployeesForPeriod(
  database: EmployeesDatabase,
  periodStart: string,
  periodEnd: string,
): Promise<EmployeeRecord[]> {
  const employmentEndFilter = or(
    gte(employees.leaveDate, periodStart),
    and(isNull(employees.leaveDate), eq(employees.isActive, true)),
  );

  return database
    .select()
    .from(employees)
    .where(and(lte(employees.joinDate, periodEnd), employmentEndFilter))
    .orderBy(asc(employees.name), asc(employees.employeeCode), asc(employees.id));
}

/** Loads all attendance rows needed to calculate one payroll period. */
export async function listPayrollAttendanceForPeriod(
  database: EmployeesDatabase,
  employeeIds: string[],
  periodStart: string,
  periodEnd: string,
): Promise<AttendanceRecord[]> {
  if (employeeIds.length === 0) {
    return [];
  }

  return database
    .select()
    .from(attendanceRecords)
    .where(and(
      inArray(attendanceRecords.employeeId, employeeIds),
      gte(attendanceRecords.attendanceDate, periodStart),
      lte(attendanceRecords.attendanceDate, periodEnd),
    ))
    .orderBy(asc(attendanceRecords.employeeId), asc(attendanceRecords.attendanceDate));
}

/** Loads approved Leave ranges so attendance LEAVE days can be classified paid/unpaid. */
export async function listPayrollApprovedLeaveClassifications(
  database: EmployeesDatabase,
  employeeIds: string[],
  periodStart: string,
  periodEnd: string,
): Promise<PayrollLeaveClassificationRecord[]> {
  if (employeeIds.length === 0) {
    return [];
  }

  return database
    .select({
      employeeId: employeeLeaves.employeeId,
      fromDate: employeeLeaves.fromDate,
      toDate: employeeLeaves.toDate,
      isPaid: leaveTypes.isPaid,
    })
    .from(employeeLeaves)
    .innerJoin(leaveTypes, eq(employeeLeaves.leaveTypeId, leaveTypes.id))
    .where(and(
      inArray(employeeLeaves.employeeId, employeeIds),
      eq(employeeLeaves.status, "APPROVED"),
      lte(employeeLeaves.fromDate, periodEnd),
      gte(employeeLeaves.toDate, periodStart),
    ))
    .orderBy(asc(employeeLeaves.employeeId), asc(employeeLeaves.fromDate), asc(employeeLeaves.toDate));
}

/** Loads confirmed advances eligible for recovery up to the payroll period end. */
export async function listPayrollAdvancesForEmployees(
  database: EmployeesDatabase,
  employeeIds: string[],
  periodEnd: string,
): Promise<PayrollAdvanceRecord[]> {
  if (employeeIds.length === 0) {
    return [];
  }

  return database
    .select({
      id: employeeAdvances.id,
      employeeId: employeeAdvances.employeeId,
      originalAmount: employeeAdvances.originalAmount,
    })
    .from(employeeAdvances)
    .where(and(
      inArray(employeeAdvances.employeeId, employeeIds),
      lte(employeeAdvances.advanceDate, periodEnd),
      eq(employeeAdvances.status, "CONFIRMED"),
    ));
}

/** Locks one employee's eligible advances in deterministic order for payroll recovery allocation. */
export async function listPayrollAdvancesForEmployeeForUpdate(
  database: EmployeesDatabase,
  employeeId: string,
  periodEnd: string,
): Promise<PayrollAdvanceRecord[]> {
  return database
    .select({
      id: employeeAdvances.id,
      employeeId: employeeAdvances.employeeId,
      originalAmount: employeeAdvances.originalAmount,
    })
    .from(employeeAdvances)
    .where(and(
      eq(employeeAdvances.employeeId, employeeId),
      lte(employeeAdvances.advanceDate, periodEnd),
      eq(employeeAdvances.status, "CONFIRMED"),
    ))
    .orderBy(
      asc(employeeAdvances.advanceDate),
      asc(employeeAdvances.createdAt),
      asc(employeeAdvances.id),
    )
    .for("update");
}

/** Reads total recoveries for the supplied advances without storing a mutable balance. */
export async function listPayrollAdvanceRecoveryTotals(
  database: EmployeesDatabase,
  employeeAdvanceIds: string[],
): Promise<Array<{ employeeAdvanceId: string; recoveredAmount: string }>> {
  if (employeeAdvanceIds.length === 0) {
    return [];
  }

  return database
    .select({
      employeeAdvanceId: employeeAdvanceRecoveries.employeeAdvanceId,
      recoveredAmount: sql<string>`coalesce(sum(${employeeAdvanceRecoveries.amount}), 0)::text`,
    })
    .from(employeeAdvanceRecoveries)
    .where(inArray(employeeAdvanceRecoveries.employeeAdvanceId, employeeAdvanceIds))
    .groupBy(employeeAdvanceRecoveries.employeeAdvanceId);
}

/** Represents one immutable salary payment header. */
export type SalaryPaymentRecord = typeof salaryPayments.$inferSelect;

/** Contains fields needed to create one salary payment or reversal header. */
export type NewSalaryPayment = typeof salaryPayments.$inferInsert;

/** Represents one immutable CASH/BANK salary payment split. */
export type SalaryPaymentSplitRecord = typeof salaryPaymentSplits.$inferSelect;

/** Contains fields needed to create one salary payment split. */
export type NewSalaryPaymentSplit = typeof salaryPaymentSplits.$inferInsert;

/** Represents one immutable allocation from a salary payment to a Payroll Item. */
export type SalaryPaymentAllocationRecord = typeof salaryPaymentAllocations.$inferSelect;

/** Contains fields needed to create one salary payment allocation. */
export type NewSalaryPaymentAllocation = typeof salaryPaymentAllocations.$inferInsert;

/** One salary payment header enriched with immutable employee labels. */
export interface SalaryPaymentListRecord extends SalaryPaymentRecord {
  employeeCode: string;
  employeeName: string;
}

/** One locked confirmed Payroll Item with its current salary-payment allocation total. */
export interface SalaryPaymentPayrollItemRecord {
  id: string;
  employeeId: string;
  payrollRunId: string;
  payrollNumber: string;
  periodStart: string;
  periodEnd: string;
  initialDueAmount: string;
  allocatedAmount: string;
}

/** One salary payment allocation enriched with its Payroll Run labels. */
export interface SalaryPaymentAllocationDetailRecord extends SalaryPaymentAllocationRecord {
  payrollNumber: string;
  periodStart: string;
  periodEnd: string;
}

/** Contains one page of Salary Payment rows and the matching total count. */
export interface PaginatedSalaryPaymentRecords {
  items: SalaryPaymentListRecord[];
  total: number;
}

/** Builds Salary Payment list filters from employee/date fields. */
function buildSalaryPaymentFilters(query: ListSalaryPaymentsQuery): SQL[] {
  const filters: SQL[] = [];

  if (query.employeeId) filters.push(eq(salaryPayments.employeeId, query.employeeId));
  if (query.payrollRunId) {
    filters.push(sql`exists (
      select 1
      from ${salaryPaymentAllocations} allocation
      inner join ${payrollItems} item on item.id = allocation.payroll_item_id
      where allocation.salary_payment_id = ${salaryPayments.id}
        and item.payroll_run_id = ${query.payrollRunId}::uuid
    )`);
  }
  if (query.startDate) filters.push(gte(salaryPayments.paymentDate, query.startDate));
  if (query.endDate) filters.push(lte(salaryPayments.paymentDate, query.endDate));

  return filters;
}

/** Lists Salary Payment headers with employee labels and pagination. */
export async function listSalaryPayments(
  database: EmployeesDatabase,
  query: ListSalaryPaymentsQuery,
): Promise<PaginatedSalaryPaymentRecords> {
  const filters = buildSalaryPaymentFilters(query);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;
  const items = await database
    .select({
      payment: salaryPayments,
      employeeCode: employees.employeeCode,
      employeeName: employees.name,
    })
    .from(salaryPayments)
    .innerJoin(employees, eq(salaryPayments.employeeId, employees.id))
    .where(where)
    .orderBy(desc(salaryPayments.paymentDate), desc(salaryPayments.createdAt), desc(salaryPayments.id))
    .limit(query.pageSize)
    .offset(offset);
  const totalRows = await database
    .select({ total: count() })
    .from(salaryPayments)
    .where(where);

  return {
    items: items.map((row) => ({ ...row.payment, employeeCode: row.employeeCode, employeeName: row.employeeName })),
    total: totalRows[0]?.total ?? 0,
  };
}

/** Reads one Salary Payment header by UUID. */
export async function findSalaryPaymentById(
  database: EmployeesDatabase,
  salaryPaymentId: string,
): Promise<SalaryPaymentRecord | null> {
  const rows = await database
    .select()
    .from(salaryPayments)
    .where(eq(salaryPayments.id, salaryPaymentId))
    .limit(1);

  return rows[0] ?? null;
}

/** Locks one Salary Payment before reversal. */
export async function lockSalaryPaymentById(
  database: EmployeesDatabase,
  salaryPaymentId: string,
): Promise<SalaryPaymentRecord | null> {
  const rows = await database
    .select()
    .from(salaryPayments)
    .where(eq(salaryPayments.id, salaryPaymentId))
    .for("update")
    .limit(1);

  return rows[0] ?? null;
}

/** Finds a reversal row already linked to one original Salary Payment. */
export async function findSalaryPaymentReversal(
  database: EmployeesDatabase,
  salaryPaymentId: string,
): Promise<SalaryPaymentRecord | null> {
  const rows = await database
    .select()
    .from(salaryPayments)
    .where(eq(salaryPayments.reversalOfPaymentId, salaryPaymentId))
    .limit(1);

  return rows[0] ?? null;
}

/** Locks confirmed Payroll Items and derives their currently allocated salary-payment totals. */
export async function lockSalaryPaymentPayrollItems(
  database: EmployeesDatabase,
  payrollItemIds: string[],
): Promise<SalaryPaymentPayrollItemRecord[]> {
  if (payrollItemIds.length === 0) return [];

  const itemRows = await database
    .select({
      id: payrollItems.id,
      employeeId: payrollItems.employeeId,
      payrollRunId: payrollItems.payrollRunId,
      payrollNumber: payrollRuns.payrollNumber,
      periodStart: payrollRuns.periodStart,
      periodEnd: payrollRuns.periodEnd,
      initialDueAmount: payrollItems.initialDueAmount,
    })
    .from(payrollItems)
    .innerJoin(payrollRuns, eq(payrollItems.payrollRunId, payrollRuns.id))
    .where(and(
      inArray(payrollItems.id, payrollItemIds),
      eq(payrollRuns.status, "CONFIRMED"),
    ))
    .orderBy(asc(payrollItems.id))
    .for("update");

  const allocationRows = await database
    .select({
      payrollItemId: salaryPaymentAllocations.payrollItemId,
      allocatedAmount: sql<string>`coalesce(sum(${salaryPaymentAllocations.amount}), 0)::text`,
    })
    .from(salaryPaymentAllocations)
    .innerJoin(salaryPayments, eq(salaryPaymentAllocations.salaryPaymentId, salaryPayments.id))
    .where(and(
      inArray(salaryPaymentAllocations.payrollItemId, payrollItemIds),
      eq(salaryPayments.status, "CONFIRMED"),
      isNull(salaryPayments.reversalOfPaymentId),
    ))
    .groupBy(salaryPaymentAllocations.payrollItemId);
  const allocatedByItem = new Map(
    allocationRows.map((row) => [row.payrollItemId, row.allocatedAmount]),
  );

  return itemRows.map((row) => ({
    ...row,
    allocatedAmount: allocatedByItem.get(row.id) ?? "0.00",
  }));
}

/** Derives confirmed salary-payment totals for Payroll Items without locking them. */
export async function listSalaryPaymentAllocationTotalsByPayrollItems(
  database: EmployeesDatabase,
  payrollItemIds: string[],
): Promise<Array<{ payrollItemId: string; paidAmount: string }>> {
  if (payrollItemIds.length === 0) return [];

  return database
    .select({
      payrollItemId: salaryPaymentAllocations.payrollItemId,
      paidAmount: sql<string>`coalesce(sum(${salaryPaymentAllocations.amount}), 0)::text`,
    })
    .from(salaryPaymentAllocations)
    .innerJoin(salaryPayments, eq(salaryPaymentAllocations.salaryPaymentId, salaryPayments.id))
    .where(and(
      inArray(salaryPaymentAllocations.payrollItemId, payrollItemIds),
      eq(salaryPayments.status, "CONFIRMED"),
      isNull(salaryPayments.reversalOfPaymentId),
    ))
    .groupBy(salaryPaymentAllocations.payrollItemId);
}

/** Creates one immutable Salary Payment header. */
export async function createSalaryPayment(
  database: EmployeesDatabase,
  input: NewSalaryPayment,
): Promise<SalaryPaymentRecord | null> {
  const rows = await database.insert(salaryPayments).values(input).returning();
  return rows[0] ?? null;
}

/** Creates all CASH/BANK splits for one Salary Payment. */
export async function createSalaryPaymentSplits(
  database: EmployeesDatabase,
  inputs: NewSalaryPaymentSplit[],
): Promise<SalaryPaymentSplitRecord[]> {
  if (inputs.length === 0) return [];
  return database.insert(salaryPaymentSplits).values(inputs).returning();
}

/** Creates all Payroll Item allocations for one Salary Payment. */
export async function createSalaryPaymentAllocations(
  database: EmployeesDatabase,
  inputs: NewSalaryPaymentAllocation[],
): Promise<SalaryPaymentAllocationRecord[]> {
  if (inputs.length === 0) return [];
  return database.insert(salaryPaymentAllocations).values(inputs).returning();
}

/** Lists immutable CASH/BANK splits belonging to one Salary Payment. */
export async function listSalaryPaymentSplits(
  database: EmployeesDatabase,
  salaryPaymentId: string,
): Promise<SalaryPaymentSplitRecord[]> {
  return database
    .select()
    .from(salaryPaymentSplits)
    .where(eq(salaryPaymentSplits.salaryPaymentId, salaryPaymentId))
    .orderBy(asc(salaryPaymentSplits.createdAt), asc(salaryPaymentSplits.id));
}

/** Lists immutable Payroll Item allocations belonging to one Salary Payment. */
export async function listSalaryPaymentAllocations(
  database: EmployeesDatabase,
  salaryPaymentId: string,
): Promise<SalaryPaymentAllocationDetailRecord[]> {
  return database
    .select({
      id: salaryPaymentAllocations.id,
      salaryPaymentId: salaryPaymentAllocations.salaryPaymentId,
      payrollItemId: salaryPaymentAllocations.payrollItemId,
      amount: salaryPaymentAllocations.amount,
      createdAt: salaryPaymentAllocations.createdAt,
      payrollNumber: payrollRuns.payrollNumber,
      periodStart: payrollRuns.periodStart,
      periodEnd: payrollRuns.periodEnd,
    })
    .from(salaryPaymentAllocations)
    .innerJoin(payrollItems, eq(salaryPaymentAllocations.payrollItemId, payrollItems.id))
    .innerJoin(payrollRuns, eq(payrollItems.payrollRunId, payrollRuns.id))
    .where(eq(salaryPaymentAllocations.salaryPaymentId, salaryPaymentId))
    .orderBy(asc(payrollRuns.periodStart), asc(salaryPaymentAllocations.createdAt), asc(salaryPaymentAllocations.id));
}

/** Marks one original Salary Payment reversed only after its linked reversal row exists. */
export async function markSalaryPaymentReversed(
  database: EmployeesDatabase,
  salaryPaymentId: string,
  reversalPaymentId: string,
): Promise<SalaryPaymentRecord | null> {
  const linkedReversalExists = sql`exists (
    select 1
    from ${salaryPayments} reversal
    where reversal.id = ${reversalPaymentId}::uuid
      and reversal.reversal_of_payment_id = ${salaryPaymentId}::uuid
  )`;
  const rows = await database
    .update(salaryPayments)
    .set({ status: "REVERSED" })
    .where(and(
      eq(salaryPayments.id, salaryPaymentId),
      eq(salaryPayments.status, "CONFIRMED"),
      linkedReversalExists,
    ))
    .returning();

  return rows[0] ?? null;
}
