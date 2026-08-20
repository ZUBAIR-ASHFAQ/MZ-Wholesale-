import { Link } from "@tanstack/react-router";

import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import { formatMoney, formatQuantity } from "../../../lib/utils.ts";
import type { InventoryStockItem } from "../api/inventory.api.ts";

interface InventoryTableProps {
  items: InventoryStockItem[];
}

/** Formats optional table values without exposing null. */
function displayValue(value: string | null): string {
  return value ?? "—";
}

/** Returns the stock status shown to the administrator. */
function stockStatus(item: InventoryStockItem): string {
  if (Number(item.sellableQuantity) <= 0) {
    return "Out of stock";
  }

  return item.isLowStock ? "Low stock" : "In stock";
}

/** Displays current quantities and cost for every listed product. */
export function InventoryTable({ items }: InventoryTableProps): React.JSX.Element {
  if (items.length === 0) {
    return <p>No inventory rows match the selected filters.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="ui-table inventory-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Product</th>
            <th>Product status</th>
            <th>Category</th>
            <th>Brand</th>
            <th>Base unit</th>
            <th>Sellable</th>
            <th>Damaged</th>
            <th>Expired</th>
            <th>Sellable weighted cost</th>
            <th>Reorder level</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.productId}>
              <td>{item.sku}</td>
              <td>{item.productName}</td>
              <td><StatusBadge status={item.isActive ? "ACTIVE" : "INACTIVE"} /></td>
              <td>{item.categoryName}</td>
              <td>{displayValue(item.brandName)}</td>
              <td>{item.baseUnitName}</td>
              <td>{formatQuantity(item.sellableQuantity)}</td>
              <td>{formatQuantity(item.damagedQuantity)}</td>
              <td>{formatQuantity(item.expiredQuantity)}</td>
              <td>{formatMoney(item.weightedAverageCost)}</td>
              <td>{formatQuantity(item.reorderLevel)}</td>
              <td><span className={`stock-health ${item.isLowStock || Number(item.sellableQuantity) <= 0 ? "attention" : "ok"}`}>{stockStatus(item)}</span></td>
              <td>
                <Link
                  className="text-link"
                  params={{ productId: item.productId }}
                  to="/inventory/products/$productId/movements"
                >
                  Movements
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
