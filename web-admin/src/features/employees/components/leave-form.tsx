import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import type {
  Employee,
  EmployeeLeave,
  EmployeeLeaveStatus,
  LeaveType,
} from "../api/employees.api.ts";
import {
  useCreateEmployeeLeave,
  useUpdateEmployeeLeave,
} from "../hooks/use-employees.ts";

const leaveFormSchema = z
  .object({
    employeeId: z.string().uuid("Select an employee."),
    leaveTypeId: z.string().uuid("Select a leave type."),
    fromDate: z.string().min(1, "From date is required."),
    toDate: z.string().min(1, "To date is required."),
    days: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, "Days must be a positive number with up to two decimals.")
      .refine((value) => Number(value) > 0, "Days must be greater than zero."),
    reason: z.string().trim().min(1, "Reason is required.").max(500),
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
    notes: z.string().max(500),
  })
  .refine((values) => values.fromDate <= values.toDate, {
    path: ["toDate"],
    message: "To date cannot be before from date.",
  });

type LeaveFormValues = z.infer<typeof leaveFormSchema>;

interface LeaveFormProps {
  employees: Employee[];
  leaveTypes: LeaveType[];
  leave?: EmployeeLeave | null;
  onCancel(): void;
  onSaved(): void;
}

/** Returns a readable message from one Employee Leave API failure. */
function readLeaveError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "The employee leave could not be saved.";
}

/** Builds stable form values for a new or existing Employee Leave row. */
function leaveFormValues(leave?: EmployeeLeave | null): LeaveFormValues {
  return {
    employeeId: leave?.employeeId ?? "",
    leaveTypeId: leave?.leaveTypeId ?? "",
    fromDate: leave?.fromDate ?? "",
    toDate: leave?.toDate ?? "",
    days: leave?.days ?? "1.00",
    reason: leave?.reason ?? "",
    status: leave?.status ?? "PENDING",
    notes: leave?.notes ?? "",
  };
}

/** Creates or edits one Employee Leave record in the standard two-column popup. */
export function LeaveForm({
  employees,
  leaveTypes,
  leave = null,
  onCancel,
  onSaved,
}: LeaveFormProps): React.JSX.Element {
  const createLeave = useCreateEmployeeLeave();
  const updateLeave = useUpdateEmployeeLeave();
  const isSaving = createLeave.isPending || updateLeave.isPending;
  const form = useForm<LeaveFormValues>({
    resolver: zodResolver(leaveFormSchema),
    defaultValues: leaveFormValues(leave),
  });
  const reset = form.reset;

  useEffect(() => {
    reset(leaveFormValues(leave));
  }, [leave, reset]);

  const availableLeaveTypes = leaveTypes.filter(
    (leaveType) => leaveType.isActive || leaveType.id === leave?.leaveTypeId,
  );

  /** Persists validated Leave fields through create or update APIs. */
  async function handleSubmit(values: LeaveFormValues): Promise<void> {
    const input = {
      employeeId: values.employeeId,
      leaveTypeId: values.leaveTypeId,
      fromDate: values.fromDate,
      toDate: values.toDate,
      days: values.days.trim(),
      reason: values.reason.trim(),
      status: values.status as EmployeeLeaveStatus,
      notes: values.notes.trim() || null,
    };

    try {
      if (leave) {
        await updateLeave.mutateAsync({ employeeLeaveId: leave.id, input });
      } else {
        await createLeave.mutateAsync(input);
      }

      onSaved();
    } catch (error) {
      form.setError("root", { message: readLeaveError(error) });
    }
  }

  return (
    <form className="employee-form" onSubmit={form.handleSubmit(handleSubmit)}>
      <div className="employee-form-grid">
        <label className="ui-field">
          <span>Employee</span>
          <select {...form.register("employeeId")}>
            <option value="">Select employee</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.employeeCode} · {employee.name}{employee.isActive ? "" : " (inactive)"}
              </option>
            ))}
          </select>
          {form.formState.errors.employeeId ? <small>{form.formState.errors.employeeId.message}</small> : null}
        </label>

        <label className="ui-field">
          <span>Leave type</span>
          <select {...form.register("leaveTypeId")}>
            <option value="">Select leave type</option>
            {availableLeaveTypes.map((leaveType) => (
              <option key={leaveType.id} value={leaveType.id}>
                {leaveType.name} · {leaveType.isPaid ? "Paid" : "Unpaid"}
                {leaveType.isActive ? "" : " (inactive)"}
              </option>
            ))}
          </select>
          {form.formState.errors.leaveTypeId ? <small>{form.formState.errors.leaveTypeId.message}</small> : null}
        </label>

        <label className="ui-field">
          <span>From date</span>
          <input type="date" {...form.register("fromDate")} />
          {form.formState.errors.fromDate ? <small>{form.formState.errors.fromDate.message}</small> : null}
        </label>

        <label className="ui-field">
          <span>To date</span>
          <input type="date" {...form.register("toDate")} />
          {form.formState.errors.toDate ? <small>{form.formState.errors.toDate.message}</small> : null}
        </label>

        <label className="ui-field">
          <span>Days</span>
          <input inputMode="decimal" {...form.register("days")} />
          {form.formState.errors.days ? <small>{form.formState.errors.days.message}</small> : null}
        </label>

        <label className="ui-field">
          <span>Status</span>
          <select {...form.register("status")}>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </label>

        <label className="ui-field employee-form-wide">
          <span>Reason</span>
          <textarea rows={3} {...form.register("reason")} />
          {form.formState.errors.reason ? <small>{form.formState.errors.reason.message}</small> : null}
        </label>

        <label className="ui-field employee-form-wide">
          <span>Notes</span>
          <textarea rows={3} {...form.register("notes")} />
          {form.formState.errors.notes ? <small>{form.formState.errors.notes.message}</small> : null}
        </label>
      </div>

      {form.formState.errors.root ? (
        <p className="error-message">{form.formState.errors.root.message}</p>
      ) : null}

      <div className="form-actions">
        <Button disabled={isSaving} label="Cancel" onClick={onCancel} />
        <Button
          disabled={isSaving}
          label={isSaving ? "Saving..." : leave ? "Save changes" : "Add leave"}
          type="submit"
        />
      </div>
    </form>
  );
}
