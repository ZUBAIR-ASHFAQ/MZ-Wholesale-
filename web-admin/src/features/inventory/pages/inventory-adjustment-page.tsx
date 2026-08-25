import { useNavigate } from "@tanstack/react-router";

import { InventoryAdjustmentForm } from "../components/inventory-adjustment-form.tsx";

/** Hosts the manual inventory adjustment form. */
export function InventoryAdjustmentPage(): React.JSX.Element {
  const navigate = useNavigate();

  /** Returns to current stock without reloading the browser. */
  function returnToInventory(): void {
    void navigate({ to: "/inventory" });
  }

  return (
    <section>
      <p className="eyebrow">Inventory Management</p>
      <h1>Manual adjustment</h1>
      <p>
        Record one reason-based stock-in or stock-out movement for the selected
        stock condition.
      </p>

      <section className="management-card inventory-entry-card">
        <InventoryAdjustmentForm
          onCancel={returnToInventory}
          onSaved={returnToInventory}
        />
      </section>
    </section>
  );
}
