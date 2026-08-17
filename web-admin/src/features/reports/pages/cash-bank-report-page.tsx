import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { usePaymentAccounts } from "../../payments/hooks/use-payments.ts";
import type { CashBankReportFilters } from "../api/reports.api.ts";
import {
  ReportDateRangeFilter,
  type ReportDateRangeFilterValues,
} from "../components/report-filters.tsx";
import { useCashBankReport } from "../hooks/use-reports.ts";

/** Returns today's Asia/Karachi business date in the YYYY-MM-DD format required by the API. */
function today(): string {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Karachi",
    year: "numeric",
  }).formatToParts(new Date());

  const year = dateParts.find((part) => part.type === "year")?.value ?? "";
  const month = dateParts.find((part) => part.type === "month")?.value ?? "";
  const day = dateParts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

/** Returns the first day of the current Karachi business month in YYYY-MM-DD format. */
function firstDayOfCurrentMonth(): string {
  return `${today().slice(0, 7)}-01`;
}

const defaultDates: ReportDateRangeFilterValues = {
  startDate: firstDayOfCurrentMonth(),
  endDate: today(),
};

/** Converts the visible Cash/Bank Report controls into the backend filter contract. */
function createCashBankFilters(
  dates: ReportDateRangeFilterValues,
  accountId: string,
): CashBankReportFilters {
  return {
    startDate: dates.startDate,
    endDate: dates.endDate,
    accountId: accountId || undefined,
  };
}

/** Formats one movement timestamp for simple local display. */
function formatMovementDate(value: string): string {
  return new Date(value).toLocaleString("en-PK", { timeZone: "Asia/Karachi" });
}

/** Converts an internal cash/bank movement value into a readable report label. */
function movementLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Shows the movement document as a link when its source has a detail page. */
function movementDocument(
  sourceType: string,
  sourceId: string | null,
  documentNumber: string | null,
): React.JSX.Element | string {
  const label = documentNumber ?? movementLabel(sourceType);

  if (!sourceId) return label;

  switch (sourceType) {
    case "CUSTOMER_RECEIPT":
    case "CUSTOMER_RECEIPT_REVERSAL":
    case "SALE_INITIAL_PAYMENT":
      return <Link className="table-link" params={{ receiptId: sourceId }} to="/payments/customer-receipts/$receiptId">{label}</Link>;
    case "SUPPLIER_PAYMENT":
    case "SUPPLIER_PAYMENT_REVERSAL":
    case "PURCHASE_INITIAL_PAYMENT":
      return <Link className="table-link" params={{ paymentId: sourceId }} to="/payments/supplier-payments/$paymentId">{label}</Link>;
    case "TRANSFER":
      return <Link className="table-link" params={{ transferId: sourceId }} to="/payments/transfers/$transferId">{label}</Link>;
    case "SALES_RETURN":
      return <Link className="table-link" params={{ salesReturnId: sourceId }} to="/returns/sales/$salesReturnId">{label}</Link>;
    case "EXPENSE":
    case "EXPENSE_REVERSAL":
      return <Link className="table-link" params={{ expenseId: sourceId }} to="/expenses/$expenseId">{label}</Link>;
    default:
      return label;
  }
}

/** Shows account opening balances, period movements, and closing balances. */
export function CashBankReportPage(): React.JSX.Element {
  const [draftDates, setDraftDates] =
    useState<ReportDateRangeFilterValues>(defaultDates);
  const [draftAccountId, setDraftAccountId] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<CashBankReportFilters>(
    () => createCashBankFilters(defaultDates, ""),
  );

  const accountsQuery = usePaymentAccounts();
  const reportQuery = useCashBankReport(appliedFilters);
  const report = reportQuery.data?.data;

  const accountOptions = useMemo(() => {
    const cashAccounts = (accountsQuery.data?.data.cashAccounts ?? []).map((account) => ({
      id: account.id,
      label: `Cash - ${account.name}`,
    }));
    const bankAccounts = (accountsQuery.data?.data.bankAccounts ?? []).map((account) => ({
      id: account.id,
      label: `Bank - ${account.bankName} - ${account.accountName}`,
    }));

    return [...cashAccounts, ...bankAccounts].sort((left, right) =>
      left.label.localeCompare(right.label),
    );
  }, [accountsQuery.data]);

  /** Applies the selected date range and optional account filter. */
  function applyFilters(): void {
    setAppliedFilters(createCashBankFilters(draftDates, draftAccountId));
  }

  /** Restores the current-month range and clears the account filter. */
  function resetFilters(): void {
    const nextDates = {
      startDate: firstDayOfCurrentMonth(),
      endDate: today(),
    };

    setDraftDates(nextDates);
    setDraftAccountId("");
    setAppliedFilters(createCashBankFilters(nextDates, ""));
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Cash and bank report</h1>
          <p>
            Review opening balances, money movements, and closing balances for cash
            and bank accounts.
          </p>
        </div>
      </div>

      <section className="management-card">
        <ReportDateRangeFilter
          disabled={reportQuery.isFetching}
          onApply={applyFilters}
          onChange={setDraftDates}
          onReset={resetFilters}
          values={draftDates}
        />

        <div className="payment-filter-grid">
          <label className="ui-field">
            <span>Account</span>
            <select
              disabled={accountsQuery.isPending || reportQuery.isFetching}
              onChange={(event) => setDraftAccountId(event.target.value)}
              value={draftAccountId}
            >
              <option value="">All cash and bank accounts</option>
              {accountOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {accountsQuery.isError ? (
          <p className="error-message">Account filter options could not be loaded.</p>
        ) : null}
      </section>

      <section className="management-card">
        {reportQuery.isPending ? <p>Loading cash and bank report...</p> : null}
        {reportQuery.isError ? (
          <p className="error-message">Could not load the cash and bank report.</p>
        ) : null}

        {report ? (
          <>
            {report.accounts.map((account) => (
              <section className="management-card" key={`${account.accountType}-${account.accountId}`}>
                <h2>{account.accountName}</h2>
                <p>
                  {account.accountType === "CASH" ? "Cash account" : "Bank account"}
                  {account.accountReference ? ` · ${account.accountReference}` : ""}
                </p>

                <div className="summary-grid">
                  <article className="summary-card">
                    <span>Opening balance</span>
                    <strong>PKR {account.openingBalance}</strong>
                  </article>
                  <article className="summary-card">
                    <span>Inflows</span>
                    <strong>PKR {account.inflowAmount}</strong>
                  </article>
                  <article className="summary-card">
                    <span>Outflows</span>
                    <strong>PKR {account.outflowAmount}</strong>
                  </article>
                  <article className="summary-card">
                    <span>Closing balance</span>
                    <strong>PKR {account.closingBalance}</strong>
                  </article>
                </div>

                <div className="table-scroll">
                  <table className="ui-table">
                    <thead>
                      <tr>
                        <th>Business date</th>
                        <th>Date / time</th>
                        <th>Direction</th>
                        <th>Source</th>
                        <th>Document</th>
                        <th>Amount</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {account.movements.map((movement) => (
                        <tr key={movement.movementId}>
                          <td>{movement.businessDate}</td>
                          <td>{formatMovementDate(movement.occurredAt)}</td>
                          <td>{movementLabel(movement.direction)}</td>
                          <td>{movementLabel(movement.sourceType)}</td>
                          <td>{movementDocument(movement.sourceType, movement.sourceId, movement.documentNumber)}</td>
                          <td>PKR {movement.amount}</td>
                          <td>{movement.description ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {account.movements.length === 0 ? (
                  <p>No movements occurred for this account in the selected period.</p>
                ) : null}
              </section>
            ))}

            {report.accounts.length === 0 ? (
              <p>No cash or bank account matched these filters.</p>
            ) : null}
          </>
        ) : null}
      </section>
    </section>
  );
}
