import { Link } from "@tanstack/react-router";

import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import { formatBusinessDate, formatMoney } from "../../../lib/utils.ts";
import type { ExpenseDetail } from "../api/expenses.api.ts";

interface ExpenseTableProps {
  expenses: ExpenseDetail[];
}

/** Returns the readable payment method shown in the Expense table. */
function paymentMethodLabel(paymentMethod: ExpenseDetail["paymentMethod"]): string {
  return paymentMethod === "CASH" ? "Cash" : "Bank transfer";
}

/** Returns the account name used to pay one expense. */
function paymentAccountLabel(expense: ExpenseDetail): string {
  if (expense.paymentMethod === "CASH") {
    return expense.cashAccountName ?? "—";
  }

  const bankParts = [expense.bankName, expense.bankAccountName].filter(Boolean);
  return bankParts.length > 0 ? bankParts.join(" - ") : "—";
}

/** Displays immutable Expense rows returned by the Expense API. */
export function ExpenseTable({ expenses }: ExpenseTableProps): React.JSX.Element {
  if (expenses.length === 0) {
    return <p>No expenses match the selected filters.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="ui-table">
        <thead>
          <tr>
            <th>Expense no.</th>
            <th>Date</th>
            <th>Category</th>
            <th>Payment method</th>
            <th>Account</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((expense) => (
            <tr key={expense.id}>
              <td><Link to="/expenses/$expenseId" params={{ expenseId: expense.id }}>{expense.expenseNumber}</Link></td>
              <td>{formatBusinessDate(expense.expenseDate)}</td>
              <td>{expense.categoryName}</td>
              <td>{paymentMethodLabel(expense.paymentMethod)}</td>
              <td>{paymentAccountLabel(expense)}</td>
              <td>{formatMoney(expense.amount)}</td>
              <td>
                <StatusBadge
                  label={expense.reversalOfExpenseId ? "Reversal" : undefined}
                  status={expense.reversalOfExpenseId ? "REVERSED" : expense.reversedByExpenseId ? "REVERSED" : "CONFIRMED"}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
