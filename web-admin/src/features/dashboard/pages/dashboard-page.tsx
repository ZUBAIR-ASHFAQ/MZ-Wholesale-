import { useState } from "react";

import { DashboardLowStockTable } from "../components/dashboard-low-stock-table.tsx";
import { DashboardRecentPurchases } from "../components/dashboard-recent-purchases.tsx";
import { DashboardRecentSales } from "../components/dashboard-recent-sales.tsx";
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
            Review confirmed activity, current balances, and stock alerts in one
            place.
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
          <section className="management-card dashboard-section">
            <div className="dashboard-section-heading">
              <div>
                <h2>Summary</h2>
                <p>Business date: {overview.businessDate}</p>
              </div>
            </div>
            <DashboardSummaryCards overview={overview} />
          </section>

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

          <div className="dashboard-two-column-grid">
            <section className="management-card">
              <h2>Recent sales</h2>
              <DashboardRecentSales items={overview.recentSales} />
            </section>

            <section className="management-card">
              <h2>Recent purchases</h2>
              <DashboardRecentPurchases items={overview.recentPurchases} />
            </section>
          </div>
        </>
      ) : null}
    </section>
  );
}
