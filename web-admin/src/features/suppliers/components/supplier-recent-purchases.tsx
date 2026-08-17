import { Link } from "@tanstack/react-router";

import type { SupplierPurchaseSummary } from "../api/suppliers.api.ts";

interface SupplierRecentPurchasesProps {
  available: boolean;
  purchases: SupplierPurchaseSummary[];
}

/** Shows the supplier's latest confirmed purchases returned by the profile API. */
export function SupplierRecentPurchases({
  available,
  purchases,
}: SupplierRecentPurchasesProps): React.JSX.Element {
  return (
    <section className="management-card">
      <h2>Recent purchases</h2>

      {!available ? (
        <p className="status-note">Recent purchase history is temporarily unavailable.</p>
      ) : purchases.length === 0 ? (
        <p>No recent purchases found.</p>
      ) : (
        <div className="table-scroll">
          <table className="ui-table">
            <thead>
              <tr>
                <th>Purchase</th>
                <th>Date</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((purchase) => (
                <tr key={purchase.id}>
                  <td>
                    <Link
                      className="table-link"
                      params={{ purchaseId: purchase.id }}
                      to="/purchases/$purchaseId"
                    >
                      {purchase.purchaseNumber}
                    </Link>
                  </td>
                  <td>{purchase.purchaseDate}</td>
                  <td>{purchase.dueAmount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
