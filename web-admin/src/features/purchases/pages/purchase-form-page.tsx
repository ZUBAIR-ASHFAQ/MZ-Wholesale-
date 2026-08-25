import { useNavigate } from "@tanstack/react-router";

import { PurchaseForm } from "../components/purchase-form.tsx";
import { usePurchase } from "../hooks/use-purchases.ts";

interface PurchaseFormPageProps {
  purchaseId?: string;
}

/** Hosts the Purchase form for new purchases and editable drafts. */
export function PurchaseFormPage({ purchaseId }: PurchaseFormPageProps): React.JSX.Element {
  const navigate = useNavigate();
  const isEditing = Boolean(purchaseId);
  const purchaseQuery = usePurchase(purchaseId ?? "");

  /** Returns to the Purchase list after save, confirmation, or cancellation. */
  function returnToPurchases(): void {
    void navigate({ to: "/purchases" });
  }

  if (isEditing && purchaseQuery.isPending) {
    return <p>Loading purchase...</p>;
  }

  if (isEditing && purchaseQuery.isError) {
    return <p className="error-message">Could not load this purchase.</p>;
  }

  return (
    <section>
      <p className="eyebrow">Purchase Management</p>
      <h1>{isEditing ? "Edit purchase draft" : "New purchase"}</h1>
      <p>
        {isEditing
          ? "Update this draft or confirm it when the supplier bill is ready."
          : "Create a supplier purchase, save it as a draft, or confirm it immediately."}
      </p>

      <PurchaseForm
        onCancel={returnToPurchases}
        onSaved={returnToPurchases}
        purchaseDetail={purchaseQuery.data?.data}
      />
    </section>
  );
}
