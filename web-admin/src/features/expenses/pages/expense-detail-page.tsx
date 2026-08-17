import { useRef, useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import type { ExpenseDetail } from "../api/expenses.api.ts";
import {
  useExpense,
  useReverseExpense,
} from "../hooks/use-expenses.ts";

interface ExpenseDetailPageProps {
  expenseId: string;
}

/** Returns the readable payment-method label shown on Expense detail. */
function paymentMethodLabel(paymentMethod: ExpenseDetail["paymentMethod"]): string {
  return paymentMethod === "CASH" ? "Cash" : "Bank transfer";
}

/** Returns the payment account label stored with one immutable expense. */
function paymentAccountLabel(expense: ExpenseDetail): string {
  if (expense.paymentMethod === "CASH") {
    return expense.cashAccountName ?? expense.cashAccountId ?? "—";
  }

  const bankParts = [
    expense.bankName,
    expense.bankAccountName,
    expense.bankAccountNumber,
  ].filter(Boolean);

  if (bankParts.length > 0) {
    return bankParts.join(" - ");
  }

  return expense.bankAccountId ?? "—";
}

/** Displays one immutable Expense and allows a linked reversal when appropriate. */
export function ExpenseDetailPage({
  expenseId,
}: ExpenseDetailPageProps): React.JSX.Element {
  const expenseQuery = useExpense(expenseId);
  const reverseExpense = useReverseExpense();
  const [showReversal, setShowReversal] = useState(false);
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [reversedSuccessfully, setReversedSuccessfully] = useState(false);
  const reversalKeyRef = useRef<string | null>(null);
  const expense = expenseQuery.data?.data;

  /** Opens the reversal form without changing the confirmed Expense. */
  function openReversal(): void {
    setValidationError(null);
    setShowReversal(true);
  }

  /** Closes the reversal form and clears the current retry key. */
  function cancelReversal(): void {
    if (reverseExpense.isPending) return;

    setReason("");
    setValidationError(null);
    setShowReversal(false);
    reversalKeyRef.current = null;
  }

  /** Reverses the Expense while reusing one idempotency key across retries. */
  async function submitReversal(): Promise<void> {
    const trimmedReason = reason.trim();

    if (!trimmedReason) {
      setValidationError("A reversal reason is required.");
      return;
    }

    setValidationError(null);

    if (!reversalKeyRef.current) {
      reversalKeyRef.current = crypto.randomUUID();
    }

    try {
      await reverseExpense.mutateAsync({
        expenseId,
        input: { reason: trimmedReason },
        idempotencyKey: reversalKeyRef.current,
      });
      setReason("");
      setShowReversal(false);
      setReversedSuccessfully(true);
      reversalKeyRef.current = null;
    } catch {
      // Keep the same idempotency key so the same reversal can be retried safely.
    }
  }

  if (expenseQuery.isPending) {
    return <p>Loading expense...</p>;
  }

  if (expenseQuery.isError || !expense) {
    return <p className="error-message">Could not load this expense.</p>;
  }

  const isReversal = Boolean(expense.reversalOfExpenseId);
  const isReversed = Boolean(expense.reversedByExpenseId) || reversedSuccessfully;
  const canReverse = !isReversal && !isReversed;

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Expense Management</p>
          <h1>{expense.expenseNumber}</h1>
          <p>View the immutable confirmed expense and its payment details.</p>
        </div>
      </div>

      <section className="management-card">
        <dl className="detail-list">
          <div><dt>Expense number</dt><dd>{expense.expenseNumber}</dd></div>
          <div><dt>Date</dt><dd>{expense.expenseDate}</dd></div>
          <div><dt>Category</dt><dd>{expense.categoryName}</dd></div>
          <div><dt>Amount</dt><dd>PKR {expense.amount}</dd></div>
          <div><dt>Payment method</dt><dd>{paymentMethodLabel(expense.paymentMethod)}</dd></div>
          <div><dt>Account</dt><dd>{paymentAccountLabel(expense)}</dd></div>
          <div><dt>Status</dt><dd>{isReversal ? "Reversal" : isReversed ? "Reversed" : "Confirmed"}</dd></div>
          <div><dt>Note</dt><dd>{expense.note || "—"}</dd></div>
          <div><dt>Created</dt><dd>{new Date(expense.createdAt).toLocaleString()}</dd></div>
          {expense.receiptUrl ? (
            <div>
              <dt>Receipt</dt>
              <dd>
                <a href={expense.receiptUrl} rel="noreferrer" target="_blank">
                  Open receipt
                </a>
              </dd>
            </div>
          ) : null}
          {expense.reversalOfExpenseId ? (
            <div><dt>Reversal of expense</dt><dd>{expense.reversalOfExpenseId}</dd></div>
          ) : null}
          {expense.reversedByExpenseId ? (
            <div><dt>Reversed by expense</dt><dd>{expense.reversedByExpenseId}</dd></div>
          ) : null}
          {expense.reversalReason ? (
            <div><dt>Reversal reason</dt><dd>{expense.reversalReason}</dd></div>
          ) : null}
        </dl>
      </section>

      {canReverse ? (
        <section className="management-card">
          <h2>Reverse expense</h2>
          <p>
            Use a reversal only to correct a confirmed expense. The original
            record remains unchanged.
          </p>

          {!showReversal ? (
            <Button label="Reverse expense" onClick={openReversal} />
          ) : (
            <div className="receipt-reversal-form">
              <label className="ui-field">
                <span>Reason</span>
                <textarea
                  disabled={reverseExpense.isPending}
                  maxLength={500}
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>

              {validationError ? (
                <p className="error-message">{validationError}</p>
              ) : null}
              {reverseExpense.isError ? (
                <p className="error-message">The expense could not be reversed.</p>
              ) : null}

              <div className="form-actions">
                <Button
                  disabled={reverseExpense.isPending}
                  label={reverseExpense.isPending ? "Reversing..." : "Confirm reversal"}
                  onClick={() => void submitReversal()}
                />
                <Button
                  disabled={reverseExpense.isPending}
                  label="Cancel"
                  onClick={cancelReversal}
                />
              </div>
            </div>
          )}
        </section>
      ) : null}

      {reversedSuccessfully ? (
        <section className="management-card">
          <p>This expense has been reversed successfully.</p>
        </section>
      ) : null}
    </section>
  );
}
