import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import { formatMoney } from "../../../lib/utils.ts";
import { Dialog } from "../../../components/ui/dialog.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import type { CashReconciliation, ReconciliationFilters } from "../api/payments.api.ts";
import { ReconciliationForm } from "../components/reconciliation-form.tsx";
import {
  useCashReconciliations,
  useConfirmCashReconciliation,
  usePaymentAccounts,
} from "../hooks/use-payments.ts";

/** Formats an API date for the reconciliation table. */
function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-PK", { timeZone: "Asia/Karachi" });
}

/** Formats a confirmation timestamp in the required business timezone. */
function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-PK", { timeZone: "Asia/Karachi" });
}

/** Reads a clear confirmation error returned by the API. */
function readConfirmationError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "The cash reconciliation could not be confirmed.";
}

/** Renders draft creation, editing, confirmation, filters, and history. */
export function CashReconciliationsPage(): React.JSX.Element {
  const [filters, setFilters] = useState<ReconciliationFilters>({ page: 1, pageSize: 20 });
  const [status, setStatus] = useState<"" | "DRAFT" | "CONFIRMED">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [editing, setEditing] = useState<CashReconciliation | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const reconciliationsQuery = useCashReconciliations(filters);
  const accountsQuery = usePaymentAccounts();
  const confirmReconciliation = useConfirmCashReconciliation();
  const result = reconciliationsQuery.data?.data;
  const cashAccounts = accountsQuery.data?.data.cashAccounts ?? [];
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  /** Applies status and date filters from the screen controls. */
  function applyFilters(): void {
    setFilters({
      status: status || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page: 1,
      pageSize: 20,
    });
  }

  /** Clears all reconciliation filters. */
  function clearFilters(): void {
    setStatus("");
    setStartDate("");
    setEndDate("");
    setFilters({ page: 1, pageSize: 20 });
  }

  /** Changes the current reconciliation page. */
  function changePage(page: number): void {
    setFilters((current) => ({ ...current, page }));
  }

  /** Opens the form for a new draft cash count. */
  function openCreateForm(): void {
    setEditing(null);
    setIsFormOpen(true);
  }

  /** Opens the form for one existing draft. */
  function openEditForm(reconciliation: CashReconciliation): void {
    setEditing(reconciliation);
    setIsFormOpen(true);
  }

  /** Closes the reconciliation form and clears the selected draft. */
  function closeForm(): void {
    setIsFormOpen(false);
    setEditing(null);
  }

  /** Confirms one draft after an explicit irreversible-action check. */
  async function confirmDraft(reconciliation: CashReconciliation): Promise<void> {
    const approved = window.confirm(
      `Confirm the cash count for ${reconciliation.cashAccountName ?? "this account"}? This cannot be edited later.`,
    );

    if (!approved) return;

    try {
      setActionError(null);
      await confirmReconciliation.mutateAsync(reconciliation.id);
    } catch (error) {
      setActionError(readConfirmationError(error));
    }
  }

  return (
    <section className="management-page">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Payments</p>
          <h1>Cash reconciliations</h1>
          <p>Compare physical cash with the system balance, then confirm the difference.</p>
        </div>
        <Button label="New cash count" onClick={openCreateForm} />
      </div>

      <section className="management-card">
        <div className="payment-filter-grid">
          <label className="ui-field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="CONFIRMED">Confirmed</option>
            </select>
          </label>
          <label className="ui-field">
            <span>Start date</span>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="ui-field">
            <span>End date</span>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
        </div>
        <div className="form-actions">
          <Button label="Apply filters" onClick={applyFilters} />
          <Button label="Clear" onClick={clearFilters} />
        </div>
      </section>

      <section className="management-card">
        {actionError ? <p className="error-message">{actionError}</p> : null}
        {reconciliationsQuery.isPending ? <p>Loading cash reconciliations...</p> : null}
        {reconciliationsQuery.isError ? (
          <p className="error-message">Could not load cash reconciliations.</p>
        ) : null}
        {result?.items.length === 0 ? <p>No cash reconciliations found.</p> : null}

        {result && result.items.length > 0 ? (
          <div className="table-scroll">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Date</th><th>Cash account</th><th>System</th><th>Counted</th>
                  <th>Difference</th><th>Status</th><th>Confirmed at</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDate(item.reconciliationDate)}</td>
                    <td>{item.cashAccountName ?? item.cashAccountId}</td>
                    <td>{formatMoney(item.systemBalance)}</td>
                    <td>{formatMoney(item.countedAmount)}</td>
                    <td>{formatMoney(item.differenceAmount)}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td>{item.confirmedAt ? formatDateTime(item.confirmedAt) : "—"}</td>
                    <td>
                      {item.status === "DRAFT" ? (
                        <div className="form-actions">
                          <Button label="Edit" onClick={() => openEditForm(item)} />
                          <Button
                            disabled={confirmReconciliation.isPending}
                            label="Confirm"
                            onClick={() => void confirmDraft(item)}
                          />
                        </div>
                      ) : (
                        <span>Immutable</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {result ? (
          <div className="pagination-row">
            <p>Page {result.page} of {totalPages} · {result.total} reconciliations</p>
            <div className="form-actions">
              <Button disabled={result.page <= 1} label="Previous" onClick={() => changePage(result.page - 1)} />
              <Button disabled={result.page >= totalPages} label="Next" onClick={() => changePage(result.page + 1)} />
            </div>
          </div>
        ) : null}
      </section>

      <Dialog
        isOpen={isFormOpen}
        onClose={closeForm}
        title={editing ? "Edit cash-count draft" : "New cash-count draft"}
      >
        {accountsQuery.isPending ? <p>Loading cash accounts...</p> : null}
        {accountsQuery.isError ? <p className="error-message">Could not load cash accounts.</p> : null}
        {!accountsQuery.isPending && !accountsQuery.isError ? (
          <ReconciliationForm
            cashAccounts={cashAccounts}
            reconciliation={editing ?? undefined}
            onFinished={closeForm}
          />
        ) : null}
      </Dialog>
    </section>
  );
}
