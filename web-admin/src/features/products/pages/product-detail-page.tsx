import { Link } from "@tanstack/react-router";

import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import { formatMoney, formatQuantity } from "../../../lib/utils.ts";
import { useProduct } from "../hooks/use-products.ts";

interface ProductDetailPageProps {
  productId: string;
}

/** Formats one stored timestamp in the ERP reporting timezone. */
function formatRecordTime(value: string): string {
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Karachi",
  }).format(new Date(value));
}

/** Shows one product and every unit allowed for purchase and sale. */
export function ProductDetailPage({
  productId,
}: ProductDetailPageProps): React.JSX.Element {
  const productQuery = useProduct(productId);

  if (productQuery.isPending) {
    return <p>Loading product...</p>;
  }

  if (productQuery.isError || !productQuery.data) {
    return <p className="error-message">Could not load this product.</p>;
  }

  const product = productQuery.data.data;

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Product Management</p>
          <h1>{product.name}</h1>
          <p>Product master data and allowed unit conversions.</p>
        </div>
        <div className="form-actions">
          <Link
            className="primary-link"
            params={{ productId: product.id }}
            to="/products/$productId/edit"
          >
            Edit product
          </Link>
          <Link className="secondary-link" to="/products">
            Back to products
          </Link>
        </div>
      </div>

      <div className="product-detail-grid">
        <section className="management-card">
          <h2>Product details</h2>
          <dl className="detail-list">
            <div><dt>Category</dt><dd>{product.categoryName}</dd></div>
            <div><dt>Brand</dt><dd>{product.brandName ?? "—"}</dd></div>
            <div><dt>Base unit</dt><dd>{product.baseUnitName}</dd></div>
            <div><dt>Reorder level</dt><dd>{formatQuantity(product.reorderLevel)}</dd></div>
            <div><dt>Reference purchase price</dt><dd>{product.referencePurchasePrice ? formatMoney(product.referencePurchasePrice) : "—"}</dd></div>
            <div><dt>Reference sale price</dt><dd>{product.referenceSalePrice ? formatMoney(product.referenceSalePrice) : "—"}</dd></div>
            <div><dt>Status</dt><dd><StatusBadge status={product.isActive ? "ACTIVE" : "INACTIVE"} /></dd></div>
          </dl>
        </section>

        <section className="management-card">
          <h2>Allowed units</h2>
          <div className="table-scroll">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Conversion to base</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {product.units.map((unit) => (
                  <tr key={unit.id}>
                    <td>{unit.unitName}</td>
                    <td>{formatQuantity(unit.conversionToBase)}</td>
                    <td>{unit.isBaseUnit ? "Base unit" : "Additional unit"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="management-card">
          <h2>Record information</h2>
          <dl className="detail-list">
            <div><dt>Created</dt><dd>{formatRecordTime(product.createdAt)}</dd></div>
            <div><dt>Last updated</dt><dd>{formatRecordTime(product.updatedAt)}</dd></div>
          </dl>
        </section>
      </div>
    </section>
  );
}
