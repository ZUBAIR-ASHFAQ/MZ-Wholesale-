import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/** Reads one project source file relative to this focused regression test. */
async function readProjectFile(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

/** Extracts one exported async service function for lock-order assertions. */
function exportedFunctionSource(source: string, functionName: string): string {
  const start = source.indexOf(`export async function ${functionName}`);
  assert.ok(start >= 0, `${functionName} was not found`);

  const nextExport = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, nextExport >= 0 ? nextExport : undefined);
}

test("customer receipt uses the same invoice-before-customer lock order as sale mutations", async () => {
  const [paymentsSource, salesSource, returnsSource] = await Promise.all([
    readProjectFile("../src/modules/payments/payments.service.ts"),
    readProjectFile("../src/modules/sales/sales.service.ts"),
    readProjectFile("../src/modules/returns/returns.service.ts"),
  ]);

  const receipt = exportedFunctionSource(paymentsSource, "createCustomerReceipt");
  const confirmSale = exportedFunctionSource(salesSource, "confirmSaleInTransaction");
  const salesReturn = exportedFunctionSource(
    returnsSource,
    "createConfirmedSalesReturnInTransaction",
  );

  const receiptInvoiceLock = receipt.indexOf("lockCustomerPaymentSales");
  const receiptCustomerLock = receipt.indexOf("findCustomerByIdForUpdate");
  assert.ok(receiptInvoiceLock >= 0);
  assert.ok(receiptCustomerLock > receiptInvoiceLock);

  const confirmInvoiceLock = confirmSale.indexOf("findSaleByIdForUpdate");
  const confirmCustomerLock = confirmSale.indexOf("findCustomerByIdForUpdate");
  assert.ok(confirmInvoiceLock >= 0);
  assert.ok(confirmCustomerLock > confirmInvoiceLock);

  const returnInvoiceLock = salesReturn.indexOf("lockConfirmedSaleForReturn");
  const returnCustomerLock = salesReturn.indexOf("findCustomerByIdForUpdate");
  assert.ok(returnInvoiceLock >= 0);
  assert.ok(returnCustomerLock > returnInvoiceLock);
});
