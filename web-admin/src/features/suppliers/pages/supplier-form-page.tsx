import { useNavigate } from "@tanstack/react-router";

import { SupplierForm } from "../components/supplier-form.tsx";
import { useSupplier } from "../hooks/use-suppliers.ts";

interface SupplierFormPageProps {
  supplierId?: string;
}

/** Hosts the shared supplier form for create and edit routes. */
export function SupplierFormPage({
  supplierId,
}: SupplierFormPageProps): React.JSX.Element {
  const navigate = useNavigate();
  const isEditing = Boolean(supplierId);
  const supplierQuery = useSupplier(supplierId ?? "");

  /** Returns to the supplier list without reloading the browser. */
  function returnToSuppliers(): void {
    void navigate({ to: "/suppliers" });
  }

  if (isEditing && supplierQuery.isPending) {
    return <p>Loading supplier...</p>;
  }

  if (isEditing && (supplierQuery.isError || !supplierQuery.data)) {
    return <p className="error-message">Could not load this supplier.</p>;
  }

  const supplier = supplierQuery.data?.data.supplier;

  return (
    <section>
      <p className="eyebrow">Supplier Management</p>
      <h1>{isEditing ? "Edit supplier" : "Add supplier"}</h1>
      <p>
        {isEditing
          ? "Update the approved supplier master data."
          : "Create a supplier for future purchases and payment tracking."}
      </p>

      <section className="management-card supplier-form-card">
        <SupplierForm
          supplier={supplier}
          onCancel={returnToSuppliers}
          onSaved={returnToSuppliers}
        />
      </section>
    </section>
  );
}
