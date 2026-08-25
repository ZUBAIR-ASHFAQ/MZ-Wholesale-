import { Link } from "@tanstack/react-router";

import { formatMoney } from "../../../lib/utils.ts";
import type {
  CustomerOutstandingItem,
  SupplierPayableItem,
} from "../api/ledgers.api.ts";

interface CustomerOutstandingTableProps {
  items: CustomerOutstandingItem[];
}

interface SupplierPayablesTableProps {
  items: SupplierPayableItem[];
}

/** Returns a readable phone value when the party has no saved number. */
function displayPhone(phone: string | null): string {
  return phone ?? "—";
}

/** Displays customers whose calculated ledger balance is greater than zero. */
export function CustomerOutstandingTable({
  items,
}: CustomerOutstandingTableProps): React.JSX.Element {
  if (items.length === 0) {
    return <p>No customers have an outstanding balance.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="ui-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Customer</th>
            <th>Phone</th>
            <th>Outstanding</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.customerId}>
              <td>{item.customerCode}</td>
              <td>{item.customerName}</td>
              <td>{displayPhone(item.phone)}</td>
              <td>{formatMoney(item.outstandingAmount)}</td>
              <td>
                <Link
                  className="text-link"
                  params={{ customerId: item.customerId }}
                  to="/ledgers/customers/$customerId"
                >
                  Open statement
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Displays suppliers whose calculated payable balance is greater than zero. */
export function SupplierPayablesTable({
  items,
}: SupplierPayablesTableProps): React.JSX.Element {
  if (items.length === 0) {
    return <p>No suppliers currently have a payable balance.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="ui-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Supplier</th>
            <th>Phone</th>
            <th>Payable</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.supplierId}>
              <td>{item.supplierCode}</td>
              <td>{item.supplierName}</td>
              <td>{displayPhone(item.phone)}</td>
              <td>{formatMoney(item.payableAmount)}</td>
              <td>
                <Link
                  className="text-link"
                  params={{ supplierId: item.supplierId }}
                  to="/ledgers/suppliers/$supplierId"
                >
                  Open statement
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
