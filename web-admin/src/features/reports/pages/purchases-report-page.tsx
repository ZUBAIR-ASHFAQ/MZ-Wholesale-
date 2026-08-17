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
  const [draftProductId, setDraftProductId] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<PurchasesReportFilters>(
    () => createPurchasesFilters(defaultDates, "", ""),
  );

  const suppliersQuery = useSuppliers({ page: 1, pageSize: 100 });
  const productsQuery = useProducts({ page: 1, pageSize: 100 });
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
    setDraftProductId("");
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
          <label className="ui-field">
            <span>Supplier</span>
            <select
              disabled={suppliersQuery.isPending || purchasesReportQuery.isFetching}
              onChange={(event) => setDraftSupplierId(event.target.value)}
              value={draftSupplierId}
            >
              <option value="">All suppliers</option>
              {supplierOptions.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.code} - {supplier.name}
                </option>
              ))}
            </select>
          </label>

          <label className="ui-field">
            <span>Product</span>
            <select
              disabled={productsQuery.isPending || purchasesReportQuery.isFetching}
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
                <strong>PKR {report.totals.purchasesAmount}</strong>
              </article>
              <article className="summary-card">
                <span>Returns</span>
                <strong>PKR {report.totals.returnAmount}</strong>
              </article>
              <article className="summary-card">
                <span>Net purchases</span>
                <strong>PKR {report.totals.netPurchasesAmount}</strong>
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
                      <td>{row.quantity}</td>
                      <td>{row.baseQuantity}</td>
                      <td>{row.unitName}</td>
                      <td>PKR {row.unitCost}</td>
                      <td>PKR {row.amount}</td>
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
