import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import type {
  StockCountListFilters,
  StockCountStatus,
} from "../api/inventory.api.ts";
import { StockCountTable } from "../components/stock-count-table.tsx";
import { useStockCounts } from "../hooks/use-inventory.ts";

const pageSize = 20;

interface CountFilterValues {
  status: "" | StockCountStatus;
  startDate: string;
  endDate: string;
}

const emptyFilters: CountFilterValues = {
  status: "",
  startDate: "",
  endDate: "",
};

/** Converts visible count filters into the backend list contract. */
function apiFilters(
  values: CountFilterValues,
  page: number,
): StockCountListFilters {
  return {
    status: values.status || undefined,
    startDate: values.startDate || undefined,
    endDate: values.endDate || undefined,
    page,
    pageSize,
  };
}

/** Shows draft and confirmed physical stock counts. */
export function StockCountListPage(): React.JSX.Element {
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const countsQuery = useStockCounts(apiFilters(appliedFilters, page));
  const result = countsQuery.data?.data;
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  /** Applies the visible filters and returns to page one. */
  function applyFilters(): void {
    setAppliedFilters(draftFilters);
    setPage(1);
  }

  /** Clears stock-count filters and returns to page one. */
  function resetFilters(): void {
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setPage(1);
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Inventory Management</p>
          <h1>Stock counts</h1>
          <p>Create draft physical counts and confirm their stock differences.</p>
        </div>
        <Link className="primary-link" to="/inventory/counts/new">
          New stock count
        </Link>
      </div>

      <section className="management-card">
        <div className="filter-grid">
          <label className="ui-field">
            <span>Status</span>
            <select
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  status: event.target.value as CountFilterValues["status"],
                }))
              }
              value={draftFilters.status}
            >
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="CONFIRMED">Confirmed</option>
            </select>
          </label>

          <label className="ui-field">
            <span>Start date</span>
            <input
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  startDate: event.target.value,
                }))
              }
              type="date"
              value={draftFilters.startDate}
            />
          </label>

          <label className="ui-field">
            <span>End date</span>
            <input
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  endDate: event.target.value,
                }))
              }
              type="date"
              value={draftFilters.endDate}
            />
          </label>

          <div className="form-actions filter-actions">
            <Button
              disabled={countsQuery.isFetching}
              label="Apply filters"
              onClick={applyFilters}
            />
            <Button
              disabled={countsQuery.isFetching}
              label="Reset"
              onClick={resetFilters}
            />
          </div>
        </div>

        {countsQuery.isPending ? <p>Loading stock counts...</p> : null}
        {countsQuery.isError ? (
          <p className="error-message">Stock counts could not be loaded.</p>
        ) : null}
        {result ? <StockCountTable items={result.items} /> : null}

        {result ? (
          <div className="pagination-row">
            <p>
              Page {page} of {totalPages} · {result.total} counts
            </p>
            <div className="form-actions">
              <Button
                disabled={page <= 1 || countsQuery.isFetching}
                label="Previous"
                onClick={() => setPage((current) => current - 1)}
              />
              <Button
                disabled={page >= totalPages || countsQuery.isFetching}
                label="Next"
                onClick={() => setPage((current) => current + 1)}
              />
            </div>
          </div>
        ) : null}
      </section>
    </section>
  );
}
