import { useNavigate } from "@tanstack/react-router";

import { CustomerForm } from "../components/customer-form.tsx";
import { useCustomer } from "../hooks/use-customers.ts";

interface CustomerFormPageProps {
  customerId?: string;
}

/** Hosts the shared customer form for create and edit routes. */
export function CustomerFormPage({
  customerId,
}: CustomerFormPageProps): React.JSX.Element {
  const navigate = useNavigate();
  const isEditing = Boolean(customerId);
  const customerQuery = useCustomer(customerId ?? "");

  /** Returns to the customer list without reloading the browser. */
  function returnToCustomers(): void {
    void navigate({ to: "/customers" });
  }

  if (isEditing && customerQuery.isPending) {
    return <p>Loading customer...</p>;
  }

  if (isEditing && (customerQuery.isError || !customerQuery.data)) {
    return <p className="error-message">Could not load this customer.</p>;
  }

  const customer = customerQuery.data?.data.customer;

  if (customer?.isWalkIn) {
    return <p className="error-message">The Walk-in Customer cannot be edited.</p>;
  }

  return (
    <section>
      <p className="eyebrow">Customer Management</p>
      <h1>{isEditing ? "Edit customer" : "Add customer"}</h1>
      <p>
        {isEditing
          ? "Update the approved customer master data."
          : "Create a regular customer for counter sales and credit tracking."}
      </p>

      <section className="management-card customer-form-card">
        <CustomerForm
          customer={customer}
          onCancel={returnToCustomers}
          onSaved={returnToCustomers}
        />
      </section>
    </section>
  );
}
