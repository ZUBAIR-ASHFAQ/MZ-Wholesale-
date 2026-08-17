import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import type { CustomerListFilters } from "../api/customers.api.ts";
import {
  CustomerFilters,
  type CustomerFilterValues,
} from "../components/customer-filters.tsx";
import { CustomerTable } from "../components/customer-table.tsx";
import { useCustomers } from "../hooks/use-customers.ts";

const pageSize = 20;

const emptyFilters: CustomerFilterValues = {
  search: "",
  active: "all",
};

/** Converts visible customer filters to the API query contract. */
function createApiFilters(
  values: CustomerFilterValues,
  page: number,
): CustomerListFilters {
  return {
    search: values.search.trim() || undefined,
    active:
      values.active === "all" ? undefined : values.active === "active",
    page,
    pageSize,
  };
}

/** Shows the searchable and paginated Customer Management list. */
export function CustomerListPage(): React.JSX.Element {
  const [draftFilters, setDraftFilters] =
    useState<CustomerFilterValues>(emptyFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<CustomerFilterValues>(emptyFilters);
  const [page, setPage] = useState(1);

  const customersQuery = useCustomers(createApiFilters(appliedFilters, page));
  const result = customersQuery.data?.data;
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  /** Applies the visible filters and returns to the first page. */
  function applyFilters(): void {
    setAppliedFilters(draftFilters);
    setPage(1);
  }

  /** Clears every customer filter and returns to the first page. */
  function resetFilters(): void {
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setPage(1);
  }

  /** Opens the previous customer page when it exists. */
  function showPreviousPage(): void {
    setPage((currentPage) => Math.max(1, currentPage - 1));
  }

  /** Opens the next customer page when it exists. */
  function showNextPage(): void {
    setPage((currentPage) => Math.min(totalPages, currentPage + 1));
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Customer Management</p>
          <h1>Customers</h1>
          <p>Search regular and Walk-in customers used by counter sales.</p>
        </div>
        <Link className="primary-link" to="/customers/new">
          Add customer
        </Link>
      </div>

      <section className="management-card customer-list-card">
        <CustomerFilters
          disabled={customersQuery.isFetching}
          onApply={applyFilters}
          onChange={setDraftFilters}
          onReset={resetFilters}
          values={draftFilters}
        />

        {customersQuery.isPending ? <p>Loading customers...</p> : null}
        {customersQuery.isError ? (
          <p className="error-message">Could not load customers.</p>
        ) : null}

        {result ? <CustomerTable customers={result.items} /> : null}

        {result ? (
          <div className="pagination-row">
            <p>
              Page {page} of {totalPages} · {result.total} customers
            </p>
            <div className="form-actions">
              <Button
                disabled={page <= 1 || customersQuery.isFetching}
                label="Previous"
                onClick={showPreviousPage}
              />
              <Button
                disabled={page >= totalPages || customersQuery.isFetching}
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
