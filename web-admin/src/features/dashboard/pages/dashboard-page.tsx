import { useState } from "react";

import { formatMoney } from "../../../lib/utils.ts";
import { DashboardLowStockTable } from "../components/dashboard-low-stock-table.tsx";
import { DashboardRecentPurchases } from "../components/dashboard-recent-purchases.tsx";
import { DashboardRecentSales } from "../components/dashboard-recent-sales.tsx";
import { DashboardSalesChart } from "../components/dashboard-sales-chart.tsx";
import { DashboardSummaryCards } from "../components/dashboard-summary-cards.tsx";
import { useDashboardOverview } from "../hooks/use-dashboard.ts";

/** Shows the owner-focused read-only Dashboard for one optional business date. */
export function DashboardPage(): React.JSX.Element {
  const [selectedDate, setSelectedDate] = useState("");
  const overviewQuery = useDashboardOverview({
    date: selectedDate || undefined,
  });
  const overview = overviewQuery.data;

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>Business overview</h1>
          <p>
            Track today&apos;s performance, recent activity, and operational
            alerts in one place.
          </p>
        </div>

        <label className="ui-field dashboard-date-filter" htmlFor="dashboard-date">
          <span>Business date</span>
          <input
            id="dashboard-date"
            onChange={(event) => setSelectedDate(event.target.value)}
            type="date"
            value={selectedDate}
          />
        </label>
      </div>

      {overviewQuery.isPending ? (
        <section className="management-card dashboard-state-card">
          <p>Loading dashboard...</p>
        </section>
      ) : null}

      {overviewQuery.isError ? (
        <section className="management-card dashboard-state-card">
          <p className="error-message">Could not load the dashboard.</p>
        </section>
      ) : null}

      {overview ? (
        <>
          <section className="dashboard-section dashboard-kpi-section">
            <div className="dashboard-section-heading">
              <div>
                <h2>Key performance</h2>
                <p>Business date: {overview.businessDate}</p>
              </div>
            </div>
            <DashboardSummaryCards overview={overview} />
          </section>

          <div className="dashboard-insights-grid">
            <DashboardSalesChart points={overview.salesTrend} />

            <section className="management-card dashboard-operations-card">
              <div className="dashboard-section-heading">
                <div>
                  <h2>Operations snapshot</h2>
                  <p>Important values that need owner attention.</p>
                </div>
              </div>

              <dl className="dashboard-operations-list">
                <div>
                  <dt>Purchases</dt>
                  <dd>{formatMoney(overview.purchases.totalPurchaseAmount)}</dd>
                  <small>{overview.purchases.purchaseCount} confirmed</small>
                </div>
                <div>
                  <dt>Expenses</dt>
                  <dd>{formatMoney(overview.expenses.netExpenseAmount)}</dd>
                  <small>{overview.expenses.expenseCount} expense records</small>
                </div>
                <div>
                  <dt>Supplier payable</dt>
                  <dd>
                    {formatMoney(overview.supplierPayable.totalPayableAmount)}
                  </dd>
                  <small>{overview.supplierPayable.supplierCount} suppliers</small>
                </div>
                <div>
                  <dt>Stock alerts</dt>
                  <dd>{overview.inventory.lowStockCount}</dd>
                  <small>{overview.inventory.outOfStockCount} out of stock</small>
                </div>
                <div>
                  <dt>Team present</dt>
                  <dd>{overview.employees.presentCount}</dd>
                  <small>
                    {overview.employees.activeEmployeeCount} active employees
                  </small>
                </div>
                <div>
                  <dt>Salary payable</dt>
                  <dd>{formatMoney(overview.employees.salaryPayableAmount)}</dd>
                  <small>Current confirmed salary due</small>
                </div>
              </dl>
            </section>
          </div>

          <div className="dashboard-two-column-grid">
            <section className="management-card">
              <div className="dashboard-section-heading">
                <div>
                  <h2>Recent sales</h2>
                  <p>Latest confirmed invoices for the selected date.</p>
                </div>
              </div>
              <DashboardRecentSales items={overview.recentSales} />
            </section>

            <section className="management-card">
              <div className="dashboard-section-heading">
                <div>
                  <h2>Recent purchases</h2>
                  <p>Latest confirmed purchases for the selected date.</p>
                </div>
              </div>
              <DashboardRecentPurchases items={overview.recentPurchases} />
            </section>
          </div>

          <section className="management-card dashboard-section">
            <div className="dashboard-section-heading">
              <div>
                <h2>Stock alerts</h2>
                <p>
                  {overview.inventory.lowStockCount} low-stock products · {" "}
                  {overview.inventory.outOfStockCount} out of stock
                </p>
              </div>
            </div>
            <DashboardLowStockTable items={overview.lowStock.items} />
          </section>
        </>
      ) : null}
    </section>
  );
}
