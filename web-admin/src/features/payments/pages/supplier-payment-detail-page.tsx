import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import type {
  PaymentAllocation,
  PaymentSplit,
  SupplierPayment,
} from "../api/payments.api.ts";
import {
  useReverseSupplierPayment,
  useSupplierPayment,
} from "../hooks/use-payments.ts";

interface SupplierPaymentDetailPageProps {
  paymentId: string;
}

/** Returns a readable payment method label for one supplier-payment split. */
function paymentMethodLabel(method: PaymentSplit["method"]): string {
  return method === "BANK_TRANSFER" ? "Bank transfer" : "Cash";
}

/** Returns the best available account label for one immutable payment split. */
function splitAccountLabel(split: PaymentSplit): string {
  if (split.accountName) return split.accountName;
  if (split.cashAccountId) return split.cashAccountId;
  if (split.bankAccountId) return split.bankAccountId;
  return "—";
}

/** Returns the best available purchase label for one supplier-payment allocation. */
function allocationDocumentLabel(allocation: PaymentAllocation): string {
  return allocation.documentNumber ?? allocation.documentId;
}

/** Prints the current supplier-payment detail page using the browser print dialog. */
function printPayment(): void {
  window.print();
}

/** Displays immutable supplier-payment details and allows one linked reversal when permitted. */
export function SupplierPaymentDetailPage({
  paymentId,
}: SupplierPaymentDetailPageProps): React.JSX.Element {
  const paymentQuery = useSupplierPayment(paymentId);
  const reversePayment = useReverseSupplierPayment();
  const [showReversal, setShowReversal] = useState(false);
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const payment: SupplierPayment | undefined = paymentQuery.data?.data;

  /** Opens the reversal form and clears any previous validation message. */
  function openReversal(): void {
    setValidationError(null);
    setShowReversal(true);
  }

  /** Closes the reversal form without changing the supplier payment. */
  function cancelReversal(): void {
    if (reversePayment.isPending) return;
    setReason("");
    setValidationError(null);
    setShowReversal(false);
  }

  /** Reverses the supplier payment with a required reason and fresh idempotency key. */
  async function submitReversal(): Promise<void> {
    const trimmedReason = reason.trim();

    if (!trimmedReason) {
      setValidationError("A reversal reason is required.");
      return;
    }

    setValidationError(null);

    try {
      await reversePayment.mutateAsync({
        paymentId,
        input: { reason: trimmedReason },
        idempotencyKey: crypto.randomUUID(),
      });
      setReason("");
      setShowReversal(false);
    } catch {
      // The mutation error is displayed below the reversal form.
    }
  }

  if (paymentQuery.isPending) {
    return <p>Loading supplier payment...</p>;
  }

  if (paymentQuery.isError || !payment) {
    return (
      <section>
        <p className="error-message">Could not load this supplier payment.</p>
        <Link className="primary-link" to="/payments/supplier-payments">
          Back to supplier payments
        </Link>
      </section>
    );
  }

  const canReverse = payment.status === "CONFIRMED" && !payment.reversalOfPaymentId;

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Payments</p>
          <h1>Supplier payment {payment.documentNumber}</h1>
          <p>View the immutable supplier payment, purchase allocations and account splits.</p>
        </div>
        <div className="form-actions">
          <Button label="Print" onClick={printPayment} />
          <Link className="secondary-link" to="/payments/supplier-payments">
            Back to supplier payments
          </Link>
        </div>
      </div>

      <section className="management-card">
        <dl className="detail-list">
          <div><dt>Payment number</dt><dd>{payment.documentNumber}</dd></div>
          <div><dt>Supplier</dt><dd>{payment.supplierName ?? payment.supplierId}</dd></div>
          <div><dt>Payment date</dt><dd>{payment.paymentDate}</dd></div>
          <div><dt>Total amount</dt><dd>PKR {payment.totalAmount}</dd></div>
          <div><dt>Status</dt><dd>{payment.status === "REVERSED" ? "Reversed" : "Confirmed"}</dd></div>
          <div><dt>Supplier payable</dt><dd>{payment.supplierBalance !== undefined ? `PKR ${payment.supplierBalance}` : "—"}</dd></div>
          <div><dt>Notes</dt><dd>{payment.notes || "—"}</dd></div>
          <div><dt>Created</dt><dd>{new Date(payment.createdAt).toLocaleString()}</dd></div>
          {payment.reversalReason ? (
            <div><dt>Reversal reason</dt><dd>{payment.reversalReason}</dd></div>
          ) : null}
          {payment.reversalOfPaymentId ? (
            <div><dt>Reversal of payment</dt><dd>{payment.reversalOfPaymentId}</dd></div>
          ) : null}
        </dl>
      </section>

      <section className="management-card">
        <h2>Payment splits</h2>
        {payment.splits && payment.splits.length > 0 ? (
          <div className="table-scroll">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Account</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {payment.splits.map((split) => (
                  <tr key={split.id}>
                    <td>{paymentMethodLabel(split.method)}</td>
                    <td>{splitAccountLabel(split)}</td>
                    <td>PKR {split.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No payment split details are available.</p>
        )}
      </section>

      <section className="management-card">
        <h2>Purchase allocations</h2>
        {payment.allocations && payment.allocations.length > 0 ? (
          <div className="table-scroll">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Purchase</th>
                  <th>Date</th>
                  <th>Allocated amount</th>
                </tr>
              </thead>
              <tbody>
                {payment.allocations.map((allocation) => (
                  <tr key={allocation.id}>
                    <td>{allocationDocumentLabel(allocation)}</td>
                    <td>{allocation.documentDate ?? "—"}</td>
                    <td>PKR {allocation.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No purchase allocations are attached to this payment.</p>
        )}
        {payment.supplierPayableAmount && payment.supplierPayableAmount !== "0.00" ? (
          <p><strong>Existing supplier payable payment:</strong> PKR {payment.supplierPayableAmount}</p>
        ) : null}
      </section>

      {canReverse ? (
        <section className="management-card">
          <h2>Reverse supplier payment</h2>
          <p>Use a reversal only to correct a confirmed payment. The original record remains unchanged.</p>

          {!showReversal ? (
            <Button label="Reverse payment" onClick={openReversal} />
          ) : (
            <div className="receipt-reversal-form">
              <label className="ui-field">
                <span>Reason</span>
                <textarea
                  disabled={reversePayment.isPending}
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>

              {validationError ? <p className="error-message">{validationError}</p> : null}
              {reversePayment.isError ? (
                <p className="error-message">The supplier payment could not be reversed.</p>
              ) : null}

              <div className="form-actions">
                <Button
                  disabled={reversePayment.isPending}
                  label={reversePayment.isPending ? "Reversing..." : "Confirm reversal"}
                  onClick={() => void submitReversal()}
                />
                <Button
                  disabled={reversePayment.isPending}
                  label="Cancel"
                  onClick={cancelReversal}
                />
              </div>
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}
