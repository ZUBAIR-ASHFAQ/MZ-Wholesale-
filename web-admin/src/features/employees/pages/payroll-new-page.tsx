import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import { currentBusinessDate } from "../../../lib/utils.ts";
import { useCreatePayrollRun } from "../hooks/use-employees.ts";

/** Creates one DRAFT Payroll Run on a full page, then opens its calculated detail. */
export function PayrollNewPage(): React.JSX.Element {
  const today = currentBusinessDate();
  const navigate = useNavigate();
  const createPayroll = useCreatePayrollRun();
  const [periodStart, setPeriodStart] = useState(`${today.slice(0, 7)}-01`);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  /** Validates the visible period and creates the initial calculated draft. */
  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!periodStart || !periodEnd) {
      setError("Period start and end are required.");
      return;
    }
    if (periodEnd < periodStart) {
      setError("Period end cannot be before period start.");
      return;
    }

    setError(null);
    try {
      const response = await createPayroll.mutateAsync({
        periodStart,
        periodEnd,
        notes: notes.trim() || null,
      });
      void navigate({
        to: "/employees/payroll/$payrollRunId",
        params: { payrollRunId: response.data.run.id },
      });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The payroll draft could not be created.");
    }
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Employee Management</p>
          <h1>New payroll draft</h1>
          <p>Create the period first; attendance, leave and current advance data are calculated by the backend.</p>
        </div>
        <Link className="secondary-link" to="/employees/payroll">Back to payroll</Link>
      </div>

      <form className="management-card payroll-draft-form" onSubmit={submit}>
        <div className="employee-form-grid">
          <label className="ui-field">
            <span>Period start</span>
            <input
              disabled={createPayroll.isPending}
              onChange={(event) => setPeriodStart(event.target.value)}
              type="date"
              value={periodStart}
            />
          </label>
          <label className="ui-field">
            <span>Period end</span>
            <input
              disabled={createPayroll.isPending}
              onChange={(event) => setPeriodEnd(event.target.value)}
              type="date"
              value={periodEnd}
            />
          </label>
          <label className="ui-field employee-form-wide">
            <span>Notes</span>
            <textarea
              disabled={createPayroll.isPending}
              maxLength={500}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              value={notes}
            />
          </label>
        </div>

        {error ? <p className="error-message">{error}</p> : null}
        <div className="form-actions">
          <Link className="secondary-link" to="/employees/payroll">Cancel</Link>
          <Button
            disabled={createPayroll.isPending}
            label={createPayroll.isPending ? "Calculating..." : "Create & calculate draft"}
            type="submit"
          />
        </div>
      </form>
    </section>
  );
}
