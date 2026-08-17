import { Link, useNavigate } from "@tanstack/react-router";

import { StockCountForm } from "../components/stock-count-form.tsx";
import { useStockCount } from "../hooks/use-inventory.ts";

interface StockCountFormPageProps {
  stockCountId?: string;
}

/** Shows the create or draft-edit stock-count form. */
export function StockCountFormPage({
  stockCountId,
}: StockCountFormPageProps): React.JSX.Element {
  const navigate = useNavigate();
  const isEdit = Boolean(stockCountId);
  const countQuery = useStockCount(stockCountId ?? "");
  const detail = countQuery.data?.data;

  /** Opens the saved stock-count detail after a successful save. */
  function handleSaved(savedStockCountId: string): void {
    void navigate({
      to: "/inventory/counts/$countId",
      params: { countId: savedStockCountId },
    });
  }

  /** Returns to the stock-count list without saving. */
  function handleCancel(): void {
    void navigate({ to: "/inventory/counts" });
  }

  if (isEdit && countQuery.isPending) {
    return <p>Loading stock count...</p>;
  }

  if (isEdit && countQuery.isError) {
    return <p className="error-message">The stock count could not be loaded.</p>;
  }

  if (detail?.stockCount.status === "CONFIRMED") {
    return (
      <section>
        <p className="eyebrow">Inventory Management</p>
        <h1>Confirmed stock count</h1>
        <p>A confirmed stock count cannot be edited.</p>
        <Link
          className="primary-link"
          params={{ countId: detail.stockCount.id }}
          to="/inventory/counts/$countId"
        >
          View stock count
        </Link>
      </section>
    );
  }

  return (
    <section>
      <p className="eyebrow">Inventory Management</p>
      <h1>{isEdit ? "Edit draft stock count" : "New stock count"}</h1>
      <p>
        {isEdit
          ? "Update counted quantities before confirmation."
          : "Record physical quantities and save them as a draft."}
      </p>

      <section className="management-card stock-count-form-card">
        <StockCountForm
          existingDetail={detail}
          onCancel={handleCancel}
          onSaved={handleSaved}
          stockCountId={stockCountId}
        />
      </section>
    </section>
  );
}
