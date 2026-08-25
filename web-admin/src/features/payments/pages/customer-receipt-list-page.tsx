import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { useCustomers } from "../../customers/hooks/use-customers.ts";
import type { CustomerReceiptFilters } from "../api/payments.api.ts";
import { CustomerReceiptsTable } from "../components/customer-receipts-table.tsx";
import { useCustomerReceipts } from "../hooks/use-payments.ts";

const pageSize = 20;

/** Shows the paginated customer receipt list with customer and date filters. */
export function CustomerReceiptListPage(): React.JSX.Element {
  const [customerId, setCustomerId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<CustomerReceiptFilters>({
    page: 1,
    pageSize,
  });

  const customersQuery = useCustomers({ page: 1, pageSize: 100 });
  const receiptsQuery = useCustomerReceipts(appliedFilters);
  const result = receiptsQuery.data?.data;
  const customers = customersQuery.data?.data.items ?? [];
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  /** Applies the visible receipt filters and returns to the first page. */
  function applyFilters(): void {
    setAppliedFilters({
      customerId: customerId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page: 1,
      pageSize,
    });
  }

  /** Clears every receipt filter and returns to the first page. */
  function clearFilters(): void {
    setCustomerId("");
    setStartDate("");
    setEndDate("");
    setAppliedFilters({ page: 1, pageSize });
  }

  /** Moves to another receipt page while preserving the active filters. */
  function changePage(page: number): void {
    setAppliedFilters((filters) => ({ ...filters, page }));
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Payments</p>
          <h1>Customer receipts</h1>
          <p>View confirmed and reversed customer payment receipts.</p>
        </div>
        <Link className="primary-link" to="/payments/customer-receipts/new">New receipt</Link>
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
            disabled={receiptsQuery.isFetching}
            label="Apply filters"
            onClick={applyFilters}
          />
          <Button
            disabled={receiptsQuery.isFetching}
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

        {receiptsQuery.isPending ? <p>Loading customer receipts...</p> : null}
        {receiptsQuery.isError ? (
          <p className="error-message">Could not load customer receipts.</p>
        ) : null}

        {result ? <CustomerReceiptsTable receipts={result.items} /> : null}

        {result ? (
          <div className="pagination-row">
            <p>
              Page {result.page} of {totalPages} · {result.total} receipts
            </p>
            <div className="form-actions">
              <Button
                disabled={result.page <= 1 || receiptsQuery.isFetching}
                label="Previous"
                onClick={() => changePage(Math.max(1, result.page - 1))}
              />
              <Button
                disabled={result.page >= totalPages || receiptsQuery.isFetching}
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
