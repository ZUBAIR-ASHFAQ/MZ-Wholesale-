import { Link, useNavigate } from "@tanstack/react-router";

import { PurchaseReturnForm } from "../components/purchase-return-form.tsx";

interface PurchaseReturnFormPageProps {
  originalPurchaseId?: string;
}

/** Hosts the Purchase Return form and optionally starts from one confirmed purchase. */
export function PurchaseReturnFormPage({
  originalPurchaseId,
}: PurchaseReturnFormPageProps): React.JSX.Element {
  const navigate = useNavigate();

  /** Returns to the Purchase Return list after confirmation. */
  function handleSaved(): void {
    void navigate({ to: "/returns/purchases" });
  }

  /** Leaves the form without creating a Purchase Return. */
  function handleCancel(): void {
    void navigate({ to: "/returns/purchases" });
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Purchase Returns</p>
          <h1>New purchase return</h1>
          <p>Return items from one confirmed supplier purchase.</p>
        </div>
        <Link className="primary-link" to="/returns/purchases">
          Purchase returns
        </Link>
      </div>

      <PurchaseReturnForm
        initialOriginalPurchaseId={originalPurchaseId}
        onSaved={handleSaved}
        onCancel={handleCancel}
      />
    </section>
  );
}
