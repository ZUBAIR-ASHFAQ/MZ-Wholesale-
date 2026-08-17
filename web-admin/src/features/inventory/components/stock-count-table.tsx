import { Link } from "@tanstack/react-router";

import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import type { StockCount } from "../api/inventory.api.ts";

interface StockCountTableProps {
  items: StockCount[];
}

/** Formats one date-only value for the stock-count table. */
function formatCountDate(value: string): string {
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
  );
}

/** Renders the saved stock-count headers and their allowed actions. */
export function StockCountTable({
  items,
}: StockCountTableProps): React.JSX.Element {
  if (items.length === 0) {
    return <p>No stock counts match the selected filters.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="ui-table">
        <thead>
          <tr>
            <th>Count number</th>
            <th>Count date</th>
            <th>Status</th>
            <th>Notes</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.countNumber}</td>
              <td>{formatCountDate(item.countDate)}</td>
              <td><StatusBadge status={item.status} /></td>
              <td>{item.notes || "—"}</td>
              <td>
                <div className="table-actions">
                  <Link
                    className="secondary-link"
                    params={{ countId: item.id }}
                    to="/inventory/counts/$countId"
                  >
                    View
                  </Link>
                  {item.status === "DRAFT" ? (
                    <Link
                      className="secondary-link"
                      params={{ countId: item.id }}
                      to="/inventory/counts/$countId/edit"
                    >
                      Edit
                    </Link>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
