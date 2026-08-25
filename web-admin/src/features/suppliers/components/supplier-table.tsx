import { Link } from "@tanstack/react-router";

import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import { formatMoney } from "../../../lib/utils.ts";
import type { SupplierListItem } from "../api/suppliers.api.ts";

interface SupplierTableProps {
  suppliers: SupplierListItem[];
}

/** Displays a nullable supplier value without exposing a technical null. */
function displayValue(value: string | null): string {
  return value ?? "—";
}

/** Displays suppliers with their contact details and available actions. */
export function SupplierTable({
  suppliers,
}: SupplierTableProps): React.JSX.Element {
  if (suppliers.length === 0) {
    return <p>No suppliers match the selected filters.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="ui-table supplier-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Phone</th>
            <th>Email</th>
            <th>Current payable</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((supplier) => (
            <tr key={supplier.id}>
              <td>{supplier.code}</td>
              <td>{supplier.name}</td>
              <td>{displayValue(supplier.phone)}</td>
              <td>{displayValue(supplier.email)}</td>
              <td>{formatMoney(supplier.currentPayable)}</td>
              <td><StatusBadge status={supplier.isActive ? "ACTIVE" : "INACTIVE"} /></td>
              <td>
                <div className="table-actions">
                  <Link
                    className="text-link"
                    params={{ supplierId: supplier.id }}
                    to="/suppliers/$supplierId"
                  >
                    View
                  </Link>
                  <Link
                    className="text-link"
                    params={{ supplierId: supplier.id }}
                    to="/suppliers/$supplierId/edit"
                  >
                    Edit
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
