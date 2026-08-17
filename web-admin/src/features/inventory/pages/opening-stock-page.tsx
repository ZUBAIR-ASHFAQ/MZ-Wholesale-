import { useNavigate } from "@tanstack/react-router";

import { OpeningStockForm } from "../components/opening-stock-form.tsx";

/** Hosts the setup-only opening-stock form. */
export function OpeningStockPage(): React.JSX.Element {
  const navigate = useNavigate();

  /** Returns to current stock without reloading the browser. */
  function returnToInventory(): void {
    void navigate({ to: "/inventory" });
  }

  return (
    <section>
      <p className="eyebrow">Inventory Management</p>
      <h1>Opening stock</h1>
      <p>
        Enter setup stock before normal purchase, sale, return, or adjustment
        activity begins.
      </p>

      <section className="management-card inventory-entry-card">
        <OpeningStockForm
          onCancel={returnToInventory}
          onSaved={returnToInventory}
        />
      </section>
    </section>
  );
}
