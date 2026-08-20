import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { Dialog } from "../../../components/ui/dialog.tsx";
import { useSuppliers } from "../../suppliers/hooks/use-suppliers.ts";
import type { SupplierPaymentFilters } from "../api/payments.api.ts";
import { SupplierPaymentForm } from "../components/supplier-payment-form.tsx";
import { SupplierPaymentsTable } from "../components/supplier-payments-table.tsx";
import { usePaymentAccounts, useSupplierPayments } from "../hooks/use-payments.ts";

const pageSize = 20;

/** Shows the paginated supplier payment list with supplier and date filters. */
export function SupplierPaymentListPage(): React.JSX.Element {
  const [supplierId, setSupplierId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<SupplierPaymentFilters>({
    page: 1,
    pageSize,
  });
  const [isNewPaymentOpen, setIsNewPaymentOpen] = useState(false);

  const accountsQuery = usePaymentAccounts();
  const suppliersQuery = useSuppliers({ page: 1, pageSize: 100 });
  const paymentsQuery = useSupplierPayments(appliedFilters);
  const result = paymentsQuery.data?.data;
  const suppliers = suppliersQuery.data?.data.items ?? [];
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  /** Applies the visible supplier-payment filters and returns to the first page. */
  function applyFilters(): void {
    setAppliedFilters({
      supplierId: supplierId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page: 1,
      pageSize,
    });
  }

  /** Clears every supplier-payment filter and returns to the first page. */
  function clearFilters(): void {
    setSupplierId("");
    setStartDate("");
    setEndDate("");
    setAppliedFilters({ page: 1, pageSize });
  }

  /** Moves to another supplier-payment page while preserving active filters. */
  function changePage(page: number): void {
    setAppliedFilters((filters) => ({ ...filters, page }));
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Payments</p>
          <h1>Supplier payments</h1>
          <p>View confirmed and reversed supplier payments.</p>
        </div>
        <Button label="New payment" onClick={() => setIsNewPaymentOpen(true)} />
      </div>

      <section className="management-card">
        <div className="payment-filter-grid">
          <label className="ui-field">
            <span>Supplier</span>
            <select
              disabled={suppliersQuery.isPending}
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
            >
              <option value="">All suppliers</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.code} - {supplier.name}
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
            disabled={paymentsQuery.isFetching}
            label="Apply filters"
            onClick={applyFilters}
          />
          <Button
            disabled={paymentsQuery.isFetching}
            label="Clear"
            onClick={clearFilters}
          />
        </div>
      </section>

      <section className="management-card">
        {suppliersQuery.isError ? (
          <p className="error-message">
            Supplier filter options could not be loaded.
          </p>
        ) : null}

        {paymentsQuery.isPending ? <p>Loading supplier payments...</p> : null}
        {paymentsQuery.isError ? (
          <p className="error-message">Could not load supplier payments.</p>
        ) : null}

        {result ? <SupplierPaymentsTable payments={result.items} /> : null}

        {result ? (
          <div className="pagination-row">
            <p>
              Page {result.page} of {totalPages} · {result.total} payments
            </p>
            <div className="form-actions">
              <Button
                disabled={result.page <= 1 || paymentsQuery.isFetching}
                label="Previous"
                onClick={() => changePage(Math.max(1, result.page - 1))}
              />
              <Button
                disabled={result.page >= totalPages || paymentsQuery.isFetching}
                label="Next"
                onClick={() =>
                  changePage(Math.min(totalPages, result.page + 1))
                }
              />
            </div>
          </div>
        ) : null}
      </section>

      <Dialog
        isOpen={isNewPaymentOpen}
        onClose={() => setIsNewPaymentOpen(false)}
        title="New supplier payment"
        wide
      >
        {accountsQuery.isPending ? <p>Loading payment accounts...</p> : null}
        {accountsQuery.isError ? (
          <p className="error-message">Payment accounts could not be loaded.</p>
        ) : null}
        {accountsQuery.data?.data ? (
          <SupplierPaymentForm
            accounts={accountsQuery.data.data}
            onCancel={() => setIsNewPaymentOpen(false)}
            onSaved={() => setIsNewPaymentOpen(false)}
          />
        ) : null}
      </Dialog>
    </section>
  );
}
