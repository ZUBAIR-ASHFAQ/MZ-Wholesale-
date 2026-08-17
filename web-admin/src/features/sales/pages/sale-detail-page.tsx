import { Link } from "@tanstack/react-router";

import { Button } from "../../../components/ui/button.tsx";
import { useBusinessSettings } from "../../business-settings/hooks/use-business-settings.ts";
import { useCustomer } from "../../customers/hooks/use-customers.ts";
import type { Sale } from "../api/sales.api.ts";
import { useSale } from "../hooks/use-sales.ts";

interface SaleDetailPageProps {
  saleId: string;
}

/** Returns the readable label shown for one sale status. */
function saleStatusLabel(status: Sale["status"]): string {
  if (status === "HELD") return "Held";
  if (status === "CONFIRMED") return "Confirmed";
  if (status === "CANCELLED") return "Cancelled";
  return "Draft";
}

/** Returns the existing status-badge class for one sale status. */
function saleStatusClass(status: Sale["status"]): string {
  return `status-badge ${status.toLowerCase()}`;
}

/** Formats an optional timestamp for a readable invoice detail value. */
function formatSaleTimestamp(value: string): string {
  return new Date(value).toLocaleString("en-PK", { timeZone: "Asia/Karachi" });
}

/** Opens the browser print dialog for the current sales invoice. */
function printSale(): void {
  window.print();
}

/** Displays one sale invoice with item snapshots, payments, and print details. */
export function SaleDetailPage({
  saleId,
}: SaleDetailPageProps): React.JSX.Element {
  const saleQuery = useSale(saleId);
  const detail = saleQuery.data?.data;
  const sale = detail?.sale;
  const customerQuery = useCustomer(sale?.customerId ?? "");
  const settingsQuery = useBusinessSettings();
  const customer = customerQuery.data?.data.customer;
  const settings = settingsQuery.data?.data.settings;
  const isEditable = sale?.status === "DRAFT" || sale?.status === "HELD";
  const isConfirmed = sale?.status === "CONFIRMED";

  if (saleQuery.isPending) {
    return <p>Loading sale...</p>;
  }

  if (saleQuery.isError || !detail || !sale) {
    return (
      <section>
        <p className="error-message">Could not load this sale.</p>
        <Link className="primary-link" to="/sales">
          Back to sales
        </Link>
      </section>
    );
  }

  return (
    <section className="sale-invoice-page">
      <div className="page-heading-row no-print">
        <div>
          <p className="eyebrow">Counter Sales</p>
          <h1>{sale.invoiceNumber ?? "Sale draft"}</h1>
          <p>View the saved invoice, manual prices, payment summary, and customer due.</p>
        </div>
        <div className="form-actions">
          {isEditable ? (
            <Link
              className="primary-link"
              params={{ saleId }}
              to="/sales/$saleId/edit"
            >
              {sale.status === "HELD" ? "Resume sale" : "Edit draft"}
            </Link>
          ) : null}
          {isConfirmed ? (
            <Link
              className="primary-link"
              search={{ originalSaleId: saleId }}
              to="/returns/sales/new"
            >
              Create sales return
            </Link>
          ) : null}
          <Button label="Print" onClick={printSale} />
          <Link className="secondary-link" to="/sales">
            Back to sales
          </Link>
        </div>
      </div>

      <section className="management-card sale-print-header">
        <div>
          <p className="eyebrow">Sales Invoice</p>
          <h2>{settings?.businessName ?? "Wholesale Distributor ERP"}</h2>
          <p>{settings?.address ?? "Business address not configured"}</p>
          <p>{settings?.phone ?? ""}</p>
        </div>
        <div className="sale-invoice-number">
          <strong>{sale.invoiceNumber ?? "Not issued yet"}</strong>
          <span>{sale.invoiceDate}</span>
        </div>
      </section>

      <section className="management-card">
        <dl className="detail-list">
          <div>
            <dt>Customer</dt>
            <dd>
              {customer ? (
                <Link params={{ customerId: customer.id }} to="/customers/$customerId">
                  {customer.code} - {customer.name}
                </Link>
              ) : (
                sale.customerId
              )}
            </dd>
          </div>
          <div><dt>Status</dt><dd><span className={saleStatusClass(sale.status)}>{saleStatusLabel(sale.status)}</span></dd></div>
          <div><dt>Subtotal</dt><dd>PKR {sale.subtotalAmount}</dd></div>
          <div><dt>Item discounts</dt><dd>PKR {sale.itemDiscountTotal}</dd></div>
          <div><dt>Invoice discount</dt><dd>PKR {sale.invoiceDiscountAmount}</dd></div>
          <div><dt>Total</dt><dd>PKR {sale.totalAmount}</dd></div>
          <div><dt>Initial paid</dt><dd>{sale.initialPaidAmount === null ? "—" : `PKR ${sale.initialPaidAmount}`}</dd></div>
          <div><dt>Initial due</dt><dd>{sale.initialDueAmount === null ? "—" : `PKR ${sale.initialDueAmount}`}</dd></div>
          <div><dt>Current outstanding</dt><dd>{detail.currentOutstandingAmount === null ? "—" : `PKR ${detail.currentOutstandingAmount}`}</dd></div>
          {sale.confirmedAt ? (
            <div><dt>Confirmed at</dt><dd>{formatSaleTimestamp(sale.confirmedAt)}</dd></div>
          ) : null}
          {sale.cancelledAt ? (
            <div><dt>Cancelled at</dt><dd>{formatSaleTimestamp(sale.cancelledAt)}</dd></div>
          ) : null}
          <div><dt>Notes</dt><dd>{sale.notes || "—"}</dd></div>
          {isConfirmed ? (
            <div className="no-print">
              <dt>Corrections</dt>
              <dd>Confirmed invoices stay unchanged. Use a Sales Return for returned goods.</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="management-card">
        <h2>Invoice items</h2>
        <p>Confirmed item prices and costs are historical snapshots and are not recalculated.</p>
        <div className="table-scroll">
          <table className="ui-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Unit</th>
                <th>Quantity</th>
                <th>Base quantity</th>
                <th>Manual price</th>
                <th>Discount</th>
                <th>Line total</th>
                {isConfirmed ? <th>Cost snapshot</th> : null}
              </tr>
            </thead>
            <tbody>
              {detail.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.productSkuSnapshot} - {item.productNameSnapshot}</td>
                  <td>{item.unitNameSnapshot} ({item.conversionToBaseSnapshot} base)</td>
                  <td>{item.quantity}</td>
                  <td>{item.baseQuantity}</td>
                  <td>PKR {item.manualUnitPrice}</td>
                  <td>PKR {item.itemDiscountAmount}</td>
                  <td>PKR {item.lineTotal}</td>
                  {isConfirmed ? <td>PKR {item.unitCostSnapshot ?? "0.00"}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="management-card">
        <div className="page-heading-row">
          <div>
            <h2>Customer receipts</h2>
            <p>Confirmed allocations reduce the current invoice outstanding amount.</p>
          </div>
          {isConfirmed ? (
            <Link
              className="secondary-link no-print"
              params={{ customerId: sale.customerId }}
              to="/ledgers/customers/$customerId"
            >
              View customer ledger
            </Link>
          ) : null}
        </div>

        {detail.payments.length > 0 ? (
          <div className="table-scroll">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Receipt number</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Receipt total</th>
                  <th>Allocated here</th>
                </tr>
              </thead>
              <tbody>
                {detail.payments.map((payment) => (
                  <tr key={payment.paymentId}>
                    <td>
                      <Link
                        className="table-link no-print-link"
                        params={{ receiptId: payment.paymentId }}
                        to="/payments/customer-receipts/$receiptId"
                      >
                        {payment.documentNumber}
                      </Link>
                    </td>
                    <td>{new Date(payment.paymentDate).toLocaleDateString()}</td>
                    <td>{payment.reversalOfPaymentId ? "Reversal" : payment.status === "REVERSED" ? "Reversed" : "Confirmed"}</td>
                    <td>PKR {payment.totalAmount}</td>
                    <td>PKR {payment.allocatedAmount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No customer receipts are allocated to this sale.</p>
        )}
      </section>
    </section>
  );
}
