import { useRef, useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import { formatBusinessDate, formatMoney, formatStatusLabel } from "../../../lib/utils.ts";
import { usePaymentAccounts } from "../../payments/hooks/use-payments.ts";
import { useReverseSalaryPayment, useSalaryPayment } from "../hooks/use-employees.ts";

interface SalaryPaymentDetailProps {
  salaryPaymentId: string;
  onClose(): void;
}

/** Shows immutable Salary Payment detail and exposes the approved reversal workflow. */
export function SalaryPaymentDetail({ salaryPaymentId, onClose }: SalaryPaymentDetailProps): React.JSX.Element {
  const paymentQuery = useSalaryPayment(salaryPaymentId);
  const accountsQuery = usePaymentAccounts();
  const reversePayment = useReverseSalaryPayment();
  const reversalKey = useRef<string | null>(null);
  const [showReversal, setShowReversal] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const payment = paymentQuery.data?.data;

  /** Returns the readable account label for one immutable Salary Payment split. */
  function accountLabel(cashAccountId: string | null, bankAccountId: string | null): string {
    const accounts = accountsQuery.data?.data;
    if (!accounts) return cashAccountId ?? bankAccountId ?? "—";
    if (cashAccountId) return accounts.cashAccounts.find((account) => account.id === cashAccountId)?.name ?? cashAccountId;
    if (bankAccountId) {
      const account = accounts.bankAccounts.find((row) => row.id === bankAccountId);
      return account ? `${account.bankName} — ${account.accountName}` : bankAccountId;
    }
    return "—";
  }

  /** Reverses one confirmed Salary Payment while retaining the idempotency key on retry. */
  async function submitReversal(): Promise<void> {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("A reversal reason is required.");
      return;
    }

    if (!reversalKey.current) reversalKey.current = crypto.randomUUID();
    setError(null);

    try {
      await reversePayment.mutateAsync({
        salaryPaymentId,
        reason: trimmedReason,
        idempotencyKey: reversalKey.current,
      });
      reversalKey.current = null;
      setReason("");
      setShowReversal(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The salary payment could not be reversed.");
    }
  }

  if (paymentQuery.isPending) return <p>Loading salary payment...</p>;
  if (paymentQuery.isError || !payment) return <p className="error-message">Could not load this salary payment.</p>;

  const canReverse = payment.status === "CONFIRMED" && !payment.reversalOfPaymentId;

  return (
    <div className="salary-payment-detail">
      <dl className="detail-list">
        <div><dt>Payment</dt><dd>{payment.documentNumber}</dd></div>
        <div><dt>Employee</dt><dd>{payment.employeeCode} · {payment.employeeName}</dd></div>
        <div><dt>Date</dt><dd>{formatBusinessDate(payment.paymentDate)}</dd></div>
        <div><dt>Total</dt><dd>{formatMoney(payment.totalAmount)}</dd></div>
        <div><dt>Status</dt><dd>{formatStatusLabel(payment.status)}</dd></div>
        <div><dt>Notes</dt><dd>{payment.notes || "—"}</dd></div>
        {payment.reversalReason ? <div><dt>Reversal reason</dt><dd>{payment.reversalReason}</dd></div> : null}
      </dl>

      <h3>Account splits</h3>
      <div className="table-scroll">
        <table className="ui-table">
          <thead><tr><th>Method</th><th>Account</th><th>Amount</th></tr></thead>
          <tbody>
            {payment.splits.map((split) => (
              <tr key={split.id}>
                <td>{split.method === "CASH" ? "Cash" : "Bank transfer"}</td>
                <td>{accountLabel(split.cashAccountId, split.bankAccountId)}</td>
                <td>{formatMoney(split.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Payroll allocations</h3>
      <div className="table-scroll">
        <table className="ui-table">
          <thead><tr><th>Payroll</th><th>Period</th><th>Amount</th></tr></thead>
          <tbody>
            {payment.allocations.map((allocation) => (
              <tr key={allocation.id}>
                <td>{allocation.payrollNumber}</td>
                <td>{formatBusinessDate(allocation.periodStart)} – {formatBusinessDate(allocation.periodEnd)}</td>
                <td>{formatMoney(allocation.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canReverse ? (
        <section className="salary-payment-reversal">
          {!showReversal ? (
            <Button label="Reverse payment" onClick={() => setShowReversal(true)} />
          ) : (
            <>
              <label className="ui-field">
                <span>Reversal reason</span>
                <textarea
                  disabled={reversePayment.isPending}
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  value={reason}
                />
              </label>
              {error ? <p className="error-message">{error}</p> : null}
              <div className="form-actions">
                <Button
                  disabled={reversePayment.isPending}
                  label="Cancel reversal"
                  onClick={() => {
                    setShowReversal(false);
                    setReason("");
                    setError(null);
                    reversalKey.current = null;
                  }}
                />
                <Button
                  disabled={reversePayment.isPending}
                  label={reversePayment.isPending ? "Reversing..." : "Confirm reversal"}
                  onClick={() => void submitReversal()}
                />
              </div>
            </>
          )}
        </section>
      ) : null}

      <div className="form-actions">
        <Button label="Done" onClick={onClose} />
      </div>
    </div>
  );
}
