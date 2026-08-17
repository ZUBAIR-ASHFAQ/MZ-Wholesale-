import type { StockCountItem } from "../api/inventory.api.ts";

interface StockCountItemsTableProps {
  items: StockCountItem[];
}

/** Formats a signed stock-count difference for display. */
function differenceLabel(value: string): string {
  const number = Number(value);
  return number > 0 ? `+${value}` : value;
}

/** Renders the immutable quantity snapshots saved for a stock count. */
export function StockCountItemsTable({
  items,
}: StockCountItemsTableProps): React.JSX.Element {
  if (items.length === 0) {
    return <p>No stock-count items were saved.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="ui-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Condition</th>
            <th>System quantity</th>
            <th>Counted quantity</th>
            <th>Difference</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                {item.productSku} — {item.productName} ({item.baseUnitName})
              </td>
              <td>{item.stockCondition}</td>
              <td>{item.systemQuantity}</td>
              <td>{item.countedQuantity}</td>
              <td>{differenceLabel(item.differenceQuantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
