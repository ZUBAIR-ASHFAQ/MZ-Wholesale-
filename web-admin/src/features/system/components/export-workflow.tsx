import { useMemo, useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { useCustomers } from "../../customers/hooks/use-customers.ts";
import { useExpenseCategories } from "../../expenses/hooks/use-expenses.ts";
import { usePaymentAccounts } from "../../payments/hooks/use-payments.ts";
import { useProducts } from "../../products/hooks/use-products.ts";
import { useSuppliers } from "../../suppliers/hooks/use-suppliers.ts";
import type {
  SystemExportFilters,
  SystemExportFormat,
  SystemExportType,
} from "../api/system.api.ts";
import { useDownloadSystemExport } from "../hooks/use-system.ts";

interface ExportOption {
  value: SystemExportType;
  label: string;
}

const exportOptions: ExportOption[] = [
  { value: "sales", label: "Sales report" },
  { value: "purchases", label: "Purchases report" },
  { value: "inventory", label: "Inventory report" },
  { value: "customer-outstanding", label: "Customer outstanding" },
  { value: "supplier-payable", label: "Supplier payable" },
  { value: "cash-bank", label: "Cash and bank report" },
  { value: "expenses", label: "Expense report" },
  { value: "profit-summary", label: "Profit summary" },
  { value: "product-profit", label: "Product profit" },
];

/** Returns today's Asia/Karachi business date in YYYY-MM-DD format. */
function today(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Karachi",
    year: "numeric",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

/** Returns the first day of the current Karachi business month. */
function firstDayOfCurrentMonth(): string {
  return `${today().slice(0, 7)}-01`;
}

/** Starts a browser download for the file returned by the authenticated API client. */
function saveDownloadedFile(blob: Blob, fileName: string | null, fallbackName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName ?? fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Returns true when the selected export requires a date range. */
function usesDateRange(type: SystemExportType): boolean {
  return !["customer-outstanding", "supplier-payable"].includes(type);
}

/** Renders simple type-specific filters and downloads CSV, Excel, or PDF exports. */
export function ExportWorkflow(): React.JSX.Element {
  const [type, setType] = useState<SystemExportType>("sales");
  const [format, setFormat] = useState<SystemExportFormat>("csv");
  const [startDate, setStartDate] = useState(firstDayOfCurrentMonth());
  const [endDate, setEndDate] = useState(today());
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [productId, setProductId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [lowStock, setLowStock] = useState(false);

  const customersQuery = useCustomers({ page: 1, pageSize: 100 });
  const suppliersQuery = useSuppliers({ page: 1, pageSize: 100 });
  const productsQuery = useProducts({ page: 1, pageSize: 100 });
  const accountsQuery = usePaymentAccounts();
  const expenseCategoriesQuery = useExpenseCategories();
  const downloadMutation = useDownloadSystemExport();

  const customers = customersQuery.data?.data.items ?? [];
  const suppliers = suppliersQuery.data?.data.items ?? [];
  const products = productsQuery.data?.data.items ?? [];
  const accounts = accountsQuery.data?.data;
  const expenseCategories = expenseCategoriesQuery.data?.data ?? [];

  const accountOptions = useMemo(
    () => [
      ...(accounts?.cashAccounts.map((account) => ({
        id: account.id,
        label: `Cash - ${account.name}`,
      })) ?? []),
      ...(accounts?.bankAccounts.map((account) => ({
        id: account.id,
        label: `Bank - ${account.bankName} - ${account.accountName}`,
      })) ?? []),
    ],
    [accounts],
  );

  /** Clears filters that do not belong to the newly selected report type. */
  function changeType(nextType: SystemExportType): void {
    setType(nextType);
    setSearch("");
    setCustomerId("");
    setSupplierId("");
    setProductId("");
    setCategoryId("");
    setAccountId("");
    setLowStock(false);
  }

  /** Converts the visible controls into only the filters supported by the selected report. */
  function buildFilters(): SystemExportFilters {
    const filters: SystemExportFilters = { format };

    if (usesDateRange(type)) {
      filters.startDate = startDate;
      filters.endDate = endDate;
    }

    if (type === "sales") {
      filters.customerId = customerId || undefined;
      filters.productId = productId || undefined;
    }

    if (type === "purchases") {
      filters.supplierId = supplierId || undefined;
      filters.productId = productId || undefined;
    }

    if (type === "inventory") {
      filters.productId = productId || undefined;
      filters.lowStock = lowStock || undefined;
    }

    if (type === "customer-outstanding" || type === "supplier-payable") {
      filters.search = search.trim() || undefined;
    }

    if (type === "cash-bank") {
      filters.accountId = accountId || undefined;
    }

    if (type === "expenses") {
      filters.categoryId = categoryId || undefined;
    }

    if (type === "product-profit") {
      filters.productId = productId || undefined;
    }

    return filters;
  }

  /** Requests the selected export and saves the returned file in the browser. */
  async function downloadExport(): Promise<void> {
    const result = await downloadMutation.mutateAsync({
      type,
      filters: buildFilters(),
    });
    saveDownloadedFile(result.blob, result.fileName, `${type}.${format}`);
  }

  return (
    <section className="management-card system-export-workflow">
      <div className="system-export-grid">
        <label className="ui-field">
          <span>Export</span>
          <select
            disabled={downloadMutation.isPending}
            onChange={(event) => changeType(event.target.value as SystemExportType)}
            value={type}
          >
            {exportOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="ui-field">
          <span>File format</span>
          <select
            disabled={downloadMutation.isPending}
            onChange={(event) => setFormat(event.target.value as SystemExportFormat)}
            value={format}
          >
            <option value="csv">CSV</option>
            <option value="xlsx">Excel</option>
            <option value="pdf">PDF</option>
          </select>
        </label>

        {usesDateRange(type) ? (
          <>
            <label className="ui-field">
              <span>Start date</span>
              <input
                disabled={downloadMutation.isPending}
                onChange={(event) => setStartDate(event.target.value)}
                type="date"
                value={startDate}
              />
            </label>
            <label className="ui-field">
              <span>End date</span>
              <input
                disabled={downloadMutation.isPending}
                onChange={(event) => setEndDate(event.target.value)}
                type="date"
                value={endDate}
              />
            </label>
          </>
        ) : null}

        {type === "sales" ? (
          <label className="ui-field">
            <span>Customer</span>
            <select
              disabled={customersQuery.isPending || downloadMutation.isPending}
              onChange={(event) => setCustomerId(event.target.value)}
              value={customerId}
            >
              <option value="">All customers</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.code} - {customer.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {type === "purchases" ? (
          <label className="ui-field">
            <span>Supplier</span>
            <select
              disabled={suppliersQuery.isPending || downloadMutation.isPending}
              onChange={(event) => setSupplierId(event.target.value)}
              value={supplierId}
            >
              <option value="">All suppliers</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.code} - {supplier.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {["sales", "purchases", "inventory", "product-profit"].includes(type) ? (
          <label className="ui-field">
            <span>Product</span>
            <select
              disabled={productsQuery.isPending || downloadMutation.isPending}
              onChange={(event) => setProductId(event.target.value)}
              value={productId}
            >
              <option value="">All products</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku} - {product.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {type === "customer-outstanding" || type === "supplier-payable" ? (
          <label className="ui-field system-export-search-field">
            <span>Search</span>
            <input
              disabled={downloadMutation.isPending}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={type === "customer-outstanding" ? "Customer code or name" : "Supplier code or name"}
              type="search"
              value={search}
            />
          </label>
        ) : null}

        {type === "cash-bank" ? (
          <label className="ui-field">
            <span>Account</span>
            <select
              disabled={accountsQuery.isPending || downloadMutation.isPending}
              onChange={(event) => setAccountId(event.target.value)}
              value={accountId}
            >
              <option value="">All accounts</option>
              {accountOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {type === "expenses" ? (
          <label className="ui-field">
            <span>Expense category</span>
            <select
              disabled={expenseCategoriesQuery.isPending || downloadMutation.isPending}
              onChange={(event) => setCategoryId(event.target.value)}
              value={categoryId}
            >
              <option value="">All categories</option>
              {expenseCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {type === "inventory" ? (
          <label className="system-export-checkbox">
            <input
              checked={lowStock}
              disabled={downloadMutation.isPending}
              onChange={(event) => setLowStock(event.target.checked)}
              type="checkbox"
            />
            <span>Low-stock products only</span>
          </label>
        ) : null}
      </div>

      <div className="form-actions system-export-actions">
        <Button
          disabled={downloadMutation.isPending}
          label={downloadMutation.isPending ? "Preparing export..." : `Download ${format.toUpperCase()}`}
          onClick={() => void downloadExport()}
        />
      </div>

      {downloadMutation.isError ? (
        <p className="error-message">
          Export could not be generated. Check the selected filters and try again.
        </p>
      ) : null}

      {customersQuery.isError || suppliersQuery.isError || productsQuery.isError || accountsQuery.isError || expenseCategoriesQuery.isError ? (
        <p className="error-message">
          Some optional filter choices could not be loaded. You can still use export types that do not depend on those choices.
        </p>
      ) : null}
    </section>
  );
}
