import { Link } from "@tanstack/react-router";

import type { LedgerEntry } from "../api/ledgers.api.ts";

interface LedgerStatementTableProps {
  entries: LedgerEntry[];
}

/** Returns a readable placeholder when an optional ledger value is missing. */
function displayValue(value: string | null): string {
  return value ?? "—";
}

/** Formats a ledger timestamp for display in the admin panel. */
function displayDate(value: string): string {
  return new Date(value).toLocaleDateString("en-PK", { timeZone: "Asia/Karachi" });
}

/** Converts an internal ledger reference into a readable label. */
function referenceLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Shows the document number as a link when its source has a detail screen. */
function documentLink(entry: LedgerEntry): React.JSX.Element | string {
  const label = displayValue(entry.documentNumber);

  if (!entry.referenceId || !entry.documentNumber) {
    return label;
  }

  switch (entry.referenceType) {
    case "SALE":
      return (
        <Link className="table-link" params={{ saleId: entry.referenceId }} to="/sales/$saleId">
          {label}
        </Link>
      );
    case "PURCHASE":
      return (
        <Link
          className="table-link"
          params={{ purchaseId: entry.referenceId }}
          to="/purchases/$purchaseId"
        >
          {label}
        </Link>
      );
    case "CUSTOMER_PAYMENT":
    case "CUSTOMER_PAYMENT_REVERSAL":
      return (
        <Link
          className="table-link"
          params={{ receiptId: entry.referenceId }}
          to="/payments/customer-receipts/$receiptId"
        >
          {label}
        </Link>
      );
    case "SUPPLIER_PAYMENT":
    case "SUPPLIER_PAYMENT_REVERSAL":
      return (
        <Link
          className="table-link"
          params={{ paymentId: entry.referenceId }}
          to="/payments/supplier-payments/$paymentId"
        >
          {label}
        </Link>
      );
    case "SALES_RETURN":
    case "SALES_RETURN_REFUND":
      return (
        <Link
          className="table-link"
          params={{ salesReturnId: entry.referenceId }}
          to="/returns/sales/$salesReturnId"
        >
          {label}
        </Link>
      );
    case "PURCHASE_RETURN":
      return (
        <Link
          className="table-link"
          params={{ purchaseReturnId: entry.referenceId }}
          to="/returns/purchases/$purchaseReturnId"
        >
          {label}
        </Link>
      );
    default:
      return label;
  }
}

/** Displays immutable ledger entries and their calculated running balance. */
export function LedgerStatementTable({
  entries,
}: LedgerStatementTableProps): React.JSX.Element {
  if (entries.length === 0) {
    return <p>No ledger entries match the selected date range.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="ui-table ledger-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Document</th>
            <th>Description</th>
            <th>Type</th>
            <th>Debit</th>
            <th>Credit</th>
            <th>Running balance</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>{displayDate(entry.occurredAt)}</td>
              <td>{documentLink(entry)}</td>
              <td>{displayValue(entry.description ?? entry.notes)}</td>
              <td>{referenceLabel(entry.referenceType)}</td>
              <td>PKR {entry.debit}</td>
              <td>PKR {entry.credit}</td>
              <td>PKR {entry.runningBalance}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
