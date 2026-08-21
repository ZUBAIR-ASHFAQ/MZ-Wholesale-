import { z } from "zod";

import { isBusinessDateNotFuture } from "../../shared/utils/business-date.js";
import { isMoneyWithinDatabaseRange } from "../../shared/utils/decimal-validation.js";

const uuidSchema = z.string().uuid("ID must be a valid UUID.");

/** Checks that one YYYY-MM-DD string is an actual calendar date. */
function isValidBusinessDate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const businessDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format.")
  .refine(isValidBusinessDate, "Date is invalid.");

const employeeCodeSchema = z
  .string()
  .trim()
  .min(1, "Employee code is required.")
  .max(32, "Employee code must be 32 characters or fewer.");

const employeeNameSchema = z
  .string()
  .trim()
  .min(1, "Employee name is required.")
  .max(160, "Employee name must be 160 characters or fewer.");

const optionalNameSchema = z
  .string()
  .trim()
  .min(1, "Value cannot be blank.")
  .max(160, "Value must be 160 characters or fewer.");

const phoneSchema = z
  .string()
  .trim()
  .min(7, "Phone number must contain at least 7 characters.")
  .max(32, "Phone number must be 32 characters or fewer.")
  .regex(/^\+?[0-9][0-9 ()-]*[0-9]$/, "Phone number contains invalid characters.");

const emailSchema = z
  .string()
  .trim()
  .email("Email address is invalid.")
  .max(254, "Email must be 254 characters or fewer.");

const referenceIdSchema = z
  .string()
  .trim()
  .min(1, "CNIC/reference ID cannot be blank.")
  .max(80, "CNIC/reference ID must be 80 characters or fewer.");

const addressSchema = z
  .string()
  .trim()
  .min(1, "Address cannot be blank.")
  .max(1000, "Address must be 1000 characters or fewer.");

const emergencyContactSchema = z
  .string()
  .trim()
  .min(1, "Emergency contact cannot be blank.")
  .max(160, "Emergency contact must be 160 characters or fewer.");

const jobTitleSchema = z
  .string()
  .trim()
  .min(1, "Job title cannot be blank.")
  .max(120, "Job title must be 120 characters or fewer.");

const departmentSchema = z
  .string()
  .trim()
  .min(1, "Department cannot be blank.")
  .max(120, "Department must be 120 characters or fewer.");

const employmentTypeSchema = z
  .string()
  .trim()
  .min(1, "Employment type is required.")
  .max(40, "Employment type must be 40 characters or fewer.");

const salarySchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Salary must be a non-negative amount with up to two decimal places.")
  .refine(isMoneyWithinDatabaseRange, "Salary is too large for the database money field.");

const attendanceStatusSchema = z.enum([
  "PRESENT",
  "ABSENT",
  "HALF_DAY",
  "LEAVE",
  "HOLIDAY",
  "WEEKLY_OFF",
]);

const attendanceTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, "Time must use HH:MM or HH:MM:SS format.");

const workedHoursSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Worked hours must be a non-negative number with up to two decimal places.")
  .refine((value) => Number(value) <= 24, "Worked hours cannot exceed 24 hours.");

const attendanceNotesSchema = z
  .string()
  .trim()
  .min(1, "Notes cannot be blank.")
  .max(500, "Notes must be 500 characters or fewer.");

const employeeLeaveStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);

const leaveTypeNameSchema = z
  .string()
  .trim()
  .min(1, "Leave type name is required.")
  .max(120, "Leave type name must be 120 characters or fewer.");

const leaveDaysSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Days must be a positive number with up to two decimal places.")
  .refine((value) => Number(value) > 0, "Days must be greater than zero.")
  .refine(isMoneyWithinDatabaseRange, "Days value is too large for the database field.");

const leaveReasonSchema = z
  .string()
  .trim()
  .min(1, "Leave reason is required.")
  .max(500, "Leave reason must be 500 characters or fewer.");

const leaveNotesSchema = z
  .string()
  .trim()
  .min(1, "Notes cannot be blank.")
  .max(500, "Notes must be 500 characters or fewer.");

/** Returns true only for a syntactically valid positive two-decimal money amount. */
function isPositiveEmployeeAdvanceAmount(value: string): boolean {
  const match = value.match(/^(\d+)(?:\.(\d{1,2}))?$/);

  if (!match) {
    return false;
  }

  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0")) > 0n;
}

const employeeAdvanceAmountSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Amount must be a positive value with up to two decimal places.")
  .refine(isPositiveEmployeeAdvanceAmount, "Amount must be greater than zero.")
  .refine(isMoneyWithinDatabaseRange, "Amount is too large for the database money field.");

const employeeAdvanceNoteSchema = z
  .string()
  .trim()
  .min(1, "Note cannot be blank.")
  .max(500, "Note must be 500 characters or fewer.");

const employeeAdvancePaymentMethodSchema = z.enum(["CASH", "BANK_TRANSFER"]);

const attendanceEntrySchema = z
  .object({
    employeeId: uuidSchema,
    attendanceDate: businessDateSchema,
    status: attendanceStatusSchema,
    checkIn: attendanceTimeSchema.nullable().optional(),
    checkOut: attendanceTimeSchema.nullable().optional(),
    workedHours: workedHoursSchema.nullable().optional(),
    notes: attendanceNotesSchema.nullable().optional(),
  })
  .strict();

/** Converts the active query-string value into a boolean. */
function parseBooleanQueryValue(value: "true" | "false"): boolean {
  return value === "true";
}

/** Returns true when an update request contains at least one field. */
function hasAtLeastOneField(input: Record<string, unknown>): boolean {
  return Object.keys(input).length > 0;
}

/** Rejects an employment date range where leave date comes before join date. */
function validateEmploymentDates(
  input: { joinDate?: string; leaveDate?: string | null },
  context: z.RefinementCtx,
): void {
  if (input.joinDate && input.leaveDate && input.leaveDate < input.joinDate) {
    context.addIssue({
      code: "custom",
      path: ["leaveDate"],
      message: "Leave date cannot be before join date.",
    });
  }
}

/** Validates employee-list filters received from query parameters. */
export const listEmployeesQuerySchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    active: z.enum(["true", "false"]).transform(parseBooleanQueryValue).optional(),
    employmentDate: businessDateSchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

/** Validates an employee UUID from the employee-detail route. */
export const employeeIdParamsSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

/** Validates a Leave Type UUID from the update route. */
export const leaveTypeIdParamsSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

/** Validates an Employee Leave UUID from the update route. */
export const employeeLeaveIdParamsSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

/** Validates an Employee Advance UUID from the recovery route. */
export const employeeAdvanceIdParamsSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

/** Validates all employee master fields accepted on creation. */
export const createEmployeeSchema = z
  .object({
    employeeCode: employeeCodeSchema,
    name: employeeNameSchema,
    fatherSpouseName: optionalNameSchema.nullable().optional(),
    phone: phoneSchema.nullable().optional(),
    email: emailSchema.nullable().optional(),
    referenceId: referenceIdSchema.nullable().optional(),
    address: addressSchema.nullable().optional(),
    emergencyContact: emergencyContactSchema.nullable().optional(),
    jobTitle: jobTitleSchema.nullable().optional(),
    department: departmentSchema.nullable().optional(),
    joinDate: businessDateSchema,
    leaveDate: businessDateSchema.nullable().optional(),
    employmentType: employmentTypeSchema,
    baseMonthlySalary: salarySchema,
  })
  .strict()
  .superRefine(validateEmploymentDates);

/** Validates employee master fields accepted on update/deactivation. */
export const updateEmployeeSchema = z
  .object({
    employeeCode: employeeCodeSchema.optional(),
    name: employeeNameSchema.optional(),
    fatherSpouseName: optionalNameSchema.nullable().optional(),
    phone: phoneSchema.nullable().optional(),
    email: emailSchema.nullable().optional(),
    referenceId: referenceIdSchema.nullable().optional(),
    address: addressSchema.nullable().optional(),
    emergencyContact: emergencyContactSchema.nullable().optional(),
    jobTitle: jobTitleSchema.nullable().optional(),
    department: departmentSchema.nullable().optional(),
    joinDate: businessDateSchema.optional(),
    leaveDate: businessDateSchema.nullable().optional(),
    employmentType: employmentTypeSchema.optional(),
    baseMonthlySalary: salarySchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(hasAtLeastOneField, {
    message: "At least one field must be provided.",
  })
  .superRefine(validateEmploymentDates);


/** Validates attendance history filters for one employee. */
export const listEmployeeAttendanceQuerySchema = z
  .object({
    startDate: businessDateSchema.optional(),
    endDate: businessDateSchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(50),
  })
  .strict()
  .refine((input) => !input.startDate || !input.endDate || input.startDate <= input.endDate, {
    path: ["endDate"],
    message: "End date cannot be before start date.",
  });

/** Validates fields used to create one reusable Leave Type. */
export const createLeaveTypeSchema = z
  .object({
    name: leaveTypeNameSchema,
    isPaid: z.boolean(),
  })
  .strict();

/** Validates fields used to rename, reclassify, or activate/deactivate a Leave Type. */
export const updateLeaveTypeSchema = z
  .object({
    name: leaveTypeNameSchema.optional(),
    isPaid: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(hasAtLeastOneField, {
    message: "At least one field must be provided.",
  });

/** Validates filters accepted by the Employee Leave list. */
export const listEmployeeLeavesQuerySchema = z
  .object({
    employeeId: uuidSchema.optional(),
    leaveTypeId: uuidSchema.optional(),
    status: employeeLeaveStatusSchema.optional(),
    startDate: businessDateSchema.optional(),
    endDate: businessDateSchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict()
  .refine((input) => !input.startDate || !input.endDate || input.startDate <= input.endDate, {
    path: ["endDate"],
    message: "End date cannot be before start date.",
  });

/** Validates one Employee Leave request/record. */
export const createEmployeeLeaveSchema = z
  .object({
    employeeId: uuidSchema,
    leaveTypeId: uuidSchema,
    fromDate: businessDateSchema,
    toDate: businessDateSchema,
    days: leaveDaysSchema,
    reason: leaveReasonSchema,
    status: employeeLeaveStatusSchema.optional(),
    notes: leaveNotesSchema.nullable().optional(),
  })
  .strict()
  .refine((input) => input.fromDate <= input.toDate, {
    path: ["toDate"],
    message: "To date cannot be before from date.",
  });

/** Validates fields accepted when updating one Employee Leave record. */
export const updateEmployeeLeaveSchema = z
  .object({
    employeeId: uuidSchema.optional(),
    leaveTypeId: uuidSchema.optional(),
    fromDate: businessDateSchema.optional(),
    toDate: businessDateSchema.optional(),
    days: leaveDaysSchema.optional(),
    reason: leaveReasonSchema.optional(),
    status: employeeLeaveStatusSchema.optional(),
    notes: leaveNotesSchema.nullable().optional(),
  })
  .strict()
  .refine(hasAtLeastOneField, {
    message: "At least one field must be provided.",
  })
  .refine((input) => !input.fromDate || !input.toDate || input.fromDate <= input.toDate, {
    path: ["toDate"],
    message: "To date cannot be before from date.",
  });

/** Validates filters accepted by the Employee Advance list. */
export const listEmployeeAdvancesQuerySchema = z
  .object({
    employeeId: uuidSchema.optional(),
    startDate: businessDateSchema.optional(),
    endDate: businessDateSchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict()
  .refine((input) => !input.startDate || !input.endDate || input.startDate <= input.endDate, {
    path: ["endDate"],
    message: "End date cannot be before start date.",
  });

/** Ensures cash/bank account IDs match the selected payment method. */
function validateEmployeeAdvanceAccount(
  input: {
    paymentMethod: "CASH" | "BANK_TRANSFER";
    cashAccountId?: string | null;
    bankAccountId?: string | null;
  },
  context: z.RefinementCtx,
): void {
  if (input.paymentMethod === "CASH") {
    if (!input.cashAccountId) {
      context.addIssue({ code: "custom", path: ["cashAccountId"], message: "Cash account is required." });
    }
    if (input.bankAccountId) {
      context.addIssue({ code: "custom", path: ["bankAccountId"], message: "Bank account must be empty for cash." });
    }
    return;
  }

  if (!input.bankAccountId) {
    context.addIssue({ code: "custom", path: ["bankAccountId"], message: "Bank account is required." });
  }
  if (input.cashAccountId) {
    context.addIssue({ code: "custom", path: ["cashAccountId"], message: "Cash account must be empty for bank transfer." });
  }
}

/** Validates one new employee advance paid from a cash or bank account. */
export const createEmployeeAdvanceSchema = z
  .object({
    employeeId: uuidSchema,
    advanceDate: businessDateSchema,
    amount: employeeAdvanceAmountSchema,
    paymentMethod: employeeAdvancePaymentMethodSchema,
    cashAccountId: uuidSchema.nullable().optional(),
    bankAccountId: uuidSchema.nullable().optional(),
    note: employeeAdvanceNoteSchema.nullable().optional(),
  })
  .strict()
  .superRefine(validateEmployeeAdvanceAccount);

/** Validates one direct recovery of an existing employee advance. */
export const recoverEmployeeAdvanceSchema = z
  .object({
    recoveryDate: businessDateSchema,
    amount: employeeAdvanceAmountSchema,
    paymentMethod: employeeAdvancePaymentMethodSchema,
    cashAccountId: uuidSchema.nullable().optional(),
    bankAccountId: uuidSchema.nullable().optional(),
    note: employeeAdvanceNoteSchema.nullable().optional(),
  })
  .strict()
  .superRefine(validateEmployeeAdvanceAccount);

/** Validates a Payroll Run UUID from payroll detail/update routes. */
export const payrollRunIdParamsSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

const payrollStatusSchema = z.enum(["DRAFT", "CONFIRMED"]);

const payrollMoneySchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Amount must be a non-negative value with up to two decimal places.")
  .refine(isMoneyWithinDatabaseRange, "Amount is too large for the database money field.");

const payrollReasonSchema = z
  .string()
  .trim()
  .min(1, "Reason cannot be blank.")
  .max(500, "Reason must be 500 characters or fewer.");

const payrollNotesSchema = z
  .string()
  .trim()
  .min(1, "Notes cannot be blank.")
  .max(500, "Notes must be 500 characters or fewer.");

/** Validates filters accepted by the Payroll Run list. */
export const listPayrollRunsQuerySchema = z
  .object({
    status: payrollStatusSchema.optional(),
    startDate: businessDateSchema.optional(),
    endDate: businessDateSchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict()
  .refine((input) => !input.startDate || !input.endDate || input.startDate <= input.endDate, {
    path: ["endDate"],
    message: "End date cannot be before start date.",
  });

/** Validates the period and optional notes used to create one draft Payroll Run. */
export const createPayrollRunSchema = z
  .object({
    periodStart: businessDateSchema,
    periodEnd: businessDateSchema,
    notes: payrollNotesSchema.nullable().optional(),
  })
  .strict()
  .refine((input) => input.periodStart <= input.periodEnd, {
    path: ["periodEnd"],
    message: "Period end cannot be before period start.",
  });

/** Validates editable per-employee draft payroll adjustments. */
const updatePayrollItemSchema = z
  .object({
    employeeId: uuidSchema,
    additionsAmount: payrollMoneySchema.optional(),
    additionsReason: payrollReasonSchema.nullable().optional(),
    deductionsAmount: payrollMoneySchema.optional(),
    deductionsReason: payrollReasonSchema.nullable().optional(),
    advanceRecoveryAmount: payrollMoneySchema.optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).some((key) => key !== "employeeId"), {
    message: "At least one payroll item adjustment must be provided.",
  });

/** Validates editable fields for a DRAFT Payroll Run. */
export const updatePayrollRunSchema = z
  .object({
    periodStart: businessDateSchema.optional(),
    periodEnd: businessDateSchema.optional(),
    notes: payrollNotesSchema.nullable().optional(),
    items: z.array(updatePayrollItemSchema).max(1000).optional(),
  })
  .strict()
  .refine(hasAtLeastOneField, {
    message: "At least one field must be provided.",
  })
  .refine((input) => !input.periodStart || !input.periodEnd || input.periodStart <= input.periodEnd, {
    path: ["periodEnd"],
    message: "Period end cannot be before period start.",
  })
  .superRefine((input, context) => {
    if (!input.items) {
      return;
    }

    const seenEmployeeIds = new Set<string>();
    input.items.forEach((item, index) => {
      if (seenEmployeeIds.has(item.employeeId)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "employeeId"],
          message: "The same employee cannot appear twice in payroll adjustments.",
        });
      }
      seenEmployeeIds.add(item.employeeId);
    });
  });

/** Validates a Salary Payment UUID from detail/reversal routes. */
export const salaryPaymentIdParamsSchema = z
  .object({
    id: uuidSchema,
  })
  .strict();

const salaryPaymentDateSchema = businessDateSchema.refine(
  isBusinessDateNotFuture,
  "Payment date cannot be in the future.",
);

const salaryPaymentReasonSchema = z
  .string()
  .trim()
  .min(1, "Reason is required.")
  .max(500, "Reason must be 500 characters or fewer.");

const salaryPaymentNotesSchema = z
  .string()
  .trim()
  .min(1, "Notes cannot be blank.")
  .max(500, "Notes must be 500 characters or fewer.");

/** Converts one validated salary money string into exact integer cents. */
function salaryPaymentMoneyToCents(value: string): bigint {
  const [wholePart, decimalPart = ""] = value.split(".");
  return BigInt(wholePart) * 100n + BigInt(decimalPart.padEnd(2, "0"));
}

/** Enforces the CASH/BANK account shape for one Salary Payment split. */
function validateSalaryPaymentSplitAccount(
  input: {
    method: "CASH" | "BANK_TRANSFER";
    cashAccountId?: string | null;
    bankAccountId?: string | null;
  },
  context: z.RefinementCtx,
): void {
  if (input.method === "CASH") {
    if (!input.cashAccountId || input.bankAccountId) {
      context.addIssue({
        code: "custom",
        path: ["cashAccountId"],
        message: "A CASH split requires only a cash account.",
      });
    }
    return;
  }

  if (!input.bankAccountId || input.cashAccountId) {
    context.addIssue({
      code: "custom",
      path: ["bankAccountId"],
      message: "A BANK_TRANSFER split requires only a bank account.",
    });
  }
}

const salaryPaymentSplitSchema = z
  .object({
    method: employeeAdvancePaymentMethodSchema,
    amount: employeeAdvanceAmountSchema,
    cashAccountId: uuidSchema.nullable().optional(),
    bankAccountId: uuidSchema.nullable().optional(),
  })
  .strict()
  .superRefine(validateSalaryPaymentSplitAccount);

const salaryPaymentAllocationSchema = z
  .object({
    payrollItemId: uuidSchema,
    amount: employeeAdvanceAmountSchema,
  })
  .strict();

/** Validates filters accepted by the Salary Payment list. */
export const listSalaryPaymentsQuerySchema = z
  .object({
    employeeId: uuidSchema.optional(),
    payrollRunId: uuidSchema.optional(),
    startDate: businessDateSchema.optional(),
    endDate: businessDateSchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict()
  .refine((input) => !input.startDate || !input.endDate || input.startDate <= input.endDate, {
    path: ["endDate"],
    message: "End date cannot be before start date.",
  });

/** Validates one salary payment with exact split/allocation totals. */
export const createSalaryPaymentSchema = z
  .object({
    employeeId: uuidSchema,
    paymentDate: salaryPaymentDateSchema,
    splits: z.array(salaryPaymentSplitSchema).min(1).max(20),
    allocations: z.array(salaryPaymentAllocationSchema).min(1).max(200),
    notes: salaryPaymentNotesSchema.nullable().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const splitAccounts = new Set<string>();
    input.splits.forEach((split, index) => {
      const accountId = split.cashAccountId ?? split.bankAccountId;
      if (!accountId) return;
      const key = `${split.method}:${accountId}`;
      if (splitAccounts.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["splits", index],
          message: "The same account can appear only once in payment splits.",
        });
      }
      splitAccounts.add(key);
    });

    const payrollItems = new Set<string>();
    input.allocations.forEach((allocation, index) => {
      if (payrollItems.has(allocation.payrollItemId)) {
        context.addIssue({
          code: "custom",
          path: ["allocations", index, "payrollItemId"],
          message: "The same Payroll Item can be allocated only once.",
        });
      }
      payrollItems.add(allocation.payrollItemId);
    });

    const splitTotal = input.splits.reduce(
      (total, split) => total + salaryPaymentMoneyToCents(split.amount),
      0n,
    );
    const allocationTotal = input.allocations.reduce(
      (total, allocation) => total + salaryPaymentMoneyToCents(allocation.amount),
      0n,
    );

    if (splitTotal !== allocationTotal) {
      context.addIssue({
        code: "custom",
        path: ["allocations"],
        message: "Payment split total must equal payroll allocation total.",
      });
    }
  });

/** Validates the required reason for a Salary Payment reversal. */
export const reverseSalaryPaymentSchema = z
  .object({
    reason: salaryPaymentReasonSchema,
  })
  .strict();

/** Validates one manually entered attendance record. */
export const createAttendanceSchema = attendanceEntrySchema;

/** Validates an atomic bulk attendance request and rejects duplicate employee/date rows. */
export const createAttendanceBulkSchema = z
  .object({
    records: z.array(attendanceEntrySchema).min(1).max(100),
  })
  .strict()
  .superRefine((input, context) => {
    const seen = new Set<string>();

    input.records.forEach((record, index) => {
      const key = `${record.employeeId}:${record.attendanceDate}`;

      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["records", index, "employeeId"],
          message: "The same employee and attendance date cannot appear twice.",
        });
      }

      seen.add(key);
    });
  });

export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type ListEmployeeAttendanceQuery = z.infer<typeof listEmployeeAttendanceQuerySchema>;
export type CreateAttendanceInput = z.infer<typeof createAttendanceSchema>;
export type CreateAttendanceBulkInput = z.infer<typeof createAttendanceBulkSchema>;
export type CreateLeaveTypeInput = z.infer<typeof createLeaveTypeSchema>;
export type UpdateLeaveTypeInput = z.infer<typeof updateLeaveTypeSchema>;
export type ListEmployeeLeavesQuery = z.infer<typeof listEmployeeLeavesQuerySchema>;
export type CreateEmployeeLeaveInput = z.infer<typeof createEmployeeLeaveSchema>;
export type UpdateEmployeeLeaveInput = z.infer<typeof updateEmployeeLeaveSchema>;
export type ListEmployeeAdvancesQuery = z.infer<typeof listEmployeeAdvancesQuerySchema>;
export type CreateEmployeeAdvanceInput = z.infer<typeof createEmployeeAdvanceSchema>;
export type RecoverEmployeeAdvanceInput = z.infer<typeof recoverEmployeeAdvanceSchema>;
export type ListPayrollRunsQuery = z.infer<typeof listPayrollRunsQuerySchema>;
export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;
export type UpdatePayrollRunInput = z.infer<typeof updatePayrollRunSchema>;
export type UpdatePayrollItemInput = NonNullable<UpdatePayrollRunInput["items"]>[number];
export type ListSalaryPaymentsQuery = z.infer<typeof listSalaryPaymentsQuerySchema>;
export type CreateSalaryPaymentInput = z.infer<typeof createSalaryPaymentSchema>;
export type ReverseSalaryPaymentInput = z.infer<typeof reverseSalaryPaymentSchema>;
