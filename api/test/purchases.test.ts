import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { AppError } from "../src/shared/errors/app-error.js";
import { calculatePurchase } from "../src/modules/purchases/purchases.service.js";

/** Verifies exact purchase totals, cost allocation, base quantities, and paid/due snapshots. */
test("calculates purchase totals and landed unit cost without floating-point drift", () => {
  const result = calculatePurchase(
    [
      {
        quantity: "2.000",
        conversionToBase: "12.000",
        unitCost: "120.00",
        itemDiscountAmount: "20.00",
      },
      {
        quantity: "5.000",
        conversionToBase: "1.000",
        unitCost: "20.00",
        itemDiscountAmount: "0.00",
      },
    ],
    "32.00",
    "28.80",
    ["100.00", "50.00"],
  );

  assert.equal(result.itemDiscountTotal, "20.00");
  assert.equal(result.subtotalAmount, "320.00");
  assert.equal(result.totalAmount, "316.80");
  assert.equal(result.initialPaidAmount, "150.00");
  assert.equal(result.initialDueAmount, "166.80");
  assert.deepEqual(
    result.items.map((item) => ({
      baseQuantity: item.baseQuantity,
      lineTotal: item.lineTotal,
      invoiceDiscountShare: item.invoiceDiscountShare,
      allocatedExtraCost: item.allocatedExtraCost,
      landedUnitCost: item.landedUnitCost,
    })),
    [
      {
        baseQuantity: "24.000",
        lineTotal: "220.00",
        invoiceDiscountShare: "22.00",
        allocatedExtraCost: "19.80",
        landedUnitCost: "9.08",
      },
      {
        baseQuantity: "5.000",
        lineTotal: "100.00",
        invoiceDiscountShare: "10.00",
        allocatedExtraCost: "9.00",
        landedUnitCost: "19.80",
      },
    ],
  );
});

/** Verifies item discounts cannot reduce a purchase line below zero. */
test("rejects an item discount above the line gross amount", () => {
  assert.throws(
    () =>
      calculatePurchase(
        [
          {
            quantity: "1.000",
            conversionToBase: "1.000",
            unitCost: "10.00",
            itemDiscountAmount: "10.01",
          },
        ],
        "0.00",
        "0.00",
      ),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR",
  );
});

/** Verifies initial payment cannot exceed the calculated purchase total. */
test("rejects an initial payment above the purchase total", () => {
  assert.throws(
    () =>
      calculatePurchase(
        [
          {
            quantity: "1.000",
            conversionToBase: "1.000",
            unitCost: "10.00",
            itemDiscountAmount: "0.00",
          },
        ],
        "0.00",
        "0.00",
        ["10.01"],
      ),
    (error: unknown) =>
      error instanceof AppError && error.code === "PAYMENT_EXCEEDS_TOTAL",
  );
});


/** Verifies confirmed purchase creation reuses the outer idempotency transaction. */
test("confirmed purchase creation uses the idempotency transaction without nesting", async () => {
  const routes = await readFile(
    new URL("../src/modules/purchases/purchases.routes.ts", import.meta.url),
    "utf8",
  );
  const service = await readFile(
    new URL("../src/modules/purchases/purchases.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(routes, /executeIdempotentMutation\([\s\S]*createPurchaseInTransaction\(transaction, input\)/);
  assert.match(service, /export async function createPurchaseInTransaction/);
});

/** Verifies saved-draft confirmation is protected by Idempotency-Key and binds the purchase ID into the request hash. */
test("saved purchase confirmation is idempotent per purchase resource", async () => {
  const routes = await readFile(
    new URL("../src/modules/purchases/purchases.routes.ts", import.meta.url),
    "utf8",
  );

  assert.match(routes, /handleConfirmPurchase[\s\S]*executeIdempotentMutation/);
  assert.match(routes, /key: request\.headers\["idempotency-key"\]/);
  assert.match(routes, /body: \{ purchaseId: params\.id, \.\.\.input \}/);
  assert.match(routes, /confirmPurchaseInTransaction\(transaction, params\.id, input\)/);
});

/** Verifies confirmation keeps the required purchase, sequence, inventory, ledger, and payment operations in one transaction-aware workflow. */
test("purchase confirmation keeps required lock and side effects in one workflow", async () => {
  const service = await readFile(
    new URL("../src/modules/purchases/purchases.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(service, /lockPurchaseById\(transaction, purchaseId\)/);
  assert.match(service, /reserveBusinessDocumentNumberInTransaction\([\s\S]*"PURCHASE"/);
  assert.match(service, /recordPurchaseStockIn\(transaction/);
  assert.match(service, /writeSupplierCredit\(transaction/);
  assert.match(service, /recordPurchaseInitialSupplierPayment\(transaction/);
  assert.match(service, /markPurchaseConfirmed\([\s\S]*transaction/);
});


/** Verifies confirmed purchases remain immutable through repository status guards. */
test("purchase repository only mutates draft rows", async () => {
  const repository = await readFile(
    new URL("../src/modules/purchases/purchases.repository.ts", import.meta.url),
    "utf8",
  );

  assert.match(repository, /updatePurchaseDraft[\s\S]*eq\(purchases\.status, "DRAFT"\)/);
  assert.match(repository, /markPurchaseConfirmed[\s\S]*eq\(purchases\.status, "DRAFT"\)/);
  assert.match(repository, /markPurchaseCancelled[\s\S]*eq\(purchases\.status, "DRAFT"\)/);
});

/** Verifies current outstanding is derived from confirmed allocations instead of an editable purchase field. */
test("purchase outstanding is calculated from confirmed supplier payment allocations", async () => {
  const repository = await readFile(
    new URL("../src/modules/purchases/purchases.repository.ts", import.meta.url),
    "utf8",
  );
  const service = await readFile(
    new URL("../src/modules/purchases/purchases.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(repository, /getPurchaseOutstandingAmount/);
  assert.match(repository, /supplierPayments\.status} = 'CONFIRMED'/);
  assert.match(repository, /reversalOfPaymentId} is null/);
  assert.match(repository, /greatest\(\$\{purchases\.totalAmount} - \$\{paidAmount}, 0\)/);
  assert.match(service, /currentOutstandingAmount/);
});

/** Verifies the Purchase service exposes the stable business errors required by Module 9. */
test("purchase service keeps the required stable business error codes", async () => {
  const service = await readFile(
    new URL("../src/modules/purchases/purchases.service.ts", import.meta.url),
    "utf8",
  );

  for (const code of [
    "SUPPLIER_NOT_FOUND",
    "PURCHASE_NOT_FOUND",
    "INVALID_PURCHASE_STATUS",
    "PAYMENT_EXCEEDS_TOTAL",
    "PRODUCT_UNIT_NOT_ALLOWED",
  ]) {
    assert.match(service, new RegExp(code));
  }
});


/** Verifies POST /purchases keeps draft creation separate from immediate confirmation. */
test("purchase create route supports draft and confirmed workflows", async () => {
  const routes = await readFile(
    new URL("../src/modules/purchases/purchases.routes.ts", import.meta.url),
    "utf8",
  );

  assert.match(routes, /app\.post\([\s\S]*"\/purchases"[\s\S]*handleCreatePurchase/);
  assert.match(routes, /if \(input\.status === "CONFIRMED"\)[\s\S]*executeIdempotentMutation/);
  assert.match(routes, /const result = await createPurchase\(app\.db, input\)/);
});

/** Verifies draft creation validates master data and writes only purchase header/items. */
test("purchase draft creation validates supplier product and unit without side effects", async () => {
  const service = await readFile(
    new URL("../src/modules/purchases/purchases.service.ts", import.meta.url),
    "utf8",
  );

  const draftBlock = service.match(/async function createDraftPurchase[\s\S]*?return \{ purchase, items \};\n\}/)?.[0] ?? "";
  assert.match(draftBlock, /requireActiveSupplier\(database, input\.supplierId\)/);
  assert.match(draftBlock, /preparePurchaseItems\(database, input\)/);
  assert.match(draftBlock, /insertPurchase\(database/);
  assert.match(draftBlock, /createPurchaseItems\(database/);
  assert.doesNotMatch(draftBlock, /recordPurchaseStockIn|writeSupplierCredit|recordPurchaseInitialSupplierPayment/);
});

/** Verifies Purchase item preparation stores current product and unit snapshots. */
test("purchase item preparation validates active product units and stores snapshots", async () => {
  const service = await readFile(
    new URL("../src/modules/purchases/purchases.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(service, /requirePurchaseProductUnit\([\s\S]*productId[\s\S]*productUnitId/);
  assert.match(service, /productSkuSnapshot:/);
  assert.match(service, /productNameSnapshot:/);
  assert.match(service, /unitNameSnapshot:/);
  assert.match(service, /conversionToBaseSnapshot:/);
});

/** Verifies proportional extra cost preserves the exact purchase-level amount after rounding. */
test("proportional extra cost allocation preserves the exact total", () => {
  const result = calculatePurchase(
    [
      { quantity: "1.000", conversionToBase: "1.000", unitCost: "10.00", itemDiscountAmount: "0.00" },
      { quantity: "1.000", conversionToBase: "1.000", unitCost: "10.00", itemDiscountAmount: "0.00" },
      { quantity: "1.000", conversionToBase: "1.000", unitCost: "10.00", itemDiscountAmount: "0.00" },
    ],
    "0.00",
    "0.01",
  );

  assert.equal(result.items.reduce((sum, item) => sum + Number(item.allocatedExtraCost), 0), 0.01);
  assert.equal(result.totalAmount, "30.01");
});

/** Verifies draft edit and cancellation both lock the purchase and remain DRAFT-only. */
test("purchase draft edit and cancel lock the row and enforce draft status", async () => {
  const service = await readFile(
    new URL("../src/modules/purchases/purchases.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(service, /updatePurchaseDraft[\s\S]*lockPurchaseById\(transaction, purchaseId\)/);
  assert.match(service, /cancelPurchase[\s\S]*lockPurchaseById\(transaction, purchaseId\)/);
  assert.match(service, /requireDraftPurchase/);
});

/** Verifies confirmation creates inventory and supplier-ledger effects before final status update. */
test("purchase confirmation creates stock and supplier ledger effects atomically", async () => {
  const service = await readFile(
    new URL("../src/modules/purchases/purchases.service.ts", import.meta.url),
    "utf8",
  );

  const confirmBlock = service.match(/export async function confirmPurchaseInTransaction[\s\S]*?return \{/i)?.[0] ?? service;
  assert.match(confirmBlock, /recordPurchaseStockIn\(transaction/);
  assert.match(confirmBlock, /writeSupplierCredit\(transaction/);
  assert.match(confirmBlock, /markPurchaseConfirmed\(\s*transaction/);
});

/** Verifies purchase stock-in uses landed cost so Inventory can update weighted-average cost correctly. */
test("purchase confirmation sends landed unit cost into weighted-average inventory stock-in", async () => {
  const purchaseService = await readFile(
    new URL("../src/modules/purchases/purchases.service.ts", import.meta.url),
    "utf8",
  );
  const inventoryService = await readFile(
    new URL("../src/modules/inventory/inventory.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(purchaseService, /recordPurchaseStockIn\(transaction,[\s\S]*unitCost: item\.landedUnitCost/);
  assert.match(inventoryService, /recordPurchaseStockIn[\s\S]*applyStockIn\(database, balance,[\s\S]*unitCost: input\.unitCost/);
});

/** Verifies optional initial payment creates the normal supplier-payment accounting chain. */
test("purchase initial payment creates payment allocation ledger debit and account outflows", async () => {
  const paymentsService = await readFile(
    new URL("../src/modules/payments/payments.service.ts", import.meta.url),
    "utf8",
  );

  const block = paymentsService.match(/export async function recordPurchaseInitialSupplierPayment[\s\S]*?return payment;\n\}/)?.[0] ?? "";
  assert.match(block, /insertSupplierPayment/);
  assert.match(block, /createSupplierPaymentSplits/);
  assert.match(block, /createSupplierPaymentAllocations/);
  assert.match(block, /writeSupplierDebit/);
  assert.match(block, /writeCashOutflow/);
  assert.match(block, /writeBankOutflow/);
});

/** Verifies standalone supplier-payment document numbers use the reserved prefix and number. */
test("supplier payment formats the reserved document sequence before saving", async () => {
  const paymentsService = await readFile(
    new URL("../src/modules/payments/payments.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(paymentsService, /const reservedNumber = await reserveBusinessDocumentNumberInTransaction\([\s\S]*"SUPPLIER_PAYMENT"/);
  assert.match(paymentsService, /const documentNumber = `\$\{reservedNumber\.prefix\}-\$\{reservedNumber\.number\}`/);
});

/** Verifies the initial payment amount still cannot exceed the purchase total at confirmation time. */
test("purchase confirmation recalculates initial paid and due snapshots before final confirmation", async () => {
  const service = await readFile(
    new URL("../src/modules/purchases/purchases.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(service, /const paymentSplitAmounts = input\.initialPayment\?\.splits\.map/);
  assert.match(service, /calculatePurchase\([\s\S]*paymentSplitAmounts/);
  assert.match(service, /initialPaidAmount: paymentTotals\.initialPaidAmount/);
  assert.match(service, /initialDueAmount: paymentTotals\.initialDueAmount/);
});

/** Verifies the idempotent route owns the same transaction as immediate confirmation side effects. */
test("idempotent create-and-confirm keeps all purchase effects in the caller transaction", async () => {
  const routes = await readFile(
    new URL("../src/modules/purchases/purchases.routes.ts", import.meta.url),
    "utf8",
  );
  const service = await readFile(
    new URL("../src/modules/purchases/purchases.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(routes, /executeIdempotentMutation\([\s\S]*createPurchaseInTransaction\(transaction, input\)/);
  assert.match(service, /createPurchaseInTransaction[\s\S]*confirmPurchaseInTransaction\(transaction, created\.purchase\.id/);
});

/** Verifies confirmation side effects all receive the same transaction, so a thrown step rolls the workflow back. */
test("purchase confirmation passes one transaction through every irreversible side effect", async () => {
  const service = await readFile(
    new URL("../src/modules/purchases/purchases.service.ts", import.meta.url),
    "utf8",
  );

  for (const pattern of [
    /lockPurchaseById\(transaction, purchaseId\)/,
    /reserveBusinessDocumentNumberInTransaction\(\s*transaction/,
    /recordPurchaseStockIn\(transaction/,
    /writeSupplierCredit\(transaction/,
    /recordPurchaseInitialSupplierPayment\(transaction/,
    /markPurchaseConfirmed\(\s*transaction/,
  ]) {
    assert.match(service, pattern);
  }
});


/** Verifies supplier-payment reversals also store the formatted reserved document number. */
test("supplier payment reversal formats the reserved document sequence before saving", async () => {
  const paymentsService = await readFile(
    new URL("../src/modules/payments/payments.service.ts", import.meta.url),
    "utf8",
  );

  const reversalBlock = paymentsService.match(/export async function reverseSupplierPayment[\s\S]*?return buildSupplierPaymentDetail/i)?.[0] ?? paymentsService;
  assert.match(reversalBlock, /const reservedNumber = await reserveBusinessDocumentNumberInTransaction\([\s\S]*"SUPPLIER_PAYMENT"/);
  assert.match(reversalBlock, /const documentNumber = `\$\{reservedNumber\.prefix\}-\$\{reservedNumber\.number\}`/);
});

/** Verifies old supplier balances remain payable even after the supplier is deactivated. */
test("supplier settlement does not require an active supplier", async () => {
  const paymentsService = await readFile(
    new URL("../src/modules/payments/payments.service.ts", import.meta.url),
    "utf8",
  );
  const purchaseService = await readFile(
    new URL("../src/modules/purchases/purchases.service.ts", import.meta.url),
    "utf8",
  );

  const supplierPaymentBlock = paymentsService.match(/export async function createSupplierPayment[\s\S]*?return buildSupplierPaymentDetail/i)?.[0] ?? "";
  assert.match(supplierPaymentBlock, /findSupplierById\(database, input\.supplierId\)/);
  assert.doesNotMatch(supplierPaymentBlock, /supplier\.isActive/);
  assert.match(purchaseService, /requireActiveSupplier\(transaction, purchase\.supplierId\)/);
});

/** Verifies Purchase Returns calculate already-returned quantity from immutable return items. */
test("purchase return repository sums previously returned quantity", async () => {
  const repository = await readFile(
    new URL("../src/modules/returns/returns.repository.ts", import.meta.url),
    "utf8",
  );

  const returnedQuantityBlock =
    repository.match(/export async function getPurchaseItemReturnedQuantity[\s\S]*?return rows\[0\]\?\.returnedQuantity \?\? "0\.000";\n}/)?.[0] ?? "";

  assert.match(returnedQuantityBlock, /sum\(\$\{purchaseReturnItems\.quantity}\)/);
  assert.match(
    returnedQuantityBlock,
    /eq\(purchaseReturnItems\.originalPurchaseItemId, originalPurchaseItemId\)/,
  );
});


/** Verifies the Purchase Return service exposes simple list and detail read workflows. */
test("purchase return service lists and reads confirmed return details", async () => {
  const service = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    service,
    /export async function listPurchaseReturns[\s\S]*readPurchaseReturns\(database, query\)[\s\S]*countPurchaseReturns\(database, query\)/,
  );
  assert.match(
    service,
    /export async function getPurchaseReturn[\s\S]*findPurchaseReturnById\(database, purchaseReturnId\)[\s\S]*findPurchaseReturnItems\(database, purchaseReturn\.id\)[\s\S]*findConfirmedPurchaseForReturn\(database, purchaseReturn\.originalPurchaseId\)/,
  );
  assert.match(service, /"PURCHASE_RETURN_NOT_FOUND"/);
  assert.match(service, /"ORIGINAL_PURCHASE_NOT_FOUND"/);
  assert.match(service, /supplierBalanceResult:\s*\{\s*reductionAmount: purchaseReturn\.totalAmount/);
});

// Module 11 Pass 18: Purchase Return validation must use original immutable purchase snapshots.
test("purchase return validation uses original purchase items and remaining quantity", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(serviceSource, /preparePurchaseReturnCreation/);
  assert.match(serviceSource, /findConfirmedPurchaseForReturn/);
  assert.match(serviceSource, /findOriginalPurchaseItemForReturn/);
  assert.match(serviceSource, /getPurchaseItemReturnedQuantity/);
  assert.match(serviceSource, /RETURN_QUANTITY_EXCEEDS_AVAILABLE/);
  assert.match(serviceSource, /originalPurchaseItem\.landedUnitCost/);
});


test("Module 11 Pass 19 keeps Purchase Return inventory integration simple and transactional", async () => {
  const inventorySource = await readFile(
    new URL("../src/modules/inventory/inventory.service.ts", import.meta.url),
    "utf8",
  );
  const returnsSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(inventorySource, /recordPurchaseReturnStockOut/);
  assert.match(inventorySource, /movementType: "PURCHASE_RETURN"/);
  assert.match(inventorySource, /stockCondition: "SELLABLE"/);
  assert.match(inventorySource, /direction: "OUT"/);
  assert.match(inventorySource, /sourceType: "PURCHASE_RETURN"/);
  assert.match(returnsSource, /applyPreparedPurchaseReturnInventory/);
  assert.match(returnsSource, /quantity: item\.baseQuantity/);
  assert.match(returnsSource, /unitCost: item\.unitCostSnapshot/);
});


/** Verifies Purchase Returns reduce supplier payable through one immutable supplier-ledger debit. */
test("Module 11 Pass 20 applies Purchase Return supplier ledger debit", async () => {
  const returnsSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );

  const block =
    returnsSource.match(/export async function applyPreparedPurchaseReturnSupplierLedger[\s\S]*?\n}/)?.[0] ?? "";

  assert.match(block, /writeSupplierDebit\(database/);
  assert.match(block, /supplierId: prepared\.originalPurchase\.supplierId/);
  assert.match(block, /amount: prepared\.totalAmount/);
  assert.match(block, /referenceType: "PURCHASE_RETURN"/);
  assert.match(block, /referenceId: purchaseReturnId/);
});


/** Verifies a Purchase Return cannot create a negative supplier payable. */
test("Module 11 Pass 21 blocks Purchase Return above current supplier payable", async () => {
  const returnsSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );

  const validationBlock =
    returnsSource.match(/export async function validatePreparedPurchaseReturnPayable[\s\S]*?\n}/)?.[0] ?? "";
  const ledgerBlock =
    returnsSource.match(/export async function applyPreparedPurchaseReturnSupplierLedger[\s\S]*?\n}/)?.[0] ?? "";

  assert.match(validationBlock, /getSupplierCurrentPayable/);
  assert.match(validationBlock, /returnAmountCents > currentPayableCents/);
  assert.match(validationBlock, /PURCHASE_RETURN_EXCEEDS_SUPPLIER_PAYABLE/);
  assert.match(validationBlock, /supplier refund\/credit cash-bank flow/);
  assert.match(ledgerBlock, /validatePreparedPurchaseReturnPayable\(database, prepared\)/);
  assert.match(ledgerBlock, /writeSupplierDebit\(database/);
});

/** Verifies Purchase Return creation locks source rows and writes stock/payable effects atomically. */
test("Module 11 Pass 22 creates Purchase Returns with transaction-owned locks", async () => {
  const repositorySource = await readFile(
    new URL("../src/modules/returns/returns.repository.ts", import.meta.url),
    "utf8",
  );
  const serviceSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );
  const supplierRepositorySource = await readFile(
    new URL("../src/modules/suppliers/suppliers.repository.ts", import.meta.url),
    "utf8",
  );

  assert.match(repositorySource, /lockConfirmedPurchaseForReturn[\s\S]*?\.for\("update"\)/);
  assert.match(repositorySource, /lockOriginalPurchaseItemsForReturn[\s\S]*?\.for\("update"\)/);
  assert.match(supplierRepositorySource, /findSupplierByIdForUpdate[\s\S]*?\.for\("update"\)/);
  assert.match(serviceSource, /createConfirmedPurchaseReturn/);
  assert.match(serviceSource, /reserveBusinessDocumentNumberInTransaction[\s\S]*?"PURCHASE_RETURN"/);
  assert.match(serviceSource, /applyPreparedPurchaseReturnInventory/);
  assert.match(serviceSource, /applyPreparedPurchaseReturnSupplierLedger/);
});

test("Pass 23 exposes Purchase Return creation for the shared idempotency transaction", async () => {
  const source = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /export async function createConfirmedPurchaseReturnInTransaction/);
  assert.match(
    source,
    /createConfirmedPurchaseReturnInTransaction\(transaction, input\)/,
  );
});

/** Verifies Module 11 exposes the required authenticated Purchase Return routes with idempotent creation. */
test("purchase return routes expose list, create, and detail endpoints", async () => {
  const routes = await readFile(
    new URL("../src/modules/returns/returns.routes.ts", import.meta.url),
    "utf8",
  );
  const moduleIndex = await readFile(
    new URL("../src/modules/returns/index.ts", import.meta.url),
    "utf8",
  );
  const appSource = await readFile(
    new URL("../src/app.ts", import.meta.url),
    "utf8",
  );

  assert.match(routes, /app\.get\(\s*"\/purchase-returns"/);
  assert.match(routes, /app\.post\(\s*"\/purchase-returns"/);
  assert.match(routes, /app\.get\(\s*"\/purchase-returns\/:id"/);
  assert.match(routes, /handleCreatePurchaseReturn[\s\S]*executeIdempotentMutation/);
  assert.match(routes, /createConfirmedPurchaseReturnInTransaction\(transaction, input\)/);
  assert.match(moduleIndex, /registerPurchaseReturnRoutes\(app\)/);
  assert.match(appSource, /app\.register\(returnsModule\)/);
});


/** Verifies Pass 26 exposes safe field-aware Purchase Return business errors. */
test("Module 11 Pass 26 keeps Purchase Return errors safe and form-friendly", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );
  const routesSource = await readFile(
    new URL("../src/modules/returns/returns.routes.ts", import.meta.url),
    "utf8",
  );

  assert.match(serviceSource, /field: "originalPurchaseItemId"/);
  assert.match(serviceSource, /PURCHASE_RETURN_EXCEEDS_SUPPLIER_PAYABLE/);
  assert.match(serviceSource, /field: "items"/);
  assert.match(routesSource, /openApiPrivateErrors/);
});


test("Purchase confirmation reuses one idempotency key across ambiguous retries", async () => {
  const formSource = await readFile(
    new URL("../../web-admin/src/features/purchases/components/purchase-form.tsx", import.meta.url),
    "utf8",
  );
  const apiSource = await readFile(
    new URL("../../web-admin/src/features/purchases/api/purchases.api.ts", import.meta.url),
    "utf8",
  );

  assert.match(formSource, /const confirmationKey = useRef\(crypto\.randomUUID\(\)\)/);
  assert.match(formSource, /idempotencyKey: confirmationKey\.current/);
  assert.match(formSource, /if \(!confirmationRequestStarted\.current\)/);
  assert.match(formSource, /confirmationRequestStarted\.current = true/);
  assert.doesNotMatch(formSource, /idempotencyKey: crypto\.randomUUID\(\)/);
  assert.doesNotMatch(apiSource, /idempotencyKey \?\? crypto\.randomUUID/);
});

/** Verifies Pass 35 keeps confirmed purchase corrections on the Purchase Return workflow. */
test("Module 11 Pass 35 integrates confirmed purchases with Purchase Returns", async () => {
  const detailSource = await readFile(
    new URL("../../web-admin/src/features/purchases/pages/purchase-detail-page.tsx", import.meta.url),
    "utf8",
  );
  const returnFormSource = await readFile(
    new URL("../../web-admin/src/features/returns/components/purchase-return-form.tsx", import.meta.url),
    "utf8",
  );
  const routerSource = await readFile(
    new URL("../../web-admin/src/app/router.tsx", import.meta.url),
    "utf8",
  );

  assert.match(detailSource, /Create purchase return/);
  assert.match(detailSource, /search=\{\{ originalPurchaseId: purchaseId \}\}/);
  assert.match(returnFormSource, /initialOriginalPurchaseId/);
  assert.match(returnFormSource, /idempotencyKey: idempotencyKey\.current/);
  assert.doesNotMatch(returnFormSource, /idempotencyKey: crypto\.randomUUID\(\)/);
  assert.match(routerSource, /NewPurchaseReturnSearch/);
  assert.match(routerSource, /originalPurchaseId/);
});


/** Verifies Pass 37 keeps Purchase Return data ready for date-based report queries. */
test("Module 11 Pass 37 prepares Purchase Returns for reports", async () => {
  const schemaSource = await readFile(
    new URL("../src/database/schema/return.schema.ts", import.meta.url),
    "utf8",
  );
  const migrationSource = await readFile(
    new URL("../drizzle/0013_module_11_returns.sql", import.meta.url),
    "utf8",
  );

  assert.match(schemaSource, /purchase_returns_return_date_index/);
  assert.match(schemaSource, /unitCostSnapshot/);
  assert.match(schemaSource, /lineTotal/);
  assert.match(migrationSource, /purchase_returns_return_date_index/);
});

/** Verifies Purchase Return request validation keeps source items unique and quantities positive. */
test("Module 11 Pass 39 validates Purchase Return request boundaries", async () => {
  const schemaSource = await readFile(
    new URL("../src/modules/returns/returns.schema.ts", import.meta.url),
    "utf8",
  );

  const purchaseItemBlock =
    schemaSource.match(/const purchaseReturnItemSchema[\s\S]*?\.strict\(\);/)?.[0] ?? "";
  const createBlock =
    schemaSource.match(/export const createPurchaseReturnSchema[\s\S]*?validateUniquePurchaseReturnItems\(input\.items, context\);[\s\S]*?\}\);/)?.[0] ?? "";

  assert.match(purchaseItemBlock, /originalPurchaseItemId: uuidSchema/);
  assert.match(purchaseItemBlock, /quantity: positiveQuantitySchema/);
  assert.match(createBlock, /originalPurchaseId: uuidSchema/);
  assert.match(createBlock, /reason: reasonSchema/);
  assert.match(createBlock, /\.min\(1, "At least one purchase return item is required\."\)/);
  assert.match(createBlock, /validateUniquePurchaseReturnItems/);
});

/** Verifies Purchase Return preparation always uses the confirmed original purchase and immutable cost snapshots. */
test("Module 11 Pass 39 protects original Purchase Return source data", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );

  const itemBlock =
    serviceSource.match(/async function preparePurchaseReturnItem[\s\S]*?\n}/)?.[0] ?? "";
  const prepareBlock =
    serviceSource.match(/export async function preparePurchaseReturnCreation[\s\S]*?\n}/)?.[0] ?? "";

  assert.match(prepareBlock, /findConfirmedPurchaseForReturn/);
  assert.match(itemBlock, /findOriginalPurchaseItemForReturn/);
  assert.match(itemBlock, /getPurchaseItemReturnedQuantity/);
  assert.match(itemBlock, /RETURN_QUANTITY_EXCEEDS_AVAILABLE/);
  assert.match(itemBlock, /originalPurchaseItem\.conversionToBaseSnapshot/);
  assert.match(itemBlock, /originalPurchaseItem\.landedUnitCost/);
  assert.match(itemBlock, /calculatePurchaseReturnLineTotal/);
});

/** Verifies confirmed Purchase Return creation keeps stock and supplier-payable effects in one locked transaction. */
test("Module 11 Pass 39 keeps Purchase Return financial effects atomic", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );
  const repositorySource = await readFile(
    new URL("../src/modules/returns/returns.repository.ts", import.meta.url),
    "utf8",
  );

  const createBlock =
    serviceSource.match(/export async function createConfirmedPurchaseReturnInTransaction[\s\S]*?return getPurchaseReturn\(transaction, savedReturn\.id\);\n}/)?.[0] ?? "";

  assert.match(repositorySource, /lockConfirmedPurchaseForReturn[\s\S]*?\.for\("update"\)/);
  assert.match(repositorySource, /lockOriginalPurchaseItemsForReturn[\s\S]*?\.for\("update"\)/);
  assert.match(createBlock, /findSupplierByIdForUpdate/);
  assert.match(createBlock, /validatePreparedPurchaseReturnPayable/);
  assert.match(createBlock, /reserveBusinessDocumentNumberInTransaction[\s\S]*?"PURCHASE_RETURN"/);
  assert.match(createBlock, /createPurchaseReturnItems/);
  assert.match(createBlock, /applyPreparedPurchaseReturnInventory/);
  assert.match(createBlock, /applyPreparedPurchaseReturnSupplierLedger/);
});

/** Verifies Purchase Returns remove sellable stock using the original cost snapshot. */
test("Module 11 Pass 39 verifies Purchase Return stock-out behavior", async () => {
  const inventorySource = await readFile(
    new URL("../src/modules/inventory/inventory.service.ts", import.meta.url),
    "utf8",
  );
  const returnsSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );

  const inventoryBlock =
    inventorySource.match(/export async function recordPurchaseReturnStockOut[\s\S]*?\n}/)?.[0] ?? "";
  const applyBlock =
    returnsSource.match(/export async function applyPreparedPurchaseReturnInventory[\s\S]*?\n}/)?.[0] ?? "";

  assert.match(inventoryBlock, /movementType: "PURCHASE_RETURN"/);
  assert.match(inventoryBlock, /stockCondition: "SELLABLE"/);
  assert.match(inventoryBlock, /direction: "OUT"/);
  assert.match(inventoryBlock, /sourceType: "PURCHASE_RETURN"/);
  assert.match(applyBlock, /quantity: item\.baseQuantity/);
  assert.match(applyBlock, /unitCost: item\.unitCostSnapshot/);
});

/** Verifies Purchase Returns reduce supplier payable and never silently create a negative payable. */
test("Module 11 Pass 39 verifies Purchase Return supplier settlement protection", async () => {
  const returnsSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );

  const validationBlock =
    returnsSource.match(/export async function validatePreparedPurchaseReturnPayable[\s\S]*?\n}/)?.[0] ?? "";
  const ledgerBlock =
    returnsSource.match(/export async function applyPreparedPurchaseReturnSupplierLedger[\s\S]*?\n}/)?.[0] ?? "";

  assert.match(validationBlock, /getSupplierCurrentPayable/);
  assert.match(validationBlock, /returnAmountCents > currentPayableCents/);
  assert.match(validationBlock, /PURCHASE_RETURN_EXCEEDS_SUPPLIER_PAYABLE/);
  assert.match(ledgerBlock, /writeSupplierDebit/);
  assert.match(ledgerBlock, /referenceType: "PURCHASE_RETURN"/);
  assert.match(ledgerBlock, /amount: prepared\.totalAmount/);
});

/** Verifies the database keeps Purchase Return source links and immutable snapshot checks. */
test("Module 11 Pass 39 verifies Purchase Return database integrity", async () => {
  const migrationSource = await readFile(
    new URL("../drizzle/0013_module_11_returns.sql", import.meta.url),
    "utf8",
  );

  assert.match(migrationSource, /purchase_returns_original_purchase_id_purchases_id_fk/);
  assert.match(migrationSource, /purchase_returns_supplier_id_suppliers_id_fk/);
  assert.match(migrationSource, /purchase_return_items_original_purchase_item_id_purchase_items_id_fk/);
  assert.match(migrationSource, /purchase_return_items_quantity_positive_check/);
  assert.match(migrationSource, /purchase_return_items_base_quantity_positive_check/);
  assert.match(migrationSource, /purchase_return_items_unit_cost_non_negative_check/);
  assert.match(migrationSource, /purchase_return_items_line_total_non_negative_check/);
});

/** Verifies Purchase Return API creation remains authenticated and idempotent. */
test("Module 11 Pass 39 verifies Purchase Return route safety", async () => {
  const routesSource = await readFile(
    new URL("../src/modules/returns/returns.routes.ts", import.meta.url),
    "utf8",
  );

  const createHandler =
    routesSource.match(/async function handleCreatePurchaseReturn[\s\S]*?\n  }/)?.[0] ?? "";

  assert.match(routesSource, /preHandler: app\.authenticate/);
  assert.match(routesSource, /app\.post\(\s*"\/purchase-returns"/);
  assert.match(createHandler, /executeIdempotentMutation/);
  assert.match(createHandler, /createConfirmedPurchaseReturnInTransaction\(transaction, input\)/);
});

/** Verifies zero-value Purchase Returns correct stock without creating an invalid zero supplier-ledger entry. */
test("Module 11 Pass 40 skips zero-value Purchase Return ledger writes", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );
  const ledgerBlock =
    serviceSource.match(/export async function applyPreparedPurchaseReturnSupplierLedger[\s\S]*?\n}/)?.[0] ?? "";

  assert.match(ledgerBlock, /validatePreparedPurchaseReturnPayable/);
  assert.match(ledgerBlock, /prepared\.totalAmount/);
  assert.match(ledgerBlock, /=== 0n/);
  assert.match(ledgerBlock, /return;/);
  assert.match(ledgerBlock, /writeSupplierDebit/);
});


/** Verifies concurrent Purchase Returns serialize before remaining quantity and payable checks run. */
test("Module 11 Pass 41 serializes concurrent Purchase Returns for one purchase", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );
  const repositorySource = await readFile(
    new URL("../src/modules/returns/returns.repository.ts", import.meta.url),
    "utf8",
  );

  const createBlock =
    serviceSource.match(/export async function createConfirmedPurchaseReturnInTransaction[\s\S]*?return getPurchaseReturn\(transaction, savedReturn\.id\);\n}/)?.[0] ?? "";
  const sourceLockPosition = createBlock.indexOf("lockConfirmedPurchaseForReturn");
  const itemLockPosition = createBlock.indexOf("lockOriginalPurchaseItemsForReturn");
  const preparePosition = createBlock.indexOf("preparePurchaseReturnCreation");
  const payablePosition = createBlock.indexOf("validatePreparedPurchaseReturnPayable");

  assert.ok(sourceLockPosition >= 0);
  assert.ok(itemLockPosition > sourceLockPosition);
  assert.ok(preparePosition > itemLockPosition);
  assert.ok(payablePosition > preparePosition);
  assert.match(repositorySource, /lockConfirmedPurchaseForReturn[\s\S]*?\.for\("update"\)/);
  assert.match(repositorySource, /lockOriginalPurchaseItemsForReturn[\s\S]*?orderBy\(asc\(purchaseItems\.id\)\)[\s\S]*?\.for\("update"\)/);
});

/** Verifies Purchase Return stock mutations use the same stable product-lock strategy as other inventory writes. */
test("Module 11 Pass 41 keeps Purchase Return product lock order stable", async () => {
  const returnsSource = await readFile(
    new URL("../src/modules/returns/returns.service.ts", import.meta.url),
    "utf8",
  );
  const inventorySource = await readFile(
    new URL("../src/modules/inventory/inventory.service.ts", import.meta.url),
    "utf8",
  );

  const applyBlock =
    returnsSource.match(/export async function applyPreparedPurchaseReturnInventory[\s\S]*?\n}/)?.[0] ?? "";
  const balanceBlock =
    inventorySource.match(/export async function getOrCreateLockedBalance[\s\S]*?\n}/)?.[0] ?? "";

  assert.match(applyBlock, /\.sort\([\s\S]*productId\.localeCompare/);
  assert.match(applyBlock, /for \(const item of items\)/);
  assert.match(balanceBlock, /acquireInventoryProductLock\(database, productId\)/);
  assert.match(balanceBlock, /lockInventoryBalanceByProductId/);
});
