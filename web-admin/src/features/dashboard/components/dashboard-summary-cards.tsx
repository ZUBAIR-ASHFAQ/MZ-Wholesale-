import type { DashboardOverview } from "../api/dashboard.api.ts";

/** Formats one decimal money string using the fixed PKR currency label. */
function money(value: string): string {
  return `PKR ${value}`;
}

/** Shows the main owner summary values returned by the Dashboard overview API. */
export function DashboardSummaryCards({
  overview,
}: {
  overview: DashboardOverview;
}): React.JSX.Element {
  return (
    <div className="dashboard-summary-grid">
      <article className="summary-card">
        <span>Sales</span>
        <strong>{money(overview.sales.totalSalesAmount)}</strong>
        <small>{overview.sales.invoiceCount} confirmed invoices</small>
      </article>

      <article className="summary-card">
        <span>Purchases</span>
        <strong>{money(overview.purchases.totalPurchaseAmount)}</strong>
        <small>{overview.purchases.purchaseCount} confirmed purchases</small>
      </article>

      <article className="summary-card">
        <span>Customer due</span>
        <strong>{money(overview.customerOutstanding.totalOutstandingAmount)}</strong>
        <small>{overview.customerOutstanding.customerCount} customers</small>
      </article>

      <article className="summary-card">
        <span>Supplier payable</span>
        <strong>{money(overview.supplierPayable.totalPayableAmount)}</strong>
        <small>{overview.supplierPayable.supplierCount} suppliers</small>
      </article>

      <article className="summary-card">
        <span>Cash balance</span>
        <strong>{money(overview.cashBank.cashBalance)}</strong>
        <small>Current cash movements balance</small>
      </article>

      <article className="summary-card">
        <span>Bank balance</span>
        <strong>{money(overview.cashBank.bankBalance)}</strong>
        <small>Current bank movements balance</small>
      </article>

      <article className="summary-card">
        <span>Expenses</span>
        <strong>{money(overview.expenses.netExpenseAmount)}</strong>
        <small>{overview.expenses.expenseCount} expenses before reversals</small>
      </article>

      <article className="summary-card">
        <span>Estimated gross profit</span>
        <strong>{money(overview.estimatedGrossProfit.grossProfitAmount)}</strong>
        <small>Based on sale cost snapshots</small>
      </article>
    </div>
  );
}
