import { useMemo, useState } from "react";

import { useProductCategories } from "../../products/hooks/use-products.ts";
import type { InventoryValuationReportFilters } from "../api/reports.api.ts";
import { useInventoryValuationReport } from "../hooks/use-reports.ts";

interface InventoryValuationFilterValues {
  search: string;
  categoryId: string;
  active: "ALL" | "ACTIVE" | "INACTIVE";
  pageSize: number;
}

const defaultFilters: InventoryValuationFilterValues = {
  search: "",
  categoryId: "",
  active: "ALL",
  pageSize: 20,
};

/** Converts visible filter controls into the Inventory Valuation API query. */
function createInventoryValuationFilters(
  values: InventoryValuationFilterValues,
  page: number,
): InventoryValuationReportFilters {
  return {
    search: values.search.trim() || undefined,
    categoryId: values.categoryId || undefined,
    active:
      values.active === "ALL" ? undefined : values.active === "ACTIVE",
    page,
    pageSize: values.pageSize,
  };
}

/** Shows current stock quantities and their weighted-average inventory value. */
export function InventoryValuationReportPage(): React.JSX.Element {
  const [draftFilters, setDraftFilters] =
    useState<InventoryValuationFilterValues>(defaultFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<InventoryValuationFilterValues>(defaultFilters);
  const [page, setPage] = useState(1);

  const categoriesQuery = useProductCategories();
  const reportQuery = useInventoryValuationReport(
    createInventoryValuationFilters(appliedFilters, page),
  );

  const categories = useMemo(
    () =>
      (categoriesQuery.data?.data ?? [])
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name)),
    [categoriesQuery.data?.data],
  );
  const report = reportQuery.data?.data;
  const totalPages = Math.max(
    1,
    Math.ceil(
      (report?.total ?? 0) / (report?.pageSize ?? appliedFilters.pageSize),
    ),
  );

  /** Applies the current filters and starts again from the first page. */
  function applyFilters(): void {
    setAppliedFilters(draftFilters);
    setPage(1);
  }

  /** Restores the default report filters. */
  function resetFilters(): void {
    setDraftFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setPage(1);
  }

  /** Moves to the previous report page. */
  function showPreviousPage(): void {
    setPage((currentPage) => Math.max(1, currentPage - 1));
  }

  /** Moves to the next report page. */
  function showNextPage(): void {
    setPage((currentPage) => Math.min(totalPages, currentPage + 1));
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Inventory valuation</h1>
          <p>
            Review current sellable, damaged, and expired stock value using the
            stored weighted-average cost.
          </p>
        </div>
      </div>

      <section className="management-card">
        <div className="payment-filter-grid">
          <label className="ui-field">
            <span>Search</span>
            <input
              disabled={reportQuery.isFetching}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              placeholder="SKU, product name, or barcode"
              type="search"
              value={draftFilters.search}
            />
          </label>

          <label className="ui-field">
            <span>Category</span>
            <select
              disabled={categoriesQuery.isPending || reportQuery.isFetching}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  categoryId: event.target.value,
                }))
              }
              value={draftFilters.categoryId}
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="ui-field">
            <span>Status</span>
            <select
              disabled={reportQuery.isFetching}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  active: event.target.value as InventoryValuationFilterValues["active"],
                }))
              }
              value={draftFilters.active}
            >
              <option value="ALL">All products</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </label>

          <label className="ui-field">
            <span>Rows per page</span>
            <select
              disabled={reportQuery.isFetching}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  pageSize: Number(event.target.value),
                }))
              }
              value={draftFilters.pageSize}
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
        </div>

        <div className="form-actions">
          <button
            className="primary-button"
            disabled={reportQuery.isFetching}
            onClick={applyFilters}
            type="button"
          >
            Apply filters
          </button>
          <button
            className="secondary-button"
            disabled={reportQuery.isFetching}
            onClick={resetFilters}
            type="button"
          >
            Reset
          </button>
        </div>

        {categoriesQuery.isError ? (
          <p className="error-message">Category filter options could not be loaded.</p>
        ) : null}
      </section>

      <section className="management-card">
        {reportQuery.isPending ? <p>Loading inventory valuation...</p> : null}
        {reportQuery.isError ? (
          <p className="error-message">Could not load the inventory valuation report.</p>
        ) : null}

        {report ? (
          <>
            <div className="summary-grid">
              <article className="summary-card">
                <span>Sellable value</span>
                <strong>PKR {report.totals.sellableValue}</strong>
              </article>
              <article className="summary-card">
                <span>Damaged value</span>
                <strong>PKR {report.totals.damagedValue}</strong>
              </article>
              <article className="summary-card">
                <span>Expired value</span>
                <strong>PKR {report.totals.expiredValue}</strong>
              </article>
              <article className="summary-card">
                <span>Total stock value</span>
                <strong>PKR {report.totals.totalValue}</strong>
              </article>
            </div>

            <div className="table-scroll">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Sellable</th>
                    <th>Damaged</th>
                    <th>Expired</th>
                    <th>Total qty</th>
                    <th>Weighted cost</th>
                    <th>Sellable value</th>
                    <th>Damaged value</th>
                    <th>Expired value</th>
                    <th>Total value</th>
                  </tr>
                </thead>
                <tbody>
                  {report.items.map((row) => (
                    <tr key={row.productId}>
                      <td>{row.productSku}</td>
                      <td>{row.productName}</td>
                      <td>{row.categoryName}</td>
                      <td>{row.isActive ? "Active" : "Inactive"}</td>
                      <td>{row.sellableQuantity}</td>
                      <td>{row.damagedQuantity}</td>
                      <td>{row.expiredQuantity}</td>
                      <td>{row.totalQuantity}</td>
                      <td>PKR {row.weightedAverageCost}</td>
                      <td>PKR {row.sellableValue}</td>
                      <td>PKR {row.damagedValue}</td>
                      <td>PKR {row.expiredValue}</td>
                      <td>PKR {row.totalValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {report.items.length === 0 ? (
              <p>No products matched the selected valuation filters.</p>
            ) : null}

            <div className="pagination-row">
              <p>
                Page {report.page} of {totalPages} · {report.total} products
              </p>
              <div className="form-actions">
                <button
                  className="secondary-button"
                  disabled={report.page <= 1 || reportQuery.isFetching}
                  onClick={showPreviousPage}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="secondary-button"
                  disabled={report.page >= totalPages || reportQuery.isFetching}
                  onClick={showNextPage}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : null}
      </section>
    </section>
  );
}
