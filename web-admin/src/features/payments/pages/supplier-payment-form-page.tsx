import { Link, useNavigate } from "@tanstack/react-router";

import { SupplierPaymentForm } from "../components/supplier-payment-form.tsx";
import { usePaymentAccounts } from "../hooks/use-payments.ts";

/** Hosts the supplier payment form and returns to the payment list after save or cancel. */
export function SupplierPaymentFormPage(): React.JSX.Element {
  const navigate = useNavigate();
  const accountsQuery = usePaymentAccounts();
  const accounts = accountsQuery.data?.data;

  /** Returns to the supplier payment list after a successful save. */
  function handleSaved(): void {
    void navigate({ to: "/payments/supplier-payments" });
  }

  /** Returns to the supplier payment list without creating a payment. */
  function handleCancel(): void {
    void navigate({ to: "/payments/supplier-payments" });
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Payments</p>
          <h1>New supplier payment</h1>
          <p>Allocate one supplier payment to outstanding purchases and cash or bank accounts.</p>
        </div>
        <Link className="secondary-link" to="/payments/supplier-payments">Back to payments</Link>
      </div>

      {accountsQuery.isPending ? <p>Loading payment accounts...</p> : null}
      {accountsQuery.isError ? (
        <p className="error-message">Payment accounts could not be loaded.</p>
      ) : null}
      {accounts ? (
        <SupplierPaymentForm
          accounts={accounts}
          onCancel={handleCancel}
          onSaved={handleSaved}
        />
      ) : null}
    </section>
  );
}
