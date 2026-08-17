import { Table } from "../../../components/ui/table.tsx";
import type { DashboardRecentPurchase } from "../api/dashboard.api.ts";

/** Converts recent confirmed purchases into shared table rows. */
function createRows(items: DashboardRecentPurchase[]): string[][] {
  const rows: string[][] = [];

  for (const item of items) {
    rows.push([
      item.purchaseNumber,
      item.purchaseDate,
      item.supplierName,
      `PKR ${item.totalAmount}`,
    ]);
  }

  return rows;
}

/** Shows the latest confirmed purchases for the selected Dashboard business date. */
export function DashboardRecentPurchases({
  items,
}: {
  items: DashboardRecentPurchase[];
}): React.JSX.Element {
  if (items.length === 0) {
    return <p>No confirmed purchases for this date.</p>;
  }

  return (
    <div className="table-scroll">
      <Table
        headings={["Purchase", "Date", "Supplier", "Amount"]}
        rows={createRows(items)}
      />
    </div>
  );
}
