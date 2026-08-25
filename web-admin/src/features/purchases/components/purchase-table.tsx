import { Link } from "@tanstack/react-router";

import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import { formatBusinessDate, formatMoney } from "../../../lib/utils.ts";
import type { Purchase } from "../api/purchases.api.ts";

interface PurchaseTableProps {
  purchases: Purchase[];
  supplierNames: ReadonlyMap<string, string>;
}

/** Displays the paginated Purchase headers returned by the Purchase API. */
export function PurchaseTable({
  purchases,
  supplierNames,
}: PurchaseTableProps): React.JSX.Element {
  if (purchases.length === 0) {
    return <p>No purchases match the selected filters.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="ui-table">
        <thead>
          <tr>
            <th>Purchase no.</th>
            <th>Date</th>
            <th>Supplier</th>
            <th>Status</th>
            <th>Total</th>
            <th>Initial paid</th>
            <th>Initial due</th>
          </tr>
        </thead>
        <tbody>
          {purchases.map((purchase) => (
            <tr key={purchase.id}>
              <td>
                <Link
                  params={{ purchaseId: purchase.id }}
                  to="/purchases/$purchaseId"
                >
                  {purchase.purchaseNumber ?? "Draft"}
                </Link>
              </td>
              <td>{formatBusinessDate(purchase.purchaseDate)}</td>
              <td>{supplierNames.get(purchase.supplierId) ?? purchase.supplierId}</td>
              <td><StatusBadge status={purchase.status} /></td>
              <td>{formatMoney(purchase.totalAmount)}</td>
              <td>
                {formatMoney(purchase.initialPaidAmount)}
              </td>
              <td>
                {formatMoney(purchase.initialDueAmount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
