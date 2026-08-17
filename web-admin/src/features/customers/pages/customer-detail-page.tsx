import { Link } from "@tanstack/react-router";

import { CustomerOpenInvoices } from "../components/customer-open-invoices.tsx";
import { CustomerRecentInvoices } from "../components/customer-recent-invoices.tsx";
import { CustomerSummary } from "../components/customer-summary.tsx";
import { SalesReturnTable } from "../../returns/components/sales-return-table.tsx";
import { useSalesReturns } from "../../returns/hooks/use-returns.ts";
import { useCustomer } from "../hooks/use-customers.ts";

interface CustomerDetailPageProps {
  customerId: string;
}

/** Shows one customer profile, sales activity, open invoices, and recent returns. */
export function CustomerDetailPage({
  customerId,
}: CustomerDetailPageProps): React.JSX.Element {
  const customerQuery = useCustomer(customerId);
  const salesReturnsQuery = useSalesReturns({
    customerId,
    page: 1,
    pageSize: 5,
  });

  if (customerQuery.isPending) {
    return <p>Loading customer...</p>;
  }

  if (customerQuery.isError || !customerQuery.data) {
    return <p className="error-message">Could not load this customer.</p>;
  }

  const profile = customerQuery.data.data;
  const salesReturns = salesReturnsQuery.data?.data;
  const customerNames = new Map([
    [profile.customer.id, `${profile.customer.code} - ${profile.customer.name}`],
  ]);

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Customer Management</p>
          <h1>{profile.customer.name}</h1>
          <p>Customer details, balance summary, and sales activity.</p>
        </div>
        <div className="form-actions">
          {profile.customer.isWalkIn ? null : (
            <Link className="primary-link" params={{ customerId }} to="/customers/$customerId/edit">
              Edit customer
            </Link>
          )}
          <Link className="secondary-link" to="/customers">Back to customers</Link>
        </div>
      </div>

      <div className="customer-detail-grid">
        <CustomerSummary profile={profile} />
        <CustomerRecentInvoices
          available={profile.recentInvoicesAvailable}
          invoices={profile.recentInvoices}
        />
        <CustomerOpenInvoices customerId={customerId} />

        <section className="management-card">
          <div className="page-heading-row">
            <div>
              <h2>Recent sales returns</h2>
              <p>Confirmed returns linked to this customer.</p>
            </div>
          </div>

          {salesReturnsQuery.isPending ? <p>Loading sales returns...</p> : null}
          {salesReturnsQuery.isError ? (
            <p className="error-message">Could not load customer sales returns.</p>
          ) : null}
          {salesReturns ? (
            <SalesReturnTable
              salesReturns={salesReturns.items}
              customerNames={customerNames}
            />
          ) : null}
        </section>
      </div>
    </section>
  );
}
