import { Link } from "@tanstack/react-router";

import type { PurchaseReturn } from "../api/returns.api.ts";

interface PurchaseReturnTableProps {
  purchaseReturns: PurchaseReturn[];
  supplierNames: ReadonlyMap<string, string>;
}

/** Displays the paginated confirmed Purchase Returns returned by the Returns API. */
export function PurchaseReturnTable({
  purchaseReturns,
  supplierNames,
}: PurchaseReturnTableProps): React.JSX.Element {
  if (purchaseReturns.length === 0) {
    return <p>No purchase returns match the selected filters.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="ui-table">
        <thead>
          <tr>
            <th>Return no.</th>
            <th>Date</th>
            <th>Supplier</th>
            <th>Total</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {purchaseReturns.map((purchaseReturn) => (
            <tr key={purchaseReturn.id}>
              <td>
                <Link
                  params={{ purchaseReturnId: purchaseReturn.id }}
                  to="/returns/purchases/$purchaseReturnId"
                >
                  {purchaseReturn.returnNumber}
                </Link>
              </td>
              <td>{purchaseReturn.returnDate}</td>
              <td>
                {supplierNames.get(purchaseReturn.supplierId) ??
                  purchaseReturn.supplierId}
              </td>
              <td>PKR {purchaseReturn.totalAmount}</td>
              <td>{purchaseReturn.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
