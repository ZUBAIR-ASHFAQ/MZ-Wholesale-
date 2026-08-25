import { Link } from "@tanstack/react-router";

import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import { formatBusinessDate, formatMoney } from "../../../lib/utils.ts";
import type { Sale } from "../api/sales.api.ts";

interface SaleTableProps {
  sales: Sale[];
  customerNames: ReadonlyMap<string, string>;
}

/** Displays the paginated Counter Sales headers returned by the Sales API. */
export function SaleTable({
  sales,
  customerNames,
}: SaleTableProps): React.JSX.Element {
  if (sales.length === 0) {
    return <p>No sales match the selected filters.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="ui-table">
        <thead>
          <tr>
            <th>Invoice no.</th>
            <th>Date</th>
            <th>Customer</th>
            <th>Status</th>
            <th>Total</th>
            <th>Paid</th>
            <th>Due</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((sale) => (
            <tr key={sale.id}>
              <td>
                <Link
                  className="table-link"
                  params={{ saleId: sale.id }}
                  to="/sales/$saleId"
                >
                  {sale.invoiceNumber ?? (sale.status === "HELD" ? "Held" : "Draft")}
                </Link>
              </td>
              <td>{formatBusinessDate(sale.invoiceDate)}</td>
              <td>{customerNames.get(sale.customerId) ?? sale.customerId}</td>
              <td><StatusBadge status={sale.status} /></td>
              <td>{formatMoney(sale.totalAmount)}</td>
              <td>
                {formatMoney(sale.initialPaidAmount)}
              </td>
              <td>
                {formatMoney(sale.initialDueAmount)}
              </td>
              <td>
                {sale.status === "DRAFT" || sale.status === "HELD" ? (
                  <Link
                    className="table-link"
                    params={{ saleId: sale.id }}
                    to="/sales/$saleId/edit"
                  >
                    {sale.status === "HELD" ? "Resume" : "Edit"}
                  </Link>
                ) : (
                  <Link
                    className="table-link"
                    params={{ saleId: sale.id }}
                    to="/sales/$saleId"
                  >
                    View
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
