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

/** Renders the private admin navigation around authenticated feature pages. */
export function AppLayout({
  admin,
  children,
  currentPath,
}: AppLayoutProps): React.JSX.Element {
  const logout = useLogoutAdmin();
  const dashboardActive = currentPath === "/dashboard";
  const productsActive = currentPath.startsWith("/products");
  const customersActive = currentPath.startsWith("/customers");
  const suppliersActive = currentPath.startsWith("/suppliers");
  const inventoryActive = currentPath.startsWith("/inventory");
  const ledgersActive = currentPath.startsWith("/ledgers");
  const paymentsActive = currentPath.startsWith("/payments");
  const purchasesActive = currentPath.startsWith("/purchases");
  const salesActive = currentPath.startsWith("/sales");
  const returnsActive = currentPath.startsWith("/returns");
  const expensesActive = currentPath.startsWith("/expenses");
  const reportsActive = currentPath.startsWith("/reports");
  const systemActive = currentPath.startsWith("/system");
  const securityActive = currentPath.startsWith("/security");

  /** Requests session revocation when the administrator signs out. */
  function handleLogout(): void {
    logout.mutate();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Wholesale ERP</p>
          <strong>Admin panel</strong>
        </div>

        <nav>
          <Link className={linkClass(dashboardActive)} to="/dashboard">
            Dashboard
          </Link>
          <div className="sidebar-nav-group">
            <span className={paymentsActive ? "sidebar-nav-label active" : "sidebar-nav-label"}>
              Payments
            </span>
            <div className="sidebar-subnav">
              <Link
                className={linkClass(currentPath === "/payments/accounts")}
                to="/payments/accounts"
              >
                Accounts
              </Link>
              <Link
                className={linkClass(
                  currentPath.startsWith("/payments/customer-receipts"),
                )}
                to="/payments/customer-receipts"
              >
                Customer receipts
              </Link>
              <Link
                className={linkClass(
                  currentPath.startsWith("/payments/supplier-payments"),
                )}
                to="/payments/supplier-payments"
              >
                Supplier payments
              </Link>
              <Link
                className={linkClass(currentPath.startsWith("/payments/transfers"))}
                to="/payments/transfers"
              >
                Transfers
              </Link>
              <Link
                className={linkClass(
                  currentPath === "/payments/cash-bank-movements",
                )}
                to="/payments/cash-bank-movements"
              >
                Movements
              </Link>
              <Link
                className={linkClass(
                  currentPath === "/payments/cash-reconciliations",
                )}
                to="/payments/cash-reconciliations"
              >
                Cash reconciliation
              </Link>
              <Link
                className={linkClass(currentPath === "/payments/daily-cash-summary")}
                to="/payments/daily-cash-summary"
              >
                Daily cash summary
              </Link>
            </div>
          </div>
          <div className="sidebar-nav-group">
            <span className={expensesActive ? "sidebar-nav-label active" : "sidebar-nav-label"}>
              Expenses
            </span>
            <div className="sidebar-subnav">
              <Link className={linkClass(currentPath === "/expenses")} to="/expenses">
                Expense list
              </Link>
              <Link className={linkClass(currentPath === "/expenses/new")} to="/expenses/new">
                New expense
              </Link>
              <Link
                className={linkClass(currentPath === "/expenses/categories")}
                to="/expenses/categories"
              >
                Categories
              </Link>
            </div>
          </div>
          <div className="sidebar-nav-group">
            <span className={reportsActive ? "sidebar-nav-label active" : "sidebar-nav-label"}>
              Reports
            </span>
            <div className="sidebar-subnav">
              <Link className={linkClass(currentPath === "/reports/sales")} to="/reports/sales">
                Sales report
              </Link>
              <Link
                className={linkClass(currentPath === "/reports/purchases")}
                to="/reports/purchases"
              >
                Purchase report
              </Link>
              <Link
                className={linkClass(currentPath === "/reports/inventory")}
                to="/reports/inventory"
              >
                Inventory report
              </Link>
              <Link
                className={linkClass(currentPath === "/reports/inventory-valuation")}
                to="/reports/inventory-valuation"
              >
                Inventory valuation
              </Link>
              <Link
                className={linkClass(currentPath === "/reports/customers/aging")}
                to="/reports/customers/aging"
              >
                Customer aging
              </Link>
              <Link
                className={linkClass(currentPath === "/reports/customers/outstanding")}
                to="/reports/customers/outstanding"
              >
                Customer outstanding
              </Link>
              <Link
                className={linkClass(currentPath === "/reports/suppliers/aging")}
                to="/reports/suppliers/aging"
              >
                Supplier aging
              </Link>
              <Link
                className={linkClass(currentPath === "/reports/suppliers/payable")}
                to="/reports/suppliers/payable"
              >
                Supplier payable
              </Link>
              <Link
                className={linkClass(currentPath === "/reports/cash-bank")}
                to="/reports/cash-bank"
              >
                Cash / bank
              </Link>
              <Link
                className={linkClass(currentPath === "/reports/expenses")}
                to="/reports/expenses"
              >
                Expense report
              </Link>
              <Link
                className={linkClass(currentPath === "/reports/profit-summary")}
                to="/reports/profit-summary"
              >
                Profit summary
              </Link>
              <Link
                className={linkClass(currentPath === "/reports/product-profit")}
                to="/reports/product-profit"
              >
                Product profit
              </Link>
            </div>
          </div>
          <div className="sidebar-nav-group">
            <span className={systemActive ? "sidebar-nav-label active" : "sidebar-nav-label"}>
              System tools
            </span>
            <div className="sidebar-subnav">
              <Link className={linkClass(currentPath === "/system/imports")} to="/system/imports">
                Imports
              </Link>
              <Link
                className={linkClass(currentPath === "/system/audit-logs")}
                to="/system/audit-logs"
              >
                Audit logs
              </Link>
              <Link className={linkClass(currentPath === "/system/exports")} to="/system/exports">
                Exports
              </Link>
            </div>
          </div>
          <Link className={linkClass(salesActive)} to="/sales">
            Sales
          </Link>
          <Link className={linkClass(returnsActive)} to="/returns/sales">
            Returns
          </Link>
          <Link className={linkClass(purchasesActive)} to="/purchases">
            Purchases
          </Link>
          <Link className={linkClass(inventoryActive)} to="/inventory">
            Inventory
          </Link>
          <Link
            className={linkClass(ledgersActive)}
            to="/ledgers/customer-outstanding"
          >
            Ledgers
          </Link>
          <Link className={linkClass(suppliersActive)} to="/suppliers">
            Suppliers
          </Link>
          <Link className={linkClass(customersActive)} to="/customers">
            Customers
          </Link>
          <Link className={linkClass(productsActive)} to="/products">
            Products
          </Link>
          <Link
            className={linkClass(currentPath === "/product-settings")}
            to="/product-settings"
          >
            Categories and brands
          </Link>
          <Link
            className={linkClass(currentPath === "/settings")}
            to="/settings"
          >
            Business settings
          </Link>
          <div className="sidebar-nav-group">
            <span className={securityActive ? "sidebar-nav-label active" : "sidebar-nav-label"}>
              Account security
            </span>
            <div className="sidebar-subnav">
              <Link
                className={linkClass(currentPath === "/security/sessions")}
                to="/security/sessions"
              >
                Active sessions
              </Link>
              <Link
                className={linkClass(currentPath === "/change-password")}
                to="/change-password"
              >
                Change password
              </Link>
            </div>
          </div>
        </nav>

        <div className="sidebar-admin">
          <strong>{admin.name}</strong>
          <span>{admin.email}</span>
        </div>

        <Button
          disabled={logout.isPending}
          label={logout.isPending ? "Signing out..." : "Sign out"}
          onClick={handleLogout}
        />
      </aside>
      <main className="page-content">{children}</main>
    </div>
  );
}
