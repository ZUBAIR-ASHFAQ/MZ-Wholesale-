import { Link } from "@tanstack/react-router";

import type { SalesReturn } from "../api/returns.api.ts";

interface SalesReturnTableProps {
  salesReturns: SalesReturn[];
  customerNames: ReadonlyMap<string, string>;
}

/** Returns the readable label shown for one Sales Return refund mode. */
function refundModeLabel(refundMode: SalesReturn["refundMode"]): string {
  if (refundMode === "CASH") {
    return "Cash refund";
  }

  if (refundMode === "BANK_TRANSFER") {
    return "Bank refund";
  }

  return "Reduce due";
}

/** Displays the paginated confirmed Sales Returns returned by the Returns API. */
export function SalesReturnTable({
  salesReturns,
  customerNames,
}: SalesReturnTableProps): React.JSX.Element {
  if (salesReturns.length === 0) {
    return <p>No sales returns match the selected filters.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="ui-table">
        <thead>
          <tr>
            <th>Return no.</th>
            <th>Date</th>
            <th>Customer</th>
            <th>Refund mode</th>
            <th>Total</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {salesReturns.map((salesReturn) => (
            <tr key={salesReturn.id}>
              <td>
                <Link
                  className="table-link"
                  params={{ salesReturnId: salesReturn.id }}
                  to="/returns/sales/$salesReturnId"
                >
                  {salesReturn.returnNumber}
                </Link>
              </td>
              <td>{salesReturn.returnDate}</td>
              <td>
                {customerNames.get(salesReturn.customerId) ?? salesReturn.customerId}
              </td>
              <td>{refundModeLabel(salesReturn.refundMode)}</td>
              <td>PKR {salesReturn.totalAmount}</td>
              <td>{salesReturn.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
