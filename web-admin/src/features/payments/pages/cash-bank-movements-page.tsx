import { useMemo, useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import type { MovementFilters } from "../api/payments.api.ts";
import { MovementsTable } from "../components/movements-table.tsx";
import { useCashBankMovements, usePaymentAccounts } from "../hooks/use-payments.ts";

const pageSize = 20;

/** Shows immutable cash and bank movement history with simple filters. */
export function CashBankMovementsPage(): React.JSX.Element {
  const accountsQuery = usePaymentAccounts();
  const [accountType, setAccountType] = useState<"" | "CASH" | "BANK">("");
  const [accountId, setAccountId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<MovementFilters>({ page: 1, pageSize });
  const movementQuery = useCashBankMovements(appliedFilters);
  const result = movementQuery.data?.data;
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));
  const accounts = accountsQuery.data?.data;

  const availableAccounts = useMemo(() => {
    if (accountType === "CASH") return accounts?.cashAccounts.map((account) => ({ id: account.id, name: account.name })) ?? [];
    if (accountType === "BANK") return accounts?.bankAccounts.map((account) => ({ id: account.id, name: `${account.bankName} - ${account.accountName}` })) ?? [];
    return [];
  }, [accountType, accounts]);

  /** Applies the selected filters and returns to the first page. */
  function applyFilters(): void {
    setAppliedFilters({
      accountType: accountType || undefined,
      accountId: accountId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page: 1,
      pageSize,
    });
  }

  /** Clears all movement filters. */
  function clearFilters(): void {
    setAccountType("");
    setAccountId("");
    setStartDate("");
    setEndDate("");
    setAppliedFilters({ page: 1, pageSize });
  }

  /** Moves to a different result page while keeping active filters. */
  function changePage(page: number): void {
    setAppliedFilters((filters) => ({ ...filters, page }));
  }

  return (
    <section>
      <div className="page-heading-row"><div><p className="eyebrow">Payments</p><h1>Cash and bank movements</h1><p>Permanent inflow and outflow history for every money account.</p></div></div>
      <section className="management-card">
        <div className="payment-filter-grid">
          <label className="ui-field"><span>Account type</span><select value={accountType} onChange={(event) => { setAccountType(event.target.value as "" | "CASH" | "BANK"); setAccountId(""); }}><option value="">All accounts</option><option value="CASH">Cash</option><option value="BANK">Bank</option></select></label>
          <label className="ui-field"><span>Account</span><select disabled={!accountType} value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">All selected-type accounts</option>{availableAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
          <label className="ui-field"><span>Start date</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label className="ui-field"><span>End date</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
        </div>
        <div className="form-actions"><Button disabled={movementQuery.isFetching} label="Apply filters" onClick={applyFilters} /><Button disabled={movementQuery.isFetching} label="Clear" onClick={clearFilters} /></div>
      </section>

      <section className="management-card">
        {movementQuery.isPending ? <p>Loading account movements...</p> : null}
        {movementQuery.isError ? <p className="error-message">Could not load account movements.</p> : null}
        {result ? <MovementsTable items={result.items} /> : null}
        {result ? <div className="pagination-row"><p>Page {result.page} of {totalPages} · {result.total} movements</p><div className="form-actions"><Button disabled={result.page <= 1 || movementQuery.isFetching} label="Previous" onClick={() => changePage(Math.max(1, result.page - 1))} /><Button disabled={result.page >= totalPages || movementQuery.isFetching} label="Next" onClick={() => changePage(Math.min(totalPages, result.page + 1))} /></div></div> : null}
      </section>
    </section>
  );
}
