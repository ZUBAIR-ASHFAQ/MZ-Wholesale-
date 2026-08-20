import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { useSupplier } from "../../suppliers/hooks/use-suppliers.ts";
import type { Purchase, PurchaseItem } from "../api/purchases.api.ts";
import { useCancelPurchase, usePurchase } from "../hooks/use-purchases.ts";

interface PurchaseDetailPageProps {
  purchaseId: string;
}

/** Returns a readable label for one Purchase status. */
function purchaseStatusLabel(status: Purchase["status"]): string {
  if (status === "CONFIRMED") return "Confirmed";
  if (status === "CANCELLED") return "Cancelled";
  return "Draft";
}

/** Returns the CSS class used by one Purchase status badge. */
function purchaseStatusClass(status: Purchase["status"]): string {
  return `status-badge ${status.toLowerCase()}`;
}

/** Returns the effective cost value stored for one immutable Purchase item. */
function itemLandedCost(item: PurchaseItem): string {
  return item.landedUnitCost || item.unitCost;
}

/** Opens the browser print dialog for the current Purchase detail. */
function printPurchase(): void {
  window.print();
}

/** Displays one Purchase with immutable item/payment snapshots and draft actions. */
export function PurchaseDetailPage({
  purchaseId,
}: PurchaseDetailPageProps): React.JSX.Element {
  const purchaseQuery = usePurchase(purchaseId);
  const cancelPurchase = useCancelPurchase();
  const [showCancel, setShowCancel] = useState(false);
  const [cancelNote, setCancelNote] = useState("");
  const detail = purchaseQuery.data?.data;
  const purchase = detail?.purchase;
  const supplierQuery = useSupplier(purchase?.supplierId ?? "");
  const supplier = supplierQuery.data?.data.supplier;
  const returnAvailabilityByItemId = new Map(
    (detail?.returnAvailability ?? []).map((availability) => [
      availability.originalPurchaseItemId,
      availability,
    ]),
  );

  /** Opens the optional draft-cancellation note form. */
  function openCancel(): void {
    setCancelNote("");
    setShowCancel(true);
  }

  /** Closes the draft-cancellation form without changing the Purchase. */
  function closeCancel(): void {
    if (cancelPurchase.isPending) return;
    setCancelNote("");
    setShowCancel(false);
  }

  /** Cancels the current draft while preserving it as historical data. */
  async function submitCancel(): Promise<void> {
    try {
      await cancelPurchase.mutateAsync({
        purchaseId,
        input: { note: cancelNote.trim() || null },
      });
      setShowCancel(false);
      setCancelNote("");
    } catch {
      // Mutation error state is shown below the cancellation form.
    }
  }

  if (purchaseQuery.isPending) {
    return <p>Loading purchase...</p>;
  }

  if (purchaseQuery.isError || !detail || !purchase) {
    return (
      <section>
        <p className="error-message">Could not load this purchase.</p>
        <Link className="primary-link" to="/purchases">
          Back to purchases
        </Link>
      </section>
    );
  }

  const isDraft = purchase.status === "DRAFT";
  const isConfirmed = purchase.status === "CONFIRMED";
  const hasReturnableQuantity = detail.returnAvailability.some(
    (availability) => Number(availability.remainingReturnableQuantity) > 0,
  );

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Purchase Management</p>
          <h1>{purchase.purchaseNumber ?? "Purchase draft"}</h1>
          <p>View the supplier bill, immutable item snapshots and financial effects.</p>
        </div>
        <div className="form-actions">
          {isDraft ? (
            <Link
              className="primary-link"
              params={{ purchaseId }}
              to="/purchases/$purchaseId/edit"
            >
              Edit draft
            </Link>
          ) : null}
          {isConfirmed && hasReturnableQuantity ? (
            <Link
              className="primary-link"
              search={{ originalPurchaseId: purchaseId }}
              to="/returns/purchases/new"
            >
              Create purchase return
            </Link>
          ) : null}
          <Button label="Print" onClick={printPurchase} />
          <Link className="secondary-link" to="/purchases">
            Back to purchases
          </Link>
        </div>
      </div>

      <section className="management-card">
        <dl className="detail-list">
          <div>
            <dt>Purchase number</dt>
            <dd>{purchase.purchaseNumber ?? "Not issued yet"}</dd>
          </div>
          <div>
            <dt>Supplier</dt>
            <dd>
              {supplier ? (
                <Link params={{ supplierId: supplier.id }} to="/suppliers/$supplierId">
                  {supplier.code} - {supplier.name}
                </Link>
              ) : (
                purchase.supplierId
              )}
            </dd>
          </div>
          <div><dt>Purchase date</dt><dd>{purchase.purchaseDate}</dd></div>
          <div>
            <dt>Status</dt>
            <dd>
              <span className={purchaseStatusClass(purchase.status)}>
                {purchaseStatusLabel(purchase.status)}
              </span>
            </dd>
          </div>
          <div><dt>Subtotal</dt><dd>PKR {purchase.subtotalAmount}</dd></div>
          <div><dt>Item discounts</dt><dd>PKR {purchase.itemDiscountTotal}</dd></div>
          <div><dt>Invoice discount</dt><dd>PKR {purchase.invoiceDiscountAmount}</dd></div>
          <div><dt>Extra cost</dt><dd>PKR {purchase.extraCostAmount}</dd></div>
          <div><dt>Total</dt><dd>PKR {purchase.totalAmount}</dd></div>
          <div>
            <dt>Initial paid</dt>
            <dd>{purchase.initialPaidAmount === null ? "—" : `PKR ${purchase.initialPaidAmount}`}</dd>
          </div>
          <div>
            <dt>Initial due</dt>
            <dd>{purchase.initialDueAmount === null ? "—" : `PKR ${purchase.initialDueAmount}`}</dd>
          </div>
          <div>
            <dt>Current outstanding</dt>
            <dd>{detail.currentOutstandingAmount === null ? "—" : `PKR ${detail.currentOutstandingAmount}`}</dd>
          </div>
          <div><dt>Notes</dt><dd>{purchase.notes || "—"}</dd></div>
          <div>
            <dt>Confirmed</dt>
            <dd>{purchase.confirmedAt ? new Date(purchase.confirmedAt).toLocaleString() : "—"}</dd>
          </div>
          <div>
            <dt>Cancelled</dt>
            <dd>{purchase.cancelledAt ? new Date(purchase.cancelledAt).toLocaleString() : "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="management-card">
        <h2>Purchase items</h2>
        <p>Confirmed item values are historical snapshots and are not recalculated from current product data.</p>
        <div className="table-scroll">
          <table className="ui-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Unit</th>
                <th>Quantity</th>
                {isConfirmed ? <th>Returned qty</th> : null}
                {isConfirmed ? <th>Remaining qty</th> : null}
                {isConfirmed ? <th>Stock on hand</th> : null}
                <th>Base quantity</th>
                <th>Rate</th>
                <th>Discount</th>
                <th>Line total</th>
                <th>Extra cost</th>
                <th>Landed unit cost</th>
                {isConfirmed ? <th>Inventory</th> : null}
              </tr>
            </thead>
            <tbody>
              {detail.items.map((item) => {
                const availability = returnAvailabilityByItemId.get(item.id);

                return (
                  <tr key={item.id}>
                  <td>{item.productSkuSnapshot} - {item.productNameSnapshot}</td>
                  <td>{item.unitNameSnapshot} ({item.conversionToBaseSnapshot} base)</td>
                  <td>{item.quantity}</td>
                  {isConfirmed ? <td>{availability?.returnedQuantity ?? "0.000"}</td> : null}
                  {isConfirmed ? <td>{availability?.remainingReturnableQuantity ?? item.quantity}</td> : null}
                  {isConfirmed ? <td>{availability?.currentStockQuantity ?? "0.000"}</td> : null}
                  <td>{item.baseQuantity}</td>
                  <td>PKR {item.unitCost}</td>
                  <td>PKR {item.itemDiscountAmount}</td>
                  <td>PKR {item.lineTotal}</td>
                  <td>PKR {item.allocatedExtraCost}</td>
                  <td>PKR {itemLandedCost(item)}</td>
                  {isConfirmed ? (
                    <td>
                      <Link
                        params={{ productId: item.productId }}
                        to="/inventory/products/$productId/movements"
                      >
                        View movements
                      </Link>
                    </td>
                  ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="management-card">
        <div className="page-heading-row">
          <div>
            <h2>Supplier payments</h2>
            <p>Confirmed allocations reduce the current outstanding amount.</p>
          </div>
          {isConfirmed ? (
            <Link
              className="secondary-link"
              params={{ supplierId: purchase.supplierId }}
              to="/ledgers/suppliers/$supplierId"
            >
              View supplier ledger
            </Link>
          ) : null}
        </div>

        {detail.payments.length > 0 ? (
          <div className="table-scroll">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Payment number</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Payment total</th>
                  <th>Allocated here</th>
                </tr>
              </thead>
              <tbody>
                {detail.payments.map((payment) => (
                  <tr key={payment.paymentId}>
                    <td>
                      <Link
                        params={{ paymentId: payment.paymentId }}
                        to="/payments/supplier-payments/$paymentId"
                      >
                        {payment.documentNumber}
                      </Link>
                    </td>
                    <td>{payment.paymentDate}</td>
                    <td>{payment.status === "REVERSED" ? "Reversed" : "Confirmed"}</td>
                    <td>PKR {payment.totalAmount}</td>
                    <td>PKR {payment.allocatedAmount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No supplier payments are allocated to this purchase.</p>
        )}
      </section>

      {isDraft ? (
        <section className="management-card">
          <h2>Cancel draft</h2>
          <p>Cancellation keeps the draft for history and creates no stock or financial effects.</p>

          {!showCancel ? (
            <Button label="Cancel purchase draft" onClick={openCancel} />
          ) : (
            <div className="receipt-reversal-form">
              <label className="ui-field">
                <span>Cancellation note (optional)</span>
                <textarea
                  disabled={cancelPurchase.isPending}
                  rows={3}
                  value={cancelNote}
                  onChange={(event) => setCancelNote(event.target.value)}
                />
              </label>

              {cancelPurchase.isError ? (
                <p className="error-message">The purchase draft could not be cancelled.</p>
              ) : null}

              <div className="form-actions">
                <Button
                  disabled={cancelPurchase.isPending}
                  label={cancelPurchase.isPending ? "Cancelling..." : "Confirm cancellation"}
                  onClick={() => void submitCancel()}
                />
                <Button
                  disabled={cancelPurchase.isPending}
                  label="Keep draft"
                  onClick={closeCancel}
                />
              </div>
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}
