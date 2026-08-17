import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  cancelSaleSchema,
  confirmSaleSchema,
  createSaleSchema,
  listSalesQuerySchema,
  updateSaleDraftSchema,
} from "../src/modules/sales/sales.schema.js";
import { calculateSale } from "../src/modules/sales/sales.service.js";
import {
  createSalesReturnSchema,
  listSalesReturnsQuerySchema,
} from "../src/modules/returns/returns.schema.js";

const customerId = "00000000-0000-4000-8000-000000000001";
const productId = "00000000-0000-4000-8000-000000000002";
const productUnitId = "00000000-0000-4000-8000-000000000003";
const cashAccountId = "00000000-0000-4000-8000-000000000004";

/** Creates one valid sale item used by the schema tests below. */
function validItem() {
  return {
    productId,
    productUnitId,
    quantity: "2.000",
    manualUnitPrice: "250.00",
    itemDiscountAmount: "0.00",
  };
}

test("create sale accepts a simple draft with manual pricing", () => {
  const result = createSaleSchema.safeParse({
    customerId,
    invoiceDate: "2026-08-08",
    items: [validItem()],
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.status, "DRAFT");
    assert.equal(result.data.invoiceDiscountAmount, "0.00");
  }
});

test("create sale rejects zero manual selling price", () => {
  const result = createSaleSchema.safeParse({
    customerId,
    invoiceDate: "2026-08-08",
    items: [{ ...validItem(), manualUnitPrice: "0.00" }],
  });

  assert.equal(result.success, false);
});

test("draft or held sale cannot contain an initial payment", () => {
  const result = createSaleSchema.safeParse({
    customerId,
    invoiceDate: "2026-08-08",
    status: "HELD",
    items: [validItem()],
    initialPayment: {
      splits: [
        {
          method: "CASH",
          amount: "100.00",
          cashAccountId,
        },
      ],
    },
  });

  assert.equal(result.success, false);
});

test("confirmed sale accepts cash initial payment with the matching account", () => {
  const result = createSaleSchema.safeParse({
    customerId,
    invoiceDate: "2026-08-08",
    status: "CONFIRMED",
    items: [validItem()],
    initialPayment: {
      splits: [
        {
          method: "CASH",
          amount: "100.00",
          cashAccountId,
        },
      ],
    },
  });

  assert.equal(result.success, true);
});

test("cash split rejects a bank account or missing cash account", () => {
  const result = confirmSaleSchema.safeParse({
    initialPayment: {
      splits: [
        {
          method: "CASH",
          amount: "100.00",
          bankAccountId: cashAccountId,
        },
      ],
    },
  });

  assert.equal(result.success, false);
});

test("sale list rejects a reversed date range", () => {
  const result = listSalesQuerySchema.safeParse({
    startDate: "2026-08-10",
    endDate: "2026-08-08",
  });

  assert.equal(result.success, false);
});

test("draft update and cancel schemas stay intentionally small", () => {
  assert.equal(updateSaleDraftSchema.safeParse({ status: "HELD" }).success, true);
  assert.equal(updateSaleDraftSchema.safeParse({}).success, false);
  assert.equal(cancelSaleSchema.safeParse({ note: "Customer changed mind." }).success, true);
});


const customerRepositoryPath = new URL(
  "../src/modules/customers/customers.repository.ts",
  import.meta.url,
);
const productRepositoryPath = new URL(
  "../src/modules/products/products.repository.ts",
  import.meta.url,
);
const inventoryRepositoryPath = new URL(
  "../src/modules/inventory/inventory.repository.ts",
  import.meta.url,
);

/** Reads a repository source file for the simple Sales integration audit. */
async function readRepository(path: URL): Promise<string> {
  return readFile(path, "utf8");
}

test("sales dependencies expose the required customer product unit and inventory lookups", async () => {
  const customerRepository = await readRepository(customerRepositoryPath);
  const productRepository = await readRepository(productRepositoryPath);
  const inventoryRepository = await readRepository(inventoryRepositoryPath);

  assert.match(customerRepository, /export async function findCustomerById/);
  assert.match(productRepository, /export async function findProductById/);
  assert.match(productRepository, /export async function findProductUnitById/);
  assert.match(productRepository, /eq\(productUnits\.productId, productId\)/);
  assert.match(inventoryRepository, /export async function lockInventoryBalanceByProductId/);
  assert.match(inventoryRepository, /\.for\("update"\)/);
});


test("sale calculation keeps manual prices and discounts exact", () => {
  const result = calculateSale(
    [
      {
        quantity: "2.000",
        conversionToBase: "12.000",
        manualUnitPrice: "250.00",
        itemDiscountAmount: "20.00",
      },
    ],
    "30.00",
  );

  assert.equal(result.items[0].baseQuantity, "24.000");
  assert.equal(result.items[0].lineTotal, "480.00");
  assert.equal(result.itemDiscountTotal, "20.00");
  assert.equal(result.subtotalAmount, "480.00");
  assert.equal(result.totalAmount, "450.00");
});

test("sale calculation rejects discounts above the sale value", () => {
  assert.throws(
    () =>
      calculateSale(
        [
          {
            quantity: "1.000",
            conversionToBase: "1.000",
            manualUnitPrice: "100.00",
            itemDiscountAmount: "101.00",
          },
        ],
        "0.00",
      ),
    /Item discount cannot exceed/,
  );
});

const salesServicePath = new URL(
  "../src/modules/sales/sales.service.ts",
  import.meta.url,
);
const salesRepositoryPath = new URL(
  "../src/modules/sales/sales.repository.ts",
  import.meta.url,
);

test("sales draft service exposes simple edit and cancellation workflows", async () => {
  const serviceSource = await readFile(salesServicePath, "utf8");

  assert.match(serviceSource, /export async function updateSaleDraft/);
  assert.match(serviceSource, /export async function cancelSaleDraft/);
  assert.match(serviceSource, /findSaleByIdForUpdate\(transaction, saleId\)/);
  assert.match(serviceSource, /Only a draft or held sale can be edited/);
  assert.match(serviceSource, /Only a draft sale can be cancelled/);
});

test("sales repository cancellation updates DRAFT sales only", async () => {
  const repositorySource = await readFile(salesRepositoryPath, "utf8");
  const cancelFunction = repositorySource.slice(
    repositorySource.indexOf("export async function cancelSaleDraft"),
  );

  assert.match(cancelFunction, /eq\(salesInvoices\.status, "DRAFT"\)/);
  assert.doesNotMatch(cancelFunction, /\["DRAFT", "HELD"\]/);
});

// Pass 7 keeps confirmation orchestration explicit and transaction-owned.
test("sales confirmation service includes stock, ledger, payment, and final status writes", async () => {
  const source = await readFile(
    new URL("../src/modules/sales/sales.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /export async function confirmSaleInTransaction/);
  assert.match(source, /recordSaleStockOut/);
  assert.match(source, /writeCustomerDebit/);
  assert.match(source, /recordSaleInitialCustomerReceipt/);
  assert.match(source, /markSaleConfirmed/);
});

// Pass 8 verifies that sale confirmation uses the existing Inventory module correctly.
test("sale confirmation removes base quantity from sellable stock and stores the cost snapshot", async () => {
  const salesSource = await readFile(salesServicePath, "utf8");
  const inventorySource = await readFile(
    new URL("../src/modules/inventory/inventory.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    salesSource,
    /recordSaleStockOut\(transaction, \{[\s\S]*?quantity: item\.baseQuantity/,
  );
  assert.match(
    salesSource,
    /updateSaleItemCostSnapshot\([\s\S]*?movement\.unitCost/,
  );
  assert.match(
    inventorySource,
    /recordSaleStockOut[\s\S]*?stockCondition: "SELLABLE"[\s\S]*?direction: "OUT"/,
  );
  assert.match(inventorySource, /applyStockOut[\s\S]*?INSUFFICIENT_STOCK/);
});

test("sale stock-out does not move damaged or expired stock", async () => {
  const inventorySource = await readFile(
    new URL("../src/modules/inventory/inventory.service.ts", import.meta.url),
    "utf8",
  );
  const start = inventorySource.indexOf("export async function recordSaleStockOut");
  const end = inventorySource.indexOf(
    "export async function recordPurchaseStockIn",
    start,
  );
  const saleStockOutSource = inventorySource.slice(start, end);

  assert.match(saleStockOutSource, /stockCondition: "SELLABLE"/);
  assert.doesNotMatch(saleStockOutSource, /DAMAGED/);
  assert.doesNotMatch(saleStockOutSource, /EXPIRED/);
});


// Pass 9 verifies that Sales uses the existing immutable customer-ledger writer.
test("sale confirmation debits the full invoice and initial payment credits it separately", async () => {
  const salesSource = await readFile(salesServicePath, "utf8");
  const paymentsSource = await readFile(
    new URL("../src/modules/payments/payments.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    salesSource,
    /writeCustomerDebit\(transaction, \{[\s\S]*?amount: sale\.totalAmount[\s\S]*?referenceType: "SALE"/,
  );
  assert.match(
    paymentsSource,
    /recordSaleInitialCustomerReceipt[\s\S]*?writeCustomerCredit\(database, \{[\s\S]*?referenceType: "CUSTOMER_PAYMENT"/,
  );
});

test("sale ledger and initial receipt keep immutable source links", async () => {
  const salesSource = await readFile(salesServicePath, "utf8");
  const paymentsSource = await readFile(
    new URL("../src/modules/payments/payments.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    salesSource,
    /referenceType: "SALE",[\s\S]*?referenceId: sale\.id/,
  );
  assert.match(
    paymentsSource,
    /referenceType: "CUSTOMER_PAYMENT",[\s\S]*?referenceId: payment\.id/,
  );
});


// Pass 10 verifies that initial sale payments use the normal Payments foundation.
test("sale initial payment creates normal receipt, allocation, ledger credit, and account inflows", async () => {
  const salesSource = await readFile(salesServicePath, "utf8");
  const paymentsSource = await readFile(
    new URL("../src/modules/payments/payments.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    salesSource,
    /recordSaleInitialCustomerReceipt\(transaction, \{[\s\S]*?saleId: sale\.id/,
  );
  assert.match(paymentsSource, /insertCustomerPayment\(database/);
  assert.match(paymentsSource, /createCustomerPaymentSplits/);
  assert.match(paymentsSource, /createCustomerPaymentAllocations/);
  assert.match(paymentsSource, /salesInvoiceId: allocation\.documentId/);
  assert.match(paymentsSource, /writeCustomerCredit\(database/);
  assert.match(paymentsSource, /writeCashInflow\(database/);
  assert.match(paymentsSource, /writeBankInflow\(database/);
});

test("sale initial payment reuses split and allocation total validation", async () => {
  const paymentsSource = await readFile(
    new URL("../src/modules/payments/payments.service.ts", import.meta.url),
    "utf8",
  );
  const start = paymentsSource.indexOf(
    "export async function recordSaleInitialCustomerReceipt",
  );
  const end = paymentsSource.indexOf("// Supplier payment operations", start);
  const initialReceiptSource = paymentsSource.slice(start, end);

  assert.match(initialReceiptSource, /validateSplits\(input\.splits\)/);
  assert.match(initialReceiptSource, /validateAccountsAreActive\(database, input\.splits\)/);
  assert.match(initialReceiptSource, /validateAllocations\(allocationInput\)/);
  assert.match(
    initialReceiptSource,
    /validateSplitAndAllocationTotals\(input\.splits, allocationInput\)/,
  );
});

test("sale confirmation schema supports mixed cash and bank initial payment", () => {
  const bankAccountId = "00000000-0000-4000-8000-000000000005";
  const result = confirmSaleSchema.safeParse({
    initialPayment: {
      splits: [
        { method: "CASH", amount: "150.00", cashAccountId },
        {
          method: "BANK_TRANSFER",
          amount: "350.00",
          bankAccountId,
        },
      ],
    },
  });

  assert.equal(result.success, true);
});


// Pass 11 verifies that the protected Walk-in Customer can never leave sale due.
test("sale confirmation blocks credit for the Walk-in Customer", async () => {
  const salesSource = await readFile(salesServicePath, "utf8");

  assert.match(salesSource, /customer\.isWalkIn && paidCents !== totalCents/);
  assert.match(salesSource, /WALK_IN_CUSTOMER_CREDIT_NOT_ALLOWED/);
  assert.match(salesSource, /Walk-in Customer sales must be fully paid before confirmation/);
});

/** Verifies Module 10 exposes exactly the six required Counter Sales routes. */
test("sales module registers the required Counter Sales routes", async () => {
  const routes = await readFile(
    new URL("../src/modules/sales/sales.routes.ts", import.meta.url),
    "utf8",
  );

  for (const route of [
    'app.get("/sales"',
    'app.post(\n    "/sales"',
    'app.get("/sales/:id"',
    '"/sales/:id/draft"',
    '"/sales/:id/confirm"',
    '"/sales/:id/cancel"',
  ]) {
    assert.match(routes, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

/** Verifies financial sale confirmation routes use the shared Idempotency-Key workflow. */
test("sales confirmation routes are idempotent", async () => {
  const routes = await readFile(
    new URL("../src/modules/sales/sales.routes.ts", import.meta.url),
    "utf8",
  );

  assert.match(routes, /if \(input\.status === "CONFIRMED"\)[\s\S]*executeIdempotentMutation/);
  assert.match(routes, /handleConfirmSale[\s\S]*executeIdempotentMutation/);
  assert.match(routes, /key: request\.headers\["idempotency-key"\]/);
  assert.match(routes, /body: \{ saleId: params\.id, \.\.\.input \}/);
});

/** Verifies the Sales module is registered after its required dependencies. */
test("application registers the Sales module", async () => {
  const appSource = await readFile(
    new URL("../src/app.ts", import.meta.url),
    "utf8",
  );

  assert.match(appSource, /import \{ salesModule \} from "\.\/modules\/sales\/index\.js"/);
  assert.match(appSource, /await app\.register\(purchasesModule\);[\s\S]*await app\.register\(salesModule\);/);
});


// Pass 22 verifies that Counter Sales keeps the required stable business error codes.
test("sales service exposes the required Counter Sales error codes", async () => {
  const salesSource = await readFile(salesServicePath, "utf8");
  const inventorySource = await readFile(
    new URL("../src/modules/inventory/inventory.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(salesSource, /"SALE_NOT_FOUND"/);
  assert.match(salesSource, /"CUSTOMER_NOT_FOUND"/);
  assert.match(salesSource, /"INVALID_SALE_STATUS"/);
  assert.match(salesSource, /"PAYMENT_EXCEEDS_TOTAL"/);
  assert.match(salesSource, /"PRODUCT_INACTIVE"/);
  assert.match(salesSource, /"PRODUCT_UNIT_NOT_ALLOWED"/);
  assert.match(salesSource, /"WALK_IN_CUSTOMER_CREDIT_NOT_ALLOWED"/);
  assert.match(salesSource, /"CUSTOMER_CREDIT_LIMIT_EXCEEDED"/);
  assert.match(inventorySource, /"INSUFFICIENT_STOCK"/);
});

test("sales no longer contains the old confirmation-not-ready error", async () => {
  const salesSource = await readFile(salesServicePath, "utf8");

  assert.doesNotMatch(salesSource, /SALE_CONFIRMATION_NOT_READY/);
});



/** Verifies sale confirmation locks key rows before financial writes. */
test("sales confirmation locks sale and customer rows", async () => {
  const serviceSource = await readFile(salesServicePath, "utf8");

  assert.match(serviceSource, /findSaleByIdForUpdate\(transaction, saleId\)/);
  assert.match(
    serviceSource,
    /findCustomerByIdForUpdate\(transaction, sale\.customerId\)/,
  );
});

/** Verifies product work is sorted before inventory row locks are acquired. */
test("sales confirmation uses predictable inventory lock order", async () => {
  const serviceSource = await readFile(salesServicePath, "utf8");

  assert.match(serviceSource, /left\.productId\.localeCompare\(right\.productId\)/);
  assert.match(serviceSource, /recordSaleStockOut\(transaction/);
});

// Pass 24 groups the main Counter Sales acceptance scenarios in one readable test file.

/** Reads one named exported function body from a source file for focused workflow assertions. */
function exportedFunctionSource(source: string, functionName: string): string {
  const start = source.indexOf(`export async function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);

  const nextExport = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, nextExport === -1 ? undefined : nextExport);
}

test("registered customer sale schemas support cash, bank, mixed, partial, and full credit", () => {
  const bankAccountId = "00000000-0000-4000-8000-000000000005";

  const cash = confirmSaleSchema.safeParse({
    initialPayment: {
      splits: [{ method: "CASH", amount: "500.00", cashAccountId }],
    },
  });
  const bank = confirmSaleSchema.safeParse({
    initialPayment: {
      splits: [
        {
          method: "BANK_TRANSFER",
          amount: "500.00",
          bankAccountId,
        },
      ],
    },
  });
  const mixed = confirmSaleSchema.safeParse({
    initialPayment: {
      splits: [
        { method: "CASH", amount: "200.00", cashAccountId },
        {
          method: "BANK_TRANSFER",
          amount: "300.00",
          bankAccountId,
        },
      ],
    },
  });
  const partial = confirmSaleSchema.safeParse({
    initialPayment: {
      splits: [{ method: "CASH", amount: "100.00", cashAccountId }],
    },
  });
  const fullCredit = confirmSaleSchema.safeParse({});

  assert.equal(cash.success, true);
  assert.equal(bank.success, true);
  assert.equal(mixed.success, true);
  assert.equal(partial.success, true);
  assert.equal(fullCredit.success, true);
});

test("sale confirmation protects customer, product, unit, stock, payment, and walk-in rules", async () => {
  const salesSource = await readFile(salesServicePath, "utf8");
  const inventorySource = await readFile(
    new URL("../src/modules/inventory/inventory.service.ts", import.meta.url),
    "utf8",
  );
  const confirmation = exportedFunctionSource(
    salesSource,
    "confirmSaleInTransaction",
  );

  assert.match(confirmation, /CUSTOMER_INACTIVE/);
  assert.match(confirmation, /PRODUCT_INACTIVE/);
  assert.match(confirmation, /PRODUCT_UNIT_NOT_ALLOWED/);
  assert.match(confirmation, /PAYMENT_EXCEEDS_TOTAL/);
  assert.match(confirmation, /WALK_IN_CUSTOMER_CREDIT_NOT_ALLOWED/);
  assert.match(inventorySource, /INSUFFICIENT_STOCK/);
});

test("draft lifecycle stays editable before confirmation and immutable afterward", async () => {
  const salesSource = await readFile(salesServicePath, "utf8");
  const updateSource = exportedFunctionSource(salesSource, "updateSaleDraft");
  const cancelSource = exportedFunctionSource(salesSource, "cancelSaleDraft");
  const confirmation = exportedFunctionSource(
    salesSource,
    "confirmSaleInTransaction",
  );

  assert.match(updateSource, /existingSale\.status !== "DRAFT" && existingSale\.status !== "HELD"/);
  assert.match(cancelSource, /existingSale\.status !== "DRAFT"/);
  assert.match(confirmation, /sale\.status !== "DRAFT" && sale\.status !== "HELD"/);
});

test("confirmed sale creates stock, ledger, allocation, and cash-bank effects in one caller transaction", async () => {
  const salesSource = await readFile(salesServicePath, "utf8");
  const paymentsSource = await readFile(
    new URL("../src/modules/payments/payments.service.ts", import.meta.url),
    "utf8",
  );
  const confirmation = exportedFunctionSource(
    salesSource,
    "confirmSaleInTransaction",
  );
  const receipt = exportedFunctionSource(
    paymentsSource,
    "recordSaleInitialCustomerReceipt",
  );

  assert.match(confirmation, /recordSaleStockOut\(transaction/);
  assert.match(confirmation, /writeCustomerDebit\(transaction/);
  assert.match(confirmation, /recordSaleInitialCustomerReceipt\(transaction/);
  assert.match(confirmation, /markSaleConfirmed\(transaction/);
  assert.match(receipt, /createCustomerPaymentAllocations/);
  assert.match(receipt, /writeCustomerCredit\(database/);
  assert.match(receipt, /writeCashInflow\(database/);
  assert.match(receipt, /writeBankInflow\(database/);
});

test("sale confirmation uses exact initial paid and due snapshots", async () => {
  const salesSource = await readFile(salesServicePath, "utf8");
  const confirmation = exportedFunctionSource(
    salesSource,
    "confirmSaleInTransaction",
  );

  assert.match(confirmation, /const initialPaidAmount = scaledIntegerToDecimal\(paidCents, MONEY_SCALE\)/);
  assert.match(confirmation, /totalCents - paidCents/);
  assert.match(
    confirmation,
    /markSaleConfirmed\(transaction, sale\.id, \{[\s\S]*initialPaidAmount,[\s\S]*initialDueAmount/,
  );
});

test("same sale confirmation request is protected by the shared idempotency workflow", async () => {
  const routesSource = await readFile(
    new URL("../src/modules/sales/sales.routes.ts", import.meta.url),
    "utf8",
  );

  assert.match(routesSource, /handleConfirmSale[\s\S]*executeIdempotentMutation/);
  assert.match(routesSource, /key: request\.headers\["idempotency-key"\]/);
  assert.match(routesSource, /body: \{ saleId: params\.id, \.\.\.input \}/);
});

// Pass 25 verifies that the Counter Sales frontend is wired to the completed Module 10 workflows.
test("Counter Sales frontend supports draft, hold, edit, confirm, and cancel actions", async () => {
  const formSource = await readFile(
    new URL("../../web-admin/src/features/sales/components/sale-form.tsx", import.meta.url),
    "utf8",
  );

  assert.match(formSource, /saveEditableSale\("DRAFT"\)/);
  assert.match(formSource, /saveEditableSale\("HELD"\)/);
  assert.match(formSource, /updateSale\.mutateAsync/);
  assert.match(formSource, /confirmSale\.mutateAsync/);
  assert.match(formSource, /cancelSale\.mutateAsync/);
});

test("Counter Sales frontend validates payment totals and Walk-in full payment", async () => {
  const formSource = await readFile(
    new URL("../../web-admin/src/features/sales/components/sale-form.tsx", import.meta.url),
    "utf8",
  );

  assert.match(formSource, /calculatePaymentTotal\(paymentSplits\)/);
  assert.match(formSource, /PaymentSplitsForm/);
  assert.match(formSource, /paidCents > grandTotalCents/);
  assert.match(formSource, /selectedCustomer\?\.isWalkIn && paidCents !== grandTotalCents/);
  assert.match(formSource, /Walk-in Customer must pay the full sale total/);
});

test("confirmed-sale frontend refreshes all data changed by confirmation", async () => {
  const hooksSource = await readFile(
    new URL("../../web-admin/src/features/sales/hooks/use-sales.ts", import.meta.url),
    "utf8",
  );

  assert.match(hooksSource, /saleQueryKeys\.all/);
  assert.match(hooksSource, /customerQueryKeys\.all/);
  assert.match(hooksSource, /inventoryQueryKeys\.all/);
  assert.match(hooksSource, /ledgerQueryKeys\.all/);
  assert.match(hooksSource, /paymentQueryKeys\.all/);
  assert.match(hooksSource, /invalidateConfirmedSaleData/);
});

test("Counter Sales router exposes list, create, edit, and detail screens", async () => {
  const routerSource = await readFile(
    new URL("../../web-admin/src/app/router.tsx", import.meta.url),
    "utf8",
  );

  assert.match(routerSource, /path: "\/sales"/);
  assert.match(routerSource, /path: "\/sales\/new"/);
  assert.match(routerSource, /path: "\/sales\/\$saleId\/edit"/);
  assert.match(routerSource, /path: "\/sales\/\$saleId"/);
});

test("Sales list links editable invoices to edit and confirmed invoices to detail", async () => {
  const tableSource = await readFile(
    new URL("../../web-admin/src/features/sales/components/sale-table.tsx", import.meta.url),
    "utf8",
  );

  assert.match(tableSource, /sale\.status === "DRAFT" \|\| sale\.status === "HELD"/);
  assert.match(tableSource, /to="\/sales\/\$saleId\/edit"/);
  assert.match(tableSource, /to="\/sales\/\$saleId"/);
  assert.match(tableSource, /sale\.status === "HELD" \? "Resume" : "Edit"/);
});


test("Module 10 migration is registered in the Drizzle journal", async () => {
  const journal = await readFile(
    new URL("../drizzle/meta/_journal.json", import.meta.url),
    "utf8",
  );

  assert.match(journal, /0012_module_10_counter_sales/);
});

test("sales database line checks use two-decimal money rounding", async () => {
  const schemaSource = await readFile(
    new URL("../src/database/schema/sales.schema.ts", import.meta.url),
    "utf8",
  );
  const migrationSource = await readFile(
    new URL("../drizzle/0012_module_10_counter_sales.sql", import.meta.url),
    "utf8",
  );

  assert.match(
    schemaSource,
    /round\(\$\{table\.quantity\} \* \$\{table\.manualUnitPrice\}, 2\)/,
  );
  assert.match(
    migrationSource,
    /round\("quantity" \* "manual_unit_price", 2\)/,
  );
});


// Module 11 Pass 11 verifies Sales Return validation before stock or settlement side effects are added.
test("Sales Return preparation validates the original sale, item ownership, and remaining quantity", async () => {
  const returnsServiceSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(returnsServiceSource, /prepareSalesReturnCreation/);
  assert.match(returnsServiceSource, /findConfirmedSaleForReturn/);
  assert.match(returnsServiceSource, /findOriginalSaleItemForReturn/);
  assert.match(returnsServiceSource, /getSalesItemReturnedQuantity/);
  assert.match(returnsServiceSource, /RETURN_ITEM_NOT_FOUND/);
  assert.match(returnsServiceSource, /RETURN_QUANTITY_EXCEEDS_AVAILABLE/);
});

test("Sales Return preparation keeps price, cost, unit conversion, and stock condition snapshots", async () => {
  const returnsServiceSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(returnsServiceSource, /originalSaleItem\.manualUnitPrice/);
  assert.match(returnsServiceSource, /originalSaleItem\.unitCostSnapshot/);
  assert.match(returnsServiceSource, /originalSaleItem\.conversionToBaseSnapshot/);
  assert.match(returnsServiceSource, /stockCondition: input\.stockCondition/);
});

// Module 11 Pass 13 audit: Sales Return due reduction uses the immutable ledger writer.
test("sales return due reduction is prepared through customer ledger credit", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(serviceSource, /applyPreparedSalesReturnDueReduction/);
  assert.match(serviceSource, /getCustomerCurrentDue/);
  assert.match(serviceSource, /writeCustomerCredit/);
  assert.match(serviceSource, /referenceType:\s*"SALES_RETURN"/);
  assert.match(serviceSource, /RETURN_AMOUNT_EXCEEDS_CUSTOMER_DUE/);
});

// Module 11 Pass 14 audit: a CASH Sales Return uses the existing immutable payment movement writer.
test("sales return cash refund writes the customer return effect and cash outflow", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );
  const paymentSchemaSource = await readFile(
    new URL("../src/database/schema/payment.schema.ts", import.meta.url),
    "utf8",
  );
  const migrationSource = await readFile(
    new URL("../drizzle/0013_module_11_returns.sql", import.meta.url),
    "utf8",
  );

  assert.match(serviceSource, /applyPreparedSalesReturnCashRefund/);
  assert.match(serviceSource, /writeCustomerCredit/);
  assert.match(serviceSource, /writeCashOutflow/);
  assert.match(serviceSource, /sourceType:\s*"SALES_RETURN"/);
  assert.match(serviceSource, /accountId:\s*cashAccountId/);
  assert.match(paymentSchemaSource, /"SALES_RETURN"/);
  assert.match(migrationSource, /ADD VALUE IF NOT EXISTS 'SALES_RETURN'/);
});


// Module 11 Pass 15 audit: a BANK_TRANSFER Sales Return uses the existing immutable bank movement writer.
test("sales return bank refund writes the customer return effect and bank outflow", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(serviceSource, /applyPreparedSalesReturnBankRefund/);
  assert.match(serviceSource, /writeCustomerCredit/);
  assert.match(serviceSource, /writeBankOutflow/);
  assert.match(serviceSource, /sourceType:\s*"SALES_RETURN"/);
  assert.match(serviceSource, /accountId:\s*bankAccountId/);
  assert.match(serviceSource, /description:\s*"Sales return bank refund"/);
});

// Module 11 Pass 16 audit: return settlement is limited to the original sale and its retained paid amount.
test("sales return settlement prevents over-refunding the original sale", async () => {
  const repositorySource = await readFile(
    new URL("../src/modules/returns/returns.repository.ts", import.meta.url),
    "utf8",
  );
  const serviceSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(repositorySource, /getSalesReturnSettlementAmounts/);
  assert.match(repositorySource, /customerPaymentAllocations\.salesInvoiceId/);
  assert.match(repositorySource, /previousReturnAmount/);
  assert.match(repositorySource, /previousRefundAmount/);
  assert.match(serviceSource, /validatePreparedSalesReturnSettlement/);
  assert.match(serviceSource, /RETURN_AMOUNT_EXCEEDS_SALE_DUE/);
  assert.match(serviceSource, /RETURN_REFUND_EXCEEDS_PAID_AMOUNT/);
});

test("cash and bank return refunds settle the return credit without leaving customer credit", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );
  const ledgerServiceSource = await readFile(
    new URL("../src/modules/ledgers/ledgers.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(serviceSource, /writeCustomerDebit/);
  assert.match(serviceSource, /referenceType:\s*"SALES_RETURN_REFUND"/);
  assert.match(ledgerServiceSource, /"SALES_RETURN_REFUND"/);
});

/** Verifies Sales Return creation locks the source rows and keeps every side effect in one transaction. */
test("Module 11 Pass 22 creates Sales Returns with transaction-owned locks", async () => {
  const repositorySource = await readFile(
    new URL("../src/modules/returns/returns.repository.ts", import.meta.url),
    "utf8",
  );
  const serviceSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(repositorySource, /lockConfirmedSaleForReturn[\s\S]*?\.for\("update"\)/);
  assert.match(repositorySource, /lockOriginalSaleItemsForReturn[\s\S]*?\.for\("update"\)/);
  assert.match(serviceSource, /createConfirmedSalesReturn/);
  assert.match(serviceSource, /createConfirmedSalesReturnInTransaction/);
  assert.match(serviceSource, /findCustomerByIdForUpdate/);
  assert.match(serviceSource, /reserveBusinessDocumentNumberInTransaction[\s\S]*?"SALES_RETURN"/);
  assert.match(serviceSource, /createSalesReturnItems/);
  assert.match(serviceSource, /applyPreparedSalesReturnInventory/);
  assert.match(serviceSource, /applyPreparedSalesReturnDueReduction|applyPreparedSalesReturnCashRefund|applyPreparedSalesReturnBankRefund/);
});

test("Pass 23 exposes Sales Return creation for the shared idempotency transaction", async () => {
  const source = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /export async function createConfirmedSalesReturnInTransaction/);
  assert.match(
    source,
    /createConfirmedSalesReturnInTransaction\(transaction, input\)/,
  );
});

/** Verifies Pass 24 exposes only the required Sales Return routes with idempotent creation. */
test("Module 11 Pass 24 adds the required Sales Return routes", async () => {
  const source = await readFile(
    new URL("../src/modules/returns/returns.routes.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /app\.get\(\s*"\/sales-returns"/);
  assert.match(source, /app\.post\(\s*"\/sales-returns"/);
  assert.match(source, /app\.get\(\s*"\/sales-returns\/:id"/);
  assert.match(source, /executeIdempotentMutation/);
  assert.match(source, /createConfirmedSalesReturnInTransaction/);
  assert.match(source, /listSalesReturnsQuerySchema\.parse/);
  assert.match(source, /createSalesReturnSchema\.parse/);
  assert.match(source, /salesReturnIdParamsSchema\.parse/);
});


/** Verifies Pass 26 exposes safe field-aware Sales Return business errors through the shared handler. */
test("Module 11 Pass 26 keeps Sales Return errors safe and form-friendly", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );
  const errorHandlerSource = await readFile(
    new URL("../src/plugins/error-handler.plugin.ts", import.meta.url),
    "utf8",
  );

  assert.match(serviceSource, /type AppErrorField/);
  assert.match(serviceSource, /fields\?: AppErrorField\[\]/);
  assert.match(serviceSource, /field: "originalSaleItemId"/);
  assert.match(serviceSource, /field: "quantity"/);
  assert.match(serviceSource, /field: "refundMode"/);
  assert.match(errorHandlerSource, /readAppError\(error\)/);
  assert.match(errorHandlerSource, /safeError\.fields/);
});


test("module 11 pass 34 keeps confirmed sale corrections on the Sales Return workflow", async () => {
  const detailSource = await readFile(
    new URL("../../web-admin/src/features/sales/pages/sale-detail-page.tsx", import.meta.url),
    "utf8",
  );
  const returnFormSource = await readFile(
    new URL("../../web-admin/src/features/returns/components/sales-return-form.tsx", import.meta.url),
    "utf8",
  );
  const routerSource = await readFile(
    new URL("../../web-admin/src/app/router.tsx", import.meta.url),
    "utf8",
  );

  assert.match(detailSource, /Create sales return/);
  assert.match(detailSource, /search=\{\{ originalSaleId: saleId \}\}/);
  assert.match(returnFormSource, /initialOriginalSaleId/);
  assert.match(routerSource, /validateSearch/);
  assert.match(routerSource, /originalSaleId/);
});


/** Verifies Pass 37 keeps Sales Return data ready for date-based profit/report queries. */
test("Module 11 Pass 37 prepares Sales Returns for reports", async () => {
  const schemaSource = await readFile(
    new URL("../src/database/schema/return.schema.ts", import.meta.url),
    "utf8",
  );
  const migrationSource = await readFile(
    new URL("../drizzle/0013_module_11_returns.sql", import.meta.url),
    "utf8",
  );

  assert.match(schemaSource, /sales_returns_return_date_index/);
  assert.match(schemaSource, /unitPriceSnapshot/);
  assert.match(schemaSource, /unitCostSnapshot/);
  assert.match(schemaSource, /lineTotal/);
  assert.match(migrationSource, /sales_returns_return_date_index/);
});


// Module 11 Pass 38 adds focused Sales Return acceptance and regression coverage.
test("Sales Return schema accepts due reduction without a payment account", () => {
  const result = createSalesReturnSchema.safeParse({
    originalSaleId: "00000000-0000-4000-8000-000000000011",
    returnDate: "2026-08-08",
    reason: "Customer returned unopened stock.",
    refundMode: "DUE_REDUCTION",
    items: [
      {
        originalSaleItemId: "00000000-0000-4000-8000-000000000012",
        quantity: "1.000",
        stockCondition: "GOOD",
      },
    ],
  });

  assert.equal(result.success, true);
});

test("Sales Return schema enforces the account required by each refund mode", () => {
  const common = {
    originalSaleId: "00000000-0000-4000-8000-000000000011",
    returnDate: "2026-08-08",
    reason: "Customer return.",
    items: [
      {
        originalSaleItemId: "00000000-0000-4000-8000-000000000012",
        quantity: "1.000",
        stockCondition: "GOOD" as const,
      },
    ],
  };

  const cash = createSalesReturnSchema.safeParse({
    ...common,
    refundMode: "CASH",
    cashAccountId: "00000000-0000-4000-8000-000000000013",
  });
  const bank = createSalesReturnSchema.safeParse({
    ...common,
    refundMode: "BANK_TRANSFER",
    bankAccountId: "00000000-0000-4000-8000-000000000014",
  });
  const missingCashAccount = createSalesReturnSchema.safeParse({
    ...common,
    refundMode: "CASH",
  });
  const wrongBankAccount = createSalesReturnSchema.safeParse({
    ...common,
    refundMode: "BANK_TRANSFER",
    cashAccountId: "00000000-0000-4000-8000-000000000013",
  });
  const dueWithAccount = createSalesReturnSchema.safeParse({
    ...common,
    refundMode: "DUE_REDUCTION",
    cashAccountId: "00000000-0000-4000-8000-000000000013",
  });

  assert.equal(cash.success, true);
  assert.equal(bank.success, true);
  assert.equal(missingCashAccount.success, false);
  assert.equal(wrongBankAccount.success, false);
  assert.equal(dueWithAccount.success, false);
});

test("Sales Return schema rejects zero quantity and duplicate original sale items", () => {
  const originalSaleItemId = "00000000-0000-4000-8000-000000000012";
  const zeroQuantity = createSalesReturnSchema.safeParse({
    originalSaleId: "00000000-0000-4000-8000-000000000011",
    returnDate: "2026-08-08",
    reason: "Customer return.",
    refundMode: "DUE_REDUCTION",
    items: [
      {
        originalSaleItemId,
        quantity: "0.000",
        stockCondition: "GOOD",
      },
    ],
  });
  const duplicateItem = createSalesReturnSchema.safeParse({
    originalSaleId: "00000000-0000-4000-8000-000000000011",
    returnDate: "2026-08-08",
    reason: "Customer return.",
    refundMode: "DUE_REDUCTION",
    items: [
      { originalSaleItemId, quantity: "1.000", stockCondition: "GOOD" },
      { originalSaleItemId, quantity: "1.000", stockCondition: "DAMAGED" },
    ],
  });

  assert.equal(zeroQuantity.success, false);
  assert.equal(duplicateItem.success, false);
});

test("Sales Return list schema rejects reversed return-date ranges", () => {
  const result = listSalesReturnsQuerySchema.safeParse({
    startDate: "2026-08-10",
    endDate: "2026-08-08",
  });

  assert.equal(result.success, false);
});

test("Sales Return workflow keeps validation, inventory, settlement, and persistence in one transaction", async () => {
  const source = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );
  const creation = exportedFunctionSource(
    source,
    "createConfirmedSalesReturnInTransaction",
  );

  assert.match(creation, /lockConfirmedSaleForReturn\(transaction/);
  assert.match(creation, /findCustomerByIdForUpdate\(transaction/);
  assert.match(creation, /lockOriginalSaleItemsForReturn\(transaction/);
  assert.match(creation, /prepareSalesReturnCreation\(transaction/);
  assert.match(creation, /reserveBusinessDocumentNumberInTransaction\([\s\S]*"SALES_RETURN"/);
  assert.match(creation, /createSalesReturn\(transaction/);
  assert.match(creation, /createSalesReturnItems\(transaction/);
  assert.match(creation, /applyPreparedSalesReturnInventory\(transaction/);
  assert.match(
    creation,
    /applyPreparedSalesReturnDueReduction|applyPreparedSalesReturnCashRefund|applyPreparedSalesReturnBankRefund/,
  );
});

test("each Sales Return settlement path validates against original paid and due amounts", async () => {
  const source = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );

  for (const functionName of [
    "applyPreparedSalesReturnDueReduction",
    "applyPreparedSalesReturnCashRefund",
    "applyPreparedSalesReturnBankRefund",
  ]) {
    const settlementSource = exportedFunctionSource(source, functionName);
    assert.match(settlementSource, /validatePreparedSalesReturnSettlement\(/);
  }
});

test("Sales Return stock conditions map GOOD to sellable and damaged or expired to non-sellable stock", async () => {
  const source = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /condition === "GOOD"/);
  assert.match(source, /return "SELLABLE"/);
  assert.match(source, /return condition;/);
  assert.match(source, /"SELLABLE" \| "DAMAGED" \| "EXPIRED"/);
  assert.match(source, /recordSalesReturnStockIn\(database/);
});

test("Sales Return database keeps refund accounts, quantities, and immutable source snapshots constrained", async () => {
  const schemaSource = await readFile(
    new URL("../src/database/schema/return.schema.ts", import.meta.url),
    "utf8",
  );

  assert.match(schemaSource, /sales_returns_refund_account_check/);
  assert.match(schemaSource, /sales_return_items_quantity_positive_check/);
  assert.match(schemaSource, /sales_return_items_base_quantity_positive_check/);
  assert.match(schemaSource, /originalSaleItemId/);
  assert.match(schemaSource, /unitPriceSnapshot/);
  assert.match(schemaSource, /unitCostSnapshot/);
  assert.match(schemaSource, /stockCondition/);
});

test("Sales Return POST route requires authentication and shared idempotency", async () => {
  const routesSource = await readFile(
    new URL("../src/modules/returns/returns.routes.ts", import.meta.url),
    "utf8",
  );

  assert.match(routesSource, /preHandler: app\.authenticate/);
  assert.match(routesSource, /app\.post\(\s*"\/sales-returns"/);
  assert.match(routesSource, /executeIdempotentMutation/);
  assert.match(routesSource, /request\.headers\["idempotency-key"\]/);
  assert.match(routesSource, /createConfirmedSalesReturnInTransaction/);
});

/** Verifies the financial audit keeps Sales Return value inside the original discounted invoice value. */
test("Module 11 Pass 40 preserves discounted Sales Return value", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );
  const repositorySource = await readFile(
    new URL("../src/modules/returns/returns.repository.ts", import.meta.url),
    "utf8",
  );

  assert.match(serviceSource, /buildSaleItemReturnableValues/);
  assert.match(serviceSource, /originalSale\.invoiceDiscountAmount/);
  assert.match(serviceSource, /item\.lineTotal/);
  assert.match(serviceSource, /allocateMoneyProportionally/);
  assert.match(serviceSource, /calculateSalesReturnLineTotal/);
  assert.match(serviceSource, /alreadyReturnedAmount/);
  assert.match(repositorySource, /getSalesItemReturnedAmount/);
  assert.match(repositorySource, /sum\(\$\{salesReturnItems\.lineTotal\}\)/);
});

/** Verifies fully discounted Sales Returns can correct stock without writing an invalid zero ledger entry. */
test("Module 11 Pass 40 skips zero-value Sales Return ledger writes", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );
  const dueReductionBlock =
    serviceSource.match(/export async function applyPreparedSalesReturnDueReduction[\s\S]*?\n}/)?.[0] ?? "";

  assert.match(dueReductionBlock, /returnAmountCents === 0n/);
  assert.match(dueReductionBlock, /return;/);
  assert.match(dueReductionBlock, /writeCustomerCredit/);
});


/** Verifies concurrent Sales Returns serialize on the source invoice before prior-return totals are read. */
test("Module 11 Pass 41 serializes concurrent Sales Returns for one invoice", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );
  const repositorySource = await readFile(
    new URL("../src/modules/returns/returns.repository.ts", import.meta.url),
    "utf8",
  );

  const createBlock = exportedFunctionSource(
    serviceSource,
    "createConfirmedSalesReturnInTransaction",
  );
  const sourceLockPosition = createBlock.indexOf("lockConfirmedSaleForReturn");
  const itemLockPosition = createBlock.indexOf("lockOriginalSaleItemsForReturn");
  const preparePosition = createBlock.indexOf("prepareSalesReturnCreation");

  assert.ok(sourceLockPosition >= 0);
  assert.ok(itemLockPosition > sourceLockPosition);
  assert.ok(preparePosition > itemLockPosition);
  assert.match(repositorySource, /lockConfirmedSaleForReturn[\s\S]*?\.for\("update"\)/);
  assert.match(repositorySource, /lockOriginalSaleItemsForReturn[\s\S]*?orderBy\(asc\(salesInvoiceItems\.id\)\)[\s\S]*?\.for\("update"\)/);
});

/** Verifies Sales Return stock locks are requested in stable product order to reduce deadlock risk. */
test("Module 11 Pass 41 keeps Sales Return product lock order stable", async () => {
  const returnsSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );
  const inventorySource = await readFile(
    new URL("../src/modules/inventory/inventory.service.ts", import.meta.url),
    "utf8",
  );

  const applyBlock = exportedFunctionSource(
    returnsSource,
    "applyPreparedSalesReturnInventory",
  );
  const balanceBlock = exportedFunctionSource(
    inventorySource,
    "getOrCreateLockedBalance",
  );

  assert.match(applyBlock, /\.sort\([\s\S]*productId\.localeCompare/);
  assert.match(applyBlock, /for \(const item of items\)/);
  assert.match(balanceBlock, /acquireInventoryProductLock\(database, productId\)/);
  assert.match(balanceBlock, /lockInventoryBalanceByProductId/);
});

/** Pass 4 regression: reversed customer receipts must not count as refundable paid value on a Sales Return. */
test("sales return refundable paid amount excludes reversed customer receipts", async () => {
  const returnsRepositorySource = await readFile(
    new URL("../src/modules/returns/returns.repository.ts", import.meta.url),
    "utf8",
  );
  const paymentsRepositorySource = await readFile(
    new URL("../src/modules/payments/payments.repository.ts", import.meta.url),
    "utf8",
  );
  const paymentsServiceSource = await readFile(
    new URL("../src/modules/payments/payments.service.ts", import.meta.url),
    "utf8",
  );

  const settlementStart = returnsRepositorySource.indexOf(
    "export async function getSalesReturnSettlementAmounts",
  );
  const settlementEnd = returnsRepositorySource.indexOf(
    "/** Reads the original sale only when it is confirmed",
    settlementStart,
  );
  const settlementSection = returnsRepositorySource.slice(settlementStart, settlementEnd);

  assert.match(settlementSection, /eq\(customerPayments\.status, "CONFIRMED"\)/);
  assert.match(settlementSection, /isNull\(customerPayments\.reversalOfPaymentId\)/);
  assert.match(paymentsRepositorySource, /\.set\(\{ status: "REVERSED" \}\)/);
  assert.match(
    paymentsServiceSource,
    /markCustomerPaymentReversed\(\s*database,\s*payment\.id,\s*reversal\.id,\s*\)/s,
  );
});

// Audit Pass 2: registered-customer credit limits are enforced during confirmation.
test("sale confirmation enforces registered customer credit limit after locking the customer", async () => {
  const salesSource = await readFile(salesServicePath, "utf8");
  const confirmation = exportedFunctionSource(
    salesSource,
    "confirmSaleInTransaction",
  );

  assert.match(salesSource, /getCustomerCurrentDue/);
  assert.match(salesSource, /CUSTOMER_CREDIT_LIMIT_EXCEEDED/);
  assert.match(
    salesSource,
    /currentDueCents \+ newDueCents > creditLimitCents/,
  );
  assert.match(
    confirmation,
    /findCustomerByIdForUpdate\(transaction, sale\.customerId\)[\s\S]*requireCustomerCreditWithinLimit/,
  );
  assert.match(
    confirmation,
    /requireCustomerCreditWithinLimit\([\s\S]*customer\.creditLimit,[\s\S]*initialDueAmount/,
  );
});

test("walk-in sale keeps its stricter full-payment rule instead of credit-limit logic", async () => {
  const salesSource = await readFile(salesServicePath, "utf8");
  const confirmation = exportedFunctionSource(
    salesSource,
    "confirmSaleInTransaction",
  );

  assert.match(
    confirmation,
    /customer\.isWalkIn && paidCents !== totalCents/,
  );
  assert.match(
    confirmation,
    /if \(!customer\.isWalkIn\) \{[\s\S]*requireCustomerCreditWithinLimit/,
  );
});

// Audit Pass 12: customer credit concurrency depends on locking before reading the ledger due.
test("sale confirmation locks the customer before reading current due for credit-limit enforcement", async () => {
  const salesSource = await readFile(salesServicePath, "utf8");
  const confirmation = exportedFunctionSource(
    salesSource,
    "confirmSaleInTransaction",
  );

  const customerLockIndex = confirmation.indexOf(
    "findCustomerByIdForUpdate(transaction, sale.customerId)",
  );
  const creditCheckIndex = confirmation.indexOf(
    "requireCustomerCreditWithinLimit(",
  );

  assert.ok(customerLockIndex >= 0, "customer row lock must exist");
  assert.ok(creditCheckIndex >= 0, "customer credit check must exist");
  assert.ok(
    customerLockIndex < creditCheckIndex,
    "customer row must be locked before current due is calculated",
  );
});
