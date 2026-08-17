import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import type { SupplierListFilters } from "../api/suppliers.api.ts";
import {
  SupplierFilters,
  type SupplierFilterValues,
} from "../components/supplier-filters.tsx";
import { SupplierTable } from "../components/supplier-table.tsx";
import { useSuppliers } from "../hooks/use-suppliers.ts";

const pageSize = 20;

const emptyFilters: SupplierFilterValues = {
  search: "",
  active: "all",
};

/** Converts visible supplier filters to the API query contract. */
function createApiFilters(
  values: SupplierFilterValues,
  page: number,
): SupplierListFilters {
  return {
    search: values.search.trim() || undefined,
    active:
      values.active === "all" ? undefined : values.active === "active",
    page,
    pageSize,
  };
}

/** Shows the searchable and paginated Supplier Management list. */
export function SupplierListPage(): React.JSX.Element {
  const [draftFilters, setDraftFilters] =
    useState<SupplierFilterValues>(emptyFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<SupplierFilterValues>(emptyFilters);
  const [page, setPage] = useState(1);

  const suppliersQuery = useSuppliers(createApiFilters(appliedFilters, page));
  const result = suppliersQuery.data?.data;
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  /** Applies the visible filters and returns to the first page. */
  function applyFilters(): void {
    setAppliedFilters(draftFilters);
    setPage(1);
  }

  /** Clears every supplier filter and returns to the first page. */
  function resetFilters(): void {
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setPage(1);
  }

  /** Opens the previous supplier page when it exists. */
  function showPreviousPage(): void {
    setPage((currentPage) => Math.max(1, currentPage - 1));
  }

  /** Opens the next supplier page when it exists. */
  function showNextPage(): void {
    setPage((currentPage) => Math.min(totalPages, currentPage + 1));
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Supplier Management</p>
          <h1>Suppliers</h1>
          <p>Search suppliers used for purchases and future payable tracking.</p>
        </div>
        <Link className="primary-link" to="/suppliers/new">
          Add supplier
        </Link>
      </div>

      <section className="management-card supplier-list-card">
        <SupplierFilters
          disabled={suppliersQuery.isFetching}
          onApply={applyFilters}
          onChange={setDraftFilters}
          onReset={resetFilters}
          values={draftFilters}
        />

        {suppliersQuery.isPending ? <p>Loading suppliers...</p> : null}
        {suppliersQuery.isError ? (
          <p className="error-message">Could not load suppliers.</p>
        ) : null}

        {result ? <SupplierTable suppliers={result.items} /> : null}

        {result ? (
          <div className="pagination-row">
            <p>
              Page {page} of {totalPages} · {result.total} suppliers
            </p>
            <div className="form-actions">
              <Button
                disabled={page <= 1 || suppliersQuery.isFetching}
                label="Previous"
                onClick={showPreviousPage}
              />
              <Button
                disabled={page >= totalPages || suppliersQuery.isFetching}
                label="Next"
                onClick={showNextPage}
              />
            </div>
          </div>
        ) : null}
      </section>
    </section>
  );
}
