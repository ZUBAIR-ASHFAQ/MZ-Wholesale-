import { z } from "zod";

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
