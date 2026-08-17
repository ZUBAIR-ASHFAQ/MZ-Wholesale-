import { formatMoney } from "../../../lib/utils.ts";

interface LedgerSummaryProps {
  openingBalance: string;
  totalDebit: string;
  totalCredit: string;
  closingBalance: string;
  closingLabel: string;
}

/** Shows the main totals for a customer or supplier statement. */
export function LedgerSummary({
  openingBalance,
  totalDebit,
  totalCredit,
  closingBalance,
  closingLabel,
}: LedgerSummaryProps): React.JSX.Element {
  return (
    <div className="ledger-summary-grid">
      <article className="summary-card">
        <span>Opening balance</span>
        <strong>{formatMoney(openingBalance)}</strong>
      </article>
      <article className="summary-card">
        <span>Total debit</span>
        <strong>{formatMoney(totalDebit)}</strong>
      </article>
      <article className="summary-card">
        <span>Total credit</span>
        <strong>{formatMoney(totalCredit)}</strong>
      </article>
      <article className="summary-card">
        <span>{closingLabel}</span>
        <strong>{formatMoney(closingBalance)}</strong>
      </article>
    </div>
  );
}
