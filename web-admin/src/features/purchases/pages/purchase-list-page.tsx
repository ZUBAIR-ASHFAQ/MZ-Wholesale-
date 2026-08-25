import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "../../../components/ui/button.tsx";
import { useSuppliers } from "../../suppliers/hooks/use-suppliers.ts";
import type {
  PurchaseListFilters,
  PurchaseStatus,
} from "../api/purchases.api.ts";
import { PurchaseTable } from "../components/purchase-table.tsx";
import { usePurchases } from "../hooks/use-purchases.ts";

const pageSize = 20;

type PurchaseStatusFilter = PurchaseStatus | "ALL";

/** Shows the filtered and paginated Purchase Management list. */
export function PurchaseListPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [supplierId, setSupplierId] = useState("");
  const [status, setStatus] = useState<PurchaseStatusFilter>("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<PurchaseListFilters>({
    page: 1,
    pageSize,
  });

  const suppliersQuery = useSuppliers({ page: 1, pageSize: 100 });
  const purchasesQuery = usePurchases(appliedFilters);
  const suppliers = suppliersQuery.data?.data.items ?? [];
  const result = purchasesQuery.data?.data;
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  const supplierNames = useMemo(
    () =>
      new Map(
        suppliers.map((supplier) => [
          supplier.id,
          `${supplier.code} - ${supplier.name}`,
        ]),
      ),
    [suppliers],
  );

  /** Opens the Purchase create form. */
  function openNewPurchase(): void {
    void navigate({ to: "/purchases/new" });
  }

  /** Applies the visible Purchase filters and returns to the first page. */
  function applyFilters(): void {
    setAppliedFilters({
      supplierId: supplierId || undefined,
      status: status === "ALL" ? undefined : status,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page: 1,
      pageSize,
    });
  }

  /** Clears every Purchase filter and returns to the first page. */
  function clearFilters(): void {
    setSupplierId("");
    setStatus("ALL");
    setStartDate("");
    setEndDate("");
    setAppliedFilters({ page: 1, pageSize });
  }

  /** Opens another Purchase list page while preserving the applied filters. */
  function changePage(page: number): void {
    setAppliedFilters((filters) => ({ ...filters, page }));
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Purchase Management</p>
          <h1>Purchases</h1>
          <p>View supplier purchases by supplier, status, and purchase date.</p>
        </div>
        <Button label="New purchase" onClick={openNewPurchase} />
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
            <span>Status</span>
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as PurchaseStatusFilter)
              }
            >
              <option value="ALL">All statuses</option>
              <option value="DRAFT">Draft</option>
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
            disabled={purchasesQuery.isFetching}
            label="Apply filters"
            onClick={applyFilters}
          />
          <Button
            disabled={purchasesQuery.isFetching}
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

        {purchasesQuery.isPending ? <p>Loading purchases...</p> : null}
        {purchasesQuery.isError ? (
          <p className="error-message">Could not load purchases.</p>
        ) : null}

        {result ? (
          <PurchaseTable
            purchases={result.items}
            supplierNames={supplierNames}
          />
        ) : null}

        {result ? (
          <div className="pagination-row">
            <p>
              Page {result.page} of {totalPages} · {result.total} purchases
            </p>
            <div className="form-actions">
              <Button
                disabled={result.page <= 1 || purchasesQuery.isFetching}
                label="Previous"
                onClick={() => changePage(Math.max(1, result.page - 1))}
              />
              <Button
                disabled={
                  result.page >= totalPages || purchasesQuery.isFetching
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
