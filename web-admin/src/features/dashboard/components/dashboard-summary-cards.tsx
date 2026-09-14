import { formatMoney } from "../../../lib/utils.ts";
import type { DashboardOverview } from "../api/dashboard.api.ts";

/** Shows the four primary owner KPIs returned by the Dashboard overview API. */
export function DashboardSummaryCards({
  overview,
}: {
  overview: DashboardOverview;
}): React.JSX.Element {
  return (
    <div className="dashboard-summary-grid" aria-label="Key performance indicators">
      <article className="summary-card dashboard-kpi-card">
        <span>Sales</span>
        <strong>{formatMoney(overview.sales.totalSalesAmount)}</strong>
        <small>{overview.sales.invoiceCount} confirmed invoices</small>
      </article>

      <article className="summary-card dashboard-kpi-card">
        <span>Estimated gross profit</span>
        <strong>{formatMoney(overview.estimatedGrossProfit.grossProfitAmount)}</strong>
        <small>Based on confirmed sale cost snapshots</small>
      </article>

      <article className="summary-card dashboard-kpi-card">
        <span>Cash &amp; bank</span>
        <strong>{formatMoney(overview.cashBank.totalBalance)}</strong>
        <small>
          Cash {formatMoney(overview.cashBank.cashBalance)} · Bank {" "}
          {formatMoney(overview.cashBank.bankBalance)}
        </small>
      </article>

      <article className="summary-card dashboard-kpi-card">
        <span>Customer due</span>
        <strong>
          {formatMoney(overview.customerOutstanding.totalOutstandingAmount)}
        </strong>
        <small>
          {overview.customerOutstanding.customerCount} customers with outstanding balance
        </small>
      </article>
    </div>
  );
}
