import { readdir, readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const sourceRoot = new URL("./", import.meta.url);
const featuresRoot = new URL("./features/", import.meta.url);
const routerUrl = new URL("./app/router.tsx", import.meta.url);
const layoutUrl = new URL("./app/layouts/app-layout.tsx", import.meta.url);
const packageUrl = new URL("../package.json", import.meta.url);
const uiRoot = new URL("./components/ui/", import.meta.url);
const backendModulesRoot = new URL("../../api/src/modules/", import.meta.url);

/** Reads one UTF-8 frontend source file. */
async function readSource(url: URL): Promise<string> {
  return readFile(url, "utf8");
}

/** Returns sorted directory names for a folder. */
async function listNames(url: URL): Promise<string[]> {
  return (await readdir(url)).sort();
}

/** Verifies that backend request fields still have matching frontend support. */
async function expectContractFields(
  backendSchemaPath: string,
  frontendPaths: string[],
  fields: string[],
): Promise<void> {
  const backendSchema = await readSource(
    new URL(backendSchemaPath, backendModulesRoot),
  );
  const frontendSources = await Promise.all(
    frontendPaths.map((path) => readSource(new URL(path, sourceRoot))),
  );
  const frontendSource = frontendSources.join("\n");

  for (const field of fields) {
    expect(backendSchema).toMatch(new RegExp(`\\b${field}\\s*:`));
    expect(frontendSource).toContain(field);
  }
}

describe("final frontend acceptance", () => {
  test("all 15 approved frontend feature areas exist", async () => {
    const features = await listNames(featuresRoot);

    for (const required of [
      "auth",
      "business-settings",
      "products",
      "customers",
      "suppliers",
      "inventory",
      "ledgers",
      "payments",
      "purchases",
      "sales",
      "returns",
      "expenses",
      "reports",
      "dashboard",
      "system",
    ]) {
      expect(features).toContain(required);
    }
  });

  test("every business feature keeps the approved api/components/hooks/pages structure where applicable", async () => {
    for (const feature of [
      "products",
      "customers",
      "suppliers",
      "inventory",
      "ledgers",
      "payments",
      "purchases",
      "sales",
      "returns",
      "expenses",
      "dashboard",
      "system",
    ]) {
      const names = await listNames(new URL(`./features/${feature}/`, import.meta.url));

      for (const required of ["api", "components", "hooks", "pages"]) {
        expect(names).toContain(required);
      }
    }
  });

  test("shared UI remains limited to the approved simple components", async () => {
    expect(await listNames(uiRoot)).toEqual([
      "button.tsx",
      "dialog.tsx",
      "input.tsx",
      "table.tsx",
    ]);
  });

  test("router exposes the required main screens including Dashboard and System tools", async () => {
    const router = await readSource(routerUrl);

    for (const path of [
      "/login",
      "/dashboard",
      "/settings",
      "/products",
      "/customers",
      "/suppliers",
      "/inventory",
      "/ledgers/customer-outstanding",
      "/payments/accounts",
      "/payments/daily-cash-summary",
      "/purchases",
      "/sales",
      "/returns/sales",
      "/expenses",
      "/reports/sales",
      "/reports/inventory-valuation",
      "/reports/customers/aging",
      "/reports/suppliers/aging",
      "/system/imports",
      "/system/audit-logs",
      "/system/exports",
    ]) {
      expect(router).toContain(`path: "${path}"`);
    }
  });

  test("authenticated root flow sends logged-in users to Dashboard", async () => {
    const router = await readSource(routerUrl);

    expect(router).toContain('<Navigate to="/dashboard" replace />');
    expect(router).toContain('path: "/dashboard"');
  });

  test("sidebar exposes all core ERP areas and System tools", async () => {
    const layout = await readSource(layoutUrl);

    for (const label of [
      "Dashboard",
      "Sales",
      "Returns",
      "Purchases",
      "Inventory",
      "Ledgers",
      "Suppliers",
      "Customers",
      "Products",
      "Business settings",
      "Inventory valuation",
      "Customer aging",
      "Supplier aging",
      "Daily cash summary",
      "Imports",
      "Audit logs",
      "Exports",
    ]) {
      expect(layout).toContain(label);
    }
  });

  test("daily cash summary frontend stays inside the Payments feature", async () => {
    const api = await readSource(
      new URL("./features/payments/api/payments.api.ts", import.meta.url),
    );
    const hooks = await readSource(
      new URL("./features/payments/hooks/use-payments.ts", import.meta.url),
    );
    const page = await readSource(
      new URL("./features/payments/pages/daily-cash-summary-page.tsx", import.meta.url),
    );

    expect(api).toContain("/payments/daily-cash-summary");
    expect(api).toContain("loadDailyCashSummary");
    expect(hooks).toContain("useDailyCashSummary");
    expect(page).toContain("Daily cash summary");
    expect(page).toContain("expectedClosing");
    expect(page).toContain("countedAmount");
    expect(page).toContain("difference");
  });

  test("supplier aging frontend stays inside the Reports feature", async () => {
    const api = await readSource(
      new URL("./features/reports/api/reports.api.ts", import.meta.url),
    );
    const hooks = await readSource(
      new URL("./features/reports/hooks/use-reports.ts", import.meta.url),
    );
    const page = await readSource(
      new URL("./features/reports/pages/supplier-aging-report-page.tsx", import.meta.url),
    );

    expect(api).toContain("/reports/suppliers/aging");
    expect(api).toContain("loadSupplierAgingReport");
    expect(hooks).toContain("useSupplierAgingReport");
    expect(page).toContain("Supplier aging");
    expect(page).toContain("bucket90Plus");
    expect(page).toContain("totalPayable");
  });

  test("frontend stack stays within the approved React/Vite/TanStack/RHF/Zod/Tailwind stack", async () => {
    const packageJson = JSON.parse(await readSource(packageUrl)) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const dependencies = {
      ...(packageJson.dependencies ?? {}),
      ...(packageJson.devDependencies ?? {}),
    };

    for (const required of [
      "react",
      "react-dom",
      "@tanstack/react-query",
      "@tanstack/react-router",
      "react-hook-form",
      "zod",
      "vite",
      "tailwindcss",
      "typescript",
    ]) {
      expect(dependencies[required]).toBeDefined();
    }

    for (const forbidden of [
      "redux",
      "@reduxjs/toolkit",
      "socket.io-client",
      "axios",
      "@nestjs/core",
      "next",
    ]) {
      expect(dependencies[forbidden]).toBeUndefined();
    }
  });

  test("System frontend keeps the required import/audit/export pages", async () => {
    const pages = await listNames(
      new URL("./features/system/pages/", import.meta.url),
    );

    expect(pages).toEqual([
      "audit-logs-page.tsx",
      "exports-page.tsx",
      "imports-page.tsx",
    ]);
  });

  test("Dashboard and Reports remain frontend read views without websocket infrastructure", async () => {
    const dashboard = await readSource(
      new URL("./features/dashboard/pages/dashboard-page.tsx", import.meta.url),
    );
    const packageJson = await readSource(packageUrl);

    expect(dashboard).not.toMatch(/WebSocket|socket\.io/i);
    expect(packageJson).not.toMatch(/socket\.io|websocket/i);
  });

  test("customer and supplier create forms send setup-only opening balances", async () => {
    const customerApi = await readSource(
      new URL("./features/customers/api/customers.api.ts", import.meta.url),
    );
    const customerForm = await readSource(
      new URL("./features/customers/components/customer-form.tsx", import.meta.url),
    );
    const supplierApi = await readSource(
      new URL("./features/suppliers/api/suppliers.api.ts", import.meta.url),
    );
    const supplierForm = await readSource(
      new URL("./features/suppliers/components/supplier-form.tsx", import.meta.url),
    );

    expect(customerApi).toContain("openingBalance?: string");
    expect(customerForm).toContain('register("openingBalance")');
    expect(customerForm).toContain("openingBalance: values.openingBalance.trim()");
    expect(customerForm).toContain("Setup only.");

    expect(supplierApi).toContain("openingBalance?: string");
    expect(supplierForm).toContain('register("openingBalance")');
    expect(supplierForm).toContain("openingBalance: values.openingBalance.trim()");
    expect(supplierForm).toContain("Setup only.");
  });
  test("sale detail displays important backend snapshots and lifecycle timestamps", async () => {
    const salesApi = await readSource(
      new URL("./features/sales/api/sales.api.ts", import.meta.url),
    );
    const saleDetailPage = await readSource(
      new URL("./features/sales/pages/sale-detail-page.tsx", import.meta.url),
    );

    expect(salesApi).toContain("baseQuantity: string");
    expect(salesApi).toContain("confirmedAt: string | null");
    expect(salesApi).toContain("cancelledAt: string | null");
    expect(saleDetailPage).toContain("Base quantity");
    expect(saleDetailPage).toContain("item.baseQuantity");
    expect(saleDetailPage).toContain("Confirmed at");
    expect(saleDetailPage).toContain("sale.confirmedAt");
    expect(saleDetailPage).toContain("Cancelled at");
    expect(saleDetailPage).toContain("sale.cancelledAt");
    expect(saleDetailPage).toContain("Manual price");
  });

  test("inventory movement history displays complete traceability fields", async () => {
    const inventoryApi = await readSource(
      new URL("./features/inventory/api/inventory.api.ts", import.meta.url),
    );
    const movementPage = await readSource(
      new URL(
        "./features/inventory/pages/product-movements-page.tsx",
        import.meta.url,
      ),
    );

    expect(inventoryApi).toContain("allocatedExtraCost: string | null");
    expect(inventoryApi).toContain("sourceType: string | null");
    expect(inventoryApi).toContain("sourceId: string | null");
    expect(movementPage).toContain("Allocated extra cost");
    expect(movementPage).toContain("movementSource(movement.sourceType, movement.sourceId)");
    expect(movementPage).toContain('to="/purchases/$purchaseId"');
    expect(movementPage).toContain('to="/sales/$saleId"');
    expect(movementPage).toContain('to="/returns/sales/$salesReturnId"');
    expect(movementPage).toContain('to="/returns/purchases/$purchaseReturnId"');
    expect(movementPage).toContain('to="/inventory/counts/$countId"');
  });

  test("return detail pages display readable settlement and complete stock effects", async () => {
    const salesReturnPage = await readSource(
      new URL("./features/returns/pages/sales-return-detail-page.tsx", import.meta.url),
    );
    const purchaseReturnPage = await readSource(
      new URL("./features/returns/pages/purchase-return-detail-page.tsx", import.meta.url),
    );

    expect(salesReturnPage).toContain("usePaymentAccounts");
    expect(salesReturnPage).toContain("cashAccount?.name");
    expect(salesReturnPage).toContain("bankAccount.bankName");
    expect(salesReturnPage).toContain("Base quantity");
    expect(salesReturnPage).toContain("item.baseQuantity");
    expect(salesReturnPage).toContain("Stock result");
    expect(salesReturnPage).toContain("detail.stockResult.map");
    expect(salesReturnPage).toContain("Stock in");

    expect(purchaseReturnPage).toContain("Supplier balance result");
    expect(purchaseReturnPage).toContain("Stock result");
    expect(purchaseReturnPage).toContain("detail.stockResult.map");
    expect(purchaseReturnPage).toContain("result.unitCostSnapshot");
    expect(purchaseReturnPage).toContain("Stock out");
  });


  test("ledger and payment history link business documents and show reconciliation confirmation time", async () => {
    const ledgerTable = await readSource(
      new URL("./features/ledgers/components/ledger-statement-table.tsx", import.meta.url),
    );
    const movementTable = await readSource(
      new URL("./features/payments/components/movements-table.tsx", import.meta.url),
    );
    const reconciliationPage = await readSource(
      new URL("./features/payments/pages/cash-reconciliations-page.tsx", import.meta.url),
    );

    expect(ledgerTable).toContain("documentLink(entry)");
    expect(ledgerTable).toContain('to="/sales/$saleId"');
    expect(ledgerTable).toContain('to="/purchases/$purchaseId"');
    expect(ledgerTable).toContain('to="/payments/customer-receipts/$receiptId"');
    expect(ledgerTable).toContain('to="/payments/supplier-payments/$paymentId"');
    expect(ledgerTable).toContain('to="/returns/sales/$salesReturnId"');
    expect(ledgerTable).toContain('to="/returns/purchases/$purchaseReturnId"');

    expect(movementTable).toContain("sourceDocument(item)");
    expect(movementTable).toContain('to="/payments/customer-receipts/$receiptId"');
    expect(movementTable).toContain('to="/payments/supplier-payments/$paymentId"');
    expect(movementTable).toContain('to="/payments/transfers/$transferId"');
    expect(movementTable).toContain('to="/returns/sales/$salesReturnId"');
    expect(movementTable).toContain('to="/expenses/$expenseId"');

    expect(reconciliationPage).toContain("Confirmed at");
    expect(reconciliationPage).toContain("item.confirmedAt");
    expect(reconciliationPage).toContain('timeZone: "Asia/Karachi"');
  });


  test("reports display base quantities and link immutable source documents", async () => {
    const salesReport = await readSource(
      new URL("./features/reports/pages/sales-report-page.tsx", import.meta.url),
    );
    const purchasesReport = await readSource(
      new URL("./features/reports/pages/purchases-report-page.tsx", import.meta.url),
    );
    const inventoryReport = await readSource(
      new URL("./features/reports/pages/inventory-report-page.tsx", import.meta.url),
    );
    const cashBankReport = await readSource(
      new URL("./features/reports/pages/cash-bank-report-page.tsx", import.meta.url),
    );
    const expenseReport = await readSource(
      new URL("./features/reports/pages/expense-report-page.tsx", import.meta.url),
    );

    expect(salesReport).toContain("Base quantity");
    expect(salesReport).toContain("row.baseQuantity");
    expect(purchasesReport).toContain("Base quantity");
    expect(purchasesReport).toContain("row.baseQuantity");

    expect(inventoryReport).toContain("movementSource(row.sourceType, row.sourceId)");
    expect(inventoryReport).toContain('to="/sales/$saleId"');
    expect(inventoryReport).toContain('to="/purchases/$purchaseId"');
    expect(inventoryReport).toContain('to="/returns/sales/$salesReturnId"');
    expect(inventoryReport).toContain('to="/returns/purchases/$purchaseReturnId"');
    expect(inventoryReport).toContain('to="/inventory/counts/$countId"');

    expect(cashBankReport).toContain("movementDocument(movement.sourceType, movement.sourceId");
    expect(cashBankReport).toContain('to="/payments/customer-receipts/$receiptId"');
    expect(cashBankReport).toContain('to="/payments/supplier-payments/$paymentId"');
    expect(cashBankReport).toContain('to="/payments/transfers/$transferId"');
    expect(cashBankReport).toContain('to="/returns/sales/$salesReturnId"');
    expect(cashBankReport).toContain('to="/expenses/$expenseId"');

    expect(expenseReport).toContain("Related expense");
    expect(expenseReport).toContain("relatedExpense(row.reversalOfExpenseId)");
    expect(expenseReport).toContain("expenseDocument(row.expenseId, row.expenseNumber)");
  });


  test("System import UI shows type-specific confirmation totals and expandable raw row details", async () => {
    const systemApi = await readSource(
      new URL("./features/system/api/system.api.ts", import.meta.url),
    );
    const validationResult = await readSource(
      new URL("./features/system/components/import-validation-result.tsx", import.meta.url),
    );
    const importDetail = await readSource(
      new URL("./features/system/components/import-job-detail.tsx", import.meta.url),
    );

    for (const field of [
      "productsCreated",
      "recordsCreated",
      "movementsCreated",
      "customerEntriesCreated",
      "supplierEntriesCreated",
    ]) {
      expect(systemApi).toContain(field);
      expect(validationResult).toContain(field);
    }

    expect(validationResult).toContain("Products created");
    expect(validationResult).toContain("Records created");
    expect(validationResult).toContain("Stock movements created");
    expect(validationResult).toContain("Customer opening entries created");
    expect(validationResult).toContain("Supplier opening entries created");
    expect(validationResult).toContain("Row details");
    expect(validationResult).toContain("error.rawRow");
    expect(validationResult).toContain("<details");

    expect(importDetail).toContain("Row details");
    expect(importDetail).toContain("error.rawRow");
    expect(importDetail).toContain("<details");
    expect(importDetail).toContain('timeZone: "Asia/Karachi"');
  });


  test("frontend mutation forms stay aligned with backend request contracts", async () => {
    await expectContractFields(
      "business-settings/business-settings.schema.ts",
      [
        "features/business-settings/api/business-settings.api.ts",
        "features/business-settings/components/business-settings-form.tsx",
      ],
      [
        "businessName",
        "phone",
        "email",
        "address",
        "logoUrl",
        "currency",
        "timezone",
        "sequences",
        "documentType",
        "prefix",
        "nextNumber",
      ],
    );

    await expectContractFields(
      "auth/auth.schema.ts",
      [
        "features/auth/api/auth.api.ts",
        "features/auth/components/login-form.tsx",
        "features/auth/components/change-password-form.tsx",
      ],
      ["email", "password", "currentPassword", "newPassword", "confirmPassword"],
    );

    await expectContractFields(
      "products/products.schema.ts",
      [
        "features/products/api/products.api.ts",
        "features/products/components/product-form.tsx",
        "features/products/components/category-form.tsx",
        "features/products/components/brand-form.tsx",
      ],
      [
        "sku",
        "barcode",
        "name",
        "categoryId",
        "brandId",
        "baseUnitName",
        "reorderLevel",
        "referencePurchasePrice",
        "referenceSalePrice",
        "units",
        "unitName",
        "conversionToBase",
        "isActive",
      ],
    );

    await expectContractFields(
      "customers/customers.schema.ts",
      [
        "features/customers/api/customers.api.ts",
        "features/customers/components/customer-form.tsx",
      ],
      [
        "name",
        "phone",
        "email",
        "address",
        "taxId",
        "creditLimit",
        "openingBalance",
        "isActive",
      ],
    );

    await expectContractFields(
      "suppliers/suppliers.schema.ts",
      [
        "features/suppliers/api/suppliers.api.ts",
        "features/suppliers/components/supplier-form.tsx",
      ],
      ["name", "phone", "email", "address", "taxId", "openingBalance", "isActive"],
    );

    await expectContractFields(
      "inventory/inventory.schema.ts",
      [
        "features/inventory/api/inventory.api.ts",
        "features/inventory/components/opening-stock-form.tsx",
        "features/inventory/components/inventory-adjustment-form.tsx",
        "features/inventory/components/stock-count-form.tsx",
      ],
      [
        "productId",
        "stockCondition",
        "quantity",
        "unitCost",
        "direction",
        "reason",
        "notes",
        "countDate",
        "countedQuantity",
        "items",
      ],
    );

    await expectContractFields(
      "payments/payments.schema.ts",
      [
        "features/payments/api/payments.api.ts",
        "features/payments/components/account-form.tsx",
        "features/payments/components/customer-receipt-form.tsx",
        "features/payments/components/supplier-payment-form.tsx",
        "features/payments/components/payment-splits-form.tsx",
        "features/payments/components/transfer-form.tsx",
        "features/payments/components/reconciliation-form.tsx",
      ],
      [
        "name",
        "openingBalance",
        "isActive",
        "bankName",
        "accountName",
        "accountNumber",
        "customerId",
        "supplierId",
        "paymentDate",
        "splits",
        "allocations",
        "notes",
        "method",
        "amount",
        "cashAccountId",
        "bankAccountId",
        "documentId",
        "sourceAccountType",
        "sourceAccountId",
        "destinationAccountType",
        "destinationAccountId",
        "transferDate",
        "reconciliationDate",
        "countedAmount",
      ],
    );

    await expectContractFields(
      "purchases/purchases.schema.ts",
      [
        "features/purchases/api/purchases.api.ts",
        "features/purchases/components/purchase-form.tsx",
      ],
      [
        "supplierId",
        "purchaseDate",
        "items",
        "productId",
        "productUnitId",
        "quantity",
        "unitCost",
        "itemDiscountAmount",
        "invoiceDiscountAmount",
        "extraCostAmount",
        "notes",
        "status",
        "initialPayment",
        "splits",
      ],
    );

    await expectContractFields(
      "sales/sales.schema.ts",
      [
        "features/sales/api/sales.api.ts",
        "features/sales/components/sale-form.tsx",
      ],
      [
        "customerId",
        "invoiceDate",
        "items",
        "productId",
        "productUnitId",
        "quantity",
        "manualUnitPrice",
        "itemDiscountAmount",
        "invoiceDiscountAmount",
        "notes",
        "status",
        "initialPayment",
        "splits",
      ],
    );

    await expectContractFields(
      "returns/returns.schema.ts",
      [
        "features/returns/api/returns.api.ts",
        "features/returns/components/sales-return-form.tsx",
        "features/returns/components/purchase-return-form.tsx",
      ],
      [
        "originalSaleId",
        "returnDate",
        "reason",
        "refundMode",
        "cashAccountId",
        "bankAccountId",
        "items",
        "originalSaleItemId",
        "quantity",
        "stockCondition",
        "originalPurchaseId",
        "originalPurchaseItemId",
      ],
    );

    await expectContractFields(
      "expenses/expenses.schema.ts",
      [
        "features/expenses/api/expenses.api.ts",
        "features/expenses/components/expense-category-form.tsx",
        "features/expenses/components/expense-form.tsx",
        "features/expenses/pages/expense-detail-page.tsx",
      ],
      [
        "name",
        "isActive",
        "expenseCategoryId",
        "expenseDate",
        "amount",
        "paymentMethod",
        "cashAccountId",
        "bankAccountId",
        "note",
        "receiptUrl",
        "reason",
      ],
    );
  });

  test("critical backend response fields remain visible in the production UI", async () => {
    const checks: Array<{ path: string; fields: string[] }> = [
      {
        path: "features/inventory/pages/product-movements-page.tsx",
        fields: ["allocatedExtraCost", "sourceType", "sourceId", "unitCost"],
      },
      {
        path: "features/sales/pages/sale-detail-page.tsx",
        fields: ["baseQuantity", "confirmedAt", "cancelledAt", "manualUnitPrice"],
      },
      {
        path: "features/returns/pages/sales-return-detail-page.tsx",
        fields: ["stockResult", "baseQuantity", "settlementResult"],
      },
      {
        path: "features/returns/pages/purchase-return-detail-page.tsx",
        fields: ["stockResult", "supplierBalanceResult", "unitCostSnapshot"],
      },
      {
        path: "features/payments/pages/cash-reconciliations-page.tsx",
        fields: ["confirmedAt", "countedAmount", "difference"],
      },
      {
        path: "features/system/components/import-validation-result.tsx",
        fields: [
          "productsCreated",
          "recordsCreated",
          "movementsCreated",
          "customerEntriesCreated",
          "supplierEntriesCreated",
          "rawRow",
        ],
      },
    ];

    for (const check of checks) {
      const source = await readSource(new URL(check.path, sourceRoot));

      for (const field of check.fields) {
        expect(source).toContain(field);
      }
    }
  });

  test("master-data detail screens show useful record metadata without exposing internal keys", async () => {
    const customerSummary = await readSource(
      new URL("./features/customers/components/customer-summary.tsx", import.meta.url),
    );
    const supplierSummary = await readSource(
      new URL("./features/suppliers/components/supplier-summary.tsx", import.meta.url),
    );
    const supplierDetail = await readSource(
      new URL("./features/suppliers/pages/supplier-detail-page.tsx", import.meta.url),
    );
    const supplierRecentPurchases = await readSource(
      new URL("./features/suppliers/components/supplier-recent-purchases.tsx", import.meta.url),
    );
    const productDetail = await readSource(
      new URL("./features/products/pages/product-detail-page.tsx", import.meta.url),
    );
    const settingsPage = await readSource(
      new URL("./features/business-settings/pages/business-settings-page.tsx", import.meta.url),
    );

    for (const source of [customerSummary, supplierSummary, productDetail, settingsPage]) {
      expect(source).toContain("Record information");
      expect(source).toContain('timeZone: "Asia/Karachi"');
      expect(source).not.toContain("singletonKey");
    }

    expect(supplierDetail).toContain("profile.recentPurchasesAvailable");
    expect(supplierRecentPurchases).toContain("Recent purchase history is temporarily unavailable.");
    expect(supplierRecentPurchases).toContain("No recent purchases found.");
    expect(supplierRecentPurchases).toContain('to="/purchases/$purchaseId"');
    expect(settingsPage).toContain("data.settings.currency");
    expect(settingsPage).toContain("data.settings.timezone");
  });

  test("final production UI uses shared money, date, and status presentation", async () => {
    const sharedUtils = await readSource(
      new URL("./lib/utils.ts", import.meta.url),
    );
    const statusBadge = await readSource(
      new URL("./components/ui/status-badge.tsx", import.meta.url),
    );
    const styles = await readSource(
      new URL("./styles/globals.css", import.meta.url),
    );

    expect(sharedUtils).toContain("formatMoney");
    expect(sharedUtils).toContain("formatQuantity");
    expect(sharedUtils).toContain("formatBusinessDate");
    expect(sharedUtils).toContain("formatBusinessDateTime");
    expect(sharedUtils).toContain('timeZone: "Asia/Karachi"');
    expect(statusBadge).toContain("formatStatusLabel");
    expect(statusBadge).toContain("status-badge");

    const consistentScreens = [
      "features/products/components/product-table.tsx",
      "features/products/components/category-table.tsx",
      "features/products/components/brand-table.tsx",
      "features/products/pages/product-detail-page.tsx",
      "features/customers/components/customer-table.tsx",
      "features/customers/components/customer-summary.tsx",
      "features/suppliers/components/supplier-table.tsx",
      "features/suppliers/components/supplier-summary.tsx",
      "features/inventory/components/inventory-table.tsx",
      "features/inventory/components/stock-count-table.tsx",
      "features/payments/components/accounts-table.tsx",
      "features/expenses/components/expense-category-table.tsx",
      "features/sales/components/sale-table.tsx",
      "features/purchases/components/purchase-table.tsx",
      "features/payments/components/customer-receipts-table.tsx",
      "features/payments/components/supplier-payments-table.tsx",
      "features/payments/pages/cash-reconciliations-page.tsx",
      "features/expenses/components/expense-table.tsx",
      "features/system/components/import-history.tsx",
      "features/system/components/import-validation-result.tsx",
      "features/system/components/import-job-detail.tsx",
    ];

    for (const screenPath of consistentScreens) {
      const source = await readSource(new URL(screenPath, sourceRoot));
      expect(source).toContain("StatusBadge");
    }

    expect(styles).toContain(".ui-table tbody tr:hover");
    expect(styles).toContain(":focus-visible");
    expect(styles).toContain(".status-badge.active");
    expect(styles).toContain(".status-badge.reversed");
    expect(styles).toContain(".status-badge.held");
  });


});
