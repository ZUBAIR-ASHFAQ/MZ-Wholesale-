import { trimDecimalZeros, formatQuantity } from "../../../lib/utils.ts";
import { useMemo, useState } from "react";

import { useCustomers } from "../../customers/hooks/use-customers.ts";
import { useProducts } from "../../products/hooks/use-products.ts";
import type { SalesReportFilters } from "../api/reports.api.ts";
import {
  ReportDateRangeFilter,
  type ReportDateRangeFilterValues,
} from "../components/report-filters.tsx";
import { useSalesReport } from "../hooks/use-reports.ts";

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

/** Converts the visible Sales Report controls into the backend filter contract. */
function createSalesFilters(
  dates: ReportDateRangeFilterValues,
  customerId: string,
  productId: string,
): SalesReportFilters {
  return {
    startDate: dates.startDate,
    endDate: dates.endDate,
    customerId: customerId || undefined,
    productId: productId || undefined,
  };
}

/** Shows confirmed sales and sales returns for the selected report filters. */
export function SalesReportPage(): React.JSX.Element {
  const [draftDates, setDraftDates] =
    useState<ReportDateRangeFilterValues>(defaultDates);
  const [draftCustomerId, setDraftCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerMenuOpen, setCustomerMenuOpen] = useState(false);
  const [draftProductId, setDraftProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<SalesReportFilters>(() =>
    createSalesFilters(defaultDates, "", ""),
  );

  const customersQuery = useCustomers({
    namePrefix: draftCustomerId ? undefined : customerSearch || undefined,
    page: 1,
    pageSize: 100,
  });
  const productsQuery = useProducts({
    namePrefix: draftProductId ? undefined : productSearch || undefined,
    page: 1,
    pageSize: 100,
  });
  const salesReportQuery = useSalesReport(appliedFilters);

  const customers = customersQuery.data?.data.items ?? [];
  const products = productsQuery.data?.data.items ?? [];
  const report = salesReportQuery.data?.data;

  const customerOptions = useMemo(
    () =>
      customers
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name)),
    [customers],
  );
  const productOptions = useMemo(
    () =>
      products
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name)),
    [products],
  );

  /** Updates the typed customer-name prefix and clears any previous customer selection. */
  function changeCustomerSearch(value: string): void {
    setCustomerSearch(value);
    setDraftCustomerId("");
    setCustomerMenuOpen(true);
  }

  /** Selects one customer from the searchable report dropdown. */
  function selectCustomer(customerId: string, label: string): void {
    setDraftCustomerId(customerId);
    setCustomerSearch(label);
    setCustomerMenuOpen(false);
  }

  /** Clears the customer report filter selection. */
  function selectAllCustomers(): void {
    setDraftCustomerId("");
    setCustomerSearch("");
    setCustomerMenuOpen(false);
  }

  /** Keeps the customer dropdown keyboard behavior aligned with the Sales list. */
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

  /** Closes the customer dropdown when focus leaves its combobox. */
  function handleCustomerBlur(event: React.FocusEvent<HTMLDivElement>): void {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setCustomerMenuOpen(false);
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

  /** Keeps the product dropdown keyboard behavior aligned with the Sales list. */
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

  /** Applies the selected dates, customer, and product to the report query. */
  function applyFilters(): void {
    setAppliedFilters(
      createSalesFilters(draftDates, draftCustomerId, draftProductId),
    );
  }

  /** Restores the current-month date range and clears optional entity filters. */
  function resetFilters(): void {
    const nextDates = {
      startDate: firstDayOfCurrentMonth(),
      endDate: today(),
    };

    setDraftDates(nextDates);
    setDraftCustomerId("");
    setCustomerSearch("");
    setCustomerMenuOpen(false);
    setDraftProductId("");
    setProductSearch("");
    setProductMenuOpen(false);
    setAppliedFilters(createSalesFilters(nextDates, "", ""));
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Sales report</h1>
          <p>
            Review confirmed sales and sales returns by date, customer, and
            product.
          </p>
        </div>
      </div>

      <section className="management-card">
        <ReportDateRangeFilter
          disabled={salesReportQuery.isFetching}
          onApply={applyFilters}
          onChange={setDraftDates}
          onReset={resetFilters}
          values={draftDates}
        />

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
                disabled={salesReportQuery.isFetching}
                placeholder="All customers"
                role="combobox"
                value={customerSearch}
                onChange={(event) => changeCustomerSearch(event.target.value)}
                onClick={() => setCustomerMenuOpen(true)}
                onFocus={(event) => {
                  setCustomerMenuOpen(true);

                  if (draftCustomerId) {
                    event.currentTarget.select();
                  }
                }}
                onKeyDown={handleCustomerKeyDown}
              />

              {customerMenuOpen ? (
                <div className="sale-customer-options" role="listbox">
                  <button
                    aria-selected={!draftCustomerId}
                    className="sale-customer-option"
                    onClick={selectAllCustomers}
                    role="option"
                    type="button"
                  >
                    All customers
                  </button>
                  {customerOptions.map((customer) => (
                    <button
                      aria-selected={draftCustomerId === customer.id}
                      className="sale-customer-option"
                      key={customer.id}
                      onClick={() =>
                        selectCustomer(
                          customer.id,
                          `${customer.code} - ${customer.name}`,
                        )
                      }
                      role="option"
                      type="button"
                    >
                      {customer.code} - {customer.name}
                    </button>
                  ))}
                  {customerSearch &&
                  !customersQuery.isPending &&
                  customerOptions.length === 0 ? (
                    <p className="sale-customer-empty">No customers found.</p>
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
                disabled={salesReportQuery.isFetching}
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

        {customersQuery.isError ? (
          <p className="error-message">Customer filter options could not be loaded.</p>
        ) : null}
        {productsQuery.isError ? (
          <p className="error-message">Product filter options could not be loaded.</p>
        ) : null}
      </section>

      <section className="management-card">
        {salesReportQuery.isPending ? <p>Loading sales report...</p> : null}
        {salesReportQuery.isError ? (
          <p className="error-message">Could not load the sales report.</p>
        ) : null}

        {report ? (
          <>
            <div className="summary-grid">
              <article className="summary-card">
                <span>Sales</span>
                <strong>PKR {trimDecimalZeros(report.totals.salesAmount)}</strong>
              </article>
              <article className="summary-card">
                <span>Returns</span>
                <strong>PKR {trimDecimalZeros(report.totals.returnAmount)}</strong>
              </article>
              <article className="summary-card">
                <span>Net sales</span>
                <strong>PKR {trimDecimalZeros(report.totals.netSalesAmount)}</strong>
              </article>
            </div>

            <div className="table-scroll">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Document</th>
                    <th>Customer</th>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th>Base quantity</th>
                    <th>Unit</th>
                    <th>Unit price</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={`${row.documentType}-${row.documentId}-${row.productId}`}>
                      <td>{row.documentDate}</td>
                      <td>{row.documentType === "SALE" ? "Sale" : "Return"}</td>
                      <td>{row.documentNumber}</td>
                      <td>{row.customerName}</td>
                      <td>
                        {row.productSku} - {row.productName}
                      </td>
                      <td>{formatQuantity(row.quantity)}</td>
                      <td>{formatQuantity(row.baseQuantity)}</td>
                      <td>{row.unitName}</td>
                      <td>PKR {trimDecimalZeros(row.unitPrice)}</td>
                      <td>PKR {trimDecimalZeros(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {report.rows.length === 0 ? (
              <p>No confirmed sales or returns matched these filters.</p>
            ) : null}
          </>
        ) : null}
      </section>
    </section>
  );
}
