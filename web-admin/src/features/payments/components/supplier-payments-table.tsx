import { Link } from "@tanstack/react-router";

import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import { formatBusinessDate, formatMoney } from "../../../lib/utils.ts";
import type { SupplierPayment } from "../api/payments.api.ts";

interface SupplierPaymentsTableProps {
  payments: SupplierPayment[];
}

/** Displays supplier payment headers returned by the Payments API. */
export function SupplierPaymentsTable({
  payments,
}: SupplierPaymentsTableProps): React.JSX.Element {
  if (payments.length === 0) {
    return <p>No supplier payments match the selected filters.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="ui-table">
        <thead>
          <tr>
            <th>Payment no.</th>
            <th>Date</th>
            <th>Supplier</th>
            <th>Total amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (
            <tr key={payment.id}>
              <td>
                <Link
                  className="table-link"
                  params={{ paymentId: payment.id }}
                  to="/payments/supplier-payments/$paymentId"
                >
                  {payment.documentNumber}
                </Link>
              </td>
              <td>{formatBusinessDate(payment.paymentDate)}</td>
              <td>{payment.supplierName ?? payment.supplierId}</td>
              <td>{formatMoney(payment.totalAmount)}</td>
              <td><StatusBadge status={payment.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
