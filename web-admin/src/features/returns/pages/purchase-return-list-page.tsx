import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";

import { Button } from "../../../components/ui/button.tsx";
import { useSuppliers } from "../../suppliers/hooks/use-suppliers.ts";
import type { PurchaseReturnListFilters } from "../api/returns.api.ts";
import { PurchaseReturnTable } from "../components/purchase-return-table.tsx";
import { usePurchaseReturns } from "../hooks/use-returns.ts";

const pageSize = 20;

/** Shows the filtered and paginated Purchase Return list. */
export function PurchaseReturnListPage(): React.JSX.Element {
  const [supplierId, setSupplierId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedFilters, setAppliedFilters] =
    useState<PurchaseReturnListFilters>({
      page: 1,
      pageSize,
    });

  const suppliersQuery = useSuppliers({ page: 1, pageSize: 100 });
  const purchaseReturnsQuery = usePurchaseReturns(appliedFilters);
  const suppliers = suppliersQuery.data?.data.items ?? [];
  const result = purchaseReturnsQuery.data?.data;
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

  /** Applies the visible Purchase Return filters and returns to the first page. */
  function applyFilters(): void {
    setAppliedFilters({
      supplierId: supplierId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page: 1,
      pageSize,
    });
  }

  /** Clears every Purchase Return filter and returns to the first page. */
  function clearFilters(): void {
    setSupplierId("");
    setStartDate("");
    setEndDate("");
    setAppliedFilters({ page: 1, pageSize });
  }

  /** Opens another Purchase Return page while preserving the applied filters. */
  function changePage(page: number): void {
    setAppliedFilters((filters) => ({ ...filters, page }));
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Purchase Returns</p>
          <h1>Purchase returns</h1>
          <p>View confirmed supplier returns by supplier and return date.</p>
        </div>
        <div className="form-actions">
          <Link className="primary-link" to="/returns/purchases/new">
            New purchase return
          </Link>
          <Link className="primary-link" to="/returns/sales">
            Sales returns
          </Link>
        </div>
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
            disabled={purchaseReturnsQuery.isFetching}
            label="Apply filters"
            onClick={applyFilters}
          />
          <Button
            disabled={purchaseReturnsQuery.isFetching}
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

        {purchaseReturnsQuery.isPending ? <p>Loading purchase returns...</p> : null}
        {purchaseReturnsQuery.isError ? (
          <p className="error-message">Could not load purchase returns.</p>
        ) : null}

        {result ? (
          <PurchaseReturnTable
            purchaseReturns={result.items}
            supplierNames={supplierNames}
          />
        ) : null}

        {result ? (
          <div className="pagination-row">
            <p>
              Page {result.page} of {totalPages} · {result.total} purchase returns
            </p>
            <div className="form-actions">
              <Button
                disabled={result.page <= 1 || purchaseReturnsQuery.isFetching}
                label="Previous"
                onClick={() => changePage(Math.max(1, result.page - 1))}
              />
              <Button
                disabled={
                  result.page >= totalPages || purchaseReturnsQuery.isFetching
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
