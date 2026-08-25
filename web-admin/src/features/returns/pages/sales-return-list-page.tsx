import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";

import { Button } from "../../../components/ui/button.tsx";
import { useCustomers } from "../../customers/hooks/use-customers.ts";
import type { SalesReturnListFilters } from "../api/returns.api.ts";
import { SalesReturnTable } from "../components/sales-return-table.tsx";
import { useSalesReturns } from "../hooks/use-returns.ts";

const pageSize = 20;

/** Shows the filtered and paginated Sales Return list. */
export function SalesReturnListPage(): React.JSX.Element {
  const [customerId, setCustomerId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<SalesReturnListFilters>({
    page: 1,
    pageSize,
  });

  const customersQuery = useCustomers({ page: 1, pageSize: 100 });
  const salesReturnsQuery = useSalesReturns(appliedFilters);
  const customers = customersQuery.data?.data.items ?? [];
  const result = salesReturnsQuery.data?.data;
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  const customerNames = useMemo(
    () =>
      new Map(
        customers.map((customer) => [
          customer.id,
          `${customer.code} - ${customer.name}`,
        ]),
      ),
    [customers],
  );

  /** Applies the visible Sales Return filters and returns to the first page. */
  function applyFilters(): void {
    setAppliedFilters({
      customerId: customerId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page: 1,
      pageSize,
    });
  }

  /** Clears every Sales Return filter and returns to the first page. */
  function clearFilters(): void {
    setCustomerId("");
    setStartDate("");
    setEndDate("");
    setAppliedFilters({ page: 1, pageSize });
  }

  /** Opens another Sales Return page while preserving the applied filters. */
  function changePage(page: number): void {
    setAppliedFilters((filters) => ({ ...filters, page }));
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Sales Returns</p>
          <h1>Sales returns</h1>
          <p>View confirmed customer returns by customer and return date.</p>
        </div>
        <div className="form-actions">
          <Link className="primary-link" to="/returns/purchases">
            Purchase returns
          </Link>
          <Link className="primary-link" to="/returns/sales/new">
            New sales return
          </Link>
        </div>
      </div>

      <section className="management-card">
        <div className="payment-filter-grid">
          <label className="ui-field">
            <span>Customer</span>
            <select
              disabled={customersQuery.isPending}
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
            >
              <option value="">All customers</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.code} - {customer.name}
                </option>
              ))}
            </select>
          </label>

          <label className="ui-field">
            <span>Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>

          <label className="ui-field">
            <span>End date</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
        </div>

        <div className="form-actions">
          <Button
            disabled={salesReturnsQuery.isFetching}
            label="Apply filters"
            onClick={applyFilters}
          />
          <Button
            disabled={salesReturnsQuery.isFetching}
            label="Clear"
            onClick={clearFilters}
          />
        </div>
      </section>

      <section className="management-card">
        {customersQuery.isError ? (
          <p className="error-message">
            Customer filter options could not be loaded.
          </p>
        ) : null}

        {salesReturnsQuery.isPending ? <p>Loading sales returns...</p> : null}
        {salesReturnsQuery.isError ? (
          <p className="error-message">Could not load sales returns.</p>
        ) : null}

        {result ? (
          <SalesReturnTable
            salesReturns={result.items}
            customerNames={customerNames}
          />
        ) : null}

        {result ? (
          <div className="pagination-row">
            <p>
              Page {result.page} of {totalPages} · {result.total} sales returns
            </p>
            <div className="form-actions">
              <Button
                disabled={result.page <= 1 || salesReturnsQuery.isFetching}
                label="Previous"
                onClick={() => changePage(Math.max(1, result.page - 1))}
              />
              <Button
                disabled={
                  result.page >= totalPages || salesReturnsQuery.isFetching
                }
                label="Next"
                onClick={() =>
                  changePage(Math.min(totalPages, result.page + 1))
                }
              />
            </div>
          </div>
        ) : null}
      </section>
    </section>
  );
}
