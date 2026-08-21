import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../../../components/ui/button.tsx";
import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import type { LeaveType } from "../api/employees.api.ts";
import {
  useCreateLeaveType,
  useLeaveTypes,
  useUpdateLeaveType,
} from "../hooks/use-employees.ts";

const leaveTypeFormSchema = z.object({
  name: z.string().trim().min(1, "Leave type name is required.").max(120),
  isPaid: z.boolean(),
});

type LeaveTypeFormValues = z.infer<typeof leaveTypeFormSchema>;

/** Returns a readable Leave Type mutation error. */
function readLeaveTypeError(error: unknown): string {
  return error instanceof ApiError ? error.message : "The leave type could not be saved.";
}

/** Creates, edits, activates, and deactivates paid/unpaid Leave Types. */
export function LeaveTypeManager(): React.JSX.Element {
  const leaveTypesQuery = useLeaveTypes();
  const createLeaveType = useCreateLeaveType();
  const updateLeaveType = useUpdateLeaveType();
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [pageError, setPageError] = useState("");
  const form = useForm<LeaveTypeFormValues>({
    resolver: zodResolver(leaveTypeFormSchema),
    defaultValues: { name: "", isPaid: true },
  });
  const reset = form.reset;
  const leaveTypes = leaveTypesQuery.data?.data ?? [];
  const isSaving = createLeaveType.isPending || updateLeaveType.isPending;

  useEffect(() => {
    reset({ name: editing?.name ?? "", isPaid: editing?.isPaid ?? true });
  }, [editing, reset]);

  /** Saves a new Leave Type or the selected Leave Type changes. */
  async function handleSubmit(values: LeaveTypeFormValues): Promise<void> {
    try {
      if (editing) {
        await updateLeaveType.mutateAsync({
          leaveTypeId: editing.id,
          input: { name: values.name.trim(), isPaid: values.isPaid },
        });
      } else {
        await createLeaveType.mutateAsync({ name: values.name.trim(), isPaid: values.isPaid });
      }

      setEditing(null);
      reset({ name: "", isPaid: true });
    } catch (error) {
      form.setError("root", { message: readLeaveTypeError(error) });
    }
  }

  /** Activates or deactivates one Leave Type without deleting history. */
  async function toggleActive(leaveType: LeaveType): Promise<void> {
    if (leaveType.isActive && !window.confirm(`Deactivate ${leaveType.name}?`)) return;

    setPageError("");
    setChangingId(leaveType.id);
    try {
      await updateLeaveType.mutateAsync({
        leaveTypeId: leaveType.id,
        input: { isActive: !leaveType.isActive },
      });
    } catch (error) {
      setPageError(readLeaveTypeError(error));
    } finally {
      setChangingId(null);
    }
  }

  return (
    <section className="employee-form">
      <form className="management-form" onSubmit={form.handleSubmit(handleSubmit)}>
        <div className="employee-form-grid">
          <label className="ui-field">
            <span>Leave type name</span>
            <input {...form.register("name")} />
            {form.formState.errors.name ? <small>{form.formState.errors.name.message}</small> : null}
          </label>

          <label className="employee-checkbox">
            <input type="checkbox" {...form.register("isPaid")} />
            <span>Paid leave</span>
          </label>
        </div>

        {form.formState.errors.root ? <p className="error-message">{form.formState.errors.root.message}</p> : null}

        <div className="form-actions">
          {editing ? <Button label="Cancel edit" onClick={() => setEditing(null)} /> : null}
          <Button disabled={isSaving} label={isSaving ? "Saving..." : editing ? "Save changes" : "Add leave type"} type="submit" />
        </div>
      </form>

      {pageError ? <p className="error-message">{pageError}</p> : null}
      {leaveTypesQuery.isPending ? <p>Loading leave types...</p> : null}
      {leaveTypesQuery.isError ? <p className="error-message">Could not load leave types.</p> : null}

      {!leaveTypesQuery.isPending && !leaveTypesQuery.isError ? (
        <div className="table-scroll">
          <table className="ui-table">
            <thead>
              <tr><th>Name</th><th>Type</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {leaveTypes.map((leaveType) => (
                <tr key={leaveType.id}>
                  <td>{leaveType.name}</td>
                  <td>{leaveType.isPaid ? "Paid" : "Unpaid"}</td>
                  <td><StatusBadge status={leaveType.isActive ? "ACTIVE" : "INACTIVE"} /></td>
                  <td>
                    <div className="table-actions">
                      <Button label="Edit" onClick={() => setEditing(leaveType)} />
                      <Button
                        disabled={changingId === leaveType.id}
                        label={leaveType.isActive ? "Deactivate" : "Activate"}
                        onClick={() => void toggleActive(leaveType)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
