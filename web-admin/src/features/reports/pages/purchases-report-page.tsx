import { trimDecimalZeros, formatQuantity } from "../../../lib/utils.ts";
import { useMemo, useState } from "react";

import { useProducts } from "../../products/hooks/use-products.ts";
import { useSuppliers } from "../../suppliers/hooks/use-suppliers.ts";
import type { PurchasesReportFilters } from "../api/reports.api.ts";
import {
  ReportDateRangeFilter,
  type ReportDateRangeFilterValues,
} from "../components/report-filters.tsx";
import { usePurchasesReport } from "../hooks/use-reports.ts";

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

/** Converts the visible Purchase Report controls into the backend filter contract. */
function createPurchasesFilters(
  dates: ReportDateRangeFilterValues,
  supplierId: string,
  productId: string,
): PurchasesReportFilters {
  return {
    startDate: dates.startDate,
    endDate: dates.endDate,
    supplierId: supplierId || undefined,
    productId: productId || undefined,
  };
}

/** Shows confirmed purchases and purchase returns for the selected report filters. */
export function PurchasesReportPage(): React.JSX.Element {
  const [draftDates, setDraftDates] =
    useState<ReportDateRangeFilterValues>(defaultDates);
  const [draftSupplierId, setDraftSupplierId] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierMenuOpen, setSupplierMenuOpen] = useState(false);
  const [draftProductId, setDraftProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<PurchasesReportFilters>(
    () => createPurchasesFilters(defaultDates, "", ""),
  );

  const suppliersQuery = useSuppliers({
    namePrefix: draftSupplierId ? undefined : supplierSearch || undefined,
    page: 1,
    pageSize: 100,
  });
  const productsQuery = useProducts({
    namePrefix: draftProductId ? undefined : productSearch || undefined,
    page: 1,
    pageSize: 100,
  });
  const purchasesReportQuery = usePurchasesReport(appliedFilters);

  const suppliers = suppliersQuery.data?.data.items ?? [];
  const products = productsQuery.data?.data.items ?? [];
  const report = purchasesReportQuery.data?.data;

  const supplierOptions = useMemo(
    () =>
      suppliers
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name)),
    [suppliers],
  );
  const productOptions = useMemo(
    () =>
      products
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name)),
    [products],
  );

  /** Updates the typed supplier-name prefix and clears any previous supplier selection. */
  function changeSupplierSearch(value: string): void {
    setSupplierSearch(value);
    setDraftSupplierId("");
    setSupplierMenuOpen(true);
  }

  /** Selects one supplier from the searchable report dropdown. */
  function selectSupplier(supplierId: string, label: string): void {
    setDraftSupplierId(supplierId);
    setSupplierSearch(label);
    setSupplierMenuOpen(false);
  }

  /** Clears the supplier report filter selection. */
  function selectAllSuppliers(): void {
    setDraftSupplierId("");
    setSupplierSearch("");
    setSupplierMenuOpen(false);
  }

  /** Keeps the supplier dropdown keyboard behavior aligned with the Sales Report. */
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

  /** Closes the supplier dropdown when focus leaves its combobox. */
  function handleSupplierBlur(event: React.FocusEvent<HTMLDivElement>): void {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setSupplierMenuOpen(false);
  }

  /** Updates the typed product-name prefix and clears any previous product selection. */
  function changeProductSearch(value: string): void {
    setProductSearch(value);
    setDraftProductId("");
    setProductMenuOpen(true);
  }

  /** Selects one product from the searchable report dropdown. */
  function selectProduct(productId: string, label: string): void {
    setDraftProductId(productId);
    setProductSearch(label);
    setProductMenuOpen(false);
  }

  /** Clears the product report filter selection. */
  function selectAllProducts(): void {
    setDraftProductId("");
    setProductSearch("");
    setProductMenuOpen(false);
  }

  /** Keeps the product dropdown keyboard behavior aligned with the Sales Report. */
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

  /** Applies the selected dates, supplier, and product to the report query. */
  function applyFilters(): void {
    setAppliedFilters(
      createPurchasesFilters(draftDates, draftSupplierId, draftProductId),
    );
  }

  /** Restores the current-month date range and clears optional entity filters. */
  function resetFilters(): void {
    const nextDates = {
      startDate: firstDayOfCurrentMonth(),
      endDate: today(),
    };

    setDraftDates(nextDates);
    setDraftSupplierId("");
    setSupplierSearch("");
    setSupplierMenuOpen(false);
    setDraftProductId("");
    setProductSearch("");
    setProductMenuOpen(false);
    setAppliedFilters(createPurchasesFilters(nextDates, "", ""));
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Purchase report</h1>
          <p>
            Review confirmed purchases and purchase returns by date, supplier,
            and product.
          </p>
        </div>
      </div>

      <section className="management-card">
        <ReportDateRangeFilter
          disabled={purchasesReportQuery.isFetching}
          onApply={applyFilters}
          onChange={setDraftDates}
          onReset={resetFilters}
          values={draftDates}
        />

        <div className="payment-filter-grid">
          <div className="ui-field">
            <span>Supplier</span>
            <div
              className="sale-customer-combobox"
              onBlur={handleSupplierBlur}
            >
              <input
                aria-autocomplete="list"
                aria-expanded={supplierMenuOpen}
                aria-haspopup="listbox"
                autoComplete="off"
                disabled={purchasesReportQuery.isFetching}
                placeholder="All suppliers"
                role="combobox"
                value={supplierSearch}
                onChange={(event) => changeSupplierSearch(event.target.value)}
                onClick={() => setSupplierMenuOpen(true)}
                onFocus={(event) => {
                  setSupplierMenuOpen(true);

                  if (draftSupplierId) {
                    event.currentTarget.select();
                  }
                }}
                onKeyDown={handleSupplierKeyDown}
              />

              {supplierMenuOpen ? (
                <div className="sale-customer-options" role="listbox">
                  <button
                    aria-selected={!draftSupplierId}
                    className="sale-customer-option"
                    onClick={selectAllSuppliers}
                    role="option"
                    type="button"
                  >
                    All suppliers
                  </button>
                  {supplierOptions.map((supplier) => (
                    <button
                      aria-selected={draftSupplierId === supplier.id}
                      className="sale-customer-option"
                      key={supplier.id}
                      onClick={() =>
                        selectSupplier(
                          supplier.id,
                          `${supplier.code} - ${supplier.name}`,
                        )
                      }
                      role="option"
                      type="button"
                    >
                      {supplier.code} - {supplier.name}
                    </button>
                  ))}
                  {supplierSearch &&
                  !suppliersQuery.isPending &&
                  supplierOptions.length === 0 ? (
                    <p className="sale-customer-empty">No suppliers found.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

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
                disabled={purchasesReportQuery.isFetching}
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
        </div>

        {suppliersQuery.isError ? (
          <p className="error-message">Supplier filter options could not be loaded.</p>
        ) : null}
        {productsQuery.isError ? (
          <p className="error-message">Product filter options could not be loaded.</p>
        ) : null}
      </section>

      <section className="management-card">
        {purchasesReportQuery.isPending ? <p>Loading purchase report...</p> : null}
        {purchasesReportQuery.isError ? (
          <p className="error-message">Could not load the purchase report.</p>
        ) : null}

        {report ? (
          <>
            <div className="summary-grid">
              <article className="summary-card">
                <span>Purchases</span>
                <strong>PKR {trimDecimalZeros(report.totals.purchasesAmount)}</strong>
              </article>
              <article className="summary-card">
                <span>Returns</span>
                <strong>PKR {trimDecimalZeros(report.totals.returnAmount)}</strong>
              </article>
              <article className="summary-card">
                <span>Net purchases</span>
                <strong>PKR {trimDecimalZeros(report.totals.netPurchasesAmount)}</strong>
              </article>
            </div>

            <div className="table-scroll">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Document</th>
                    <th>Supplier</th>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th>Base quantity</th>
                    <th>Unit</th>
                    <th>Unit cost</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={`${row.documentType}-${row.documentId}-${row.productId}`}>
                      <td>{row.documentDate}</td>
                      <td>{row.documentType === "PURCHASE" ? "Purchase" : "Return"}</td>
                      <td>{row.documentNumber}</td>
                      <td>{row.supplierName}</td>
                      <td>
                        {row.productSku} - {row.productName}
                      </td>
                      <td>{formatQuantity(row.quantity)}</td>
                      <td>{formatQuantity(row.baseQuantity)}</td>
                      <td>{row.unitName}</td>
                      <td>PKR {trimDecimalZeros(row.unitCost)}</td>
                      <td>PKR {trimDecimalZeros(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {report.rows.length === 0 ? (
              <p>No confirmed purchases or returns matched these filters.</p>
            ) : null}
          </>
        ) : null}
      </section>
    </section>
  );
}
