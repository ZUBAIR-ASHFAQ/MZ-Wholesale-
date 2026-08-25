import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import { dashboardQueryKeys } from "../../dashboard/hooks/use-dashboard.ts";
import { loadPaymentAccounts } from "../../payments/api/payments.api.ts";
import { paymentQueryKeys } from "../../payments/hooks/use-payments.ts";
import { reportQueryKeys } from "../../reports/hooks/use-reports.ts";
import {
  confirmPayrollRun,
  createAttendanceBulk,
  createEmployeeAdvance,
  createPayrollRun,
  createSalaryPayment,
  createEmployee,
  createEmployeeLeave,
  createLeaveType,
  loadEmployee,
  loadEmployeeAdvances,
  loadEmployeeAttendance,
  loadEmployeeLeaves,
  loadEmployees,
  loadLeaveTypes,
  loadPayrollRun,
  loadPayrollRuns,
  loadSalaryPayment,
  loadSalaryPayments,
  recoverEmployeeAdvance,
  reverseSalaryPayment,
  updateEmployee,
  updateEmployeeLeave,
  updateLeaveType,
  updatePayrollRun,
  type CreateAttendanceInput,
  type CreateEmployeeAdvanceInput,
  type CreateEmployeeInput,
  type CreateEmployeeLeaveInput,
  type CreateLeaveTypeInput,
  type CreatePayrollRunInput,
  type CreateSalaryPaymentInput,
  type EmployeeAdvanceListFilters,
  type EmployeeLeaveListFilters,
  type EmployeeListFilters,
  type PayrollRunListFilters,
  type RecoverEmployeeAdvanceInput,
  type SalaryPaymentListFilters,
  type UpdateEmployeeInput,
  type UpdateEmployeeLeaveInput,
  type UpdateLeaveTypeInput,
  type UpdatePayrollRunInput,
} from "../api/employees.api.ts";

/** Stable cache keys used by every Employee Management screen. */
export const employeeQueryKeys = {
  all: ["employees"] as const,
  lists: () => ["employees", "list"] as const,
  list: (filters: EmployeeListFilters) => ["employees", "list", filters] as const,
  details: () => ["employees", "detail"] as const,
  detail: (employeeId: string) => ["employees", "detail", employeeId] as const,
  attendance: () => ["employees", "attendance"] as const,
  attendanceForDate: (employeeId: string, attendanceDate: string) =>
    ["employees", "attendance", employeeId, attendanceDate] as const,
  leaveTypes: () => ["employees", "leave-types"] as const,
  leaves: () => ["employees", "leaves"] as const,
  leaveList: (filters: EmployeeLeaveListFilters) => ["employees", "leaves", filters] as const,
  advances: () => ["employees", "advances"] as const,
  advanceList: (filters: EmployeeAdvanceListFilters) => ["employees", "advances", filters] as const,
  payrollRuns: () => ["employees", "payroll-runs"] as const,
  payrollRunList: (filters: PayrollRunListFilters) => ["employees", "payroll-runs", filters] as const,
  payrollRun: (payrollRunId: string) => ["employees", "payroll-runs", "detail", payrollRunId] as const,
  salaryPayments: () => ["employees", "salary-payments"] as const,
  salaryPaymentList: (filters: SalaryPaymentListFilters) => ["employees", "salary-payments", filters] as const,
  salaryPayment: (salaryPaymentId: string) => ["employees", "salary-payments", "detail", salaryPaymentId] as const,
};

/** Invalidates Employee-derived Reports/Dashboard caches after a related mutation. */
async function invalidateEmployeeReadModels(
  queryClient: ReturnType<typeof useQueryClient>,
  includeCashBankReport = false,
): Promise<void> {
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: reportQueryKeys.employeeAll }),
  ];

  if (includeCashBankReport) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: reportQueryKeys.cashBankAll }),
    );
  }

  await Promise.all(invalidations);
}

/** Loads one filtered and paginated employee list. */
export function useEmployees(filters: EmployeeListFilters = {}) {
  return useQuery({
    queryKey: employeeQueryKeys.list(filters),
    queryFn: () => loadEmployees(filters),
  });
}

/** Loads every employee for selectors that must not silently stop at the API page-size cap. */
export function useAllEmployees() {
  return useQuery({
    queryKey: [...employeeQueryKeys.lists(), "all"] as const,
    queryFn: async () => {
      const pageSize = 100;
      const firstPage = await loadEmployees({ page: 1, pageSize });
      const employees = [...firstPage.data.items];

      for (let page = 2; employees.length < firstPage.data.total; page += 1) {
        const response = await loadEmployees({ page, pageSize });
        employees.push(...response.data.items);

        if (response.data.items.length === 0) {
          break;
        }
      }

      return employees;
    },
  });
}

/** Loads one employee when its ID is available. */
export function useEmployee(employeeId: string) {
  return useQuery({
    queryKey: employeeQueryKeys.detail(employeeId),
    queryFn: () => loadEmployee(employeeId),
    enabled: employeeId.length > 0,
  });
}

/** Creates one employee and refreshes cached employee lists/details. */
export function useCreateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateEmployeeInput) => createEmployee(input),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.detail(response.data.id) }),
        invalidateEmployeeReadModels(queryClient),
      ]);
    },
  });
}

interface UpdateEmployeeVariables {
  employeeId: string;
  input: UpdateEmployeeInput;
}

/** Updates one employee and refreshes its detail and list caches. */
export function useUpdateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ employeeId, input }: UpdateEmployeeVariables) =>
      updateEmployee(employeeId, input),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.detail(response.data.id) }),
        invalidateEmployeeReadModels(queryClient),
      ]);
    },
  });
}

/** Loads the selected business date's attendance for the employees visible in the daily grid. */
export function useAttendanceForEmployees(employeeIds: string[], attendanceDate: string) {
  return useQueries({
    queries: employeeIds.map((employeeId) => ({
      queryKey: employeeQueryKeys.attendanceForDate(employeeId, attendanceDate),
      queryFn: () => loadEmployeeAttendance(employeeId, {
        startDate: attendanceDate,
        endDate: attendanceDate,
        page: 1,
        pageSize: 1,
      }),
      enabled: employeeId.length > 0 && attendanceDate.length > 0,
    })),
  });
}

/** Creates one daily attendance batch and refreshes attendance caches. */
export function useCreateAttendanceBulk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (records: CreateAttendanceInput[]) => createAttendanceBulk(records),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.attendance() }),
        invalidateEmployeeReadModels(queryClient),
      ]);
    },
  });
}

/** Loads reusable Leave Types. */
export function useLeaveTypes() {
  return useQuery({
    queryKey: employeeQueryKeys.leaveTypes(),
    queryFn: loadLeaveTypes,
  });
}

/** Creates one Leave Type and refreshes Leave Type selectors. */
export function useCreateLeaveType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateLeaveTypeInput) => createLeaveType(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: employeeQueryKeys.leaveTypes() });
    },
  });
}

interface UpdateLeaveTypeVariables {
  leaveTypeId: string;
  input: UpdateLeaveTypeInput;
}

/** Updates one Leave Type and refreshes leave lists/selectors. */
export function useUpdateLeaveType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ leaveTypeId, input }: UpdateLeaveTypeVariables) =>
      updateLeaveType(leaveTypeId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.leaveTypes() }),
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.leaves() }),
      ]);
    },
  });
}

/** Loads one filtered and paginated Employee Leave list. */
export function useEmployeeLeaves(filters: EmployeeLeaveListFilters = {}) {
  return useQuery({
    queryKey: employeeQueryKeys.leaveList(filters),
    queryFn: () => loadEmployeeLeaves(filters),
  });
}

/** Creates one Employee Leave row and refreshes leave caches. */
export function useCreateEmployeeLeave() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateEmployeeLeaveInput) => createEmployeeLeave(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: employeeQueryKeys.leaves() });
    },
  });
}

interface UpdateEmployeeLeaveVariables {
  employeeLeaveId: string;
  input: UpdateEmployeeLeaveInput;
}

/** Updates one Employee Leave row and refreshes leave caches. */
export function useUpdateEmployeeLeave() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ employeeLeaveId, input }: UpdateEmployeeLeaveVariables) =>
      updateEmployeeLeave(employeeLeaveId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: employeeQueryKeys.leaves() });
    },
  });
}

/** Loads one filtered and paginated Employee Advance list. */
export function useEmployeeAdvances(filters: EmployeeAdvanceListFilters = {}) {
  return useQuery({
    queryKey: employeeQueryKeys.advanceList(filters),
    queryFn: () => loadEmployeeAdvances(filters),
  });
}

/** Refreshes Employee Advance data and cash/bank balances after one financial mutation. */
async function refreshEmployeeAdvanceAffectedData(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: employeeQueryKeys.advances() }),
    queryClient.invalidateQueries({ queryKey: employeeQueryKeys.lists() }),
    queryClient.invalidateQueries({ queryKey: employeeQueryKeys.details() }),
    queryClient.invalidateQueries({ queryKey: paymentQueryKeys.all }),
    invalidateEmployeeReadModels(queryClient, true),
  ]);

  await queryClient.fetchQuery({
    queryKey: paymentQueryKeys.accounts,
    queryFn: loadPaymentAccounts,
    staleTime: 0,
  });
}

interface CreateEmployeeAdvanceVariables {
  input: CreateEmployeeAdvanceInput;
  idempotencyKey: string;
}

/** Creates one Employee Advance and refreshes advance/account movement data. */
export function useCreateEmployeeAdvance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ input, idempotencyKey }: CreateEmployeeAdvanceVariables) =>
      createEmployeeAdvance(input, idempotencyKey),
    onSuccess: async () => {
      await refreshEmployeeAdvanceAffectedData(queryClient);
    },
  });
}

interface RecoverEmployeeAdvanceVariables {
  employeeAdvanceId: string;
  input: RecoverEmployeeAdvanceInput;
  idempotencyKey: string;
}

/** Directly recovers one Employee Advance and refreshes advance/account movement data. */
export function useRecoverEmployeeAdvance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ employeeAdvanceId, input, idempotencyKey }: RecoverEmployeeAdvanceVariables) =>
      recoverEmployeeAdvance(employeeAdvanceId, input, idempotencyKey),
    onSuccess: async () => {
      await refreshEmployeeAdvanceAffectedData(queryClient);
    },
  });
}

/** Loads one filtered and paginated Payroll Run list. */
export function usePayrollRuns(filters: PayrollRunListFilters = {}) {
  return useQuery({
    queryKey: employeeQueryKeys.payrollRunList(filters),
    queryFn: () => loadPayrollRuns(filters),
  });
}

/** Loads one Payroll Run detail when its ID is available. */
export function usePayrollRun(payrollRunId: string) {
  return useQuery({
    queryKey: employeeQueryKeys.payrollRun(payrollRunId),
    queryFn: () => loadPayrollRun(payrollRunId),
    enabled: payrollRunId.length > 0,
  });
}

/** Creates one DRAFT Payroll Run and refreshes Payroll lists. */
export function useCreatePayrollRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePayrollRunInput) => createPayrollRun(input),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.payrollRuns() }),
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.payrollRun(response.data.run.id) }),
      ]);
    },
  });
}

interface UpdatePayrollRunVariables {
  payrollRunId: string;
  input: UpdatePayrollRunInput;
}

/** Recalculates one DRAFT Payroll Run and refreshes its detail/list caches. */
export function useUpdatePayrollRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ payrollRunId, input }: UpdatePayrollRunVariables) =>
      updatePayrollRun(payrollRunId, input),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.payrollRuns() }),
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.payrollRun(response.data.run.id) }),
      ]);
    },
  });
}

interface ConfirmPayrollRunVariables {
  payrollRunId: string;
  idempotencyKey: string;
}

/** Confirms one DRAFT Payroll Run and refreshes payroll/advance data. */
export function useConfirmPayrollRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ payrollRunId, idempotencyKey }: ConfirmPayrollRunVariables) =>
      confirmPayrollRun(payrollRunId, idempotencyKey),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.payrollRuns() }),
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.payrollRun(response.data.run.id) }),
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.advances() }),
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.details() }),
        invalidateEmployeeReadModels(queryClient),
      ]);
    },
  });
}

/** Loads Salary Payments using the current filters. */
export function useSalaryPayments(filters: SalaryPaymentListFilters = {}) {
  return useQuery({
    queryKey: employeeQueryKeys.salaryPaymentList(filters),
    queryFn: () => loadSalaryPayments(filters),
  });
}

/** Loads one Salary Payment detail only when selected. */
export function useSalaryPayment(salaryPaymentId: string) {
  return useQuery({
    queryKey: employeeQueryKeys.salaryPayment(salaryPaymentId),
    queryFn: () => loadSalaryPayment(salaryPaymentId),
    enabled: salaryPaymentId.length > 0,
  });
}

interface CreateSalaryPaymentVariables {
  input: CreateSalaryPaymentInput;
  idempotencyKey: string;
}

/** Creates one Salary Payment and refreshes salary payable/account balances. */
export function useCreateSalaryPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ input, idempotencyKey }: CreateSalaryPaymentVariables) =>
      createSalaryPayment(input, idempotencyKey),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.payrollRuns() }),
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.salaryPayments() }),
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.details() }),
        queryClient.invalidateQueries({ queryKey: paymentQueryKeys.all }),
        invalidateEmployeeReadModels(queryClient, true),
      ]);

      await queryClient.fetchQuery({
        queryKey: paymentQueryKeys.accounts,
        queryFn: loadPaymentAccounts,
        staleTime: 0,
      });
    },
  });
}

interface ReverseSalaryPaymentVariables {
  salaryPaymentId: string;
  reason: string;
  idempotencyKey: string;
}

/** Reverses one Salary Payment and refreshes salary payable/account balances. */
export function useReverseSalaryPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ salaryPaymentId, reason, idempotencyKey }: ReverseSalaryPaymentVariables) =>
      reverseSalaryPayment(salaryPaymentId, reason, idempotencyKey),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.payrollRuns() }),
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.salaryPayments() }),
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.salaryPayment(response.data.id) }),
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: employeeQueryKeys.details() }),
        queryClient.invalidateQueries({ queryKey: paymentQueryKeys.all }),
        invalidateEmployeeReadModels(queryClient, true),
      ]);

      await queryClient.fetchQuery({
        queryKey: paymentQueryKeys.accounts,
        queryFn: loadPaymentAccounts,
        staleTime: 0,
      });
    },
  });
}
