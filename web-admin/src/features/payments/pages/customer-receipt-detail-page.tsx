import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import type {
  CustomerReceipt,
  PaymentAllocation,
  PaymentSplit,
} from "../api/payments.api.ts";
import {
  useCustomerReceipt,
  useReverseCustomerReceipt,
} from "../hooks/use-payments.ts";

interface CustomerReceiptDetailPageProps {
  receiptId: string;
}

/** Returns a readable payment method label for one receipt split. */
function paymentMethodLabel(method: PaymentSplit["method"]): string {
  return method === "BANK_TRANSFER" ? "Bank transfer" : "Cash";
}

/** Returns the best available account label for one immutable split. */
function splitAccountLabel(split: PaymentSplit): string {
  if (split.accountName) return split.accountName;
  if (split.cashAccountId) return split.cashAccountId;
  if (split.bankAccountId) return split.bankAccountId;
  return "—";
}

/** Returns the best available document label for one receipt allocation. */
function allocationDocumentLabel(allocation: PaymentAllocation): string {
  return allocation.documentNumber ?? allocation.documentId;
}

/** Prints the current receipt detail page using the browser print dialog. */
function printReceipt(): void {
  window.print();
}

/** Displays immutable receipt details and allows one linked reversal when permitted. */
export function CustomerReceiptDetailPage({
  receiptId,
}: CustomerReceiptDetailPageProps): React.JSX.Element {
  const receiptQuery = useCustomerReceipt(receiptId);
  const reverseReceipt = useReverseCustomerReceipt();
  const [showReversal, setShowReversal] = useState(false);
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const receipt = receiptQuery.data?.data;

  /** Opens the small reversal form and clears old validation messages. */
  function openReversal(): void {
    setValidationError(null);
    setShowReversal(true);
  }

  /** Closes the reversal form without changing the receipt. */
  function cancelReversal(): void {
    if (reverseReceipt.isPending) return;
    setReason("");
    setValidationError(null);
    setShowReversal(false);
  }

  /** Reverses the receipt with a required reason and a fresh idempotency key. */
  async function submitReversal(): Promise<void> {
    const trimmedReason = reason.trim();

    if (!trimmedReason) {
      setValidationError("A reversal reason is required.");
      return;
    }

    setValidationError(null);

    try {
      await reverseReceipt.mutateAsync({
        receiptId,
        input: { reason: trimmedReason },
        idempotencyKey: crypto.randomUUID(),
      });
      setReason("");
      setShowReversal(false);
    } catch {
      // The mutation error is displayed below the reversal form.
    }
  }

  if (receiptQuery.isPending) {
    return <p>Loading customer receipt...</p>;
  }

  if (receiptQuery.isError || !receipt) {
    return (
      <section>
        <p className="error-message">Could not load this customer receipt.</p>
        <Link className="primary-link" to="/payments/customer-receipts">
          Back to receipts
        </Link>
      </section>
    );
  }

  const canReverse = receipt.status === "CONFIRMED" && !receipt.reversalOfPaymentId;

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Payments</p>
          <h1>Customer receipt {receipt.documentNumber}</h1>
          <p>View the immutable receipt, its allocations and account splits.</p>
        </div>
        <div className="form-actions">
          <Button label="Print" onClick={printReceipt} />
          <Link className="secondary-link" to="/payments/customer-receipts">
            Back to receipts
          </Link>
        </div>
      </div>

      <section className="management-card">
        <dl className="detail-list">
          <div><dt>Receipt number</dt><dd>{receipt.documentNumber}</dd></div>
          <div><dt>Customer</dt><dd>{receipt.customerName ?? receipt.customerId}</dd></div>
          <div><dt>Payment date</dt><dd>{receipt.paymentDate}</dd></div>
          <div><dt>Total amount</dt><dd>PKR {receipt.totalAmount}</dd></div>
          <div><dt>Status</dt><dd>{receipt.status === "REVERSED" ? "Reversed" : "Confirmed"}</dd></div>
          <div><dt>Customer balance</dt><dd>{receipt.customerBalance !== undefined ? `PKR ${receipt.customerBalance}` : "—"}</dd></div>
          <div><dt>Notes</dt><dd>{receipt.notes || "—"}</dd></div>
          <div><dt>Created</dt><dd>{new Date(receipt.createdAt).toLocaleString()}</dd></div>
          {receipt.reversalReason ? (
            <div><dt>Reversal reason</dt><dd>{receipt.reversalReason}</dd></div>
          ) : null}
          {receipt.reversalOfPaymentId ? (
            <div><dt>Reversal of receipt</dt><dd>{receipt.reversalOfPaymentId}</dd></div>
          ) : null}
        </dl>
      </section>

      <section className="management-card">
        <h2>Payment splits</h2>
        {receipt.splits && receipt.splits.length > 0 ? (
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
                {receipt.splits.map((split) => (
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
        <h2>Invoice allocations</h2>
        {receipt.allocations && receipt.allocations.length > 0 ? (
          <div className="table-scroll">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Allocated amount</th>
                </tr>
              </thead>
              <tbody>
                {receipt.allocations.map((allocation) => (
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
          <p>No invoice allocations are available.</p>
        )}
      </section>

      {canReverse ? (
        <section className="management-card">
          <h2>Reverse receipt</h2>
          <p>Use a reversal only to correct a confirmed receipt. The original record remains unchanged.</p>

          {!showReversal ? (
            <Button label="Reverse receipt" onClick={openReversal} />
          ) : (
            <div className="receipt-reversal-form">
              <label className="ui-field">
                <span>Reason</span>
                <textarea
                  disabled={reverseReceipt.isPending}
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>

              {validationError ? <p className="error-message">{validationError}</p> : null}
              {reverseReceipt.isError ? (
                <p className="error-message">The receipt could not be reversed.</p>
              ) : null}

              <div className="form-actions">
                <Button
                  disabled={reverseReceipt.isPending}
                  label={reverseReceipt.isPending ? "Reversing..." : "Confirm reversal"}
                  onClick={() => void submitReversal()}
                />
                <Button
                  disabled={reverseReceipt.isPending}
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
