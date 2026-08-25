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
  const [supplierSearch, setSupplierSearch] = useState("");
  const [selectedSupplierLabel, setSelectedSupplierLabel] = useState("");
  const [supplierMenuOpen, setSupplierMenuOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedFilters, setAppliedFilters] =
    useState<PurchaseReturnListFilters>({
      page: 1,
      pageSize,
    });

  const suppliersQuery = useSuppliers({ page: 1, pageSize: 100 });
  const supplierOptionsQuery = useSuppliers({
    namePrefix: supplierId ? undefined : supplierSearch || undefined,
    page: 1,
    pageSize: 100,
  });
  const purchaseReturnsQuery = usePurchaseReturns(appliedFilters);
  const suppliers = suppliersQuery.data?.data.items ?? [];
  const supplierOptions = supplierOptionsQuery.data?.data.items ?? [];
  const result = purchaseReturnsQuery.data?.data;
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  const supplierNames = useMemo(() => {
    const names = new Map(
      suppliers.map((supplier) => [
        supplier.id,
        `${supplier.code} - ${supplier.name}`,
      ]),
    );

    if (supplierId && selectedSupplierLabel) {
      names.set(supplierId, selectedSupplierLabel);
    }

    return names;
  }, [selectedSupplierLabel, supplierId, suppliers]);

  /** Updates the typed supplier-name prefix and clears any previous selection. */
  function changeSupplierSearch(value: string): void {
    setSupplierSearch(value);
    setSupplierId("");
    setSelectedSupplierLabel("");
    setSupplierMenuOpen(true);
  }

  /** Selects one supplier from the searchable dropdown. */
  function selectSupplier(supplierIdValue: string, label: string): void {
    setSupplierId(supplierIdValue);
    setSupplierSearch(label);
    setSelectedSupplierLabel(label);
    setSupplierMenuOpen(false);
  }

  /** Clears only the supplier selection while keeping the dropdown available. */
  function selectAllSuppliers(): void {
    setSupplierId("");
    setSupplierSearch("");
    setSelectedSupplierLabel("");
    setSupplierMenuOpen(false);
  }

  /** Handles the minimal keyboard behavior expected from the supplier combobox. */
  function handleSupplierKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
  ): void {
    if (event.key === "Escape") {
      setSupplierMenuOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSupplierMenuOpen(true);
    }
  }

  /** Closes the supplier dropdown only when focus leaves the whole combobox. */
  function handleSupplierBlur(event: React.FocusEvent<HTMLDivElement>): void {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setSupplierMenuOpen(false);
  }

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
    setSupplierSearch("");
    setSelectedSupplierLabel("");
    setSupplierMenuOpen(false);
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
          <div className="ui-field">
            <span>Supplier</span>
            <div
              className="purchase-supplier-combobox"
              onBlur={handleSupplierBlur}
            >
              <input
                aria-autocomplete="list"
                aria-expanded={supplierMenuOpen}
                aria-haspopup="listbox"
                autoComplete="off"
                disabled={suppliersQuery.isPending}
                placeholder="All suppliers"
                role="combobox"
                value={supplierSearch}
                onChange={(event) => changeSupplierSearch(event.target.value)}
                onClick={() => setSupplierMenuOpen(true)}
                onFocus={(event) => {
                  setSupplierMenuOpen(true);

                  if (supplierId) {
                    event.currentTarget.select();
                  }
                }}
                onKeyDown={handleSupplierKeyDown}
              />

              {supplierMenuOpen ? (
                <div className="purchase-supplier-options" role="listbox">
                  <button
                    className="purchase-supplier-option"
                    type="button"
                    onClick={selectAllSuppliers}
                  >
                    All suppliers
                  </button>

                  {supplierOptions.map((supplier) => {
                    const label = `${supplier.code} - ${supplier.name}`;

                    return (
                      <button
                        className="purchase-supplier-option"
                        aria-selected={supplier.id === supplierId}
                        key={supplier.id}
                        role="option"
                        type="button"
                        onClick={() => selectSupplier(supplier.id, label)}
                      >
                        {label}
                      </button>
                    );
                  })}

                  {supplierSearch &&
                  !supplierOptionsQuery.isPending &&
                  supplierOptions.length === 0 ? (
                    <p className="purchase-supplier-empty">No suppliers found.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

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
