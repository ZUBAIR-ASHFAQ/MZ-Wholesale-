import { Link } from "@tanstack/react-router";

import { Button } from "../../../components/ui/button.tsx";
import { formatMoney } from "../../../lib/utils.ts";
import { useBusinessSettings } from "../../business-settings/hooks/use-business-settings.ts";
import { useSupplier } from "../../suppliers/hooks/use-suppliers.ts";
import { usePurchaseReturn } from "../hooks/use-returns.ts";

interface PurchaseReturnDetailPageProps {
  purchaseReturnId: string;
}

/** Opens the browser print dialog for the current Purchase Return. */
function printPurchaseReturn(): void {
  window.print();
}

/** Displays one confirmed Purchase Return with immutable item and supplier-balance snapshots. */
export function PurchaseReturnDetailPage({
  purchaseReturnId,
}: PurchaseReturnDetailPageProps): React.JSX.Element {
  const purchaseReturnQuery = usePurchaseReturn(purchaseReturnId);
  const detail = purchaseReturnQuery.data?.data;
  const purchaseReturn = detail?.purchaseReturn;
  const supplierQuery = useSupplier(purchaseReturn?.supplierId ?? "");
  const settingsQuery = useBusinessSettings();
  const supplier = supplierQuery.data?.data.supplier;
  const settings = settingsQuery.data?.data.settings;

  if (purchaseReturnQuery.isPending) {
    return <p>Loading purchase return...</p>;
  }

  if (purchaseReturnQuery.isError || !detail || !purchaseReturn) {
    return (
      <section>
        <p className="error-message">Could not load this purchase return.</p>
        <Link className="primary-link" to="/returns/purchases">
          Back to purchase returns
        </Link>
      </section>
    );
  }

  return (
    <section className="sale-invoice-page">
      <div className="page-heading-row no-print">
        <div>
          <p className="eyebrow">Purchase Returns</p>
          <h1>{purchaseReturn.returnNumber}</h1>
          <p>View the confirmed return, item snapshots, stock result, and supplier payable reduction.</p>
        </div>
        <div className="form-actions">
          <Button label="Print" onClick={printPurchaseReturn} />
          <Link className="secondary-link" to="/returns/purchases">
            Back to purchase returns
          </Link>
        </div>
      </div>

      <section className="management-card sale-print-header">
        <div>
          <p className="eyebrow">Purchase Return</p>
          <h2>{settings?.businessName ?? "Wholesale Distributor ERP"}</h2>
          <p>{settings?.address ?? "Business address not configured"}</p>
          <p>{settings?.phone ?? ""}</p>
        </div>
        <div className="sale-invoice-number">
          <strong>{purchaseReturn.returnNumber}</strong>
          <span>{purchaseReturn.returnDate}</span>
        </div>
      </section>

      <section className="management-card">
        <dl className="detail-list">
          <div>
            <dt>Supplier</dt>
            <dd>
              {supplier ? (
                <Link params={{ supplierId: supplier.id }} to="/suppliers/$supplierId">
                  {supplier.code} - {supplier.name}
                </Link>
              ) : (
                purchaseReturn.supplierId
              )}
            </dd>
          </div>
          <div><dt>Status</dt><dd><span className="status-badge confirmed">Confirmed</span></dd></div>
          <div>
            <dt>Original purchase</dt>
            <dd>
              <Link
                params={{ purchaseId: detail.originalPurchase.id }}
                to="/purchases/$purchaseId"
              >
                {detail.originalPurchase.purchaseNumber ?? detail.originalPurchase.id}
              </Link>
            </dd>
          </div>
          <div><dt>Return date</dt><dd>{purchaseReturn.returnDate}</dd></div>
          <div><dt>Total</dt><dd>PKR {purchaseReturn.totalAmount}</dd></div>
          <div><dt>Reason</dt><dd>{purchaseReturn.reason}</dd></div>
        </dl>
      </section>

      <section className="management-card">
        <h2>Returned items</h2>
        <p>Costs below are immutable snapshots from the original confirmed purchase.</p>
        <div className="table-scroll">
          <table className="ui-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Unit</th>
                <th>Quantity</th>
                <th>Base quantity</th>
                <th>Cost snapshot</th>
                <th>Line total</th>
              </tr>
            </thead>
            <tbody>
              {detail.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.productSkuSnapshot} - {item.productNameSnapshot}</td>
                  <td>{item.unitNameSnapshot} ({item.conversionToBaseSnapshot} base)</td>
                  <td>{item.quantity}</td>
                  <td>{item.baseQuantity}</td>
                  <td>{formatMoney(item.unitCostSnapshot)}</td>
                  <td>PKR {item.lineTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="management-card">
        <h2>Supplier balance result</h2>
        <dl className="detail-list">
          <div>
            <dt>Supplier payable reduction</dt>
            <dd>PKR {detail.supplierBalanceResult.reductionAmount}</dd>
          </div>
        </dl>
      </section>

      <section className="management-card">
        <h2>Stock result</h2>
        <p>Confirmed purchase returns remove the returned base quantity from inventory.</p>
        <div className="table-scroll">
          <table className="ui-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Base quantity</th>
                <th>Cost snapshot</th>
                <th>Inventory effect</th>
              </tr>
            </thead>
            <tbody>
              {detail.stockResult.map((result, index) => {
                const item = detail.items.find((candidate) => candidate.productId === result.productId);

                return (
                  <tr key={`${result.productId}-${index}`}>
                    <td>
                      {item
                        ? `${item.productSkuSnapshot} - ${item.productNameSnapshot}`
                        : "Product snapshot unavailable"}
                    </td>
                    <td>{result.baseQuantity}</td>
                    <td>{formatMoney(result.unitCostSnapshot)}</td>
                    <td>Stock out</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
