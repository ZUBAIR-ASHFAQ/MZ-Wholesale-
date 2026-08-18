import { Link } from "@tanstack/react-router";

import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import { formatMoney, formatQuantity } from "../../../lib/utils.ts";
import type { ProductSummary } from "../api/products.api.ts";

interface ProductTableProps {
  products: ProductSummary[];
}

/** Formats optional values without showing technical null values. */
function displayValue(value: string | null): string {
  return value ?? "—";
}

/** Displays the product list with links to detail and edit pages. */
export function ProductTable({ products }: ProductTableProps): React.JSX.Element {
  if (products.length === 0) {
    return <p>No products match the selected filters.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="ui-table product-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Brand</th>
            <th>Base unit</th>
            <th>Reorder level</th>
            <th>Reference sale price</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td>{product.name}</td>
              <td>{product.categoryName}</td>
              <td>{displayValue(product.brandName)}</td>
              <td>{product.baseUnitName}</td>
              <td>{formatQuantity(product.reorderLevel)}</td>
              <td>{product.referenceSalePrice ? formatMoney(product.referenceSalePrice) : "—"}</td>
              <td><StatusBadge status={product.isActive ? "ACTIVE" : "INACTIVE"} /></td>
              <td>
                <div className="table-actions">
                  <Link
                    className="text-link"
                    params={{ productId: product.id }}
                    to="/products/$productId"
                  >
                    View
                  </Link>
                  <Link
                    className="text-link"
                    params={{ productId: product.id }}
                    to="/products/$productId/edit"
                  >
                    Edit
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
