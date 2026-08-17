import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import type { OutstandingListFilters } from "../api/ledgers.api.ts";
import { SupplierPayablesTable } from "../components/outstanding-list-table.tsx";
import { useSupplierPayables } from "../hooks/use-ledgers.ts";

const pageSize = 20;

/** Shows suppliers whose calculated ledger balance is still payable. */
export function SupplierPayablesPage(): React.JSX.Element {
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);

  const filters: OutstandingListFilters = {
    search: appliedSearch || undefined,
    page,
    pageSize,
  };
  const payablesQuery = useSupplierPayables(filters);
  const result = payablesQuery.data?.data;
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
          <p className="eyebrow">Supplier Ledgers</p>
          <h1>Supplier payables</h1>
          <p>Suppliers with a positive payable calculated from ledger entries.</p>
        </div>
      </div>

      <section className="management-card">
        <div className="ledger-search-row">
          <label className="ui-field">
            <span>Search by code, name or phone</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <div className="form-actions ledger-filter-actions">
            <Button disabled={payablesQuery.isFetching} label="Search" onClick={applySearch} />
            <Button disabled={payablesQuery.isFetching} label="Clear" onClick={clearSearch} />
          </div>
        </div>

        {payablesQuery.isPending ? <p>Loading supplier payables...</p> : null}
        {payablesQuery.isError ? <p className="error-message">Could not load supplier payables.</p> : null}
        {result ? <SupplierPayablesTable items={result.items} /> : null}
        {result ? (
          <div className="pagination-row">
            <p>Page {page} of {totalPages} · {result.total} suppliers</p>
            <div className="form-actions">
              <Button disabled={page <= 1 || payablesQuery.isFetching} label="Previous" onClick={() => setPage((value) => Math.max(1, value - 1))} />
              <Button disabled={page >= totalPages || payablesQuery.isFetching} label="Next" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} />
            </div>
          </div>
        ) : null}
      </section>
    </section>
  );
}
