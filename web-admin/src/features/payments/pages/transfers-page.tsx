import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { Dialog } from "../../../components/ui/dialog.tsx";
import type { TransferFilters } from "../api/payments.api.ts";
import { TransferForm } from "../components/transfer-form.tsx";
import { usePaymentAccounts, useTransfers } from "../hooks/use-payments.ts";

const pageSize = 20;

/** Formats one API date for a compact transfer list. */
function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

/** Shows immutable internal transfers and the transfer creation form. */
export function TransfersPage(): React.JSX.Element {
  const accountsQuery = usePaymentAccounts();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filters, setFilters] = useState<TransferFilters>({ page: 1, pageSize });
  const transfersQuery = useTransfers(filters);
  const result = transfersQuery.data?.data;
  const accounts = accountsQuery.data?.data;
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  /** Opens the transfer form. */
  function openForm(): void {
    setIsFormOpen(true);
  }

  /** Closes the transfer form after cancel or success. */
  function closeForm(): void {
    setIsFormOpen(false);
  }

  /** Applies transfer date filters from the first page. */
  function applyFilters(): void {
    setFilters({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page: 1,
      pageSize,
    });
  }

  /** Clears all transfer filters. */
  function clearFilters(): void {
    setStartDate("");
    setEndDate("");
    setFilters({ page: 1, pageSize });
  }

  /** Changes the transfer result page. */
  function changePage(page: number): void {
    setFilters((current) => ({ ...current, page }));
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Payments</p>
          <h1>Internal transfers</h1>
          <p>Move money safely between cash and bank accounts.</p>
        </div>
        <Button label="New transfer" onClick={openForm} />
      </div>

      <section className="management-card">
        <div className="payment-filter-grid">
          <label className="ui-field"><span>Start date</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label className="ui-field"><span>End date</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
        </div>
        <div className="form-actions"><Button label="Apply filters" onClick={applyFilters} /><Button label="Clear" onClick={clearFilters} /></div>
      </section>

      <section className="management-card">
        {transfersQuery.isPending ? <p>Loading transfers...</p> : null}
        {transfersQuery.isError ? <p className="error-message">Could not load transfers.</p> : null}
        {result?.items.length === 0 ? <p>No transfers found.</p> : null}
        {result && result.items.length > 0 ? (
          <div className="table-scroll">
            <table className="ui-table">
              <thead><tr><th>Date</th><th>From</th><th>To</th><th>Amount</th><th>Action</th></tr></thead>
              <tbody>
                {result.items.map((transfer) => (
                  <tr key={transfer.id}>
                    <td>{formatDate(transfer.transferDate)}</td>
                    <td>{transfer.sourceAccountName ?? transfer.sourceMethod}</td>
                    <td>{transfer.destinationAccountName ?? transfer.destinationMethod}</td>
                    <td>PKR {transfer.amount}</td>
                    <td><Link className="primary-link" to="/payments/transfers/$transferId" params={{ transferId: transfer.id }}>View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {result ? (
          <div className="pagination-row">
            <p>Page {result.page} of {totalPages} · {result.total} transfers</p>
            <div className="form-actions">
              <Button disabled={result.page <= 1} label="Previous" onClick={() => changePage(result.page - 1)} />
              <Button disabled={result.page >= totalPages} label="Next" onClick={() => changePage(result.page + 1)} />
            </div>
          </div>
        ) : null}
      </section>

      <Dialog isOpen={isFormOpen} onClose={closeForm} title="New internal transfer">
        {accounts ? <TransferForm accounts={accounts} onFinished={closeForm} /> : <p>Loading accounts...</p>}
      </Dialog>
    </section>
  );
}
