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
  salaryPayable?: string;
  advanceOutstanding?: string;
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

/** Leave workflow states supported by Employee Management. */
export type EmployeeLeaveStatus = "PENDING" | "APPROVED" | "REJECTED";

/** One reusable paid/unpaid Leave Type returned by the API. */
export interface LeaveType {
  id: string;
  name: string;
  isPaid: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Fields accepted when creating one Leave Type. */
export interface CreateLeaveTypeInput {
  name: string;
  isPaid: boolean;
}

/** Fields accepted when updating one Leave Type. */
export interface UpdateLeaveTypeInput {
  name?: string;
  isPaid?: boolean;
  isActive?: boolean;
}

/** One Employee Leave row returned by create/update APIs. */
export interface EmployeeLeaveRecord {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  days: string;
  reason: string;
  status: EmployeeLeaveStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One Employee Leave row enriched for the Leave list. */
export interface EmployeeLeave extends EmployeeLeaveRecord {
  employeeCode: string;
  employeeName: string;
  leaveTypeName: string;
  leaveTypeIsPaid: boolean;
}

/** One paginated Employee Leave list response. */
export interface PaginatedEmployeeLeaves {
  items: EmployeeLeave[];
  total: number;
}

/** Filters accepted by GET /employee-leaves. */
export interface EmployeeLeaveListFilters {
  employeeId?: string;
  leaveTypeId?: string;
  status?: EmployeeLeaveStatus;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

/** Fields accepted when creating one Employee Leave row. */
export interface CreateEmployeeLeaveInput {
  employeeId: string;
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  days: string;
  reason: string;
  status?: EmployeeLeaveStatus;
  notes?: string | null;
}

/** Fields accepted when updating one Employee Leave row. */
export interface UpdateEmployeeLeaveInput {
  employeeId?: string;
  leaveTypeId?: string;
  fromDate?: string;
  toDate?: string;
  days?: string;
  reason?: string;
  status?: EmployeeLeaveStatus;
  notes?: string | null;
}

/** Builds the query string accepted by the Employee Leave list route. */
function buildEmployeeLeaveListQuery(filters: EmployeeLeaveListFilters): string {
  const params = new URLSearchParams();

  if (filters.employeeId) params.set("employeeId", filters.employeeId);
  if (filters.leaveTypeId) params.set("leaveTypeId", filters.leaveTypeId);
  if (filters.status) params.set("status", filters.status);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (filters.page !== undefined) params.set("page", String(filters.page));
  if (filters.pageSize !== undefined) params.set("pageSize", String(filters.pageSize));

  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Loads all Leave Types in stable backend order. */
export function loadLeaveTypes(): Promise<ApiSuccess<LeaveType[]>> {
  return requestApi<ApiSuccess<LeaveType[]>>("/leave-types");
}

/** Creates one reusable Leave Type. */
export function createLeaveType(
  input: CreateLeaveTypeInput,
): Promise<ApiSuccess<LeaveType>> {
  return requestApi<ApiSuccess<LeaveType>>("/leave-types", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Updates one reusable Leave Type. */
export function updateLeaveType(
  leaveTypeId: string,
  input: UpdateLeaveTypeInput,
): Promise<ApiSuccess<LeaveType>> {
  return requestApi<ApiSuccess<LeaveType>>(`/leave-types/${leaveTypeId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** Loads one filtered and paginated Employee Leave list. */
export function loadEmployeeLeaves(
  filters: EmployeeLeaveListFilters = {},
): Promise<ApiSuccess<PaginatedEmployeeLeaves>> {
  return requestApi<ApiSuccess<PaginatedEmployeeLeaves>>(
    `/employee-leaves${buildEmployeeLeaveListQuery(filters)}`,
  );
}

/** Creates one Employee Leave workflow row. */
export function createEmployeeLeave(
  input: CreateEmployeeLeaveInput,
): Promise<ApiSuccess<EmployeeLeaveRecord>> {
  return requestApi<ApiSuccess<EmployeeLeaveRecord>>("/employee-leaves", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Updates one Employee Leave workflow row. */
export function updateEmployeeLeave(
  employeeLeaveId: string,
  input: UpdateEmployeeLeaveInput,
): Promise<ApiSuccess<EmployeeLeaveRecord>> {
  return requestApi<ApiSuccess<EmployeeLeaveRecord>>(`/employee-leaves/${employeeLeaveId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** Payment methods accepted by Employee Advance financial mutations. */
export type EmployeeAdvancePaymentMethod = "CASH" | "BANK_TRANSFER";

/** One Employee Advance list row with derived recovery/outstanding values. */
export interface EmployeeAdvance {
  id: string;
  advanceNumber: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  advanceDate: string;
  originalAmount: string;
  paymentMethod: EmployeeAdvancePaymentMethod;
  cashAccountId: string | null;
  bankAccountId: string | null;
  note: string | null;
  status: "CONFIRMED";
  createdAt: string;
  recoveredAmount: string;
  outstandingAmount: string;
}

/** One paginated Employee Advance list response. */
export interface PaginatedEmployeeAdvances {
  items: EmployeeAdvance[];
  total: number;
}

/** Filters accepted by GET /employee-advances. */
export interface EmployeeAdvanceListFilters {
  employeeId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

/** Fields accepted when creating one Employee Advance. */
export interface CreateEmployeeAdvanceInput {
  employeeId: string;
  advanceDate: string;
  amount: string;
  paymentMethod: EmployeeAdvancePaymentMethod;
  cashAccountId?: string | null;
  bankAccountId?: string | null;
  note?: string | null;
}

/** Fields accepted when directly recovering one Employee Advance. */
export interface RecoverEmployeeAdvanceInput {
  recoveryDate: string;
  amount: string;
  paymentMethod: EmployeeAdvancePaymentMethod;
  cashAccountId?: string | null;
  bankAccountId?: string | null;
  note?: string | null;
}

/** One direct Employee Advance recovery returned by the API. */
export interface EmployeeAdvanceRecovery {
  id: string;
  employeeAdvanceId: string;
  payrollItemId: string | null;
  recoveryNumber: string | null;
  recoveryDate: string;
  amount: string;
  paymentMethod: EmployeeAdvancePaymentMethod | null;
  cashAccountId: string | null;
  bankAccountId: string | null;
  note: string | null;
  createdAt: string;
}

/** Builds the query string accepted by the Employee Advance list route. */
function buildEmployeeAdvanceListQuery(filters: EmployeeAdvanceListFilters): string {
  const params = new URLSearchParams();

  if (filters.employeeId) params.set("employeeId", filters.employeeId);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (filters.page !== undefined) params.set("page", String(filters.page));
  if (filters.pageSize !== undefined) params.set("pageSize", String(filters.pageSize));

  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Loads one filtered and paginated Employee Advance list. */
export function loadEmployeeAdvances(
  filters: EmployeeAdvanceListFilters = {},
): Promise<ApiSuccess<PaginatedEmployeeAdvances>> {
  return requestApi<ApiSuccess<PaginatedEmployeeAdvances>>(
    `/employee-advances${buildEmployeeAdvanceListQuery(filters)}`,
  );
}

/** Creates one Employee Advance through the idempotent financial API. */
export function createEmployeeAdvance(
  input: CreateEmployeeAdvanceInput,
  idempotencyKey: string,
): Promise<ApiSuccess<Omit<EmployeeAdvance, "employeeCode" | "employeeName" | "recoveredAmount" | "outstandingAmount">>> {
  return requestApi<ApiSuccess<Omit<EmployeeAdvance, "employeeCode" | "employeeName" | "recoveredAmount" | "outstandingAmount">>>(
    "/employee-advances",
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input),
    },
  );
}

/** Directly recovers one Employee Advance through the idempotent financial API. */
export function recoverEmployeeAdvance(
  employeeAdvanceId: string,
  input: RecoverEmployeeAdvanceInput,
  idempotencyKey: string,
): Promise<ApiSuccess<EmployeeAdvanceRecovery>> {
  return requestApi<ApiSuccess<EmployeeAdvanceRecovery>>(
    `/employee-advances/${employeeAdvanceId}/recover`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input),
    },
  );
}

/** Payroll workflow state returned by Payroll Run APIs. */
export type PayrollStatus = "DRAFT" | "CONFIRMED";

/** One Payroll Run header returned by list/detail APIs. */
export interface PayrollRun {
  id: string;
  payrollNumber: string;
  periodStart: string;
  periodEnd: string;
  status: PayrollStatus;
  grossTotal: string;
  attendanceDeductionTotal: string;
  additionsTotal: string;
  deductionsTotal: string;
  advanceRecoveryTotal: string;
  netTotal: string;
  notes: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One employee calculation row inside a Payroll Run detail. */
export interface PayrollItem {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeCodeSnapshot: string;
  employeeNameSnapshot: string;
  jobTitleSnapshot: string | null;
  baseSalarySnapshot: string;
  workingDays: string;
  payableDays: string;
  presentDays: string;
  paidLeaveDays: string;
  unpaidLeaveDays: string;
  absentDays: string;
  halfDays: string;
  grossSalary: string;
  attendanceDeduction: string;
  additionsAmount: string;
  additionsReason: string | null;
  deductionsAmount: string;
  deductionsReason: string | null;
  advanceRecoveryAmount: string;
  netSalary: string;
  initialPaidAmount: string;
  initialDueAmount: string;
  paidAmount: string;
  remainingDueAmount: string;
  createdAt: string;
}

/** Complete Payroll Run detail returned by GET /payroll-runs/:id. */
export interface PayrollRunDetail {
  run: PayrollRun;
  items: PayrollItem[];
}

/** One paginated Payroll Run list response. */
export interface PaginatedPayrollRuns {
  items: PayrollRun[];
  total: number;
}

/** Filters accepted by GET /payroll-runs. */
export interface PayrollRunListFilters {
  status?: PayrollStatus;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

/** Fields accepted when creating one DRAFT Payroll Run. */
export interface CreatePayrollRunInput {
  periodStart: string;
  periodEnd: string;
  notes?: string | null;
}

/** Editable adjustment fields for one employee in a DRAFT Payroll Run. */
export interface UpdatePayrollItemInput {
  employeeId: string;
  additionsAmount?: string;
  additionsReason?: string | null;
  deductionsAmount?: string;
  deductionsReason?: string | null;
  advanceRecoveryAmount?: string;
}

/** Fields accepted when recalculating one DRAFT Payroll Run. */
export interface UpdatePayrollRunInput {
  periodStart?: string;
  periodEnd?: string;
  notes?: string | null;
  items?: UpdatePayrollItemInput[];
}

/** Builds the query string accepted by the Payroll Run list route. */
function buildPayrollRunListQuery(filters: PayrollRunListFilters): string {
  const params = new URLSearchParams();

  if (filters.status) params.set("status", filters.status);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (filters.page !== undefined) params.set("page", String(filters.page));
  if (filters.pageSize !== undefined) params.set("pageSize", String(filters.pageSize));

  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Loads one filtered and paginated Payroll Run list. */
export function loadPayrollRuns(
  filters: PayrollRunListFilters = {},
): Promise<ApiSuccess<PaginatedPayrollRuns>> {
  return requestApi<ApiSuccess<PaginatedPayrollRuns>>(
    `/payroll-runs${buildPayrollRunListQuery(filters)}`,
  );
}

/** Loads one Payroll Run with all employee calculation rows. */
export function loadPayrollRun(payrollRunId: string): Promise<ApiSuccess<PayrollRunDetail>> {
  return requestApi<ApiSuccess<PayrollRunDetail>>(`/payroll-runs/${payrollRunId}`);
}

/** Creates and calculates one DRAFT Payroll Run. */
export function createPayrollRun(
  input: CreatePayrollRunInput,
): Promise<ApiSuccess<PayrollRunDetail>> {
  return requestApi<ApiSuccess<PayrollRunDetail>>("/payroll-runs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Recalculates editable values of one DRAFT Payroll Run. */
export function updatePayrollRun(
  payrollRunId: string,
  input: UpdatePayrollRunInput,
): Promise<ApiSuccess<PayrollRunDetail>> {
  return requestApi<ApiSuccess<PayrollRunDetail>>(`/payroll-runs/${payrollRunId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** Confirms one DRAFT Payroll Run without creating cash/bank movement. */
export function confirmPayrollRun(
  payrollRunId: string,
  idempotencyKey: string,
): Promise<ApiSuccess<PayrollRunDetail>> {
  return requestApi<ApiSuccess<PayrollRunDetail>>(`/payroll-runs/${payrollRunId}/confirm`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

/** One CASH/BANK split accepted by Salary Payment creation. */
export interface SalaryPaymentSplitInput {
  method: EmployeeAdvancePaymentMethod;
  amount: string;
  cashAccountId?: string | null;
  bankAccountId?: string | null;
}

/** One Payroll Item allocation accepted by Salary Payment creation. */
export interface SalaryPaymentAllocationInput {
  payrollItemId: string;
  amount: string;
}

/** Fields accepted when creating one Salary Payment. */
export interface CreateSalaryPaymentInput {
  employeeId: string;
  paymentDate: string;
  splits: SalaryPaymentSplitInput[];
  allocations: SalaryPaymentAllocationInput[];
  notes?: string | null;
}

/** One immutable Salary Payment header returned in list responses. */
export interface SalaryPayment {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  documentNumber: string;
  paymentDate: string;
  totalAmount: string;
  status: "CONFIRMED" | "REVERSED";
  reversalOfPaymentId: string | null;
  reversalReason: string | null;
  notes: string | null;
  createdAt: string;
}

/** One stored Salary Payment account split. */
export interface SalaryPaymentSplit {
  id: string;
  salaryPaymentId: string;
  method: EmployeeAdvancePaymentMethod;
  amount: string;
  cashAccountId: string | null;
  bankAccountId: string | null;
  createdAt: string;
}

/** One Salary Payment allocation enriched with its Payroll Run labels. */
export interface SalaryPaymentAllocation {
  id: string;
  salaryPaymentId: string;
  payrollItemId: string;
  amount: string;
  createdAt: string;
  payrollNumber: string;
  periodStart: string;
  periodEnd: string;
}

/** Complete immutable Salary Payment detail returned by the API. */
export interface SalaryPaymentDetail extends SalaryPayment {
  splits: SalaryPaymentSplit[];
  allocations: SalaryPaymentAllocation[];
}

/** One paginated Salary Payment list response. */
export interface PaginatedSalaryPayments {
  items: SalaryPayment[];
  total: number;
}

/** Filters accepted by GET /salary-payments. */
export interface SalaryPaymentListFilters {
  employeeId?: string;
  payrollRunId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

/** Builds the query string accepted by the Salary Payment list route. */
function buildSalaryPaymentListQuery(filters: SalaryPaymentListFilters): string {
  const params = new URLSearchParams();

  if (filters.employeeId) params.set("employeeId", filters.employeeId);
  if (filters.payrollRunId) params.set("payrollRunId", filters.payrollRunId);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (filters.page !== undefined) params.set("page", String(filters.page));
  if (filters.pageSize !== undefined) params.set("pageSize", String(filters.pageSize));

  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Loads Salary Payments using employee/payroll/date filters. */
export function loadSalaryPayments(
  filters: SalaryPaymentListFilters = {},
): Promise<ApiSuccess<PaginatedSalaryPayments>> {
  return requestApi<ApiSuccess<PaginatedSalaryPayments>>(
    `/salary-payments${buildSalaryPaymentListQuery(filters)}`,
  );
}

/** Loads one immutable Salary Payment with splits and allocations. */
export function loadSalaryPayment(
  salaryPaymentId: string,
): Promise<ApiSuccess<SalaryPaymentDetail>> {
  return requestApi<ApiSuccess<SalaryPaymentDetail>>(`/salary-payments/${salaryPaymentId}`);
}

/** Creates one idempotent Salary Payment. */
export function createSalaryPayment(
  input: CreateSalaryPaymentInput,
  idempotencyKey: string,
): Promise<ApiSuccess<SalaryPaymentDetail>> {
  return requestApi<ApiSuccess<SalaryPaymentDetail>>("/salary-payments", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}

/** Reverses one Salary Payment through the idempotent financial API. */
export function reverseSalaryPayment(
  salaryPaymentId: string,
  reason: string,
  idempotencyKey: string,
): Promise<ApiSuccess<SalaryPaymentDetail>> {
  return requestApi<ApiSuccess<SalaryPaymentDetail>>(
    `/salary-payments/${salaryPaymentId}/reverse`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ reason }),
    },
  );
}
