import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { attendanceRecords, employees } from "../../database/schema/index.js";
import type {
  ListEmployeeAttendanceQuery,
  ListEmployeesQuery,
} from "./employees.schema.js";

/** Contains the database methods used by the Employee repository. */
export type EmployeesDatabase = Pick<NodePgDatabase, "select" | "insert" | "update">;

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
