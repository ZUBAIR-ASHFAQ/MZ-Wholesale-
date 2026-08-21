import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createAttendanceBulk,
  createEmployee,
  loadEmployee,
  loadEmployeeAttendance,
  loadEmployees,
  updateEmployee,
  type CreateAttendanceInput,
  type CreateEmployeeInput,
  type EmployeeListFilters,
  type UpdateEmployeeInput,
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
};

/** Loads one filtered and paginated employee list. */
export function useEmployees(filters: EmployeeListFilters = {}) {
  return useQuery({
    queryKey: employeeQueryKeys.list(filters),
    queryFn: () => loadEmployees(filters),
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
      await queryClient.invalidateQueries({ queryKey: employeeQueryKeys.attendance() });
    },
  });
}
