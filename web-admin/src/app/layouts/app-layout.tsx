import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Button } from "../../components/ui/button.tsx";
import type { AdminProfile } from "../../features/auth/api/auth.api.ts";
import { useLogoutAdmin } from "../../features/auth/hooks/use-auth.ts";

interface AppLayoutProps {
  admin: AdminProfile;
  children: ReactNode;
  currentPath: string;
}

/** Returns the active class when the current page belongs to the link. */
function linkClass(isActive: boolean): string | undefined {
  return isActive ? "active" : undefined;
}

/** Returns the live ERP section shown in the compact top bar. */
function sectionTitle(currentPath: string): string {
  if (currentPath === "/dashboard") return "Business overview";
  if (currentPath.startsWith("/sales")) return "Counter sales";
  if (currentPath.startsWith("/purchases")) return "Purchases";
  if (currentPath.startsWith("/inventory")) return "Inventory";
  if (currentPath.startsWith("/products") || currentPath === "/product-settings") return "Products";
  if (currentPath.startsWith("/customers")) return "Customers";
  if (currentPath.startsWith("/suppliers")) return "Suppliers";
  if (currentPath.startsWith("/employees")) return "Employees";
  if (currentPath.startsWith("/ledgers")) return "Ledgers";
  if (currentPath.startsWith("/payments")) return "Payments, cash and bank";
  if (currentPath.startsWith("/returns")) return "Returns";
  if (currentPath.startsWith("/expenses")) return "Expenses";
  if (currentPath.startsWith("/reports")) return "Reports";
  if (currentPath.startsWith("/system")) return "System tools";
  if (currentPath === "/settings") return "Business settings";
  if (currentPath.startsWith("/security") || currentPath === "/change-password") return "Account security";
  return "Wholesale operations";
}

/** Builds a small deterministic avatar label without adding another dependency. */
function adminInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return "A";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

/** Renders the private admin navigation around authenticated feature pages. */
export function AppLayout({
  admin,
  children,
  currentPath,
}: AppLayoutProps): React.JSX.Element {
  const logout = useLogoutAdmin();
  const dashboardActive = currentPath === "/dashboard";
  const productsActive = currentPath.startsWith("/products") || currentPath === "/product-settings";
  const customerReceiptsActive = currentPath.startsWith("/payments/customer-receipts");
  const customersActive = currentPath.startsWith("/customers") || customerReceiptsActive;
  const supplierPaymentsActive = currentPath.startsWith("/payments/supplier-payments");
  const suppliersActive = currentPath.startsWith("/suppliers") || supplierPaymentsActive;
  const employeesActive = currentPath.startsWith("/employees");
  const inventoryActive = currentPath.startsWith("/inventory");
  const ledgersActive = currentPath.startsWith("/ledgers");
  const paymentsActive = currentPath.startsWith("/payments") && !supplierPaymentsActive && !customerReceiptsActive;
  const purchasesActive = currentPath.startsWith("/purchases");
  const salesActive = currentPath.startsWith("/sales");
  const returnsActive = currentPath.startsWith("/returns");
  const expensesActive = currentPath.startsWith("/expenses");
  const reportsActive = currentPath.startsWith("/reports");
  const systemActive = currentPath.startsWith("/system");
  const securityActive = currentPath.startsWith("/security") || currentPath === "/change-password";

  /** Requests session revocation when the administrator signs out. */
  function handleLogout(): void {
    logout.mutate();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark" aria-hidden="true">W</div>
          <div className="sidebar-brand-copy">
            <strong>Wholesale ERP</strong>
            <span>Counter administration</span>
          </div>
        </div>

        <Link className="sidebar-quick-sale" to="/sales/new">
          <span aria-hidden="true">+</span>
          New counter sale
        </Link>

        <nav aria-label="Primary navigation">
          <div className="sidebar-nav-section">
            <span className="sidebar-nav-heading">Operations</span>
            <Link className={linkClass(dashboardActive)} to="/dashboard">
              Dashboard
            </Link>

            <details className="sidebar-nav-group" open={salesActive}>
              <summary className={salesActive ? "sidebar-nav-trigger active" : "sidebar-nav-trigger"}>
                Sales
              </summary>
              <div className="sidebar-subnav">
                <Link className={linkClass(currentPath === "/sales")} to="/sales">
                  Sales list
                </Link>
                <Link className={linkClass(currentPath === "/sales/new")} to="/sales/new">
                  New sale
                </Link>
              </div>
            </details>

            <details className="sidebar-nav-group" open={purchasesActive}>
              <summary className={purchasesActive ? "sidebar-nav-trigger active" : "sidebar-nav-trigger"}>
                Purchases
              </summary>
              <div className="sidebar-subnav">
                <Link className={linkClass(currentPath === "/purchases")} to="/purchases">
                  Purchase list
                </Link>
                <Link className={linkClass(currentPath === "/purchases/new")} to="/purchases/new">
                  New purchase
                </Link>
              </div>
            </details>

            <details className="sidebar-nav-group" open={inventoryActive}>
              <summary className={inventoryActive ? "sidebar-nav-trigger active" : "sidebar-nav-trigger"}>
                Inventory
              </summary>
              <div className="sidebar-subnav">
                <Link className={linkClass(currentPath === "/inventory")} to="/inventory">
                  Stock overview
                </Link>
                <Link className={linkClass(currentPath === "/inventory/opening-stock")} to="/inventory/opening-stock">
                  Opening stock
                </Link>
                <Link className={linkClass(currentPath === "/inventory/adjustments")} to="/inventory/adjustments">
                  Stock adjustments
                </Link>
                <Link className={linkClass(currentPath === "/inventory/counts")} to="/inventory/counts">
                  Stock counts
                </Link>
                <Link className={linkClass(currentPath === "/inventory/counts/new")} to="/inventory/counts/new">
                  New stock count
                </Link>
              </div>
            </details>
          </div>

          <div className="sidebar-nav-section">
            <span className="sidebar-nav-heading">Master data</span>
            <details className="sidebar-nav-group" open={productsActive}>
              <summary className={productsActive ? "sidebar-nav-trigger active" : "sidebar-nav-trigger"}>
                Products
              </summary>
              <div className="sidebar-subnav">
                <Link className={linkClass(currentPath === "/products")} to="/products">
                  Product list
                </Link>
                <Link className={linkClass(currentPath === "/products/new")} to="/products/new">
                  New product
                </Link>
                <Link className={linkClass(currentPath === "/product-settings")} to="/product-settings">
                  Categories and brands
                </Link>
              </div>
            </details>

            <details className="sidebar-nav-group" open={customersActive}>
              <summary className={customersActive ? "sidebar-nav-trigger active" : "sidebar-nav-trigger"}>
                Customers
              </summary>
              <div className="sidebar-subnav">
                <Link className={linkClass(currentPath === "/customers")} to="/customers">
                  Customer list
                </Link>
                <Link className={linkClass(currentPath === "/customers/new")} to="/customers/new">
                  New customer
                </Link>
                <Link className={linkClass(currentPath === "/payments/customer-receipts")} to="/payments/customer-receipts">
                  Customer receipts
                </Link>
                <Link className={linkClass(currentPath === "/payments/customer-receipts/new")} to="/payments/customer-receipts/new">
                  New customer receipt
                </Link>
              </div>
            </details>

            <details className="sidebar-nav-group" open={suppliersActive}>
              <summary className={suppliersActive ? "sidebar-nav-trigger active" : "sidebar-nav-trigger"}>
                Suppliers
              </summary>
              <div className="sidebar-subnav">
                <Link className={linkClass(currentPath === "/suppliers")} to="/suppliers">
                  Supplier list
                </Link>
                <Link className={linkClass(currentPath === "/suppliers/new")} to="/suppliers/new">
                  New supplier
                </Link>
                <Link className={linkClass(currentPath === "/payments/supplier-payments")} to="/payments/supplier-payments">
                  Supplier payments
                </Link>
                <Link className={linkClass(currentPath === "/payments/supplier-payments/new")} to="/payments/supplier-payments/new">
                  New supplier payment
                </Link>
              </div>
            </details>

            <details className="sidebar-nav-group" open={employeesActive}>
              <summary className={employeesActive ? "sidebar-nav-trigger active" : "sidebar-nav-trigger"}>
                Employees
              </summary>
              <div className="sidebar-subnav">
                <Link className={linkClass(currentPath === "/employees")} to="/employees">
                  Employee list
                </Link>
                <Link className={linkClass(currentPath === "/employees/attendance")} to="/employees/attendance">
                  Attendance
                </Link>
              </div>
            </details>
          </div>

          <div className="sidebar-nav-section">
            <span className="sidebar-nav-heading">Money</span>
            <details className="sidebar-nav-group" open={ledgersActive}>
              <summary className={ledgersActive ? "sidebar-nav-trigger active" : "sidebar-nav-trigger"}>
                Ledgers
              </summary>
              <div className="sidebar-subnav">
                <Link className={linkClass(currentPath === "/ledgers/customer-outstanding")} to="/ledgers/customer-outstanding">
                  Customer outstanding
                </Link>
                <Link className={linkClass(currentPath === "/ledgers/supplier-payables")} to="/ledgers/supplier-payables">
                  Supplier payables
                </Link>
              </div>
            </details>

            <details className="sidebar-nav-group" open={paymentsActive}>
              <summary className={paymentsActive ? "sidebar-nav-trigger active" : "sidebar-nav-trigger"}>
                Payments
              </summary>
              <div className="sidebar-subnav">
                <Link className={linkClass(currentPath === "/payments/accounts")} to="/payments/accounts">
                  Accounts
                </Link>
                <Link className={linkClass(currentPath === "/payments/transfers")} to="/payments/transfers">
                  Transfers
                </Link>
                <Link className={linkClass(currentPath === "/payments/cash-bank-movements")} to="/payments/cash-bank-movements">
                  Cash / bank movements
                </Link>
                <Link className={linkClass(currentPath === "/payments/cash-reconciliations")} to="/payments/cash-reconciliations">
                  Cash reconciliation
                </Link>
                <Link className={linkClass(currentPath === "/payments/daily-cash-summary")} to="/payments/daily-cash-summary">
                  Daily cash summary
                </Link>
              </div>
            </details>

            <details className="sidebar-nav-group" open={returnsActive}>
              <summary className={returnsActive ? "sidebar-nav-trigger active" : "sidebar-nav-trigger"}>
                Returns
              </summary>
              <div className="sidebar-subnav">
                <Link className={linkClass(currentPath === "/returns/sales")} to="/returns/sales">
                  Sales returns
                </Link>
                <Link className={linkClass(currentPath === "/returns/sales/new")} to="/returns/sales/new">
                  New sales return
                </Link>
                <Link className={linkClass(currentPath === "/returns/purchases")} to="/returns/purchases">
                  Purchase returns
                </Link>
                <Link className={linkClass(currentPath === "/returns/purchases/new")} to="/returns/purchases/new">
                  New purchase return
                </Link>
              </div>
            </details>

            <details className="sidebar-nav-group" open={expensesActive}>
              <summary className={expensesActive ? "sidebar-nav-trigger active" : "sidebar-nav-trigger"}>
                Expenses
              </summary>
              <div className="sidebar-subnav">
                <Link className={linkClass(currentPath === "/expenses")} to="/expenses">
                  Expense list
                </Link>
                <Link className={linkClass(currentPath === "/expenses/new")} to="/expenses/new">
                  New expense
                </Link>
                <Link className={linkClass(currentPath === "/expenses/categories")} to="/expenses/categories">
                  Expense categories
                </Link>
              </div>
            </details>
          </div>

          <div className="sidebar-nav-section">
            <span className="sidebar-nav-heading">Owner view</span>
            <details className="sidebar-nav-group" open={reportsActive}>
              <summary className={reportsActive ? "sidebar-nav-trigger active" : "sidebar-nav-trigger"}>
                Reports
              </summary>
              <div className="sidebar-subnav">
                <Link className={linkClass(currentPath === "/reports/sales")} to="/reports/sales">
                  Sales report
                </Link>
                <Link className={linkClass(currentPath === "/reports/purchases")} to="/reports/purchases">
                  Purchase report
                </Link>
                <Link className={linkClass(currentPath === "/reports/inventory")} to="/reports/inventory">
                  Inventory report
                </Link>
                <Link className={linkClass(currentPath === "/reports/inventory-valuation")} to="/reports/inventory-valuation">
                  Inventory valuation
                </Link>
                <Link className={linkClass(currentPath === "/reports/customers/aging")} to="/reports/customers/aging">
                  Customer aging
                </Link>
                <Link className={linkClass(currentPath === "/reports/customers/outstanding")} to="/reports/customers/outstanding">
                  Customer outstanding
                </Link>
                <Link className={linkClass(currentPath === "/reports/suppliers/aging")} to="/reports/suppliers/aging">
                  Supplier aging
                </Link>
                <Link className={linkClass(currentPath === "/reports/suppliers/payable")} to="/reports/suppliers/payable">
                  Supplier payable
                </Link>
                <Link className={linkClass(currentPath === "/reports/cash-bank")} to="/reports/cash-bank">
                  Cash / bank
                </Link>
                <Link className={linkClass(currentPath === "/reports/expenses")} to="/reports/expenses">
                  Expense report
                </Link>
                <Link className={linkClass(currentPath === "/reports/profit-summary")} to="/reports/profit-summary">
                  Profit summary
                </Link>
                <Link className={linkClass(currentPath === "/reports/product-profit")} to="/reports/product-profit">
                  Product profit
                </Link>
              </div>
            </details>
          </div>

          <div className="sidebar-nav-section">
            <span className="sidebar-nav-heading">Administration</span>
            <details className="sidebar-nav-group" open={systemActive}>
              <summary className={systemActive ? "sidebar-nav-trigger active" : "sidebar-nav-trigger"}>
                System tools
              </summary>
              <div className="sidebar-subnav">
                <Link className={linkClass(currentPath === "/system/imports")} to="/system/imports">
                  Imports
                </Link>
                <Link className={linkClass(currentPath === "/system/audit-logs")} to="/system/audit-logs">
                  Audit logs
                </Link>
                <Link className={linkClass(currentPath === "/system/exports")} to="/system/exports">
                  Exports
                </Link>
                <Link className={linkClass(currentPath === "/system/wireframe")} to="/system/wireframe">
                  UI wireframe
                </Link>
              </div>
            </details>

            <Link className={linkClass(currentPath === "/settings")} to="/settings">
              Business settings
            </Link>

            <details className="sidebar-nav-group" open={securityActive}>
              <summary className={securityActive ? "sidebar-nav-trigger active" : "sidebar-nav-trigger"}>
                Account security
              </summary>
              <div className="sidebar-subnav">
                <Link className={linkClass(currentPath === "/security/sessions")} to="/security/sessions">
                  Active sessions
                </Link>
                <Link className={linkClass(currentPath === "/change-password")} to="/change-password">
                  Change password
                </Link>
              </div>
            </details>
          </div>
        </nav>

        <div className="sidebar-admin">
          <div className="sidebar-admin-avatar" aria-hidden="true">
            {adminInitials(admin.name)}
          </div>
          <div className="sidebar-admin-copy">
            <strong>{admin.name}</strong>
            <span>{admin.email}</span>
          </div>
        </div>

        <Button
          disabled={logout.isPending}
          label={logout.isPending ? "Signing out..." : "Sign out"}
          onClick={handleLogout}
        />
      </aside>

      <div className="app-workspace">
        <header className="app-topbar">
          <div className="topbar-context">
            <span>Wholesale operations</span>
            <strong>{sectionTitle(currentPath)}</strong>
          </div>
          <div className="topbar-actions">
            <Link className="topbar-sale-link" to="/sales/new">
              New sale
            </Link>
            <div className="topbar-admin" title={admin.email}>
              <span>{adminInitials(admin.name)}</span>
            </div>
          </div>
        </header>

        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
