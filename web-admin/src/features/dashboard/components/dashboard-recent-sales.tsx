import { Table } from "../../../components/ui/table.tsx";
import type { DashboardRecentSale } from "../api/dashboard.api.ts";

/** Converts recent confirmed sales into shared table rows. */
function createRows(items: DashboardRecentSale[]): string[][] {
  const rows: string[][] = [];

  for (const item of items) {
    rows.push([
      item.invoiceNumber,
      item.invoiceDate,
      item.customerName,
      `PKR ${item.totalAmount}`,
    ]);
  }

  return rows;
}

/** Shows the latest confirmed sales for the selected Dashboard business date. */
export function DashboardRecentSales({
  items,
}: {
  items: DashboardRecentSale[];
}): React.JSX.Element {
  if (items.length === 0) {
    return <p>No confirmed sales for this date.</p>;
  }

  return (
    <div className="table-scroll">
      <Table
        headings={["Invoice", "Date", "Customer", "Amount"]}
        rows={createRows(items)}
      />
    </div>
  );
}
