import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import type { OutstandingListFilters } from "../api/ledgers.api.ts";
import { CustomerOutstandingTable } from "../components/outstanding-list-table.tsx";
import { useCustomerOutstanding } from "../hooks/use-ledgers.ts";

const pageSize = 20;

/** Shows customers whose calculated ledger balance is still due. */
export function CustomerOutstandingPage(): React.JSX.Element {
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);

  const filters: OutstandingListFilters = {
    search: appliedSearch || undefined,
    page,
    pageSize,
  };
  const outstandingQuery = useCustomerOutstanding(filters);
  const result = outstandingQuery.data?.data;
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  /** Applies the search. */
  function applySearch(): void {
    setAppliedSearch(search.trim());
    setPage(1);
  }

  /** Clears the search input and returns to the first page. */
  function clearSearch(): void {
    setSearch("");
    setAppliedSearch("");
    setPage(1);
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Customer Ledgers</p>
          <h1>Customer outstanding</h1>
          <p>Customers with a positive due balance calculated from ledger entries.</p>
        </div>
      </div>

      <section className="management-card">
        <div className="ledger-search-row">
          <label className="ui-field">
            <span>Search by code, name or phone</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <div className="form-actions ledger-filter-actions">
            <Button disabled={outstandingQuery.isFetching} label="Search" onClick={applySearch} />
            <Button disabled={outstandingQuery.isFetching} label="Clear" onClick={clearSearch} />
          </div>
        </div>

        {outstandingQuery.isPending ? <p>Loading customer outstanding balances...</p> : null}
        {outstandingQuery.isError ? <p className="error-message">Could not load customer outstanding balances.</p> : null}
        {result ? <CustomerOutstandingTable items={result.items} /> : null}
        {result ? (
          <div className="pagination-row">
            <p>Page {page} of {totalPages} · {result.total} customers</p>
            <div className="form-actions">
              <Button disabled={page <= 1 || outstandingQuery.isFetching} label="Previous" onClick={() => setPage((value) => Math.max(1, value - 1))} />
              <Button disabled={page >= totalPages || outstandingQuery.isFetching} label="Next" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} />
            </div>
          </div>
        ) : null}
      </section>
    </section>
  );
}
