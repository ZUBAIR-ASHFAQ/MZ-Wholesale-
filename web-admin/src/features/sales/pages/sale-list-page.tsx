import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";

import { Button } from "../../../components/ui/button.tsx";
import { useCustomers } from "../../customers/hooks/use-customers.ts";
import type { SaleListFilters, SaleStatus } from "../api/sales.api.ts";
import { SaleTable } from "../components/sale-table.tsx";
import { useSales } from "../hooks/use-sales.ts";

const pageSize = 20;
type SaleStatusFilter = SaleStatus | "ALL";

/** Shows the filtered and paginated Counter Sales list. */
export function SaleListPage(): React.JSX.Element {
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerLabel, setSelectedCustomerLabel] = useState("");
  const [customerMenuOpen, setCustomerMenuOpen] = useState(false);
  const [status, setStatus] = useState<SaleStatusFilter>("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<SaleListFilters>({
    page: 1,
    pageSize,
  });

  const customersQuery = useCustomers({ page: 1, pageSize: 100 });
  const customerOptionsQuery = useCustomers({
    namePrefix: customerId ? undefined : customerSearch || undefined,
    page: 1,
    pageSize: 100,
  });
  const salesQuery = useSales(appliedFilters);
  const customers = customersQuery.data?.data.items ?? [];
  const customerOptions = customerOptionsQuery.data?.data.items ?? [];
  const result = salesQuery.data?.data;
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  const customerNames = useMemo(() => {
    const names = new Map(
      customers.map((customer) => [
        customer.id,
        `${customer.code} - ${customer.name}`,
      ]),
    );

    if (customerId && selectedCustomerLabel) {
      names.set(customerId, selectedCustomerLabel);
    }

    return names;
  }, [customerId, customers, selectedCustomerLabel]);

  /** Updates the typed customer-name prefix and clears any previous selection. */
  function changeCustomerSearch(value: string): void {
    setCustomerSearch(value);
    setCustomerId("");
    setSelectedCustomerLabel("");
    setCustomerMenuOpen(true);
  }

  /** Selects one customer from the searchable dropdown. */
  function selectCustomer(customerIdValue: string, label: string): void {
    setCustomerId(customerIdValue);
    setCustomerSearch(label);
    setSelectedCustomerLabel(label);
    setCustomerMenuOpen(false);
  }

  /** Clears only the customer selection while keeping the dropdown available. */
  function selectAllCustomers(): void {
    setCustomerId("");
    setCustomerSearch("");
    setSelectedCustomerLabel("");
    setCustomerMenuOpen(false);
  }

  /** Handles the minimal keyboard behavior expected from the customer combobox. */
  function handleCustomerKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
  ): void {
    if (event.key === "Escape") {
      setCustomerMenuOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCustomerMenuOpen(true);
    }
  }

  /** Closes the customer dropdown only when focus leaves the whole combobox. */
  function handleCustomerBlur(event: React.FocusEvent<HTMLDivElement>): void {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setCustomerMenuOpen(false);
  }

  /** Applies the visible Sales filters and returns to the first page. */
  function applyFilters(): void {
    setAppliedFilters({
      customerId: customerId || undefined,
      status: status === "ALL" ? undefined : status,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page: 1,
      pageSize,
    });
  }

  /** Clears every Sales filter and returns to the first page. */
  function clearFilters(): void {
    setCustomerId("");
    setCustomerSearch("");
    setSelectedCustomerLabel("");
    setCustomerMenuOpen(false);
    setStatus("ALL");
    setStartDate("");
    setEndDate("");
    setAppliedFilters({ page: 1, pageSize });
  }

  /** Opens another Sales page while preserving the applied filters. */
  function changePage(page: number): void {
    setAppliedFilters((filters) => ({ ...filters, page }));
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Counter Sales</p>
          <h1>Sales</h1>
          <p>View invoices by customer, status, and sale date.</p>
        </div>
        <Link className="primary-link" to="/sales/new">
          New sale
        </Link>
      </div>

      <section className="management-card">
        <div className="payment-filter-grid">
          <div className="ui-field">
            <span>Customer</span>
            <div
              className="sale-customer-combobox"
              onBlur={handleCustomerBlur}
            >
              <input
                aria-autocomplete="list"
                aria-expanded={customerMenuOpen}
                aria-haspopup="listbox"
                autoComplete="off"
                disabled={customersQuery.isPending}
                placeholder="All customers"
                role="combobox"
                value={customerSearch}
                onChange={(event) => changeCustomerSearch(event.target.value)}
                onClick={() => setCustomerMenuOpen(true)}
                onFocus={(event) => {
                  setCustomerMenuOpen(true);

                  if (customerId) {
                    event.currentTarget.select();
                  }
                }}
                onKeyDown={handleCustomerKeyDown}
              />

              {customerMenuOpen ? (
                <div className="sale-customer-options" role="listbox">
                  <button
                    className="sale-customer-option"
                    type="button"
                    onClick={selectAllCustomers}
                  >
                    All customers
                  </button>

                  {customerOptions.map((customer) => {
                    const label = `${customer.code} - ${customer.name}`;

                    return (
                      <button
                        className="sale-customer-option"
                        aria-selected={customer.id === customerId}
                        key={customer.id}
                        role="option"
                        type="button"
                        onClick={() => selectCustomer(customer.id, label)}
                      >
                        {label}
                      </button>
                    );
                  })}

                  {customerSearch &&
                  !customerOptionsQuery.isPending &&
                  customerOptions.length === 0 ? (
                    <p className="sale-customer-empty">No customers found.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <label className="ui-field">
            <span>Status</span>
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as SaleStatusFilter)
              }
            >
              <option value="ALL">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="HELD">Held</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="CANCELLED">Cancelled</option>
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
            disabled={salesQuery.isFetching}
            label="Apply filters"
            onClick={applyFilters}
          />
          <Button
            disabled={salesQuery.isFetching}
            label="Clear"
            onClick={clearFilters}
          />
        </div>
      </section>

      <section className="management-card">
        {customersQuery.isError || customerOptionsQuery.isError ? (
          <p className="error-message">
            Customer filter options could not be loaded.
          </p>
        ) : null}

        {salesQuery.isPending ? <p>Loading sales...</p> : null}
        {salesQuery.isError ? (
          <p className="error-message">Could not load sales.</p>
        ) : null}

        {result ? (
          <SaleTable sales={result.items} customerNames={customerNames} />
        ) : null}

        {result ? (
          <div className="pagination-row">
            <p>
              Page {result.page} of {totalPages} · {result.total} sales
            </p>
            <div className="form-actions">
              <Button
                disabled={result.page <= 1 || salesQuery.isFetching}
                label="Previous"
                onClick={() => changePage(Math.max(1, result.page - 1))}
              />
              <Button
                disabled={result.page >= totalPages || salesQuery.isFetching}
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
