import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { Dialog } from "../../../components/ui/dialog.tsx";
import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import {
  formatBusinessDate,
  formatBusinessDateTime,
  formatMoney,
  formatQuantity,
  formatStatusLabel,
} from "../../../lib/utils.ts";
import type { PayrollItem } from "../api/employees.api.ts";
import { SalaryPaymentDetail } from "../components/salary-payment-detail.tsx";
import { SalaryPaymentForm } from "../components/salary-payment-form.tsx";
import {
  useConfirmPayrollRun,
  usePayrollRun,
  useSalaryPayments,
  useUpdatePayrollRun,
} from "../hooks/use-employees.ts";

interface PayrollDetailPageProps {
  payrollRunId: string;
}

interface PayrollAdjustmentState {
  additionsAmount: string;
  additionsReason: string;
  deductionsAmount: string;
  deductionsReason: string;
  advanceRecoveryAmount: string;
}

const salaryPaymentPageSize = 20;

/** Returns the editable adjustment state represented by one calculated Payroll Item. */
function adjustmentFromItem(item: PayrollItem): PayrollAdjustmentState {
  return {
    additionsAmount: item.additionsAmount,
    additionsReason: item.additionsReason ?? "",
    deductionsAmount: item.deductionsAmount,
    deductionsReason: item.deductionsReason ?? "",
    advanceRecoveryAmount: item.advanceRecoveryAmount,
  };
}

/** Returns true only for a non-negative two-decimal money string. */
function isMoney(value: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(value.trim());
}

/** Returns true when one already-valid money string is greater than zero. */
function isPositiveMoney(value: string): boolean {
  if (!isMoney(value)) return false;
  const [whole, decimal = ""] = value.trim().split(".");
  return BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0")) > 0n;
}

/** Displays and edits one Payroll Run, confirms it, then pays salary from the same full page. */
export function PayrollDetailPage({ payrollRunId }: PayrollDetailPageProps): React.JSX.Element {
  const payrollQuery = usePayrollRun(payrollRunId);
  const updatePayroll = useUpdatePayrollRun();
  const confirmPayroll = useConfirmPayrollRun();
  const confirmKey = useRef(crypto.randomUUID());
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [adjustments, setAdjustments] = useState<Record<string, PayrollAdjustmentState>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [paymentItem, setPaymentItem] = useState<PayrollItem | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState("");
  const [salaryPage, setSalaryPage] = useState(1);
  const payroll = payrollQuery.data?.data;
  const salaryPaymentsQuery = useSalaryPayments({
    payrollRunId,
    page: salaryPage,
    pageSize: salaryPaymentPageSize,
  });
  const salaryPayments = salaryPaymentsQuery.data?.data;
  const salaryTotalPages = Math.max(1, Math.ceil((salaryPayments?.total ?? 0) / salaryPaymentPageSize));

  useEffect(() => {
    if (!payroll) return;
    setPeriodStart(payroll.run.periodStart);
    setPeriodEnd(payroll.run.periodEnd);
    setNotes(payroll.run.notes ?? "");
    setAdjustments(Object.fromEntries(
      payroll.items.map((item) => [item.id, adjustmentFromItem(item)]),
    ));
  }, [payroll]);

  /** Changes one draft adjustment field without mutating any calculated backend value locally. */
  function changeAdjustment(
    item: PayrollItem,
    field: keyof PayrollAdjustmentState,
    value: string,
  ): void {
    setAdjustments((current) => ({
      ...current,
      [item.id]: {
        ...(current[item.id] ?? adjustmentFromItem(item)),
        [field]: value,
      },
    }));
  }

  /** Validates and recalculates the complete DRAFT Payroll Run through the backend. */
  async function saveDraft(): Promise<void> {
    if (!payroll || payroll.run.status !== "DRAFT") return;
    if (!periodStart || !periodEnd || periodEnd < periodStart) {
      setSaveError("Enter a valid payroll period.");
      return;
    }
    if (notes.trim().length > 500) {
      setSaveError("Notes must be 500 characters or fewer.");
      return;
    }

    for (const item of payroll.items) {
      const adjustment = adjustments[item.id] ?? adjustmentFromItem(item);
      if (!isMoney(adjustment.additionsAmount) || !isMoney(adjustment.deductionsAmount) || !isMoney(adjustment.advanceRecoveryAmount)) {
        setSaveError(`Enter valid two-decimal adjustment amounts for ${item.employeeCodeSnapshot}.`);
        return;
      }
      if (isPositiveMoney(adjustment.additionsAmount) && !adjustment.additionsReason.trim()) {
        setSaveError(`Addition reason is required for ${item.employeeCodeSnapshot}.`);
        return;
      }
      if (isPositiveMoney(adjustment.deductionsAmount) && !adjustment.deductionsReason.trim()) {
        setSaveError(`Deduction reason is required for ${item.employeeCodeSnapshot}.`);
        return;
      }
    }

    setSaveError(null);
    try {
      await updatePayroll.mutateAsync({
        payrollRunId,
        input: {
          periodStart,
          periodEnd,
          notes: notes.trim() || null,
          items: payroll.items.map((item) => {
            const adjustment = adjustments[item.id] ?? adjustmentFromItem(item);
            return {
              employeeId: item.employeeId,
              additionsAmount: adjustment.additionsAmount.trim(),
              additionsReason: adjustment.additionsReason.trim() || null,
              deductionsAmount: adjustment.deductionsAmount.trim(),
              deductionsReason: adjustment.deductionsReason.trim() || null,
              advanceRecoveryAmount: adjustment.advanceRecoveryAmount.trim(),
            };
          }),
        },
      });
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : "The payroll draft could not be recalculated.");
    }
  }

  /** Confirms the current DRAFT while retaining one idempotency key across retries. */
  async function confirmDraft(): Promise<void> {
    setConfirmError(null);
    try {
      await confirmPayroll.mutateAsync({ payrollRunId, idempotencyKey: confirmKey.current });
      confirmKey.current = crypto.randomUUID();
      setConfirmOpen(false);
    } catch (error) {
      setConfirmError(error instanceof ApiError ? error.message : "The payroll run could not be confirmed.");
    }
  }

  if (payrollQuery.isPending) return <p>Loading payroll...</p>;
  if (payrollQuery.isError || !payroll) {
    return (
      <section>
        <p className="error-message">Could not load this payroll run.</p>
        <Link className="primary-link" to="/employees/payroll">Back to payroll</Link>
      </section>
    );
  }

  const isDraft = payroll.run.status === "DRAFT";

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Employee Management</p>
          <h1>Payroll {payroll.run.payrollNumber}</h1>
          <p>{formatBusinessDate(payroll.run.periodStart)} – {formatBusinessDate(payroll.run.periodEnd)} · <StatusBadge status={payroll.run.status} /></p>
        </div>
        <div className="form-actions">
          {isDraft ? <Button disabled={updatePayroll.isPending} label={updatePayroll.isPending ? "Recalculating..." : "Save & recalculate"} onClick={() => void saveDraft()} /> : null}
          {isDraft ? <Button disabled={confirmPayroll.isPending || updatePayroll.isPending} label="Confirm payroll" onClick={() => setConfirmOpen(true)} /> : null}
          <Link className="secondary-link" to="/employees/payroll">Back to payroll</Link>
        </div>
      </div>

      <section className="management-card payroll-summary-card">
        <div className="payroll-summary-grid">
          <div><span>Gross salary</span><strong>{formatMoney(payroll.run.grossTotal)}</strong></div>
          <div><span>Attendance deduction</span><strong>{formatMoney(payroll.run.attendanceDeductionTotal)}</strong></div>
          <div><span>Additions</span><strong>{formatMoney(payroll.run.additionsTotal)}</strong></div>
          <div><span>Other deductions</span><strong>{formatMoney(payroll.run.deductionsTotal)}</strong></div>
          <div><span>Advance recovery</span><strong>{formatMoney(payroll.run.advanceRecoveryTotal)}</strong></div>
          <div><span>Net salary</span><strong>{formatMoney(payroll.run.netTotal)}</strong></div>
        </div>
      </section>

      {isDraft ? (
        <section className="management-card payroll-period-card">
          <div className="employee-form-grid">
            <label className="ui-field">
              <span>Period start</span>
              <input disabled={updatePayroll.isPending} onChange={(event) => setPeriodStart(event.target.value)} type="date" value={periodStart} />
            </label>
            <label className="ui-field">
              <span>Period end</span>
              <input disabled={updatePayroll.isPending} onChange={(event) => setPeriodEnd(event.target.value)} type="date" value={periodEnd} />
            </label>
            <label className="ui-field employee-form-wide">
              <span>Notes</span>
              <textarea disabled={updatePayroll.isPending} maxLength={500} onChange={(event) => setNotes(event.target.value)} rows={3} value={notes} />
            </label>
          </div>
          {saveError ? <p className="error-message">{saveError}</p> : null}
        </section>
      ) : (
        <section className="management-card">
          <dl className="detail-list">
            <div><dt>Confirmed</dt><dd>{formatBusinessDateTime(payroll.run.confirmedAt)}</dd></div>
            <div><dt>Notes</dt><dd>{payroll.run.notes || "—"}</dd></div>
          </dl>
        </section>
      )}

      <section className="management-card payroll-items-card">
        <h2>Employee payroll</h2>
        <div className="table-scroll">
          <table className="ui-table payroll-items-table">
            <thead>
              <tr>
                <th>Employee</th><th>Days</th><th>Base / gross</th><th>Attendance</th><th>Additions</th><th>Deductions</th><th>Advance recovery</th><th>Net</th><th>Paid</th><th>Remaining</th>{!isDraft ? <th>Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {payroll.items.map((item) => {
                const adjustment = adjustments[item.id] ?? adjustmentFromItem(item);
                return (
                  <tr key={item.id}>
                    <td><strong>{item.employeeNameSnapshot}</strong><br /><small>{item.employeeCodeSnapshot}{item.jobTitleSnapshot ? ` · ${item.jobTitleSnapshot}` : ""}</small></td>
                    <td>
                      <small>Working {formatQuantity(item.workingDays)}<br />Payable {formatQuantity(item.payableDays)}<br />Absent {formatQuantity(item.absentDays)} · Half {formatQuantity(item.halfDays)}<br />Paid leave {formatQuantity(item.paidLeaveDays)} · Unpaid {formatQuantity(item.unpaidLeaveDays)}</small>
                    </td>
                    <td>{formatMoney(item.baseSalarySnapshot)}<br /><small>Gross {formatMoney(item.grossSalary)}</small></td>
                    <td>{formatMoney(item.attendanceDeduction)}</td>
                    <td>
                      {isDraft ? (
                        <div className="payroll-adjustment-fields">
                          <input aria-label={`Addition amount for ${item.employeeNameSnapshot}`} disabled={updatePayroll.isPending} inputMode="decimal" onChange={(event) => changeAdjustment(item, "additionsAmount", event.target.value)} value={adjustment.additionsAmount} />
                          <input aria-label={`Addition reason for ${item.employeeNameSnapshot}`} disabled={updatePayroll.isPending} onChange={(event) => changeAdjustment(item, "additionsReason", event.target.value)} placeholder="Reason" value={adjustment.additionsReason} />
                        </div>
                      ) : <>{formatMoney(item.additionsAmount)}{item.additionsReason ? <><br /><small>{item.additionsReason}</small></> : null}</>}
                    </td>
                    <td>
                      {isDraft ? (
                        <div className="payroll-adjustment-fields">
                          <input aria-label={`Deduction amount for ${item.employeeNameSnapshot}`} disabled={updatePayroll.isPending} inputMode="decimal" onChange={(event) => changeAdjustment(item, "deductionsAmount", event.target.value)} value={adjustment.deductionsAmount} />
                          <input aria-label={`Deduction reason for ${item.employeeNameSnapshot}`} disabled={updatePayroll.isPending} onChange={(event) => changeAdjustment(item, "deductionsReason", event.target.value)} placeholder="Reason" value={adjustment.deductionsReason} />
                        </div>
                      ) : <>{formatMoney(item.deductionsAmount)}{item.deductionsReason ? <><br /><small>{item.deductionsReason}</small></> : null}</>}
                    </td>
                    <td>
                      {isDraft ? (
                        <input aria-label={`Advance recovery for ${item.employeeNameSnapshot}`} disabled={updatePayroll.isPending} inputMode="decimal" onChange={(event) => changeAdjustment(item, "advanceRecoveryAmount", event.target.value)} value={adjustment.advanceRecoveryAmount} />
                      ) : formatMoney(item.advanceRecoveryAmount)}
                    </td>
                    <td><strong>{formatMoney(item.netSalary)}</strong></td>
                    <td>{formatMoney(item.paidAmount)}</td>
                    <td><strong>{formatMoney(item.remainingDueAmount)}</strong></td>
                    {!isDraft ? (
                      <td>
                        <Button disabled={item.remainingDueAmount === "0.00"} label="Pay salary" onClick={() => setPaymentItem(item)} />
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {!isDraft ? (
        <section className="management-card payroll-payments-card">
          <h2>Salary payment history</h2>
          {salaryPaymentsQuery.isPending ? <p>Loading salary payments...</p> : null}
          {salaryPaymentsQuery.isError ? <p className="error-message">Could not load salary payment history.</p> : null}
          {salaryPayments?.items.length === 0 ? <p>No salary payments have been recorded for this payroll.</p> : null}
          {salaryPayments && salaryPayments.items.length > 0 ? (
            <div className="table-scroll">
              <table className="ui-table">
                <thead><tr><th>Document</th><th>Employee</th><th>Date</th><th>Amount</th><th>Status</th><th>Type</th><th>Action</th></tr></thead>
                <tbody>
                  {salaryPayments.items.map((payment) => (
                    <tr key={payment.id}>
                      <td>{payment.documentNumber}</td>
                      <td>{payment.employeeCode} · {payment.employeeName}</td>
                      <td>{formatBusinessDate(payment.paymentDate)}</td>
                      <td>{formatMoney(payment.totalAmount)}</td>
                      <td>{formatStatusLabel(payment.status)}</td>
                      <td>{payment.reversalOfPaymentId ? "Reversal" : "Payment"}</td>
                      <td><Button label="View" onClick={() => setSelectedPaymentId(payment.id)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {salaryPayments ? (
            <div className="pagination-row">
              <p>Page {salaryPage} of {salaryTotalPages} · {salaryPayments.total} entries</p>
              <div className="form-actions">
                <Button disabled={salaryPage <= 1 || salaryPaymentsQuery.isFetching} label="Previous" onClick={() => setSalaryPage((current) => Math.max(1, current - 1))} />
                <Button disabled={salaryPage >= salaryTotalPages || salaryPaymentsQuery.isFetching} label="Next" onClick={() => setSalaryPage((current) => Math.min(salaryTotalPages, current + 1))} />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <Dialog isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm payroll">
        <p>Confirm {payroll.run.payrollNumber}? This freezes payroll snapshots and creates salary payable, but does not move cash or bank balances.</p>
        {confirmError ? <p className="error-message">{confirmError}</p> : null}
        <div className="form-actions">
          <Button disabled={confirmPayroll.isPending} label="Cancel" onClick={() => setConfirmOpen(false)} />
          <Button disabled={confirmPayroll.isPending} label={confirmPayroll.isPending ? "Confirming..." : "Confirm payroll"} onClick={() => void confirmDraft()} />
        </div>
      </Dialog>

      <Dialog isOpen={paymentItem !== null} onClose={() => setPaymentItem(null)} title="Pay salary" wide>
        {paymentItem ? (
          <SalaryPaymentForm
            item={paymentItem}
            onCancel={() => setPaymentItem(null)}
            onSaved={() => setPaymentItem(null)}
            payrollNumber={payroll.run.payrollNumber}
            periodEnd={payroll.run.periodEnd}
          />
        ) : null}
      </Dialog>

      <Dialog isOpen={selectedPaymentId.length > 0} onClose={() => setSelectedPaymentId("")} title="Salary payment detail" wide>
        {selectedPaymentId ? <SalaryPaymentDetail onClose={() => setSelectedPaymentId("")} salaryPaymentId={selectedPaymentId} /> : null}
      </Dialog>
    </section>
  );
}
