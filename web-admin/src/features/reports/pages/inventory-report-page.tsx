import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { formatMoney, trimDecimalZeros, formatQuantity } from "../../../lib/utils.ts";
import { useProducts } from "../../products/hooks/use-products.ts";
import type { InventoryReportFilters } from "../api/reports.api.ts";
import {
  ReportDateRangeFilter,
  type ReportDateRangeFilterValues,
} from "../components/report-filters.tsx";
import { useInventoryReport } from "../hooks/use-reports.ts";

/** Returns today's Asia/Karachi business date in the YYYY-MM-DD format required by the API. */
function today(): string {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Karachi",
    year: "numeric",
  }).formatToParts(new Date());

  const year = dateParts.find((part) => part.type === "year")?.value ?? "";
  const month = dateParts.find((part) => part.type === "month")?.value ?? "";
  const day = dateParts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

/** Returns the first day of the current Karachi business month in YYYY-MM-DD format. */
function firstDayOfCurrentMonth(): string {
  return `${today().slice(0, 7)}-01`;
}

const defaultDates: ReportDateRangeFilterValues = {
  startDate: firstDayOfCurrentMonth(),
  endDate: today(),
};

/** Converts the visible Inventory Report controls into the backend filter contract. */
function createInventoryFilters(
  dates: ReportDateRangeFilterValues,
  productId: string,
  lowStock: boolean,
): InventoryReportFilters {
  return {
    startDate: dates.startDate,
    endDate: dates.endDate,
    productId: productId || undefined,
    lowStock: lowStock || undefined,
  };
}

/** Formats an API timestamp for simple local display in the movement table. */
function formatMovementDate(value: string): string {
  return new Date(value).toLocaleString("en-PK", { timeZone: "Asia/Karachi" });
}

/** Converts an internal movement/source value into a readable report label. */
function reportLabel(value: string | null): string {
  if (!value) return "Manual";

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Links an inventory movement to its source document when a detail screen exists. */
function movementSource(sourceType: string | null, sourceId: string | null): React.JSX.Element | string {
  const label = reportLabel(sourceType);

  if (!sourceId || !sourceType) return label;

  switch (sourceType) {
    case "SALE":
      return <Link className="table-link" params={{ saleId: sourceId }} to="/sales/$saleId">{label}</Link>;
    case "PURCHASE":
      return <Link className="table-link" params={{ purchaseId: sourceId }} to="/purchases/$purchaseId">{label}</Link>;
    case "SALES_RETURN":
      return <Link className="table-link" params={{ salesReturnId: sourceId }} to="/returns/sales/$salesReturnId">{label}</Link>;
    case "PURCHASE_RETURN":
      return <Link className="table-link" params={{ purchaseReturnId: sourceId }} to="/returns/purchases/$purchaseReturnId">{label}</Link>;
    default:
      return label;
  }
}

/** Shows current stock and immutable inventory movements for the selected filters. */
export function InventoryReportPage(): React.JSX.Element {
  const [draftDates, setDraftDates] =
    useState<ReportDateRangeFilterValues>(defaultDates);
  const [draftProductId, setDraftProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const [draftLowStock, setDraftLowStock] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<InventoryReportFilters>(
    () => createInventoryFilters(defaultDates, "", false),
  );

  const productsQuery = useProducts({
    namePrefix: draftProductId ? undefined : productSearch || undefined,
    page: 1,
    pageSize: 100,
  });
  const inventoryReportQuery = useInventoryReport(appliedFilters);

  const products = productsQuery.data?.data.items ?? [];
  const report = inventoryReportQuery.data?.data;

  const productOptions = useMemo(
    () =>
      products
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name)),
    [products],
  );

  /** Updates the typed product-name prefix and clears any previous product selection. */
  function changeProductSearch(value: string): void {
    setProductSearch(value);
    setDraftProductId("");
    setProductMenuOpen(true);
  }

  /** Selects one product from the searchable Inventory Report dropdown. */
  function selectProduct(productId: string, label: string): void {
    setDraftProductId(productId);
    setProductSearch(label);
    setProductMenuOpen(false);
  }

  /** Clears the Inventory Report product filter selection. */
  function selectAllProducts(): void {
    setDraftProductId("");
    setProductSearch("");
    setProductMenuOpen(false);
  }

  /** Keeps the product dropdown keyboard behavior aligned with the other report dropdowns. */
  function handleProductKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
  ): void {
    if (event.key === "Escape") {
      setProductMenuOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setProductMenuOpen(true);
    }
  }

  /** Closes the product dropdown when focus leaves its combobox. */
  function handleProductBlur(event: React.FocusEvent<HTMLDivElement>): void {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setProductMenuOpen(false);
  }

  /** Applies the selected date range, product, and low-stock option. */
  function applyFilters(): void {
    setAppliedFilters(
      createInventoryFilters(draftDates, draftProductId, draftLowStock),
    );
  }

  /** Restores the current-month range and clears optional inventory filters. */
  function resetFilters(): void {
    const nextDates = {
      startDate: firstDayOfCurrentMonth(),
      endDate: today(),
    };

    setDraftDates(nextDates);
    setDraftProductId("");
    setProductSearch("");
    setProductMenuOpen(false);
    setDraftLowStock(false);
    setAppliedFilters(createInventoryFilters(nextDates, "", false));
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Inventory report</h1>
          <p>
            Review current stock balances and inventory movements for the selected
            date range.
          </p>
        </div>
      </div>

      <section className="management-card">
        <ReportDateRangeFilter
          disabled={inventoryReportQuery.isFetching}
          onApply={applyFilters}
          onChange={setDraftDates}
          onReset={resetFilters}
          values={draftDates}
        />

        <div className="payment-filter-grid">
          <div className="ui-field">
            <span>Product</span>
            <div
              className="sale-customer-combobox"
              onBlur={handleProductBlur}
            >
              <input
                aria-autocomplete="list"
                aria-expanded={productMenuOpen}
                aria-haspopup="listbox"
                autoComplete="off"
                disabled={inventoryReportQuery.isFetching}
                placeholder="All products"
                role="combobox"
                value={productSearch}
                onChange={(event) => changeProductSearch(event.target.value)}
                onClick={() => setProductMenuOpen(true)}
                onFocus={(event) => {
                  setProductMenuOpen(true);

                  if (draftProductId) {
                    event.currentTarget.select();
                  }
                }}
                onKeyDown={handleProductKeyDown}
              />

              {productMenuOpen ? (
                <div className="sale-customer-options" role="listbox">
                  <button
                    aria-selected={!draftProductId}
                    className="sale-customer-option"
                    onClick={selectAllProducts}
                    role="option"
                    type="button"
                  >
                    All products
                  </button>
                  {productOptions.map((product) => (
                    <button
                      aria-selected={draftProductId === product.id}
                      className="sale-customer-option"
                      key={product.id}
                      onClick={() =>
                        selectProduct(
                          product.id,
                          `${product.sku} - ${product.name}`,
                        )
                      }
                      role="option"
                      type="button"
                    >
                      {product.sku} - {product.name}
                    </button>
                  ))}
                  {productSearch &&
                  !productsQuery.isPending &&
                  productOptions.length === 0 ? (
                    <p className="sale-customer-empty">No products found.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <label className="ui-field">
            <span>Stock filter</span>
            <span>
              <input
                checked={draftLowStock}
                disabled={inventoryReportQuery.isFetching}
                onChange={(event) => setDraftLowStock(event.target.checked)}
                type="checkbox"
              />{" "}
              Low stock only
            </span>
          </label>
        </div>

        {productsQuery.isError ? (
          <p className="error-message">Product filter options could not be loaded.</p>
        ) : null}
      </section>

      <section className="management-card">
        {inventoryReportQuery.isPending ? <p>Loading inventory report...</p> : null}
        {inventoryReportQuery.isError ? (
          <p className="error-message">Could not load the inventory report.</p>
        ) : null}

        {report ? (
          <>
            <h2>Current stock</h2>
            <div className="table-scroll">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Brand</th>
                    <th>Unit</th>
                    <th>Sellable</th>
                    <th>Damaged</th>
                    <th>Expired</th>
                    <th>Reorder level</th>
                    <th>Sellable weighted cost</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.stock.map((row) => (
                    <tr key={row.productId}>
                      <td>
                        {row.productSku} - {row.productName}
                      </td>
                      <td>{row.categoryName}</td>
                      <td>{row.brandName ?? "-"}</td>
                      <td>{row.baseUnitName}</td>
                      <td>{formatQuantity(row.sellableQuantity)}</td>
                      <td>{formatQuantity(row.damagedQuantity)}</td>
                      <td>{formatQuantity(row.expiredQuantity)}</td>
                      <td>{row.reorderLevel}</td>
                      <td>{formatMoney(row.weightedAverageCost)}</td>
                      <td>{row.isLowStock ? "Low stock" : "In stock"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {report.stock.length === 0 ? (
              <p>No current stock matched these filters.</p>
            ) : null}

            <h2>Stock movements</h2>
            <div className="table-scroll">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>Date / time</th>
                    <th>Product</th>
                    <th>Movement</th>
                    <th>Condition</th>
                    <th>Direction</th>
                    <th>Quantity</th>
                    <th>Unit cost</th>
                    <th>Extra cost</th>
                    <th>Source</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {report.movements.map((row) => (
                    <tr key={row.movementId}>
                      <td>{formatMovementDate(row.occurredAt)}</td>
                      <td>
                        {row.productSku} - {row.productName}
                      </td>
                      <td>{reportLabel(row.movementType)}</td>
                      <td>{reportLabel(row.stockCondition)}</td>
                      <td>{reportLabel(row.direction)}</td>
                      <td>{formatQuantity(row.quantity)}</td>
                      <td>{formatMoney(row.unitCost)}</td>
                      <td>
                        {row.allocatedExtraCost === null
                          ? "-"
                          : `PKR ${trimDecimalZeros(row.allocatedExtraCost)}`}
                      </td>
                      <td>{movementSource(row.sourceType, row.sourceId)}</td>
                      <td>{row.reason ?? row.notes ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {report.movements.length === 0 ? (
              <p>No inventory movements matched this date range.</p>
            ) : null}
          </>
        ) : null}
      </section>
    </section>
  );
}
