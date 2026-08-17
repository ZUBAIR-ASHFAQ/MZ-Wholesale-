import { useNavigate } from "@tanstack/react-router";

import { SaleForm } from "../components/sale-form.tsx";
import { useSale } from "../hooks/use-sales.ts";

interface SaleFormPageProps {
  saleId?: string;
}

/** Shows the Counter Sale form for a new sale or an existing DRAFT/HELD sale. */
export function SaleFormPage({ saleId }: SaleFormPageProps): React.JSX.Element {
  const navigate = useNavigate();
  const saleQuery = useSale(saleId ?? "");

  /** Returns to the Sales list after saving, holding, cancelling, or leaving the form. */
  function returnToSales(): void {
    void navigate({ to: "/sales" });
  }

  if (saleId && saleQuery.isPending) {
    return <p>Loading sale...</p>;
  }

  if (saleId && saleQuery.isError) {
    return <p className="error-message">The sale could not be loaded.</p>;
  }

  const sale = saleQuery.data?.data;

  if (sale && sale.sale.status !== "DRAFT" && sale.sale.status !== "HELD") {
    return <p className="error-message">Only draft or held sales can be edited.</p>;
  }

  return (
    <section>
      <p className="eyebrow">Counter Sales</p>
      <h1>{sale ? (sale.sale.status === "HELD" ? "Resume held sale" : "Edit draft sale") : "New sale"}</h1>
      <p>
        Select the customer and products, then enter the final manual selling price for every item.
      </p>

      <SaleForm
        initialSale={sale}
        onCancel={returnToSales}
        onSaved={returnToSales}
      />
    </section>
  );
}
