import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import type { InventoryStockFilters } from "../api/inventory.api.ts";
import {
  InventoryFilters,
  type InventoryFilterValues,
} from "../components/inventory-filters.tsx";
import { InventoryTable } from "../components/inventory-table.tsx";
import { useInventoryStock } from "../hooks/use-inventory.ts";

const pageSize = 20;
const emptyFilters: InventoryFilterValues = { search: "", lowStock: false };

/** Converts visible filter values into the Inventory API contract. */
function apiFilters(
  values: InventoryFilterValues,
  page: number,
): InventoryStockFilters {
  return {
    search: values.search || undefined,
    lowStock: values.lowStock || undefined,
    page,
    pageSize,
  };
}

/** Shows searchable current stock without allowing direct stock edits. */
export function InventoryListPage(): React.JSX.Element {
  const [draftFilters, setDraftFilters] =
    useState<InventoryFilterValues>(emptyFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<InventoryFilterValues>(emptyFilters);
  const [page, setPage] = useState(1);
  const inventoryQuery = useInventoryStock(apiFilters(appliedFilters, page));
  const result = inventoryQuery.data?.data;
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  /** Applies filters and returns to the first result page. */
  function applyFilters(): void {
    setAppliedFilters(draftFilters);
    setPage(1);
  }

  /** Clears every filter and returns to the first page. */
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
          <h1>Current stock</h1>
          <p>Review sellable, damaged, and expired stock in base units.</p>
        </div>
        <div className="form-actions">
          <Link className="secondary-link" to="/inventory/counts">
            Stock counts
          </Link>
          <Link className="secondary-link" to="/inventory/opening-stock">
            Opening stock
          </Link>
          <Link className="primary-link" to="/inventory/adjustments">
            New adjustment
          </Link>
        </div>
      </div>

      <section className="management-card inventory-list-card">
        <InventoryFilters
          disabled={inventoryQuery.isFetching}
          onApply={applyFilters}
          onChange={setDraftFilters}
          onReset={resetFilters}
          values={draftFilters}
        />

        {inventoryQuery.isPending ? <p>Loading inventory...</p> : null}
        {inventoryQuery.isError ? (
          <p className="error-message">Could not load inventory.</p>
        ) : null}

        {result ? <InventoryTable items={result.items} /> : null}

        {result ? (
          <div className="pagination-row">
            <p>
              Page {page} of {totalPages} · {result.total} products
            </p>
            <div className="form-actions">
              <Button
                disabled={page <= 1 || inventoryQuery.isFetching}
                label="Previous"
                onClick={() => setPage((current) => current - 1)}
              />
              <Button
                disabled={page >= totalPages || inventoryQuery.isFetching}
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
