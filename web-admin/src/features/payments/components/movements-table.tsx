import { Link } from "@tanstack/react-router";

import type { CashBankMovement } from "../api/payments.api.ts";

interface MovementsTableProps {
  items: CashBankMovement[];
}

/** Formats an API timestamp for a readable admin-table cell. */
function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-PK", { timeZone: "Asia/Karachi" });
}

/** Converts an internal movement value into a readable UI label. */
function movementLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Shows a movement document as a link when its source has a detail screen. */
function sourceDocument(item: CashBankMovement): React.JSX.Element | string {
  const label = item.documentNumber ?? movementLabel(item.sourceType);

  if (!item.sourceId) {
    return label;
  }

  switch (item.sourceType) {
    case "CUSTOMER_RECEIPT":
    case "CUSTOMER_RECEIPT_REVERSAL":
    case "SALE_INITIAL_PAYMENT":
      return (
        <Link
          className="table-link"
          params={{ receiptId: item.sourceId }}
          to="/payments/customer-receipts/$receiptId"
        >
          {label}
        </Link>
      );
    case "SUPPLIER_PAYMENT":
    case "SUPPLIER_PAYMENT_REVERSAL":
    case "PURCHASE_INITIAL_PAYMENT":
      return (
        <Link
          className="table-link"
          params={{ paymentId: item.sourceId }}
          to="/payments/supplier-payments/$paymentId"
        >
          {label}
        </Link>
      );
    case "TRANSFER":
      return (
        <Link
          className="table-link"
          params={{ transferId: item.sourceId }}
          to="/payments/transfers/$transferId"
        >
          {label}
        </Link>
      );
    case "SALES_RETURN":
      return (
        <Link
          className="table-link"
          params={{ salesReturnId: item.sourceId }}
          to="/returns/sales/$salesReturnId"
        >
          {label}
        </Link>
      );
    case "EXPENSE":
    case "EXPENSE_REVERSAL":
      return (
        <Link
          className="table-link"
          params={{ expenseId: item.sourceId }}
          to="/expenses/$expenseId"
        >
          {label}
        </Link>
      );
    default:
      return label;
  }
}

/** Shows immutable cash and bank movement history with document traceability. */
export function MovementsTable({ items }: MovementsTableProps): React.JSX.Element {
  if (items.length === 0) return <p>No account movements match the selected filters.</p>;

  return (
    <div className="table-scroll">
      <table className="ui-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Account</th>
            <th>Direction</th>
            <th>Method</th>
            <th>Source</th>
            <th>Document</th>
            <th>Amount</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{formatDate(item.occurredAt)}</td>
              <td>{item.accountName}</td>
              <td>{movementLabel(item.direction)}</td>
              <td>{movementLabel(item.method)}</td>
              <td>{movementLabel(item.sourceType)}</td>
              <td>{sourceDocument(item)}</td>
              <td>PKR {item.amount}</td>
              <td>{item.description ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
