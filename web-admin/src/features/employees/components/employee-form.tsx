import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import { currentBusinessDate } from "../../../lib/utils.ts";
import type { Employee } from "../api/employees.api.ts";
import { useCreateEmployee, useUpdateEmployee } from "../hooks/use-employees.ts";

const optionalEmailSchema = z.string().trim().refine(
  (value) => value.length === 0 || z.string().email().safeParse(value).success,
  "Enter a valid email address.",
);

const optionalPhoneSchema = z.string().trim().refine(
  (value) => value.length === 0 || /^\+?[0-9][0-9 ()-]*[0-9]$/.test(value),
  "Phone number contains invalid characters.",
);

const employeeFormSchema = z
  .object({
    employeeCode: z.string().trim().min(1, "Employee code is required.").max(32, "Employee code is too long."),
    name: z.string().trim().min(1, "Employee name is required.").max(160, "Employee name is too long."),
    fatherSpouseName: z.string().trim().max(160, "Father/spouse name is too long."),
    phone: optionalPhoneSchema.refine((value) => value.length === 0 || value.length >= 7, "Phone number is too short.").refine((value) => value.length <= 32, "Phone number is too long."),
    email: optionalEmailSchema.refine((value) => value.length <= 254, "Email is too long."),
    referenceId: z.string().trim().max(80, "CNIC/reference ID is too long."),
    emergencyContact: z.string().trim().max(160, "Emergency contact is too long."),
    jobTitle: z.string().trim().max(120, "Job title is too long."),
    department: z.string().trim().max(120, "Department is too long."),
    joinDate: z.string().min(1, "Join date is required."),
    leaveDate: z.string(),
    employmentType: z.string().trim().min(1, "Employment type is required.").max(40, "Employment type is too long."),
    baseMonthlySalary: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Use a non-negative salary with up to 2 decimals."),
    address: z.string().trim().max(1000, "Address is too long."),
    isActive: z.boolean(),
  })
  .superRefine((values, context) => {
    if (values.leaveDate && values.joinDate && values.leaveDate < values.joinDate) {
      context.addIssue({
        code: "custom",
        path: ["leaveDate"],
        message: "Leave date cannot be before join date.",
      });
    }

    if (!values.isActive && !values.leaveDate) {
      context.addIssue({
        code: "custom",
        path: ["leaveDate"],
        message: "Leave date is required when an employee is inactive.",
      });
    }
  });

type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

interface EmployeeFormProps {
  employee?: Employee;
  onSaved(): void;
  onCancel(): void;
}

/** Converts blank optional text into the null value accepted by the API. */
function optionalText(value: string): string | null {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

/** Returns starting values for create or edit mode. */
function createDefaultValues(employee?: Employee): EmployeeFormValues {
  return {
    employeeCode: employee?.employeeCode ?? "",
    name: employee?.name ?? "",
    fatherSpouseName: employee?.fatherSpouseName ?? "",
    phone: employee?.phone ?? "",
    email: employee?.email ?? "",
    referenceId: employee?.referenceId ?? "",
    emergencyContact: employee?.emergencyContact ?? "",
    jobTitle: employee?.jobTitle ?? "",
    department: employee?.department ?? "",
    joinDate: employee?.joinDate ?? currentBusinessDate(),
    leaveDate: employee?.leaveDate ?? "",
    employmentType: employee?.employmentType ?? "",
    baseMonthlySalary: employee?.baseMonthlySalary ?? "0.00",
    address: employee?.address ?? "",
    isActive: employee?.isActive ?? true,
  };
}

/** Renders the shared Add/Edit Employee form with at most two desktop fields per row. */
export function EmployeeForm({
  employee,
  onSaved,
  onCancel,
}: EmployeeFormProps): React.JSX.Element {
  const createMutation = useCreateEmployee();
  const updateMutation = useUpdateEmployee();
  const [formError, setFormError] = useState("");
  const isEditing = Boolean(employee);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: createDefaultValues(employee),
  });

  useEffect(() => {
    reset(createDefaultValues(employee));
  }, [employee, reset]);

  /** Copies API validation errors into matching form fields. */
  function applyApiError(error: unknown): void {
    if (!(error instanceof ApiError)) {
      setFormError("The employee could not be saved.");
      return;
    }

    setFormError(error.message);

    for (const fieldError of error.fieldErrors) {
      const field = fieldError.field as keyof EmployeeFormValues;
      setError(field, { message: fieldError.message });
    }
  }

  /** Creates a new employee or saves changes to the current employee. */
  async function saveEmployee(values: EmployeeFormValues): Promise<void> {
    setFormError("");

    const commonInput = {
      employeeCode: values.employeeCode.trim(),
      name: values.name.trim(),
      fatherSpouseName: optionalText(values.fatherSpouseName),
      phone: optionalText(values.phone),
      email: optionalText(values.email),
      referenceId: optionalText(values.referenceId),
      address: optionalText(values.address),
      emergencyContact: optionalText(values.emergencyContact),
      jobTitle: optionalText(values.jobTitle),
      department: optionalText(values.department),
      joinDate: values.joinDate,
      leaveDate: values.leaveDate || null,
      employmentType: values.employmentType.trim(),
      baseMonthlySalary: values.baseMonthlySalary.trim(),
    };

    try {
      if (employee) {
        await updateMutation.mutateAsync({
          employeeId: employee.id,
          input: { ...commonInput, isActive: values.isActive },
        });
      } else {
        await createMutation.mutateAsync(commonInput);
      }

      onSaved();
    } catch (error) {
      applyApiError(error);
    }
  }

  return (
    <form className="employee-form" onSubmit={handleSubmit(saveEmployee)}>
      <div className="employee-form-grid">
        <label className="ui-field">
          <span>Employee code</span>
          <input {...register("employeeCode")} />
          {errors.employeeCode ? <small className="error-message">{errors.employeeCode.message}</small> : null}
        </label>

        <label className="ui-field">
          <span>Name</span>
          <input {...register("name")} />
          {errors.name ? <small className="error-message">{errors.name.message}</small> : null}
        </label>

        <label className="ui-field">
          <span>Father / spouse name</span>
          <input {...register("fatherSpouseName")} />
          {errors.fatherSpouseName ? <small className="error-message">{errors.fatherSpouseName.message}</small> : null}
        </label>

        <label className="ui-field">
          <span>Phone</span>
          <input {...register("phone")} />
          {errors.phone ? <small className="error-message">{errors.phone.message}</small> : null}
        </label>

        <label className="ui-field">
          <span>Email</span>
          <input type="email" {...register("email")} />
          {errors.email ? <small className="error-message">{errors.email.message}</small> : null}
        </label>

        <label className="ui-field">
          <span>CNIC / reference ID</span>
          <input {...register("referenceId")} />
          {errors.referenceId ? <small className="error-message">{errors.referenceId.message}</small> : null}
        </label>

        <label className="ui-field">
          <span>Emergency contact</span>
          <input {...register("emergencyContact")} />
          {errors.emergencyContact ? <small className="error-message">{errors.emergencyContact.message}</small> : null}
        </label>

        <label className="ui-field">
          <span>Job title</span>
          <input {...register("jobTitle")} />
          {errors.jobTitle ? <small className="error-message">{errors.jobTitle.message}</small> : null}
        </label>

        <label className="ui-field">
          <span>Department</span>
          <input {...register("department")} />
          {errors.department ? <small className="error-message">{errors.department.message}</small> : null}
        </label>

        <label className="ui-field">
          <span>Employment type</span>
          <input placeholder="e.g. Permanent" {...register("employmentType")} />
          {errors.employmentType ? <small className="error-message">{errors.employmentType.message}</small> : null}
        </label>

        <label className="ui-field">
          <span>Join date</span>
          <input type="date" {...register("joinDate")} />
          {errors.joinDate ? <small className="error-message">{errors.joinDate.message}</small> : null}
        </label>

        <label className="ui-field">
          <span>Leave date</span>
          <input type="date" {...register("leaveDate")} />
          {errors.leaveDate ? <small className="error-message">{errors.leaveDate.message}</small> : null}
        </label>

        <label className="ui-field">
          <span>Base monthly salary</span>
          <input inputMode="decimal" {...register("baseMonthlySalary")} />
          {errors.baseMonthlySalary ? <small className="error-message">{errors.baseMonthlySalary.message}</small> : null}
        </label>

        {isEditing ? (
          <label className="employee-checkbox">
            <input type="checkbox" {...register("isActive")} />
            <span>Employee is active</span>
          </label>
        ) : null}

        <label className="ui-field employee-form-wide">
          <span>Address</span>
          <textarea rows={3} {...register("address")} />
          {errors.address ? <small className="error-message">{errors.address.message}</small> : null}
        </label>
      </div>

      {formError ? <p className="error-message">{formError}</p> : null}

      <div className="form-actions">
        <Button disabled={isSaving} label={isSaving ? "Saving..." : "Save employee"} type="submit" />
        <Button disabled={isSaving} label="Cancel" onClick={onCancel} />
      </div>
    </form>
  );
}
