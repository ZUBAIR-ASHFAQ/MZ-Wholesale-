import type { CustomerInvoiceSummary } from "../api/customers.api.ts";

interface CustomerRecentInvoicesProps {
  available: boolean;
  invoices: CustomerInvoiceSummary[];
}

/** Shows recent sales invoices returned by the customer profile API. */
export function CustomerRecentInvoices({
  available,
  invoices,
}: CustomerRecentInvoicesProps): React.JSX.Element {
  return (
    <section className="management-card">
      <h2>Recent sales invoices</h2>
      {!available ? (
        <p>Available after Sales module.</p>
      ) : invoices.length === 0 ? (
        <p>No recent sales invoices are available.</p>
      ) : (
        <div className="table-scroll">
          <table className="ui-table">
            <thead><tr><th>Invoice</th><th>Date</th><th>Due</th></tr></thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.invoiceNumber}</td>
                  <td>{invoice.invoiceDate}</td>
                  <td>{invoice.dueAmount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
