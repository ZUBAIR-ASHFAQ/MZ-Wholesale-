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
  const [supplierSearch, setSupplierSearch] = useState("");
  const [selectedSupplierLabel, setSelectedSupplierLabel] = useState("");
  const [supplierMenuOpen, setSupplierMenuOpen] = useState(false);
  const [status, setStatus] = useState<PurchaseStatusFilter>("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<PurchaseListFilters>({
    page: 1,
    pageSize,
  });

  const suppliersQuery = useSuppliers({ page: 1, pageSize: 100 });
  const supplierOptionsQuery = useSuppliers({
    namePrefix: supplierId ? undefined : supplierSearch || undefined,
    page: 1,
    pageSize: 100,
  });
  const purchasesQuery = usePurchases(appliedFilters);
  const suppliers = suppliersQuery.data?.data.items ?? [];
  const supplierOptions = supplierOptionsQuery.data?.data.items ?? [];
  const result = purchasesQuery.data?.data;
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
    setSupplierSearch("");
    setSelectedSupplierLabel("");
    setSupplierMenuOpen(false);
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
