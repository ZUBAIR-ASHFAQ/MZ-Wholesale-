import { Link } from "@tanstack/react-router";

import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import { formatBusinessDate, formatMoney } from "../../../lib/utils.ts";
import type { CustomerReceipt } from "../api/payments.api.ts";

interface CustomerReceiptsTableProps {
  receipts: CustomerReceipt[];
}

/** Displays customer receipt headers returned by the Payments API. */
export function CustomerReceiptsTable({
  receipts,
}: CustomerReceiptsTableProps): React.JSX.Element {
  if (receipts.length === 0) {
    return <p>No customer receipts match the selected filters.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="ui-table">
        <thead>
          <tr>
            <th>Receipt no.</th>
            <th>Date</th>
            <th>Customer</th>
            <th>Total amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {receipts.map((receipt) => (
            <tr key={receipt.id}>
              <td>
                <Link
                  className="table-link"
                  params={{ receiptId: receipt.id }}
                  to="/payments/customer-receipts/$receiptId"
                >
                  {receipt.documentNumber}
                </Link>
              </td>
              <td>{formatBusinessDate(receipt.paymentDate)}</td>
              <td>{receipt.customerName ?? receipt.customerId}</td>
              <td>{formatMoney(receipt.totalAmount)}</td>
              <td><StatusBadge status={receipt.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
