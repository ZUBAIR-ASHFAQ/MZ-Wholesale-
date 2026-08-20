import { Link, useNavigate } from "@tanstack/react-router";

import { usePaymentAccounts } from "../../payments/hooks/use-payments.ts";
import { SalesReturnForm } from "../components/sales-return-form.tsx";

interface SalesReturnFormPageProps {
  originalSaleId?: string;
}

/** Hosts the Sales Return form and optionally starts from one confirmed sale. */
export function SalesReturnFormPage({
  originalSaleId,
}: SalesReturnFormPageProps): React.JSX.Element {
  const navigate = useNavigate();
  const accountsQuery = usePaymentAccounts();
  const accounts = accountsQuery.data?.data;

  /** Opens the immutable generated Sales Return document after confirmation. */
  function handleSaved(salesReturnId: string): void {
    void navigate({
      to: "/returns/sales/$salesReturnId",
      params: { salesReturnId },
    });
  }

  /** Leaves the form without creating a Sales Return. */
  function handleCancel(): void {
    void navigate({ to: "/returns/sales" });
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Sales Returns</p>
          <h1>New sales return</h1>
          <p>Select a confirmed invoice, return quantities, stock condition, and settlement method.</p>
        </div>
        <Link className="secondary-link" to="/returns/sales">Back to sales returns</Link>
      </div>

      {accountsQuery.isPending ? <p>Loading payment accounts...</p> : null}
      {accountsQuery.isError ? <p className="error-message">Payment accounts could not be loaded.</p> : null}
      {accounts ? (
        <SalesReturnForm
          accounts={accounts}
          initialOriginalSaleId={originalSaleId}
          onCancel={handleCancel}
          onSaved={handleSaved}
        />
      ) : null}
    </section>
  );
}
