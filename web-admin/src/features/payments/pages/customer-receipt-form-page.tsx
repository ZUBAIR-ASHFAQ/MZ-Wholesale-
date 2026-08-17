import { Link, useNavigate } from "@tanstack/react-router";

import { usePaymentAccounts } from "../hooks/use-payments.ts";
import { CustomerReceiptForm } from "../components/customer-receipt-form.tsx";

/** Hosts the customer receipt form and returns to the receipt list after save or cancel. */
export function CustomerReceiptFormPage(): React.JSX.Element {
  const navigate = useNavigate();
  const accountsQuery = usePaymentAccounts();
  const accounts = accountsQuery.data?.data;

  /** Returns to the receipt list after a successful save. */
  function handleSaved(): void {
    void navigate({ to: "/payments/customer-receipts" });
  }

  /** Returns to the receipt list without creating a receipt. */
  function handleCancel(): void {
    void navigate({ to: "/payments/customer-receipts" });
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Payments</p>
          <h1>New customer receipt</h1>
          <p>Allocate one customer payment to outstanding invoices and cash or bank accounts.</p>
        </div>
        <Link className="secondary-link" to="/payments/customer-receipts">Back to receipts</Link>
      </div>

      {accountsQuery.isPending ? <p>Loading payment accounts...</p> : null}
      {accountsQuery.isError ? (
        <p className="error-message">Payment accounts could not be loaded.</p>
      ) : null}
      {accounts ? (
        <CustomerReceiptForm
          accounts={accounts}
          onCancel={handleCancel}
          onSaved={handleSaved}
        />
      ) : null}
    </section>
  );
}
