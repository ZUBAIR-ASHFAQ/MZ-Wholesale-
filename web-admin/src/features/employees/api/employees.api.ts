import { requestApi } from "../../../lib/api-client.ts";
import type { ApiSuccess } from "../../../lib/api-types.ts";

/** One employee master row returned by the Employee Management API. */
export interface Employee {
  id: string;
  employeeCode: string;
  name: string;
  fatherSpouseName: string | null;
  phone: string | null;
  email: string | null;
  referenceId: string | null;
  address: string | null;
  emergencyContact: string | null;
  jobTitle: string | null;
  department: string | null;
  joinDate: string;
  leaveDate: string | null;
  employmentType: string;
  baseMonthlySalary: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One page returned by GET /employees. */
export interface PaginatedEmployees {
  items: Employee[];
  total: number;
}

/** Filters accepted by GET /employees. */
export interface EmployeeListFilters {
  search?: string;
  active?: boolean;
  employmentDate?: string;
  page?: number;
  pageSize?: number;
}

/** Fields accepted when creating an employee. */
export interface CreateEmployeeInput {
  employeeCode: string;
  name: string;
  fatherSpouseName?: string | null;
  phone?: string | null;
  email?: string | null;
  referenceId?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  joinDate: string;
  leaveDate?: string | null;
  employmentType: string;
  baseMonthlySalary: string;
}

/** Fields accepted when updating an employee. */
export interface UpdateEmployeeInput {
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

/** Builds the query string accepted by the employee-list route. */
function buildEmployeeListQuery(filters: EmployeeListFilters): string {
  const params = new URLSearchParams();
  const search = filters.search?.trim();

  if (search) params.set("search", search);
  if (filters.active !== undefined) params.set("active", String(filters.active));
  if (filters.employmentDate) params.set("employmentDate", filters.employmentDate);
  if (filters.page !== undefined) params.set("page", String(filters.page));
  if (filters.pageSize !== undefined) params.set("pageSize", String(filters.pageSize));

  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Loads one filtered and paginated employee list. */
export async function loadEmployees(
  filters: EmployeeListFilters = {},
): Promise<ApiSuccess<PaginatedEmployees>> {
  return requestApi<ApiSuccess<PaginatedEmployees>>(
    `/employees${buildEmployeeListQuery(filters)}`,
  );
}

/** Loads one employee master record. */
export async function loadEmployee(
  employeeId: string,
): Promise<ApiSuccess<Employee>> {
  return requestApi<ApiSuccess<Employee>>(`/employees/${employeeId}`);
}

/** Creates one employee master record. */
export async function createEmployee(
  input: CreateEmployeeInput,
): Promise<ApiSuccess<Employee>> {
  return requestApi<ApiSuccess<Employee>>("/employees", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Updates approved employee master fields or active status. */
export async function updateEmployee(
  employeeId: string,
  input: UpdateEmployeeInput,
): Promise<ApiSuccess<Employee>> {
  return requestApi<ApiSuccess<Employee>>(`/employees/${employeeId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** Attendance states supported by the employee attendance table. */
export type AttendanceStatus =
  | "PRESENT"
  | "ABSENT"
  | "HALF_DAY"
  | "LEAVE"
  | "HOLIDAY"
  | "WEEKLY_OFF";

/** One employee attendance row returned by the API. */
export interface AttendanceRecord {
  id: string;
  employeeId: string;
  attendanceDate: string;
  status: AttendanceStatus;
  checkIn: string | null;
  checkOut: string | null;
  workedHours: string | null;
  notes: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

/** One paginated employee attendance history response. */
export interface PaginatedAttendance {
  items: AttendanceRecord[];
  total: number;
}

/** Filters accepted by GET /employees/:id/attendance. */
export interface AttendanceListFilters {
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

/** Fields accepted when creating one attendance record. */
export interface CreateAttendanceInput {
  employeeId: string;
  attendanceDate: string;
  status: AttendanceStatus;
  checkIn?: string | null;
  checkOut?: string | null;
  workedHours?: string | null;
  notes?: string | null;
}

/** Builds the query string accepted by one employee's attendance history route. */
function buildAttendanceListQuery(filters: AttendanceListFilters): string {
  const params = new URLSearchParams();

  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (filters.page !== undefined) params.set("page", String(filters.page));
  if (filters.pageSize !== undefined) params.set("pageSize", String(filters.pageSize));

  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Loads one employee's attendance history. */
export async function loadEmployeeAttendance(
  employeeId: string,
  filters: AttendanceListFilters = {},
): Promise<ApiSuccess<PaginatedAttendance>> {
  return requestApi<ApiSuccess<PaginatedAttendance>>(
    `/employees/${employeeId}/attendance${buildAttendanceListQuery(filters)}`,
  );
}

/** Creates one manual attendance row. */
export async function createAttendance(
  input: CreateAttendanceInput,
): Promise<ApiSuccess<AttendanceRecord>> {
  return requestApi<ApiSuccess<AttendanceRecord>>("/employees/attendance", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Creates one attendance batch atomically. */
export async function createAttendanceBulk(
  records: CreateAttendanceInput[],
): Promise<ApiSuccess<AttendanceRecord[]>> {
  return requestApi<ApiSuccess<AttendanceRecord[]>>("/employees/attendance/bulk", {
    method: "POST",
    body: JSON.stringify({ records }),
  });
}
