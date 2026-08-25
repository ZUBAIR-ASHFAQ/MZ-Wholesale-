import { Link, useNavigate } from "@tanstack/react-router";

import { ExpenseForm } from "../components/expense-form.tsx";

/** Shows the confirmed Expense creation form on its own route. */
export function ExpenseFormPage(): React.JSX.Element {
  const navigate = useNavigate();

  /** Returns to the Expense list after a successful save or cancel. */
  function returnToExpenses(): void {
    void navigate({ to: "/expenses" });
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Expense Management</p>
          <h1>New expense</h1>
          <p>Record a confirmed cash or bank expense.</p>
        </div>
        <Link className="primary-link" to="/expenses">
          Back to expenses
        </Link>
      </div>

      <section className="management-card">
        <ExpenseForm
          onCancel={returnToExpenses}
          onSaved={returnToExpenses}
        />
      </section>
    </section>
  );
}
