interface CustomerOpenInvoicesProps {
  customerId: string;
}

/** Shows why open invoices are not available before the Sales module exists. */
export function CustomerOpenInvoices({
  customerId,
}: CustomerOpenInvoicesProps): React.JSX.Element {
  void customerId;

  return (
    <section className="management-card customer-open-invoices-card">
      <h2>Open invoices</h2>
      <p>Available after the Sales module is implemented.</p>
    </section>
  );
}
