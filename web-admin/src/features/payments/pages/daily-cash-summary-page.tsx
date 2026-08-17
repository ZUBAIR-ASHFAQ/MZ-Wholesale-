import { useEffect, useMemo, useState } from "react";

import { useDailyCashSummary, usePaymentAccounts } from "../hooks/use-payments.ts";

/** Returns today's business date in the configured Asia/Karachi timezone. */
function getKarachiBusinessDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Shows expected and counted cash for one cash account and business date. */
export function DailyCashSummaryPage(): React.JSX.Element {
  const accountsQuery = usePaymentAccounts();
  const cashAccounts = useMemo(
    () => (accountsQuery.data?.data.cashAccounts ?? []).filter((account) => account.isActive),
    [accountsQuery.data?.data.cashAccounts],
  );
  const [cashAccountId, setCashAccountId] = useState("");
  const [date, setDate] = useState(getKarachiBusinessDate);

  useEffect(() => {
    if (!cashAccountId && cashAccounts.length > 0) {
      setCashAccountId(cashAccounts[0].id);
    }
  }, [cashAccountId, cashAccounts]);

  const summaryQuery = useDailyCashSummary({ cashAccountId, date });
  const summary = summaryQuery.data?.data;

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Payments</p>
          <h1>Daily cash summary</h1>
          <p>Review opening cash, daily inflows and outflows, expected closing, and any confirmed physical cash count.</p>
        </div>
      </div>

      <section className="management-card">
        <div className="payment-filter-grid">
          <label className="ui-field">
            <span>Cash account</span>
            <select
              disabled={accountsQuery.isPending || summaryQuery.isFetching}
              onChange={(event) => setCashAccountId(event.target.value)}
              value={cashAccountId}
            >
              {cashAccounts.length === 0 ? <option value="">No active cash account</option> : null}
              {cashAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          <label className="ui-field">
            <span>Business date</span>
            <input
              disabled={summaryQuery.isFetching}
              onChange={(event) => setDate(event.target.value)}
              type="date"
              value={date}
            />
          </label>
        </div>

        {accountsQuery.isError ? <p className="error-message">Could not load cash accounts.</p> : null}
      </section>

      <section className="management-card">
        {summaryQuery.isPending && cashAccountId ? <p>Loading daily cash summary...</p> : null}
        {summaryQuery.isError ? <p className="error-message">Could not load the daily cash summary.</p> : null}
        {!cashAccountId && !accountsQuery.isPending ? <p>No active cash account is available.</p> : null}

        {summary ? (
          <>
            <div className="summary-grid">
              <article className="summary-card"><span>Opening</span><strong>PKR {summary.opening}</strong></article>
              <article className="summary-card"><span>Inflows</span><strong>PKR {summary.inflows}</strong></article>
              <article className="summary-card"><span>Outflows</span><strong>PKR {summary.outflows}</strong></article>
              <article className="summary-card"><span>Expected closing</span><strong>PKR {summary.expectedClosing}</strong></article>
            </div>

            <div className="management-card">
              <h2>{summary.cashAccountName}</h2>
              <p>Business date: {summary.date}</p>
              {summary.countedAmount !== null && summary.difference !== null ? (
                <div className="summary-grid">
                  <article className="summary-card"><span>Counted amount</span><strong>PKR {summary.countedAmount}</strong></article>
                  <article className="summary-card"><span>Difference</span><strong>PKR {summary.difference}</strong></article>
                </div>
              ) : (
                <p>No confirmed cash reconciliation exists for this account and date.</p>
              )}
            </div>
          </>
        ) : null}
      </section>
    </section>
  );
}
