import { Link } from "@tanstack/react-router";

import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import { formatMoney } from "../../../lib/utils.ts";
import type { CustomerListItem } from "../api/customers.api.ts";

interface CustomerTableProps {
  customers: CustomerListItem[];
}

/** Displays a nullable customer value without exposing a technical null. */
function displayValue(value: string | null): string {
  return value ?? "—";
}

/** Displays customers with protected Walk-in and active-status labels. */
export function CustomerTable({
  customers,
}: CustomerTableProps): React.JSX.Element {
  if (customers.length === 0) {
    return <p>No customers match the selected filters.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="ui-table customer-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Phone</th>
            <th>Email</th>
            <th>Credit limit</th>
            <th>Current due</th>
            <th>Type</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <tr key={customer.id}>
              <td>{customer.code}</td>
              <td>{customer.name}</td>
              <td>{displayValue(customer.phone)}</td>
              <td>{displayValue(customer.email)}</td>
              <td>{formatMoney(customer.creditLimit)}</td>
              <td>{formatMoney(customer.currentDue)}</td>
              <td>{customer.isWalkIn ? "Walk-in" : "Regular"}</td>
              <td><StatusBadge status={customer.isActive ? "ACTIVE" : "INACTIVE"} /></td>
              <td>
                <div className="table-actions">
                  <Link
                    className="text-link"
                    params={{ customerId: customer.id }}
                    to="/customers/$customerId"
                  >
                    View
                  </Link>
                  {customer.isWalkIn ? null : (
                    <Link
                      className="text-link"
                      params={{ customerId: customer.id }}
                      to="/customers/$customerId/edit"
                    >
                      Edit
                    </Link>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
