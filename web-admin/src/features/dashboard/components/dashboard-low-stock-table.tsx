import { Table } from "../../../components/ui/table.tsx";
import type { DashboardLowStockProduct } from "../api/dashboard.api.ts";

/** Converts low-stock products into the shared plain table row format. */
function createRows(items: DashboardLowStockProduct[]): string[][] {
  const rows: string[][] = [];

  for (const item of items) {
    rows.push([
      item.sku,
      item.productName,
      item.sellableQuantity,
      item.reorderLevel,
      item.isOutOfStock ? "Out of stock" : "Low stock",
    ]);
  }

  return rows;
}

/** Shows the Dashboard's low-stock and out-of-stock product alerts. */
export function DashboardLowStockTable({
  items,
}: {
  items: DashboardLowStockProduct[];
}): React.JSX.Element {
  if (items.length === 0) {
    return <p>No low-stock products.</p>;
  }

  return (
    <div className="table-scroll">
      <Table
        headings={["SKU", "Product", "Sellable stock", "Reorder level", "Status"]}
        rows={createRows(items)}
      />
    </div>
  );
}
