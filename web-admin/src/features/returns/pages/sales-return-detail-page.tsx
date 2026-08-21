import { Link } from "@tanstack/react-router";

import { Button } from "../../../components/ui/button.tsx";
import { formatMoney } from "../../../lib/utils.ts";
import { useBusinessSettings } from "../../business-settings/hooks/use-business-settings.ts";
import { useCustomer } from "../../customers/hooks/use-customers.ts";
import { usePaymentAccounts } from "../../payments/hooks/use-payments.ts";
import type { SalesReturn } from "../api/returns.api.ts";
import { useSalesReturn } from "../hooks/use-returns.ts";

interface SalesReturnDetailPageProps {
  salesReturnId: string;
}

/** Returns the readable label shown for one Sales Return refund mode. */
function refundModeLabel(refundMode: SalesReturn["refundMode"]): string {
  if (refundMode === "CASH") return "Cash refund";
  if (refundMode === "BANK_TRANSFER") return "Bank refund";
  return "Reduce due";
}

/** Opens the browser print dialog for the current Sales Return. */
function printSalesReturn(): void {
  window.print();
}

/** Displays one confirmed Sales Return with immutable item and settlement snapshots. */
export function SalesReturnDetailPage({
  salesReturnId,
}: SalesReturnDetailPageProps): React.JSX.Element {
  const salesReturnQuery = useSalesReturn(salesReturnId);
  const detail = salesReturnQuery.data?.data;
  const salesReturn = detail?.salesReturn;
  const customerQuery = useCustomer(salesReturn?.customerId ?? "");
  const settingsQuery = useBusinessSettings();
  const accountsQuery = usePaymentAccounts();
  const customer = customerQuery.data?.data.customer;
  const settings = settingsQuery.data?.data.settings;
  const accounts = accountsQuery.data?.data;
  const cashAccount = accounts?.cashAccounts.find(
    (account) => account.id === salesReturn?.cashAccountId,
  );
  const bankAccount = accounts?.bankAccounts.find(
    (account) => account.id === salesReturn?.bankAccountId,
  );

  if (salesReturnQuery.isPending) {
    return <p>Loading sales return...</p>;
  }

  if (salesReturnQuery.isError || !detail || !salesReturn) {
    return (
      <section>
        <p className="error-message">Could not load this sales return.</p>
        <Link className="primary-link" to="/returns/sales">
          Back to sales returns
        </Link>
      </section>
    );
  }

  return (
    <section className="sale-invoice-page">
      <div className="page-heading-row no-print">
        <div>
          <p className="eyebrow">Sales Returns</p>
          <h1>{salesReturn.returnNumber}</h1>
          <p>View the confirmed return, item snapshots, stock result, and refund method.</p>
        </div>
        <div className="form-actions">
          <Button label="Print" onClick={printSalesReturn} />
          <Link className="secondary-link" to="/returns/sales">
            Back to sales returns
          </Link>
        </div>
      </div>

      <section className="management-card sale-print-header">
        <div>
          <p className="eyebrow">Sales Return</p>
          <h2>{settings?.businessName ?? "Wholesale Distributor ERP"}</h2>
          <p>{settings?.address ?? "Business address not configured"}</p>
          <p>{settings?.phone ?? ""}</p>
        </div>
        <div className="sale-invoice-number">
          <strong>{salesReturn.returnNumber}</strong>
          <span>{salesReturn.returnDate}</span>
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
                salesReturn.customerId
              )}
            </dd>
          </div>
          <div><dt>Status</dt><dd><span className="status-badge confirmed">Confirmed</span></dd></div>
          <div><dt>Original sale</dt><dd><Link params={{ saleId: detail.originalSale.id }} to="/sales/$saleId">{detail.originalSale.invoiceNumber ?? detail.originalSale.id}</Link></dd></div>
          <div><dt>Refund mode</dt><dd>{refundModeLabel(salesReturn.refundMode)}</dd></div>
          <div><dt>Total</dt><dd>PKR {salesReturn.totalAmount}</dd></div>
          <div>
            <dt>Cash account</dt>
            <dd>{cashAccount?.name ?? (salesReturn.cashAccountId ? "Account unavailable" : "—")}</dd>
          </div>
          <div>
            <dt>Bank account</dt>
            <dd>
              {bankAccount
                ? `${bankAccount.bankName} - ${bankAccount.accountName} (${bankAccount.accountNumber})`
                : salesReturn.bankAccountId
                  ? "Account unavailable"
                  : "—"}
            </dd>
          </div>
          <div><dt>Reason</dt><dd>{salesReturn.reason}</dd></div>
        </dl>
      </section>

      <section className="management-card">
        <h2>Returned items</h2>
        <p>Prices and costs below are immutable snapshots from the original confirmed sale.</p>
        <div className="table-scroll">
          <table className="ui-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Unit</th>
                <th>Quantity</th>
                <th>Base quantity</th>
                <th>Stock condition</th>
                <th>Sale price</th>
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
                  <td>{item.stockCondition}</td>
                  <td>PKR {item.unitPriceSnapshot}</td>
                  <td>{formatMoney(item.unitCostSnapshot)}</td>
                  <td>PKR {item.lineTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="management-card">
        <h2>Settlement result</h2>
        <dl className="detail-list">
          <div><dt>Settlement</dt><dd>{refundModeLabel(detail.settlementResult.refundMode)}</dd></div>
          <div><dt>Settlement amount</dt><dd>PKR {detail.settlementResult.totalAmount}</dd></div>
        </dl>
      </section>

      <section className="management-card">
        <h2>Stock result</h2>
        <p>Each returned line is posted back to the stock condition selected when the return was confirmed.</p>
        <div className="table-scroll">
          <table className="ui-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Condition</th>
                <th>Base quantity</th>
                <th>Inventory effect</th>
              </tr>
            </thead>
            <tbody>
              {detail.stockResult.map((result, index) => {
                const item = detail.items.find((candidate) => candidate.productId === result.productId);

                return (
                  <tr key={`${result.productId}-${result.stockCondition}-${index}`}>
                    <td>
                      {item
                        ? `${item.productSkuSnapshot} - ${item.productNameSnapshot}`
                        : "Product snapshot unavailable"}
                    </td>
                    <td>{result.stockCondition}</td>
                    <td>{result.baseQuantity}</td>
                    <td>Stock in</td>
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
