import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Navigate,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";

import { useCurrentAdmin } from "../features/auth/hooks/use-auth.ts";
import { ChangePasswordPage } from "../features/auth/pages/change-password-page.tsx";
import { LoginPage } from "../features/auth/pages/login-page.tsx";
import { SessionsPage } from "../features/auth/pages/sessions-page.tsx";
import { BusinessSettingsPage } from "../features/business-settings/pages/business-settings-page.tsx";
import { CustomerDetailPage } from "../features/customers/pages/customer-detail-page.tsx";
import { CustomerFormPage } from "../features/customers/pages/customer-form-page.tsx";
import { CustomerListPage } from "../features/customers/pages/customer-list-page.tsx";
import { InventoryAdjustmentPage } from "../features/inventory/pages/inventory-adjustment-page.tsx";
import { InventoryListPage } from "../features/inventory/pages/inventory-list-page.tsx";
import { OpeningStockPage } from "../features/inventory/pages/opening-stock-page.tsx";
import { ProductMovementsPage } from "../features/inventory/pages/product-movements-page.tsx";
import { StockCountDetailPage } from "../features/inventory/pages/stock-count-detail-page.tsx";
import { StockCountFormPage } from "../features/inventory/pages/stock-count-form-page.tsx";
import { StockCountListPage } from "../features/inventory/pages/stock-count-list-page.tsx";
import { ExpenseCategoriesPage } from "../features/expenses/pages/expense-categories-page.tsx";
import { ExpenseDetailPage } from "../features/expenses/pages/expense-detail-page.tsx";
import { ExpenseFormPage } from "../features/expenses/pages/expense-form-page.tsx";
import { ExpenseListPage } from "../features/expenses/pages/expense-list-page.tsx";
import { CustomerOutstandingPage } from "../features/ledgers/pages/customer-outstanding-page.tsx";
import { CustomerStatementPage } from "../features/ledgers/pages/customer-statement-page.tsx";
import { SupplierPayablesPage } from "../features/ledgers/pages/supplier-payables-page.tsx";
import { SupplierStatementPage } from "../features/ledgers/pages/supplier-statement-page.tsx";
import { AccountsPage } from "../features/payments/pages/accounts-page.tsx";
import { CashBankMovementsPage } from "../features/payments/pages/cash-bank-movements-page.tsx";
import { CashReconciliationsPage } from "../features/payments/pages/cash-reconciliations-page.tsx";
import { DailyCashSummaryPage } from "../features/payments/pages/daily-cash-summary-page.tsx";
import { CustomerReceiptDetailPage } from "../features/payments/pages/customer-receipt-detail-page.tsx";
import { CustomerReceiptFormPage } from "../features/payments/pages/customer-receipt-form-page.tsx";
import { CustomerReceiptListPage } from "../features/payments/pages/customer-receipt-list-page.tsx";
import { SupplierPaymentDetailPage } from "../features/payments/pages/supplier-payment-detail-page.tsx";
import { SupplierPaymentFormPage } from "../features/payments/pages/supplier-payment-form-page.tsx";
import { SupplierPaymentListPage } from "../features/payments/pages/supplier-payment-list-page.tsx";
import { TransferDetailPage } from "../features/payments/pages/transfer-detail-page.tsx";
import { TransfersPage } from "../features/payments/pages/transfers-page.tsx";
import { SupplierDetailPage } from "../features/suppliers/pages/supplier-detail-page.tsx";
import { SupplierFormPage } from "../features/suppliers/pages/supplier-form-page.tsx";
import { SupplierListPage } from "../features/suppliers/pages/supplier-list-page.tsx";
import { ProductDetailPage } from "../features/products/pages/product-detail-page.tsx";
import { ProductFormPage } from "../features/products/pages/product-form-page.tsx";
import { ProductListPage } from "../features/products/pages/product-list-page.tsx";
import { ProductSettingsPage } from "../features/products/pages/product-settings-page.tsx";
import { PurchaseDetailPage } from "../features/purchases/pages/purchase-detail-page.tsx";
import { PurchaseFormPage } from "../features/purchases/pages/purchase-form-page.tsx";
import { PurchaseListPage } from "../features/purchases/pages/purchase-list-page.tsx";
import { SaleDetailPage } from "../features/sales/pages/sale-detail-page.tsx";
import { SaleFormPage } from "../features/sales/pages/sale-form-page.tsx";
import { SaleListPage } from "../features/sales/pages/sale-list-page.tsx";
import { SalesReturnListPage } from "../features/returns/pages/sales-return-list-page.tsx";
import { SalesReturnFormPage } from "../features/returns/pages/sales-return-form-page.tsx";
import { SalesReturnDetailPage } from "../features/returns/pages/sales-return-detail-page.tsx";
import { PurchaseReturnListPage } from "../features/returns/pages/purchase-return-list-page.tsx";
import { PurchaseReturnFormPage } from "../features/returns/pages/purchase-return-form-page.tsx";
import { PurchaseReturnDetailPage } from "../features/returns/pages/purchase-return-detail-page.tsx";
import { DashboardPage } from "../features/dashboard/pages/dashboard-page.tsx";
import { CashBankReportPage } from "../features/reports/pages/cash-bank-report-page.tsx";
import { CustomerAgingReportPage } from "../features/reports/pages/customer-aging-report-page.tsx";
import { CustomerOutstandingReportPage } from "../features/reports/pages/customer-outstanding-report-page.tsx";
import { ExpenseReportPage } from "../features/reports/pages/expense-report-page.tsx";
import { InventoryReportPage } from "../features/reports/pages/inventory-report-page.tsx";
import { InventoryValuationReportPage } from "../features/reports/pages/inventory-valuation-report-page.tsx";
import { ProductProfitReportPage } from "../features/reports/pages/product-profit-report-page.tsx";
import { ProfitSummaryReportPage } from "../features/reports/pages/profit-summary-report-page.tsx";
import { PurchasesReportPage } from "../features/reports/pages/purchases-report-page.tsx";
import { SalesReportPage } from "../features/reports/pages/sales-report-page.tsx";
import { SupplierAgingReportPage } from "../features/reports/pages/supplier-aging-report-page.tsx";
import { SupplierPayableReportPage } from "../features/reports/pages/supplier-payable-report-page.tsx";
import { AuditLogsPage } from "../features/system/pages/audit-logs-page.tsx";
import { ExportsPage } from "../features/system/pages/exports-page.tsx";
import { ImportsPage } from "../features/system/pages/imports-page.tsx";
import { AppLayout } from "./layouts/app-layout.tsx";
import { AuthLayout } from "./layouts/auth-layout.tsx";

/** Protects private pages and provides the correct layout for the current route. */
function RootRouteComponent(): React.JSX.Element {
  const currentAdmin = useCurrentAdmin();
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isLoginPage = currentPath === "/login";

  if (currentAdmin.isPending) {
    return <p className="page-status">Checking admin session...</p>;
  }

  const admin = currentAdmin.data?.data.admin;

  if (isLoginPage) {
    if (admin) {
      return <Navigate to="/dashboard" replace />;
    }

    return (
      <AuthLayout>
        <Outlet />
      </AuthLayout>
    );
  }

  if (!admin) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AppLayout admin={admin} currentPath={currentPath}>
      <Outlet />
    </AppLayout>
  );
}

/** Shows a simple message when no registered route matches the URL. */
function NotFoundPage(): React.JSX.Element {
  return (
    <section>
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p>The requested admin page does not exist.</p>
      <Link className="primary-link" to="/dashboard">
        Go to dashboard
      </Link>
    </section>
  );
}

/** Reads the Expense ID from the detail route. */
function ExpenseDetailRoutePage(): React.JSX.Element {
  const { expenseId } = expenseDetailRoute.useParams();
  return <ExpenseDetailPage expenseId={expenseId} />;
}

/** Reads the receipt ID from the customer receipt detail route. */
function CustomerReceiptDetailRoutePage(): React.JSX.Element {
  const { receiptId } = paymentCustomerReceiptDetailRoute.useParams();
  return <CustomerReceiptDetailPage receiptId={receiptId} />;
}

/** Reads the payment ID from the supplier payment detail route. */
function SupplierPaymentDetailRoutePage(): React.JSX.Element {
  const { paymentId } = paymentSupplierPaymentDetailRoute.useParams();
  return <SupplierPaymentDetailPage paymentId={paymentId} />;
}

/** Reads the transfer ID from the payment transfer detail route. */
function TransferDetailRoutePage(): React.JSX.Element {
  const { transferId } = paymentTransferDetailRoute.useParams();
  return <TransferDetailPage transferId={transferId} />;
}

/** Reads the customer ID from the ledger statement route. */
function CustomerStatementRoutePage(): React.JSX.Element {
  const { customerId } = customerStatementRoute.useParams();
  return <CustomerStatementPage customerId={customerId} />;
}

/** Reads the supplier ID from the ledger statement route. */
function SupplierStatementRoutePage(): React.JSX.Element {
  const { supplierId } = supplierStatementRoute.useParams();
  return <SupplierStatementPage supplierId={supplierId} />;
}

/** Reads the stock-count ID from the detail route. */
function StockCountDetailRoutePage(): React.JSX.Element {
  const { countId } = stockCountDetailRoute.useParams();
  return <StockCountDetailPage stockCountId={countId} />;
}

/** Reads the stock-count ID from the edit route. */
function StockCountEditRoutePage(): React.JSX.Element {
  const { countId } = stockCountEditRoute.useParams();
  return <StockCountFormPage stockCountId={countId} />;
}

/** Reads the product ID from the Inventory movement route. */
function ProductMovementsRoutePage(): React.JSX.Element {
  const { productId } = productMovementsRoute.useParams();
  return <ProductMovementsPage productId={productId} />;
}

/** Reads the supplier ID from the edit route and renders the shared form page. */
function SupplierEditRoutePage(): React.JSX.Element {
  const { supplierId } = supplierEditRoute.useParams();
  return <SupplierFormPage supplierId={supplierId} />;
}

/** Reads the supplier ID from the detail route and renders the profile page. */
function SupplierDetailRoutePage(): React.JSX.Element {
  const { supplierId } = supplierDetailRoute.useParams();
  return <SupplierDetailPage supplierId={supplierId} />;
}

/** Reads the customer ID from the detail route and renders the profile page. */
function CustomerDetailRoutePage(): React.JSX.Element {
  const { customerId } = customerDetailRoute.useParams();
  return <CustomerDetailPage customerId={customerId} />;
}

/** Reads the customer ID from the edit route and renders the shared form page. */
function CustomerEditRoutePage(): React.JSX.Element {
  const { customerId } = customerEditRoute.useParams();
  return <CustomerFormPage customerId={customerId} />;
}

/** Reads the product ID from the detail route and renders the detail page. */
function ProductDetailRoutePage(): React.JSX.Element {
  const { productId } = productDetailRoute.useParams();

  return <ProductDetailPage productId={productId} />;
}

/** Reads the product ID from the edit route and renders the shared form page. */
function ProductEditRoutePage(): React.JSX.Element {
  const { productId } = productEditRoute.useParams();

  return <ProductFormPage productId={productId} />;
}

const rootRoute = createRootRoute({
  component: RootRouteComponent,
  notFoundComponent: NotFoundPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <Navigate to="/dashboard" replace />,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

const changePasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/change-password",
  component: ChangePasswordPage,
});

const sessionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/security/sessions",
  component: SessionsPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: BusinessSettingsPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: DashboardPage,
});

const expensesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/expenses",
  component: ExpenseListPage,
});

const newExpenseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/expenses/new",
  component: ExpenseFormPage,
});

const expenseCategoriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/expenses/categories",
  component: ExpenseCategoriesPage,
});

const expenseDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/expenses/$expenseId",
  component: ExpenseDetailRoutePage,
});

const paymentAccountsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/payments/accounts",
  component: AccountsPage,
});

const paymentCustomerReceiptsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/payments/customer-receipts",
  component: CustomerReceiptListPage,
});

const paymentNewCustomerReceiptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/payments/customer-receipts/new",
  component: CustomerReceiptFormPage,
});

const paymentCustomerReceiptDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/payments/customer-receipts/$receiptId",
  component: CustomerReceiptDetailRoutePage,
});

const paymentSupplierPaymentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/payments/supplier-payments",
  component: SupplierPaymentListPage,
});

const paymentNewSupplierPaymentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/payments/supplier-payments/new",
  component: SupplierPaymentFormPage,
});

const paymentSupplierPaymentDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/payments/supplier-payments/$paymentId",
  component: SupplierPaymentDetailRoutePage,
});

const paymentMovementsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/payments/cash-bank-movements",
  component: CashBankMovementsPage,
});

const paymentCashReconciliationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/payments/cash-reconciliations",
  component: CashReconciliationsPage,
});

const paymentDailyCashSummaryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/payments/daily-cash-summary",
  component: DailyCashSummaryPage,
});

const paymentTransfersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/payments/transfers",
  component: TransfersPage,
});

const paymentTransferDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/payments/transfers/$transferId",
  component: TransferDetailRoutePage,
});

const customerOutstandingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ledgers/customer-outstanding",
  component: CustomerOutstandingPage,
});

const supplierPayablesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ledgers/supplier-payables",
  component: SupplierPayablesPage,
});

const customerStatementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ledgers/customers/$customerId",
  component: CustomerStatementRoutePage,
});

const supplierStatementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ledgers/suppliers/$supplierId",
  component: SupplierStatementRoutePage,
});

const inventoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inventory",
  component: InventoryListPage,
});

const openingStockRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inventory/opening-stock",
  component: OpeningStockPage,
});

const inventoryAdjustmentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inventory/adjustments",
  component: InventoryAdjustmentPage,
});

const stockCountsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inventory/counts",
  component: StockCountListPage,
});

const newStockCountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inventory/counts/new",
  component: StockCountFormPage,
});

const stockCountEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inventory/counts/$countId/edit",
  component: StockCountEditRoutePage,
});

const stockCountDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inventory/counts/$countId",
  component: StockCountDetailRoutePage,
});

const productMovementsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inventory/products/$productId/movements",
  component: ProductMovementsRoutePage,
});

const salesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sales",
  component: SaleListPage,
});

const newSaleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sales/new",
  component: SaleFormPage,
});

/** Reads the sale ID from the edit route and opens the reusable sale form. */
function SaleEditRoutePage(): React.JSX.Element {
  const { saleId } = saleEditRoute.useParams();
  return <SaleFormPage saleId={saleId} />;
}

const saleEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sales/$saleId/edit",
  component: SaleEditRoutePage,
});

/** Reads the sale ID from the detail route and opens the invoice view. */
function SaleDetailRoutePage(): React.JSX.Element {
  const { saleId } = saleDetailRoute.useParams();
  return <SaleDetailPage saleId={saleId} />;
}

const saleDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sales/$saleId",
  component: SaleDetailRoutePage,
});


const salesReturnsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/returns/sales",
  component: SalesReturnListPage,
});

const purchaseReturnsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/returns/purchases",
  component: PurchaseReturnListPage,
});

interface NewPurchaseReturnSearch {
  originalPurchaseId?: string;
}

/** Opens the Purchase Return form and preserves an optional source purchase selection. */
function NewPurchaseReturnRoutePage(): React.JSX.Element {
  const search = newPurchaseReturnRoute.useSearch();
  return <PurchaseReturnFormPage originalPurchaseId={search.originalPurchaseId} />;
}

const newPurchaseReturnRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/returns/purchases/new",
  validateSearch: (search: Record<string, unknown>): NewPurchaseReturnSearch => ({
    originalPurchaseId:
      typeof search.originalPurchaseId === "string"
        ? search.originalPurchaseId
        : undefined,
  }),
  component: NewPurchaseReturnRoutePage,
});

interface NewSalesReturnSearch {
  originalSaleId?: string;
}

/** Opens the Sales Return form and preserves an optional source sale selection. */
function NewSalesReturnRoutePage(): React.JSX.Element {
  const search = newSalesReturnRoute.useSearch();
  return <SalesReturnFormPage originalSaleId={search.originalSaleId} />;
}

const newSalesReturnRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/returns/sales/new",
  validateSearch: (search: Record<string, unknown>): NewSalesReturnSearch => ({
    originalSaleId:
      typeof search.originalSaleId === "string" ? search.originalSaleId : undefined,
  }),
  component: NewSalesReturnRoutePage,
});

/** Reads the Sales Return ID from the detail route and opens the print view. */
function SalesReturnDetailRoutePage(): React.JSX.Element {
  const { salesReturnId } = salesReturnDetailRoute.useParams();
  return <SalesReturnDetailPage salesReturnId={salesReturnId} />;
}

const salesReturnDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/returns/sales/$salesReturnId",
  component: SalesReturnDetailRoutePage,
});

/** Reads the Purchase Return ID from the detail route and opens the print view. */
function PurchaseReturnDetailRoutePage(): React.JSX.Element {
  const { purchaseReturnId } = purchaseReturnDetailRoute.useParams();
  return <PurchaseReturnDetailPage purchaseReturnId={purchaseReturnId} />;
}

const purchaseReturnDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/returns/purchases/$purchaseReturnId",
  component: PurchaseReturnDetailRoutePage,
});

const purchasesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/purchases",
  component: PurchaseListPage,
});

const newPurchaseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/purchases/new",
  component: PurchaseFormPage,
});

/** Loads the editable Purchase draft ID from the current route. */
function PurchaseEditRoutePage(): React.JSX.Element {
  const { purchaseId } = purchaseEditRoute.useParams();
  return <PurchaseFormPage purchaseId={purchaseId} />;
}

const purchaseEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/purchases/$purchaseId/edit",
  component: PurchaseEditRoutePage,
});

/** Loads the Purchase ID for the read-only detail route. */
function PurchaseDetailRoutePage(): React.JSX.Element {
  const { purchaseId } = purchaseDetailRoute.useParams();
  return <PurchaseDetailPage purchaseId={purchaseId} />;
}

const purchaseDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/purchases/$purchaseId",
  component: PurchaseDetailRoutePage,
});

const suppliersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/suppliers",
  component: SupplierListPage,
});

const newSupplierRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/suppliers/new",
  component: SupplierFormPage,
});

const supplierEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/suppliers/$supplierId/edit",
  component: SupplierEditRoutePage,
});

const supplierDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/suppliers/$supplierId",
  component: SupplierDetailRoutePage,
});

const customersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/customers",
  component: CustomerListPage,
});

const newCustomerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/customers/new",
  component: CustomerFormPage,
});

const customerEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/customers/$customerId/edit",
  component: CustomerEditRoutePage,
});

const customerDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/customers/$customerId",
  component: CustomerDetailRoutePage,
});


const salesReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reports/sales",
  component: SalesReportPage,
});

const purchasesReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reports/purchases",
  component: PurchasesReportPage,
});

const inventoryReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reports/inventory",
  component: InventoryReportPage,
});

const inventoryValuationReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reports/inventory-valuation",
  component: InventoryValuationReportPage,
});

const customerAgingReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reports/customers/aging",
  component: CustomerAgingReportPage,
});

const customerOutstandingReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reports/customers/outstanding",
  component: CustomerOutstandingReportPage,
});

const supplierAgingReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reports/suppliers/aging",
  component: SupplierAgingReportPage,
});

const supplierPayableReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reports/suppliers/payable",
  component: SupplierPayableReportPage,
});

const cashBankReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reports/cash-bank",
  component: CashBankReportPage,
});

const expenseReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reports/expenses",
  component: ExpenseReportPage,
});

const profitSummaryReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reports/profit-summary",
  component: ProfitSummaryReportPage,
});

const productProfitReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reports/product-profit",
  component: ProductProfitReportPage,
});

const systemImportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/system/imports",
  component: ImportsPage,
});

const systemAuditLogsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/system/audit-logs",
  component: AuditLogsPage,
});

const systemExportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/system/exports",
  component: ExportsPage,
});

const productsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/products",
  component: ProductListPage,
});

const newProductRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/products/new",
  component: ProductFormPage,
});

const productSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/product-settings",
  component: ProductSettingsPage,
});

const productEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/products/$productId/edit",
  component: ProductEditRoutePage,
});

const productDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/products/$productId",
  component: ProductDetailRoutePage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  changePasswordRoute,
  sessionsRoute,
  settingsRoute,
  dashboardRoute,
  expensesRoute,
  newExpenseRoute,
  expenseCategoriesRoute,
  expenseDetailRoute,
  paymentAccountsRoute,
  paymentCustomerReceiptsRoute,
  paymentNewCustomerReceiptRoute,
  paymentCustomerReceiptDetailRoute,
  paymentSupplierPaymentsRoute,
  paymentNewSupplierPaymentRoute,
  paymentSupplierPaymentDetailRoute,
  paymentMovementsRoute,
  paymentCashReconciliationsRoute,
  paymentDailyCashSummaryRoute,
  paymentTransfersRoute,
  paymentTransferDetailRoute,
  customerOutstandingRoute,
  supplierPayablesRoute,
  customerStatementRoute,
  supplierStatementRoute,
  inventoryRoute,
  openingStockRoute,
  inventoryAdjustmentRoute,
  stockCountsRoute,
  newStockCountRoute,
  stockCountEditRoute,
  stockCountDetailRoute,
  productMovementsRoute,
  salesReportRoute,
  purchasesReportRoute,
  inventoryReportRoute,
  inventoryValuationReportRoute,
  customerAgingReportRoute,
  customerOutstandingReportRoute,
  supplierAgingReportRoute,
  supplierPayableReportRoute,
  cashBankReportRoute,
  expenseReportRoute,
  profitSummaryReportRoute,
  productProfitReportRoute,
  systemImportsRoute,
  systemAuditLogsRoute,
  systemExportsRoute,
  salesRoute,
  newSaleRoute,
  saleEditRoute,
  saleDetailRoute,
  salesReturnsRoute,
  purchaseReturnsRoute,
  newPurchaseReturnRoute,
  newSalesReturnRoute,
  salesReturnDetailRoute,
  purchaseReturnDetailRoute,
  purchasesRoute,
  newPurchaseRoute,
  purchaseEditRoute,
  purchaseDetailRoute,
  suppliersRoute,
  newSupplierRoute,
  supplierEditRoute,
  supplierDetailRoute,
  customersRoute,
  newCustomerRoute,
  customerEditRoute,
  customerDetailRoute,
  productsRoute,
  newProductRoute,
  productSettingsRoute,
  productEditRoute,
  productDetailRoute,
]);

/** Stores the complete route tree used by the React application. */
export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
