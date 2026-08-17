import { useMemo, useState } from "react";

import { useProducts } from "../../products/hooks/use-products.ts";
import type { ProductProfitReportFilters } from "../api/reports.api.ts";
import {
  ReportDateRangeFilter,
  type ReportDateRangeFilterValues,
} from "../components/report-filters.tsx";
import { useProductProfitReport } from "../hooks/use-reports.ts";

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

const defaultPageSize = 20;

/** Converts visible controls into the backend Product Profit filter contract. */
function createProductProfitFilters(
  dates: ReportDateRangeFilterValues,
  productId: string,
  page: number,
  pageSize: number,
): ProductProfitReportFilters {
  return {
    startDate: dates.startDate,
    endDate: dates.endDate,
    productId: productId || undefined,
    page,
    pageSize,
  };
}

/** Shows estimated profit grouped by product for the selected report filters. */
export function ProductProfitReportPage(): React.JSX.Element {
  const [draftDates, setDraftDates] =
    useState<ReportDateRangeFilterValues>(defaultDates);
  const [draftProductId, setDraftProductId] = useState("");
  const [draftPageSize, setDraftPageSize] = useState(defaultPageSize);
  const [appliedProductId, setAppliedProductId] = useState("");
  const [appliedPageSize, setAppliedPageSize] = useState(defaultPageSize);
  const [appliedDates, setAppliedDates] =
    useState<ReportDateRangeFilterValues>(defaultDates);
  const [page, setPage] = useState(1);

  const productsQuery = useProducts({ page: 1, pageSize: 100 });
  const reportQuery = useProductProfitReport(
    createProductProfitFilters(
      appliedDates,
      appliedProductId,
      page,
      appliedPageSize,
    ),
  );

  const products = productsQuery.data?.data.items ?? [];
  const report = reportQuery.data?.data;
  const totalPages = Math.max(
    1,
    Math.ceil((report?.total ?? 0) / (report?.pageSize ?? appliedPageSize)),
  );

  const productOptions = useMemo(
    () =>
      products
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name)),
    [products],
  );

  /** Applies dates, product, and page-size filters and returns to page one. */
  function applyFilters(): void {
    setAppliedDates(draftDates);
    setAppliedProductId(draftProductId);
    setAppliedPageSize(draftPageSize);
    setPage(1);
  }

  /** Restores the current-month date range and clears optional filters. */
  function resetFilters(): void {
    const nextDates = {
      startDate: firstDayOfCurrentMonth(),
      endDate: today(),
    };

    setDraftDates(nextDates);
    setDraftProductId("");
    setDraftPageSize(defaultPageSize);
    setAppliedDates(nextDates);
    setAppliedProductId("");
    setAppliedPageSize(defaultPageSize);
    setPage(1);
  }

  /** Keeps the requested page size inside the backend-supported range. */
  function changePageSize(event: React.ChangeEvent<HTMLInputElement>): void {
    const nextPageSize = Number(event.target.value);

    if (
      Number.isInteger(nextPageSize) &&
      nextPageSize >= 1 &&
      nextPageSize <= 100
    ) {
      setDraftPageSize(nextPageSize);
    }
  }

  /** Moves to the previous result page. */
  function showPreviousPage(): void {
    setPage((currentPage) => Math.max(1, currentPage - 1));
  }

  /** Moves to the next result page without passing the final page. */
  function showNextPage(): void {
    setPage((currentPage) => Math.min(totalPages, currentPage + 1));
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Product profit report</h1>
          <p>
            Review sales, returns, historical costs, and estimated profit by
            product.
          </p>
        </div>
      </div>

      <section className="management-card">
        <ReportDateRangeFilter
          disabled={reportQuery.isFetching}
          onApply={applyFilters}
          onChange={setDraftDates}
          onReset={resetFilters}
          values={draftDates}
        />

        <div className="payment-filter-grid">
          <label className="ui-field">
            <span>Product</span>
            <select
              disabled={productsQuery.isPending || reportQuery.isFetching}
              onChange={(event) => setDraftProductId(event.target.value)}
              value={draftProductId}
            >
              <option value="">All products</option>
              {productOptions.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku} - {product.name}
                </option>
              ))}
            </select>
          </label>

          <label className="ui-field">
            <span>Rows per page</span>
            <input
              disabled={reportQuery.isFetching}
              max={100}
              min={1}
              onChange={changePageSize}
              type="number"
              value={draftPageSize}
            />
          </label>
        </div>

        {productsQuery.isError ? (
          <p className="error-message">Product filter options could not be loaded.</p>
        ) : null}
      </section>

      <section className="management-card">
        {reportQuery.isPending ? <p>Loading product profit report...</p> : null}
        {reportQuery.isError ? (
          <p className="error-message">Could not load the product profit report.</p>
        ) : null}

        {report ? (
          <>
            <div className="table-scroll">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Product</th>
                    <th>Sold qty</th>
                    <th>Returned qty</th>
                    <th>Net qty</th>
                    <th>Sales</th>
                    <th>Returns</th>
                    <th>Net sales</th>
                    <th>COGS</th>
                    <th>Returned cost</th>
                    <th>Net cost</th>
                    <th>Estimated profit</th>
                  </tr>
                </thead>
                <tbody>
                  {report.items.map((row) => (
                    <tr key={row.productId}>
                      <td>{row.productSku}</td>
                      <td>{row.productName}</td>
                      <td>{row.soldBaseQuantity}</td>
                      <td>{row.returnedBaseQuantity}</td>
                      <td>{row.netBaseQuantity}</td>
                      <td>PKR {row.salesAmount}</td>
                      <td>PKR {row.returnAmount}</td>
                      <td>PKR {row.netSalesAmount}</td>
                      <td>PKR {row.costOfGoodsSoldAmount}</td>
                      <td>PKR {row.returnedCostAmount}</td>
                      <td>PKR {row.netCostAmount}</td>
                      <td>PKR {row.estimatedProfitAmount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {report.items.length === 0 ? (
              <p>No products matched these profit report filters.</p>
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
