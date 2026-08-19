import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import {
  createCashReconciliationSchema,
  createCustomerReceiptSchema,
  createSupplierPaymentSchema,
  createTransferSchema,
  customerReceiptListQuerySchema,
  dailyCashSummaryQuerySchema,
  reversePaymentSchema,
  type CreateCustomerReceiptInput,
  type CreateSupplierPaymentInput,
} from "../src/modules/payments/payments.schema.js";
import {
  createCashReconciliation,
  createCustomerReceipt,
  createSupplierPayment,
  createTransfer,
} from "../src/modules/payments/payments.service.js";
import { AppError } from "../src/shared/errors/app-error.js";

/** Reads one project file relative to this test file. */
async function readProjectFile(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

/** Locks the approved Module 8 route contract before payment routes are implemented. */
test("Module 8 documentation contains only the approved payment routes", async () => {
  const readme = await readProjectFile("../../README.md");
  const approvedRoutes = [
    "GET /payments/accounts",
    "POST /payments/cash-accounts",
    "PATCH /payments/cash-accounts/:id",
    "POST /payments/bank-accounts",
    "PATCH /payments/bank-accounts/:id",
    "GET /payments/customer-receipts",
    "POST /payments/customer-receipts",
    "GET /payments/customer-receipts/:id",
    "POST /payments/customer-receipts/:id/reverse",
    "GET /payments/supplier-payments",
    "POST /payments/supplier-payments",
    "GET /payments/supplier-payments/:id",
    "POST /payments/supplier-payments/:id/reverse",
    "GET /payments/cash-bank-movements",
    "GET /payments/transfers",
    "POST /payments/transfers",
    "GET /payments/transfers/:id",
    "GET /payments/cash-reconciliations",
    "POST /payments/cash-reconciliations",
    "PATCH /payments/cash-reconciliations/:id",
    "POST /payments/cash-reconciliations/:id/confirm",
  ];

  for (const route of approvedRoutes) {
    assert.match(readme, new RegExp(route.replace(/[/:]/g, "\\$&")));
  }

  assert.doesNotMatch(readme, /payments\/cheques|cheque-account|CHEQUE/);
  assert.doesNotMatch(readme, /POST \/payments\/cash-bank-movements/);
  assert.doesNotMatch(readme, /(?:PATCH|DELETE) \/payments\/cash-bank-movements/);
});

/** Confirms the modules required by the payment foundation already exist. */
test("Module 8 foundation dependencies are available", async () => {
  const appSource = await readProjectFile("../src/app.ts");

  for (const dependency of [
    "businessSettingsModule",
    "customersModule",
    "suppliersModule",
    "ledgersModule",
    "installAuthPlugin",
    "installDatabasePlugin",
  ]) {
    assert.match(appSource, new RegExp(`\\b${dependency}\\b`));
  }
});

/** Confirms payment allocations now use the real Sales and Purchase source documents. */
test("Module 8 allocations use real source documents", async () => {
  const readme = await readProjectFile("../../README.md");
  const paymentSchema = await readProjectFile(
    "../src/database/schema/payment.schema.ts",
  );

  assert.match(readme, /Customer receipt allocations use real confirmed Sales invoices/);
  assert.match(paymentSchema, /salesInvoiceId:[\s\S]*references\(\(\) => salesInvoices\.id\)/);
  assert.match(paymentSchema, /purchaseId:[\s\S]*references\(\(\) => purchases\.id\)/);
});

/** Verifies the complete Module 8 payment foundation table set. */
test("Module 8 payment schema exports all required foundation tables", async () => {
  const schema = await readProjectFile("../src/database/schema/payment.schema.ts");
  const schemaIndex = await readProjectFile("../src/database/schema/index.ts");
  const requiredTables = [
    "cashAccounts",
    "bankAccounts",
    "customerPayments",
    "customerPaymentSplits",
    "customerPaymentAllocations",
    "supplierPayments",
    "supplierPaymentSplits",
    "supplierPaymentAllocations",
    "cashBankMovements",
    "cashBankTransfers",
    "cashReconciliations",
  ];

  for (const table of requiredTables) {
    assert.match(schema, new RegExp(`export const ${table}\\b`));
    assert.match(schemaIndex, new RegExp(`\\b${table}\\b`));
  }
});

/** Verifies that version 1 allows only cash and bank-transfer methods. */
test("Module 8 payment method enum excludes cheque support", async () => {
  const schema = await readProjectFile("../src/database/schema/payment.schema.ts");

  assert.match(schema, /paymentMethodEnum[\s\S]*"CASH"[\s\S]*"BANK_TRANSFER"/);
  assert.doesNotMatch(schema, /"CHEQUE"/);
});

/** Verifies that monetary fields use the approved PostgreSQL precision. */
test("Module 8 money uses numeric 14,2 and positive checks", async () => {
  const schema = await readProjectFile("../src/database/schema/payment.schema.ts");

  assert.match(schema, /precision: 14, scale: 2/);
  assert.match(schema, /customer_payment_splits_amount_check/);
  assert.match(schema, /supplier_payment_splits_amount_check/);
  assert.match(schema, /cash_bank_movements_amount_check/);
  assert.match(schema, /cash_bank_transfers_amount_check/);
});

/** Verifies exact matching cash and bank account constraints. */
test("Module 8 split and movement rows require one matching account", async () => {
  const schema = await readProjectFile("../src/database/schema/payment.schema.ts");

  for (const constraint of [
    "customer_payment_splits_account_check",
    "supplier_payment_splits_account_check",
    "cash_bank_movements_account_check",
    "cash_bank_transfers_source_account_check",
    "cash_bank_transfers_destination_account_check",
  ]) {
    assert.match(schema, new RegExp(constraint));
  }
});

/** Verifies that account balances are not stored as editable current balances. */
test("Module 8 account tables do not store current balance", async () => {
  const schema = await readProjectFile("../src/database/schema/payment.schema.ts");

  assert.doesNotMatch(schema, /currentBalance|current_balance/);
  assert.match(schema, /openingBalance/);
  assert.match(schema, /cashBankMovements/);
});

/** Verifies every named schema callback has a short junior-friendly comment. */
test("Module 8 schema comments every function", async () => {
  const schema = await readProjectFile("../src/database/schema/payment.schema.ts");
  const functions = [...schema.matchAll(/function\s+(\w+)\s*\(/g)].map(
    (match) => match[1],
  );

  assert.ok(functions.length > 0);
  for (const functionName of functions) {
    const functionPosition = schema.indexOf(`function ${functionName}`);
    const nearbySource = schema.slice(Math.max(0, functionPosition - 180), functionPosition);
    assert.match(nearbySource, /\/\*\*[\s\S]*\*\//);
  }
});

/** Verifies nullable account columns cannot bypass movement duplicate protection. */
test("Module 8 movement source effects use separate cash and bank unique indexes", async () => {
  const schema = await readProjectFile("../src/database/schema/payment.schema.ts");
  const migration = await readProjectFile(
    "../drizzle/0010_module_8_payment_foundation.sql",
  );

  for (const indexName of [
    "cash_bank_movements_cash_source_effect_unique",
    "cash_bank_movements_bank_source_effect_unique",
  ]) {
    assert.match(schema, new RegExp(indexName));
    assert.match(migration, new RegExp(indexName));
  }

  assert.doesNotMatch(schema, /cash_bank_movements_source_effect_unique/);
});

/** Verifies confirmed cash reconciliations cannot be changed or deleted. */
test("Module 8 confirmed reconciliations are protected by database triggers", async () => {
  const migration = await readProjectFile(
    "../drizzle/0010_module_8_payment_foundation.sql",
  );

  assert.match(migration, /prevent_confirmed_cash_reconciliation_change/);
  assert.match(migration, /cash_reconciliations_prevent_confirmed_update/);
  assert.match(migration, /prevent_confirmed_cash_reconciliation_delete/);
  assert.match(migration, /cash_reconciliations_prevent_confirmed_delete/);
});

/** Verifies transfer and reconciliation rules stay enforced in PostgreSQL. */
test("Module 8 transfer and reconciliation constraints remain database enforced", async () => {
  const schema = await readProjectFile("../src/database/schema/payment.schema.ts");

  assert.match(schema, /cash_bank_transfers_different_accounts_check/);
  assert.match(schema, /cash_reconciliations_counted_amount_check/);
  assert.match(schema, /cash_reconciliations_confirmation_check/);
});

/** Verifies Pass 4 provides the complete Module 8 Zod contract. */
test("Module 8 exports all approved payment validation schemas", async () => {
  const schema = await readProjectFile(
    "../src/modules/payments/payments.schema.ts",
  );
  const requiredSchemas = [
    "paymentIdParamsSchema",
    "createCashAccountSchema",
    "updateCashAccountSchema",
    "createBankAccountSchema",
    "updateBankAccountSchema",
    "customerReceiptListQuerySchema",
    "supplierPaymentListQuerySchema",
    "createCustomerReceiptSchema",
    "createSupplierPaymentSchema",
    "reversePaymentSchema",
    "movementListQuerySchema",
    "createTransferSchema",
    "transferListQuerySchema",
    "createCashReconciliationSchema",
    "updateCashReconciliationSchema",
    "reconciliationListQuerySchema",
  ];

  for (const schemaName of requiredSchemas) {
    assert.match(schema, new RegExp(`export const ${schemaName}\\b`));
  }
});

/** Verifies money stays string-based and exact comparisons use integer cents. */
test("Module 8 validation avoids floating-point money comparison", async () => {
  const schema = await readProjectFile(
    "../src/modules/payments/payments.schema.ts",
  );

  assert.match(schema, /function moneyToCents\(/);
  assert.match(schema, /BigInt\(/);
  assert.match(schema, /splitTotal !== allocationTotal/);
  assert.doesNotMatch(schema, /parseFloat\(|Number\([^)]*amount/);
});

/** Verifies payment splits require the account matching their method. */
test("Module 8 Zod schemas validate matching split accounts", async () => {
  const schema = await readProjectFile(
    "../src/modules/payments/payments.schema.ts",
  );

  assert.match(schema, /function validateSplitAccount\(/);
  assert.match(schema, /A CASH split requires only a cash account/);
  assert.match(schema, /A BANK_TRANSFER split requires only a bank account/);
  assert.match(schema, /superRefine\(validateSplitAccount\)/);
});

/** Verifies payment bodies reject duplicate rows and unequal totals. */
test("Module 8 payment requests validate duplicates and totals", async () => {
  const schema = await readProjectFile(
    "../src/modules/payments/payments.schema.ts",
  );

  assert.match(schema, /function validateUniqueSplits\(/);
  assert.match(schema, /function validateUniqueAllocations\(/);
  assert.match(schema, /function validatePaymentTotals\(/);
  assert.match(schema, /Payment split total must equal allocation total/);
});

/** Verifies query schemas keep strict pagination and date-range validation. */
test("Module 8 query schemas validate dates and pagination", async () => {
  const schema = await readProjectFile(
    "../src/modules/payments/payments.schema.ts",
  );

  assert.match(schema, /function validateDateRange\(/);
  assert.match(schema, /pageSize: z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.max\(100\)/);
  assert.match(schema, /End date must be on or after start date/);
  assert.match(schema, /\.strict\(\)/);
});

/** Verifies transfer and reconciliation requests enforce their core rules. */
test("Module 8 transfer and reconciliation schemas enforce core rules", async () => {
  const schema = await readProjectFile(
    "../src/modules/payments/payments.schema.ts",
  );

  assert.match(schema, /Transfer source and destination must be different accounts/);
  assert.match(schema, /cashAccountId: uuidSchema/);
  assert.match(schema, /countedAmount: moneySchema/);
  assert.match(schema, /status: reconciliationStatusSchema\.optional\(\)/);
});

/** Verifies every named helper function has a junior-friendly comment. */
test("Module 8 payment schema comments every named function", async () => {
  const schema = await readProjectFile(
    "../src/modules/payments/payments.schema.ts",
  );
  const functions = [...schema.matchAll(/function\s+(\w+)\s*\(/g)].map(
    (match) => match[1],
  );

  assert.ok(functions.length > 0);
  for (const functionName of functions) {
    const functionPosition = schema.indexOf(`function ${functionName}`);
    const nearbySource = schema.slice(
      Math.max(0, functionPosition - 220),
      functionPosition,
    );
    assert.match(nearbySource, /\/\*\*[\s\S]*\*\//);
  }
});

/** Verifies the account repository contains every Pass 5 database function. */
test("Module 8 account repository exposes the approved account queries", async () => {
  const repository = await readProjectFile(
    "../src/modules/payments/payments.repository.ts",
  );
  const requiredFunctions = [
    "listCashAccounts",
    "listBankAccounts",
    "findCashAccountById",
    "findBankAccountById",
    "findCashAccountByName",
    "findBankAccountByAccountNumber",
    "createCashAccount",
    "createBankAccount",
    "updateCashAccount",
    "updateBankAccount",
    "lockCashAccount",
    "lockBankAccount",
    "readCashAccountBalance",
    "readBankAccountBalance",
  ];

  for (const functionName of requiredFunctions) {
    assert.match(
      repository,
      new RegExp(`export async function ${functionName}\\b`),
    );
  }
});

/** Keeps current balances calculated from movements instead of editable columns. */
test("Module 8 repository calculates account balances from movements", async () => {
  const repository = await readProjectFile(
    "../src/modules/payments/payments.repository.ts",
  );

  assert.match(repository, /cashAccounts\.openingBalance/);
  assert.match(repository, /bankAccounts\.openingBalance/);
  assert.match(repository, /cashBankMovements\.direction/);
  assert.match(repository, /cashBankMovements\.sourceType/);
  assert.match(repository, /<> 'OPENING_BALANCE'/);
  assert.match(repository, /'INFLOW'/);
  assert.match(repository, /else -\$\{cashBankMovements\.amount\}/);
  assert.doesNotMatch(repository, /currentBalance|current_balance/);
});

/** Ensures account locks use PostgreSQL row locking for future transactions. */
test("Module 8 account repository uses row locks", async () => {
  const repository = await readProjectFile(
    "../src/modules/payments/payments.repository.ts",
  );

  const lockCalls = repository.match(/\.for\("update"\)/g) ?? [];
  assert.ok(lockCalls.length >= 2);
});

/** Keeps HTTP and business workflow objects out of the repository layer. */
test("Module 8 repository contains database logic only", async () => {
  const repository = await readProjectFile(
    "../src/modules/payments/payments.repository.ts",
  );

  assert.doesNotMatch(repository, /FastifyRequest|FastifyReply|FastifyInstance/);
  assert.doesNotMatch(repository, /request\.|reply\.|app\./);
  assert.doesNotMatch(repository, /from ["']fastify["']/);
});

/** Verifies every repository function has a short explanatory comment. */
test("Module 8 repository comments every function", async () => {
  const repository = await readProjectFile(
    "../src/modules/payments/payments.repository.ts",
  );
  const functions = [...repository.matchAll(/export async function\s+(\w+)\s*\(/g)].map(
    (match) => match[1],
  );

  assert.ok(functions.length > 0);
  for (const functionName of functions) {
    const functionPosition = repository.indexOf(
      `export async function ${functionName}`,
    );
    const nearbySource = repository.slice(
      Math.max(0, functionPosition - 220),
      functionPosition,
    );
    assert.match(nearbySource, /\/\*\*[\s\S]*\*\//);
  }
});


test("Pass 6 keeps account service workflows simple and transactional", async () => {
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");
  assert.match(service, /export async function listAccounts/);
  assert.match(service, /export async function createCashAccount/);
  assert.match(service, /export async function updateCashAccount/);
  assert.match(service, /export async function createBankAccount/);
  assert.match(service, /export async function updateBankAccount/);
  assert.match(service, /requireTransaction/);
  assert.match(service, /sourceType: "OPENING_BALANCE"/);
  assert.doesNotMatch(service, /openingBalance\?:/);
});

test("Pass 6 comments every named account service function", async () => {
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");
  const namedFunctions = [...service.matchAll(/(?:export )?async function ([A-Za-z0-9_]+)|function ([A-Za-z0-9_]+)/g)];
  for (const match of namedFunctions) {
    const functionName = match[1] ?? match[2];
    const before = service.slice(0, match.index);
    assert.match(before.slice(-220), /\/\*\*[\s\S]*?\*\//, `${functionName} needs a short comment`);
  }
});

/** Verifies Pass 7 provides the four internal account movement writers. */
test("Module 8 exposes four simple internal movement writers", async () => {
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");

  for (const functionName of [
    "writeCashInflow",
    "writeCashOutflow",
    "writeBankInflow",
    "writeBankOutflow",
  ]) {
    assert.match(service, new RegExp(`export async function ${functionName}\\b`));
  }

  assert.match(service, /async function writeAccountMovement/);
  assert.match(service, /ACCOUNT_INACTIVE/);
  assert.match(service, /DUPLICATE_MOVEMENT_SOURCE/);
  assert.match(service, /PAYMENT_AMOUNT_INVALID/);
});

/** Verifies duplicate movement detection remains in the repository layer. */
test("Module 8 repository can find an existing movement source effect", async () => {
  const repository = await readProjectFile(
    "../src/modules/payments/payments.repository.ts",
  );

  assert.match(repository, /export async function findMovementBySource/);
  assert.match(repository, /cashBankMovements\.sourceType/);
  assert.match(repository, /cashBankMovements\.sourceId/);
  assert.match(repository, /cashBankMovements\.direction/);
});

/** Ensures opening balances use the same internal writer path as later workflows. */
test("Module 8 opening movements use the internal movement writers", async () => {
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");

  assert.match(service, /createCashOpeningMovement[\s\S]*writeCashInflow/);
  assert.match(service, /createBankOpeningMovement[\s\S]*writeBankInflow/);
  assert.doesNotMatch(
    service,
    /createCashOpeningMovement[\s\S]{0,700}createCashBankMovement/,
  );
});

/** Verifies every new named Pass 7 function has a short purpose comment. */
test("Module 8 Pass 7 comments every movement writer function", async () => {
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");
  const repository = await readProjectFile(
    "../src/modules/payments/payments.repository.ts",
  );
  const sources = [service, repository];
  const functionNames = [
    "validateMovementSource",
    "throwMovementConflict",
    "writeAccountMovement",
    "writeCashInflow",
    "writeCashOutflow",
    "writeBankInflow",
    "writeBankOutflow",
    "findMovementBySource",
  ];

  for (const functionName of functionNames) {
    const source = sources.find((candidate) =>
      candidate.includes(`function ${functionName}`),
    );
    assert.ok(source, `${functionName} must exist`);
    const position = source.indexOf(`function ${functionName}`);
    assert.match(
      source.slice(Math.max(0, position - 240), position),
      /\/\*\*[\s\S]*\*\//,
      `${functionName} needs a short comment`,
    );
  }
});


test("movement history repository keeps list and count filters together", async () => {
  const repository = await readProjectFile("../src/modules/payments/payments.repository.ts");
  assert.match(repository, /function buildMovementFilters/);
  assert.match(repository, /export async function listCashBankMovements/);
  assert.match(repository, /export async function countCashBankMovements/);
  assert.match(repository, /desc\(cashBankMovements\.occurredAt\)/);
});

/** Verifies cash/bank movement date filters use the required Karachi business date. */
test("movement history filters use Asia/Karachi business dates", async () => {
  const repository = await readProjectFile("../src/modules/payments/payments.repository.ts");

  assert.match(
    repository,
    /timezone\('Asia\/Karachi', \${cashBankMovements\.occurredAt}\)::date >= \${options\.startDate}::date/,
  );
  assert.match(
    repository,
    /timezone\('Asia\/Karachi', \${cashBankMovements\.occurredAt}\)::date <= \${options\.endDate}::date/,
  );
  assert.doesNotMatch(
    repository,
    /cashBankMovements\.occurredAt, new Date\(`\${options\.(?:startDate|endDate)}T/,
  );
});

test("movement history service validates account type and returns pagination", async () => {
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");
  assert.match(service, /export async function listCashBankMovements/);
  assert.match(service, /query\.accountType === "CASH"/);
  assert.match(service, /query\.accountType === "BANK"/);
  assert.match(service, /return \{ items, page: query\.page, pageSize: query\.pageSize, total \}/);
});

/** Verifies Pass 9 adds the complete immutable transfer repository contract. */
test("Module 8 implements transfer repository functions", async () => {
  const repository = await readProjectFile(
    "../src/modules/payments/payments.repository.ts",
  );

  for (const functionName of [
    "createTransfer",
    "findTransferById",
    "listTransfers",
    "countTransfers",
  ]) {
    assert.match(repository, new RegExp(`export async function ${functionName}\\b`));
  }

  assert.match(repository, /cashBankTransfers\.transferDate/);
  assert.match(repository, /desc\(cashBankTransfers\.createdAt\)/);
});

/** Verifies transfer listing resolves account names with fixed queries instead of per-row lookups. */
test("Module 8 transfer list avoids account N+1 queries", async () => {
  const repository = await readProjectFile(
    "../src/modules/payments/payments.repository.ts",
  );
  const start = repository.indexOf("export async function listTransfers");
  const end = repository.indexOf("export async function countTransfers", start);
  const listTransfersSource = repository.slice(start, end);

  assert.match(listTransfersSource, /inArray\(cashAccounts\.id, cashIds\)/);
  assert.match(listTransfersSource, /inArray\(bankAccounts\.id, bankIds\)/);
  assert.doesNotMatch(listTransfersSource, /await findCashAccountById/);
  assert.doesNotMatch(listTransfersSource, /await findBankAccountById/);
});

/** Verifies transfer creation locks accounts and checks available balance. */
test("Module 8 transfer service uses locks and exact balance checks", async () => {
  const service = await readProjectFile(
    "../src/modules/payments/payments.service.ts",
  );

  assert.match(service, /async function lockTransferAccounts\(/);
  assert.match(service, /lockCashAccount/);
  assert.match(service, /lockBankAccount/);
  assert.match(service, /moneyToCents\(sourceBalance\) < moneyToCents\(input\.amount\)/);
  assert.match(service, /INSUFFICIENT_ACCOUNT_BALANCE/);
  assert.doesNotMatch(service, /parseFloat\(|Number\([^)]*amount/);
});

/** Verifies one transfer creates exactly one linked outflow and one linked inflow. */
test("Module 8 transfer service creates two linked movements", async () => {
  const service = await readProjectFile(
    "../src/modules/payments/payments.service.ts",
  );

  assert.match(service, /sourceType: "TRANSFER" as const/);
  assert.match(service, /sourceId: transfer\.id/);
  assert.match(service, /writeCashOutflow|writeBankOutflow/);
  assert.match(service, /writeCashInflow|writeBankInflow/);
  assert.match(service, /return requireTransaction\(database/);
});

/** Verifies every named Pass 9 helper keeps a short junior-friendly comment. */
test("Module 8 transfer functions are commented", async () => {
  const files = [
    await readProjectFile("../src/modules/payments/payments.service.ts"),
    await readProjectFile("../src/modules/payments/payments.repository.ts"),
  ];

  for (const source of files) {
    const names = [...source.matchAll(/(?:export\s+)?async function\s+(\w+)\s*\(/g)]
      .map((match) => match[1]);

    for (const name of names) {
      const position = source.indexOf(`function ${name}`);
      const nearby = source.slice(Math.max(0, position - 220), position);
      assert.match(nearby, /\/\*\*[\s\S]*\*\//);
    }
  }
});


/** Keeps the Module 8 implementation on the approved production stack. */
test("Module 8 audit keeps the approved stack and excludes unnecessary infrastructure", async () => {
  const apiPackage = JSON.parse(
    await readProjectFile("../package.json"),
  ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const webPackage = JSON.parse(
    await readProjectFile("../../web-admin/package.json"),
  ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

  const apiDependencies = {
    ...apiPackage.dependencies,
    ...apiPackage.devDependencies,
  };
  const webDependencies = {
    ...webPackage.dependencies,
    ...webPackage.devDependencies,
  };

  for (const required of ["fastify", "drizzle-orm", "pg", "zod"]) {
    assert.ok(apiDependencies[required], `${required} must remain installed`);
  }

  for (const required of [
    "react",
    "react-dom",
    "@tanstack/react-query",
    "@tanstack/react-router",
    "react-hook-form",
    "zod",
    "vite",
  ]) {
    assert.ok(webDependencies[required], `${required} must remain installed`);
  }

  for (const forbidden of [
    "@nestjs/core",
    "express",
    "prisma",
    "@prisma/client",
    "typeorm",
    "sequelize",
    "redis",
    "ioredis",
    "bullmq",
    "socket.io",
  ]) {
    assert.equal(apiDependencies[forbidden], undefined, `${forbidden} is outside the approved stack`);
  }
});

/** Ensures completed modules keep the approved five-file backend structure. */
test("Module 8 audit protects the five-file module structure", async () => {
  const { readdir } = await import("node:fs/promises");
  const completedModules = [
    "auth",
    "business-settings",
    "products",
    "customers",
    "suppliers",
    "inventory",
    "ledgers",
  ];

  for (const moduleName of completedModules) {
    const directory = new URL(`../src/modules/${moduleName}/`, import.meta.url);
    const files = (await readdir(directory)).sort();
    const baseName = moduleName === "business-settings" ? "business-settings" : moduleName;
    const expected = [
      "index.ts",
      `${baseName}.repository.ts`,
      `${baseName}.routes.ts`,
      `${baseName}.schema.ts`,
      `${baseName}.service.ts`,
    ].sort();

    assert.deepEqual(files, expected, `${moduleName} must keep exactly five production files`);
  }

  const paymentDirectory = new URL("../src/modules/payments/", import.meta.url);
  const paymentFiles = (await readdir(paymentDirectory)).sort();
  assert.deepEqual(paymentFiles, [
    "index.ts",
    "payments.repository.ts",
    "payments.routes.ts",
    "payments.schema.ts",
    "payments.service.ts",
  ]);
});

/** Requires a short purpose comment above every named Payments function. */
test("Module 8 audit comments every named function for junior developers", async () => {
  for (const fileName of [
    "payments.repository.ts",
    "payments.routes.ts",
    "payments.schema.ts",
    "payments.service.ts",
  ]) {
    const source = await readProjectFile(`../src/modules/payments/${fileName}`);
    const functionPattern = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g;

    for (const match of source.matchAll(functionPattern)) {
      const functionName = match[1];
      const position = match.index ?? 0;
      const nearby = source.slice(Math.max(0, position - 260), position);
      assert.match(
        nearby,
        /\/\*\*[^]*?\*\/\s*$/,
        `${fileName}: ${functionName} needs a short purpose comment`,
      );
    }
  }
});

/** Keeps the staged Payments code simple until routes and registration are implemented. */
test("Module 8 audit keeps clear route service repository boundaries", async () => {
  const repository = await readProjectFile("../src/modules/payments/payments.repository.ts");
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");

  assert.doesNotMatch(repository, /FastifyRequest|FastifyReply|app\.get|app\.post|request\.|reply\./);
  assert.doesNotMatch(service, /app\.get|app\.post|app\.patch|app\.delete/);
  assert.doesNotMatch(repository, /new AppError|paymentError\(/);
  assert.match(service, /from "\.\/payments\.repository\.js"/);
  assert.doesNotMatch(service, /from ["']drizzle-orm["']/);
});

/** Verifies Pass 10 provides the complete cash reconciliation draft repository. */
test("Module 8 cash reconciliation repository supports draft workflows", async () => {
  const repository = await readProjectFile(
    "../src/modules/payments/payments.repository.ts",
  );

  for (const functionName of [
    "createCashReconciliation",
    "lockCashReconciliation",
    "updateDraftCashReconciliation",
    "listCashReconciliations",
    "countCashReconciliations",
  ]) {
    assert.match(repository, new RegExp(`export async function ${functionName}\\b`));
  }

  assert.match(repository, /eq\(cashReconciliations\.status, "DRAFT"\)/);
  assert.match(repository, /\.for\("update"\)/);
  assert.match(repository, /innerJoin\(cashAccounts/);
});

/** Verifies Pass 10 keeps reconciliation business rules in the service. */
test("Module 8 cash reconciliation service creates and edits drafts safely", async () => {
  const service = await readProjectFile(
    "../src/modules/payments/payments.service.ts",
  );

  for (const functionName of [
    "listCashReconciliations",
    "createCashReconciliation",
    "updateCashReconciliation",
  ]) {
    assert.match(service, new RegExp(`export async function ${functionName}\\b`));
  }

  assert.match(service, /lockCashAccount\(transaction, input\.cashAccountId\)/);
  assert.match(service, /readCashAccountBalance/);
  assert.match(service, /status: "DRAFT"/);
  assert.match(service, /RECONCILIATION_ALREADY_CONFIRMED/);
  assert.match(service, /calculateReconciliationDifference/);
  const draftSection = service.slice(
    service.indexOf("export async function createCashReconciliation"),
    service.indexOf("export async function confirmCashReconciliation"),
  );
  assert.doesNotMatch(draftSection, /RECONCILIATION_ADJUSTMENT/);
});

/** Keeps Module 8 reconciliation code commented and easy for junior developers. */
test("Module 8 reconciliation functions have short purpose comments", async () => {
  for (const path of [
    "../src/modules/payments/payments.repository.ts",
    "../src/modules/payments/payments.service.ts",
  ]) {
    const source = await readProjectFile(path);
    const names = [
      ...source.matchAll(
        /(?:export\s+)?async function\s+(?:createCashReconciliation|lockCashReconciliation|updateDraftCashReconciliation|confirmDraftCashReconciliation|listCashReconciliations|countCashReconciliations|updateCashReconciliation|confirmCashReconciliation)\s*\(/g,
      ),
    ].map((match) => match[0].match(/function\s+(\w+)/)?.[1]);

    assert.ok(names.length > 0);
    for (const name of names) {
      const position = source.indexOf(`function ${name}`);
      const nearbySource = source.slice(Math.max(0, position - 180), position);
      assert.match(nearbySource, /\/\*\*[\s\S]*\*\//);
    }
  }
});

/** Verifies reconciliation confirmation recalculates the balance and stays transactional. */
test("Module 8 confirms cash reconciliations in one transaction", async () => {
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");

  assert.match(service, /export async function confirmCashReconciliation\(/);
  assert.match(service, /lockCashReconciliation\(/);
  assert.match(service, /lockCashAccount\(/);
  assert.match(service, /readCashAccountBalance\(/);
  assert.match(service, /confirmDraftCashReconciliation\(/);
  assert.match(service, /return requireTransaction\(database/);
});

/** Verifies a surplus creates an inflow and a shortage creates an outflow. */
test("Module 8 reconciliation confirmation writes the correct adjustment direction", async () => {
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");

  assert.match(service, /differenceCents > 0n[\s\S]*writeCashInflow/);
  assert.match(service, /differenceCents < 0n[\s\S]*writeCashOutflow/);
  assert.match(service, /sourceType: "RECONCILIATION_ADJUSTMENT"/);
  assert.match(service, /amount: centsToMoney\(-differenceCents\)/);
});

/** Verifies a zero difference confirms without creating an unnecessary movement. */
test("Module 8 zero reconciliation difference creates no movement", async () => {
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");

  assert.doesNotMatch(service, /differenceCents === 0n[\s\S]*writeCash/);
  assert.match(service, /if \(differenceCents > 0n\)/);
  assert.match(service, /if \(differenceCents < 0n\)/);
});

/** Verifies the repository confirms only a row that is still in draft status. */
test("Module 8 repository confirms draft reconciliations only", async () => {
  const repository = await readProjectFile("../src/modules/payments/payments.repository.ts");

  assert.match(repository, /export async function confirmDraftCashReconciliation\(/);
  assert.match(repository, /status: "CONFIRMED"/);
  assert.match(repository, /confirmedAt: confirmation\.confirmedAt/);
  assert.match(repository, /eq\(cashReconciliations\.status, "DRAFT"\)/);
});

/** Verifies Pass 12 provides the customer receipt repository foundation. */
test("Module 8 customer receipt repository supports immutable foundation records", async () => {
  const repository = await readProjectFile("../src/modules/payments/payments.repository.ts");

  for (const functionName of [
    "createCustomerPayment",
    "createCustomerPaymentSplits",
    "createCustomerPaymentAllocations",
    "findCustomerPaymentById",
    "listCustomerPayments",
    "countCustomerPayments",
    "listCustomerPaymentSplits",
    "listCustomerPaymentAllocations",
    "lockCustomerPayment",
    "markCustomerPaymentReversed",
  ]) {
    assert.match(repository, new RegExp(`export async function ${functionName}\\b`));
  }

  assert.match(repository, /from\(customerPayments\)/);
  assert.match(repository, /insert\(customerPaymentSplits\)/);
  assert.match(repository, /insert\(customerPaymentAllocations\)/);
  assert.match(repository, /\.for\("update"\)/);
  assert.match(repository, /status: "REVERSED"/);
});

/** Keeps customer receipt persistence separate from unavailable Sales workflows. */
test("Module 8 customer receipt foundation does not invent sales invoice logic", async () => {
  const repository = await readProjectFile("../src/modules/payments/payments.repository.ts");
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");

  assert.doesNotMatch(repository, /createSalesInvoice|insert\(salesInvoices\)/);
  assert.doesNotMatch(service, /confirmCustomerReceipt|allocateCustomerReceipt/);
  assert.doesNotMatch(service, /fake invoice|mock invoice/i);
});

/** Confirms list and count queries share the same customer receipt filters. */
test("Module 8 customer receipt pagination uses shared filters", async () => {
  const repository = await readProjectFile("../src/modules/payments/payments.repository.ts");

  assert.match(repository, /function buildCustomerPaymentFilters\(/);
  assert.match(repository, /listCustomerPayments[\s\S]*buildCustomerPaymentFilters\(options\)/);
  assert.match(repository, /countCustomerPayments[\s\S]*buildCustomerPaymentFilters\(options\)/);
  assert.match(repository, /customerPayments\.customerId/);
  assert.match(repository, /customerPayments\.paymentDate/);
});

/** Verifies Pass 13 adds the complete supplier-payment repository foundation. */
test("Module 8 provides the supplier payment repository foundation", async () => {
  const repository = await readProjectFile(
    "../src/modules/payments/payments.repository.ts",
  );

  const requiredFunctions = [
    "createSupplierPayment",
    "createSupplierPaymentSplits",
    "createSupplierPaymentAllocations",
    "findSupplierPaymentById",
    "lockSupplierPayment",
    "listSupplierPayments",
    "countSupplierPayments",
    "listSupplierPaymentSplits",
    "listSupplierPaymentAllocations",
    "markSupplierPaymentReversed",
  ];

  for (const functionName of requiredFunctions) {
    assert.match(repository, new RegExp(`export async function ${functionName}\\(`));
  }

  assert.match(repository, /function buildSupplierPaymentFilters\(/);
  assert.match(repository, /supplierId\?: string/);
  assert.match(repository, /\.for\("update"\)/);
});

/** Verifies supplier payment repository functions remain simple and documented. */
test("Module 8 comments every supplier payment repository function", async () => {
  const repository = await readProjectFile(
    "../src/modules/payments/payments.repository.ts",
  );
  const functionNames = [
    "createSupplierPayment",
    "createSupplierPaymentSplits",
    "createSupplierPaymentAllocations",
    "findSupplierPaymentById",
    "lockSupplierPayment",
    "listSupplierPayments",
    "countSupplierPayments",
    "listSupplierPaymentSplits",
    "listSupplierPaymentAllocations",
    "markSupplierPaymentReversed",
    "buildSupplierPaymentFilters",
  ];

  for (const functionName of functionNames) {
    const functionPosition = repository.indexOf(`function ${functionName}`);
    assert.ok(functionPosition >= 0, `${functionName} is missing`);
    const nearbySource = repository.slice(
      Math.max(0, functionPosition - 180),
      functionPosition,
    );
    assert.match(nearbySource, /\/\*\*[\s\S]*\*\//);
  }
});

/** Verifies supplier payments now use real Purchase rows and allocation validation. */
test("Module 8 supplier payment foundation is connected to Purchases", async () => {
  const repository = await readProjectFile(
    "../src/modules/payments/payments.repository.ts",
  );
  const paymentSchema = await readProjectFile(
    "../src/database/schema/payment.schema.ts",
  );
  const service = await readProjectFile(
    "../src/modules/payments/payments.service.ts",
  );

  assert.match(paymentSchema, /purchaseId/);
  assert.match(repository, /lockSupplierPaymentPurchases/);
  assert.match(service, /validatePaymentRequest/);
  assert.match(service, /writeSupplierDebit/);
  assert.doesNotMatch(service, /PURCHASE_MODULE_NOT_READY/);
});

/** Verifies Pass 14 adds the complete shared payment validation workflow. */
test("Module 8 service contains all shared payment validation helpers", async () => {
  const service = await readProjectFile(
    "../src/modules/payments/payments.service.ts",
  );

  for (const helper of [
    "validateSplits",
    "validateAllocations",
    "validateSplitAndAllocationTotals",
    "validateMatchingAccount",
    "validateAccountsAreActive",
    "validateAllocationParty",
    "validateOutstandingAmounts",
    "validatePaymentRequest",
  ]) {
    assert.match(service, new RegExp(`function ${helper}\\(`));
  }
});

/** Verifies shared payment totals use exact integer cents. */
test("Module 8 shared payment validation avoids floating-point arithmetic", async () => {
  const service = await readProjectFile(
    "../src/modules/payments/payments.service.ts",
  );
  const validationStart = service.indexOf("function validateMatchingAccount");
  const validationEnd = service.indexOf("/** Runs related account writes", validationStart);
  const validationSource = service.slice(validationStart, validationEnd);

  assert.match(validationSource, /moneyToCents/);
  assert.match(validationSource, /splitTotal !== allocationTotal/);
  assert.doesNotMatch(validationSource, /parseFloat\(|Number\(/);
});

/** Verifies every shared payment validation helper has a purpose comment. */
test("Module 8 comments every shared payment validation function", async () => {
  const service = await readProjectFile(
    "../src/modules/payments/payments.service.ts",
  );
  const helpers = [
    "validateSplits",
    "validateAllocations",
    "validateSplitAndAllocationTotals",
    "validateMatchingAccount",
    "validateAccountsAreActive",
    "validateAllocationParty",
    "validateOutstandingAmounts",
    "validatePaymentRequest",
  ];

  for (const helper of helpers) {
    const position = service.indexOf(`function ${helper}`);
    const nearbySource = service.slice(Math.max(0, position - 220), position);
    assert.ok(position >= 0, `${helper} must exist`);
    assert.match(nearbySource, /\/\*\*[\s\S]*\*\//);
  }
});

/** Verifies allocation validation protects party ownership and outstanding limits. */
test("Module 8 shared allocation validation rejects invalid documents", async () => {
  const service = await readProjectFile(
    "../src/modules/payments/payments.service.ts",
  );

  assert.match(service, /PAYMENT_PARTY_MISMATCH/);
  assert.match(service, /PAYMENT_DOCUMENT_NOT_FOUND/);
  assert.match(service, /ALLOCATION_EXCEEDS_OUTSTANDING/);
  assert.match(service, /PAYMENT_TOTAL_MISMATCH/);
});


/** Verifies customer receipt services are connected to real Sales invoices. */
test("Module 8 customer receipt services use real Sales data", async () => {
  const service = await readProjectFile(
    "../src/modules/payments/payments.service.ts",
  );

  for (const functionName of [
    "listCustomerReceipts",
    "createCustomerReceipt",
    "getCustomerReceipt",
    "reverseCustomerReceipt",
  ]) {
    assert.match(service, new RegExp(`export async function ${functionName}\\b`));
  }

  assert.doesNotMatch(service, /SALES_MODULE_NOT_READY/);
  assert.match(service, /lockCustomerPaymentSales/);
  assert.match(service, /insertCustomerPayment\(/);
  assert.match(service, /createCustomerPaymentAllocations\(/);
});

/** Confirms every customer receipt service function has a junior-friendly comment. */
test("Module 8 comments every customer receipt function", async () => {
  const service = await readProjectFile(
    "../src/modules/payments/payments.service.ts",
  );

  for (const functionName of [
    "listCustomerReceipts",
    "createCustomerReceipt",
    "getCustomerReceipt",
    "reverseCustomerReceipt",
  ]) {
    const position = service.indexOf(`export async function ${functionName}`);
    const nearbySource = service.slice(Math.max(0, position - 220), position);
    assert.ok(position >= 0, `${functionName} must exist`);
    assert.match(nearbySource, /\/\*\*[\s\S]*\*\//);
  }
});

/** Verifies customer receipt routes are connected to the enabled receipt services. */
test("Module 8 customer receipt routes use the Sales-backed services", async () => {
  const routes = await readProjectFile("../src/modules/payments/payments.routes.ts");
  const paymentsDirectory = new URL("../src/modules/payments/", import.meta.url);
  const entries = await readdir(paymentsDirectory);

  assert.match(routes, /listCustomerReceipts/);
  assert.match(routes, /createCustomerReceipt/);
  assert.match(routes, /getCustomerReceipt/);
  assert.match(routes, /reverseCustomerReceipt/);
  assert.ok(entries.includes("index.ts"));
});

/** Verifies all supplier payment services are backed by real Purchase data. */
test("Module 8 supplier payment services are connected to Purchases", async () => {
  const service = await readProjectFile(
    "../src/modules/payments/payments.service.ts",
  );

  for (const functionName of [
    "listSupplierPayments",
    "createSupplierPayment",
    "getSupplierPayment",
    "reverseSupplierPayment",
  ]) {
    assert.match(service, new RegExp(`export async function ${functionName}\\b`));
  }

  assert.doesNotMatch(service, /PURCHASE_MODULE_NOT_READY/);
  assert.match(service, /insertSupplierPayment\(/);
  assert.match(service, /createSupplierPaymentAllocations\(/);
});

/** Confirms every deferred supplier payment function has a junior-friendly comment. */
test("Module 8 comments every deferred supplier payment function", async () => {
  const service = await readProjectFile(
    "../src/modules/payments/payments.service.ts",
  );

  for (const functionName of [
    "listSupplierPayments",
    "createSupplierPayment",
    "getSupplierPayment",
    "reverseSupplierPayment",
  ]) {
    const position = service.indexOf(`export async function ${functionName}`);
    const nearbySource = service.slice(Math.max(0, position - 240), position);
    assert.ok(position >= 0, `${functionName} must exist`);
    assert.match(nearbySource, /\/\*\*[\s\S]*\*\//);
  }
});

/** Keeps supplier payment routes safe while their Purchase dependency is deferred. */
test("Module 8 supplier payment routes return service dependency errors until Purchases exist", async () => {
  const routes = await readProjectFile("../src/modules/payments/payments.routes.ts");
  const paymentsDirectory = new URL("../src/modules/payments/", import.meta.url);
  const entries = await readdir(paymentsDirectory);

  assert.match(routes, /listSupplierPayments/);
  assert.match(routes, /createSupplierPayment/);
  assert.match(routes, /getSupplierPayment/);
  assert.match(routes, /reverseSupplierPayment/);
  assert.ok(entries.includes("index.ts"));
});



/** Protects reversal rows from missing reasons, stray reasons, and self-links. */
test("Module 8 payment reversal rows have strict database shapes", async () => {
  const schema = await readProjectFile(
    "../src/database/schema/payment.schema.ts",
  );

  assert.match(schema, /customer_payments_reversal_shape_check/);
  assert.match(schema, /customer_payments_no_self_reversal_check/);
  assert.match(schema, /supplier_payments_reversal_shape_check/);
  assert.match(schema, /supplier_payments_no_self_reversal_check/);
  assert.match(schema, /reversalReason} is null/);
  assert.match(schema, /reversalOfPaymentId} <> .*\.id/);
});

/** Requires a linked reversal header before an original payment can be marked reversed. */
test("Module 8 repository protects reversal status updates", async () => {
  const repository = await readProjectFile(
    "../src/modules/payments/payments.repository.ts",
  );

  assert.match(repository, /findCustomerPaymentReversal/);
  assert.match(repository, /findSupplierPaymentReversal/);
  assert.match(repository, /markCustomerPaymentReversed[\s\S]*reversalPaymentId/);
  assert.match(repository, /markSupplierPaymentReversed[\s\S]*reversalPaymentId/);
  assert.match(repository, /linkedReversalExists/);
  assert.match(repository, /reversal_of_payment_id/);
});

/** Confirms every new reversal repository function has a short purpose comment. */
test("Module 8 comments reversal repository functions", async () => {
  const repository = await readProjectFile(
    "../src/modules/payments/payments.repository.ts",
  );

  for (const functionName of [
    "findCustomerPaymentReversal",
    "markCustomerPaymentReversed",
    "findSupplierPaymentReversal",
    "markSupplierPaymentReversed",
  ]) {
    const position = repository.indexOf(`export async function ${functionName}`);
    const nearbySource = repository.slice(Math.max(0, position - 240), position);
    assert.ok(position >= 0, `${functionName} must exist`);
    assert.match(nearbySource, /\/\*\*[\s\S]*\*\//);
  }
});

/** Verifies Pass 18 adds the complete approved Payments route contract. */
test("Module 8 registers every approved payment route", async () => {
  const routes = await readProjectFile("../src/modules/payments/payments.routes.ts");
  const approvedRoutes = [
    '"/payments/accounts"',
    '"/payments/cash-accounts"',
    '"/payments/cash-accounts/:id"',
    '"/payments/bank-accounts"',
    '"/payments/bank-accounts/:id"',
    '"/payments/customer-receipts"',
    '"/payments/customer-receipts/:id"',
    '"/payments/customer-receipts/:id/reverse"',
    '"/payments/supplier-payments"',
    '"/payments/supplier-payments/:id"',
    '"/payments/supplier-payments/:id/reverse"',
    '"/payments/daily-cash-summary"',
    '"/payments/cash-bank-movements"',
    '"/payments/transfers"',
    '"/payments/transfers/:id"',
    '"/payments/cash-reconciliations"',
    '"/payments/cash-reconciliations/:id"',
    '"/payments/cash-reconciliations/:id/confirm"',
  ];

  for (const route of approvedRoutes) {
    assert.match(routes, new RegExp(route.replace(/[/:.-]/g, "\\$&")));
  }

  assert.doesNotMatch(routes, /cheque|checks?/i);
});

/** Verifies every Payments route uses the existing authentication boundary. */
test("Module 8 routes require authentication and mutation security", async () => {
  const routes = await readProjectFile("../src/modules/payments/payments.routes.ts");

  assert.match(routes, /preHandler: app\.authenticate/);
  assert.match(routes, /openApiAccessSecurity/);
  assert.match(routes, /openApiMutationSecurity/);
  assert.match(routes, /privateRoute\(app,[\s\S]*true\)/);
});

/** Verifies required financial mutations use the shared idempotency helper. */
test("Module 8 financial routes use idempotency protection", async () => {
  const routes = await readProjectFile("../src/modules/payments/payments.routes.ts");

  assert.match(routes, /executeIdempotentMutation/);
  assert.match(routes, /request\.headers\["idempotency-key"\]/);
  for (const handler of [
    "handleCreateCustomerReceipt",
    "handleReverseCustomerReceipt",
    "handleCreateSupplierPayment",
    "handleReverseSupplierPayment",
    "handleCreateTransfer",
    "handleConfirmCashReconciliation",
  ]) {
    const start = routes.indexOf(`function ${handler}`);
    const next = routes.indexOf("\n  /**", start + 1);
    const section = routes.slice(start, next === -1 ? undefined : next);
    assert.match(section, /sendIdempotentMutation/);
  }
});

/** Verifies routes stay thin and call service functions instead of repositories. */
test("Module 8 routes remain simple and contain no Drizzle queries", async () => {
  const routes = await readProjectFile("../src/modules/payments/payments.routes.ts");

  assert.doesNotMatch(routes, /drizzle-orm|\.select\(|\.insert\(|\.update\(|\.delete\(/);
  assert.doesNotMatch(routes, /payments\.repository/);
  assert.match(routes, /createDataResponse/);
});

/** Verifies every named Payments route function has a short purpose comment. */
test("Module 8 route functions are commented for junior developers", async () => {
  const routes = await readProjectFile("../src/modules/payments/payments.routes.ts");
  const functions = [...routes.matchAll(/(?:async\s+)?function\s+(\w+)\s*\(/g)].map(
    (match) => match[1],
  );

  assert.ok(functions.length > 0);
  for (const functionName of functions) {
    const functionPosition = routes.indexOf(`function ${functionName}`);
    const nearbySource = routes.slice(Math.max(0, functionPosition - 180), functionPosition);
    assert.match(nearbySource, /\/\*\*[\s\S]*\*\//);
  }
});

/** Verifies Pass 19 completes the approved five-file Payments module. */
test("Module 8 uses the complete five-file backend structure", async () => {
  const moduleDirectory = new URL("../src/modules/payments/", import.meta.url);
  const files = (await readdir(moduleDirectory)).sort();

  assert.deepEqual(files, [
    "index.ts",
    "payments.repository.ts",
    "payments.routes.ts",
    "payments.schema.ts",
    "payments.service.ts",
  ]);
});

/** Verifies the Payments module registers its routes and exports internal writers. */
test("Module 8 index registers routes and exports movement writers", async () => {
  const index = await readProjectFile("../src/modules/payments/index.ts");

  assert.match(index, /export const paymentsModule: FastifyPluginAsync/);
  assert.match(index, /await registerPaymentRoutes\(app\)/);
  for (const writer of [
    "writeCashInflow",
    "writeCashOutflow",
    "writeBankInflow",
    "writeBankOutflow",
  ]) {
    assert.match(index, new RegExp(writer));
  }
});

/** Verifies Payments loads after Ledgers because it uses ledger boundaries. */
test("Module 8 registers after Ledgers in the Fastify app", async () => {
  const app = await readProjectFile("../src/app.ts");
  const ledgersPosition = app.indexOf("await app.register(ledgersModule)");
  const paymentsPosition = app.indexOf("await app.register(paymentsModule)");

  assert.ok(ledgersPosition >= 0, "Ledgers module must be registered");
  assert.ok(paymentsPosition > ledgersPosition, "Payments must load after Ledgers");
});

/** Verifies Swagger documents the complete Payments module under one tag. */
test("Module 8 adds its Swagger tag", async () => {
  const swagger = await readProjectFile("../src/plugins/swagger.plugin.ts");

  assert.match(swagger, /name: "payments"/);
  assert.match(swagger, /Cash and bank accounts, customer receipts, supplier payments/);
});

/** Reads one frontend Payments file relative to the API test folder. */
async function readFrontendPaymentFile(relativePath: string): Promise<string> {
  return readProjectFile(`../../web-admin/src/features/payments/${relativePath}`);
}

test("Module 8 Pass 20 adds simple account and movement frontend screens", async () => {
  const apiFile = await readFrontendPaymentFile("api/payments.api.ts");
  const hooksFile = await readFrontendPaymentFile("hooks/use-payments.ts");
  const accountsPage = await readFrontendPaymentFile("pages/accounts-page.tsx");
  const movementsPage = await readFrontendPaymentFile("pages/cash-bank-movements-page.tsx");

  assert.match(apiFile, /\/payments\/accounts/);
  assert.match(apiFile, /\/payments\/cash-bank-movements/);
  assert.match(hooksFile, /usePaymentAccounts/);
  assert.match(hooksFile, /useCashBankMovements/);
  assert.match(accountsPage, /Current balance|calculated from immutable money movements/);
  assert.match(movementsPage, /Permanent inflow and outflow history/);
  assert.doesNotMatch(accountsPage, /fetch\(/);
  assert.doesNotMatch(movementsPage, /fetch\(/);
});


/** Keeps the approved backend stack and rejects unapproved infrastructure. */
test("Module 8 keeps the approved backend and frontend stack", async () => {
  const apiPackage = JSON.parse(await readProjectFile("../package.json")) as {
    dependencies: Record<string, string>;
  };
  const webPackage = JSON.parse(await readProjectFile("../../web-admin/package.json")) as {
    dependencies: Record<string, string>;
  };

  for (const dependency of ["fastify", "drizzle-orm", "pg", "zod"]) {
    assert.ok(apiPackage.dependencies[dependency], `${dependency} must remain installed`);
  }

  for (const dependency of [
    "react",
    "@tanstack/react-query",
    "@tanstack/react-router",
    "react-hook-form",
    "zod",
  ]) {
    assert.ok(webPackage.dependencies[dependency], `${dependency} must remain installed`);
  }

  for (const forbidden of [
    "@nestjs/core",
    "express",
    "prisma",
    "@prisma/client",
    "typeorm",
    "sequelize",
    "redis",
    "bullmq",
    "socket.io",
    "ws",
  ]) {
    assert.equal(apiPackage.dependencies[forbidden], undefined);
  }
});

/** Keeps HTTP, business, and database responsibilities in their proper files. */
test("Module 8 preserves route service repository boundaries", async () => {
  const routes = await readProjectFile("../src/modules/payments/payments.routes.ts");
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");
  const repository = await readProjectFile("../src/modules/payments/payments.repository.ts");

  assert.doesNotMatch(routes, /from ["']drizzle-orm["']/);
  assert.doesNotMatch(routes, /\.select\(|\.insert\(|\.update\(|\.delete\(/);
  assert.doesNotMatch(repository, /FastifyRequest|FastifyReply|FastifyInstance/);
  assert.doesNotMatch(repository, /new AppError|throw new [A-Za-z]+Error/);
  assert.doesNotMatch(service, /app\.(get|post|patch|put|delete)\(/);
});

/** Keeps the frontend Payments feature small and predictable for junior developers. */
test("Module 8 frontend uses only the approved current-pass files", async () => {
  const featureRoot = new URL("../../web-admin/src/features/payments/", import.meta.url);
  const folders = ["api", "components", "hooks", "pages"];
  const files: string[] = [];

  for (const folder of folders) {
    for (const file of await readdir(new URL(`${folder}/`, featureRoot))) {
      files.push(`${folder}/${file}`);
    }
  }

  assert.deepEqual(files.sort(), [
    "api/payments.api.ts",
    "components/account-form.tsx",
    "components/accounts-table.tsx",
    "components/customer-receipt-form.tsx",
    "components/customer-receipts-table.tsx",
    "components/movements-table.tsx",
    "components/payment-splits-form.tsx",
    "components/reconciliation-form.tsx",
    "components/supplier-payment-form.tsx",
    "components/supplier-payments-table.tsx",
    "components/transfer-form.tsx",
    "hooks/use-payments.ts",
    "pages/accounts-page.tsx",
    "pages/cash-bank-movements-page.tsx",
    "pages/cash-reconciliations-page.tsx",
    "pages/customer-receipt-detail-page.tsx",
    "pages/customer-receipt-form-page.tsx",
    "pages/customer-receipt-list-page.tsx",
    "pages/supplier-payment-detail-page.tsx",
    "pages/supplier-payment-form-page.tsx",
    "pages/supplier-payment-list-page.tsx",
    "pages/transfer-detail-page.tsx",
    "pages/transfers-page.tsx",
  ]);
});

/** Ensures every named Payments function has a nearby purpose comment. */
test("Module 8 comments every named function for junior developers", async () => {
  const sources = [
    await readProjectFile("../src/modules/payments/payments.schema.ts"),
    await readProjectFile("../src/modules/payments/payments.repository.ts"),
    await readProjectFile("../src/modules/payments/payments.service.ts"),
    await readProjectFile("../src/modules/payments/payments.routes.ts"),
    await readProjectFile("../src/modules/payments/index.ts"),
    await readFrontendPaymentFile("api/payments.api.ts"),
    await readFrontendPaymentFile("hooks/use-payments.ts"),
    await readFrontendPaymentFile("components/account-form.tsx"),
    await readFrontendPaymentFile("components/accounts-table.tsx"),
    await readFrontendPaymentFile("components/movements-table.tsx"),
    await readFrontendPaymentFile("components/reconciliation-form.tsx"),
    await readFrontendPaymentFile("components/transfer-form.tsx"),
    await readFrontendPaymentFile("pages/accounts-page.tsx"),
    await readFrontendPaymentFile("pages/cash-bank-movements-page.tsx"),
    await readFrontendPaymentFile("pages/cash-reconciliations-page.tsx"),
    await readFrontendPaymentFile("pages/transfer-detail-page.tsx"),
    await readFrontendPaymentFile("pages/transfers-page.tsx"),
  ];

  const functionPattern = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g;

  for (const source of sources) {
    for (const match of source.matchAll(functionPattern)) {
      const functionPosition = match.index ?? 0;
      const nearbySource = source.slice(Math.max(0, functionPosition - 240), functionPosition);
      assert.match(nearbySource, /\/\*\*[\s\S]*?\*\/\s*$/);
    }
  }
});


/** Verifies Pass 22 adds the transfer frontend without bypassing feature boundaries. */
test("Module 8 Pass 22 adds simple transfer frontend screens", async () => {
  const apiFile = await readFrontendPaymentFile("api/payments.api.ts");
  const hooksFile = await readFrontendPaymentFile("hooks/use-payments.ts");
  const formFile = await readFrontendPaymentFile("components/transfer-form.tsx");
  const listPage = await readFrontendPaymentFile("pages/transfers-page.tsx");
  const detailPage = await readFrontendPaymentFile("pages/transfer-detail-page.tsx");
  const router = await readProjectFile("../../web-admin/src/app/router.tsx");

  assert.match(apiFile, /\/payments\/transfers/);
  assert.match(apiFile, /idempotency-key/);
  assert.match(hooksFile, /useCreateTransfer/);
  assert.match(hooksFile, /useTransfers/);
  assert.match(formFile, /react-hook-form/);
  assert.match(formFile, /Source and destination must be different accounts/);
  assert.match(listPage, /Internal transfers/);
  assert.match(detailPage, /immutable and linked to two account movements/);
  assert.match(router, /\/payments\/transfers\/\$transferId/);
  assert.doesNotMatch(listPage, /fetch\(/);
  assert.doesNotMatch(detailPage, /fetch\(/);
});


/** Verifies Pass 23 adds the cash-reconciliation frontend without bypassing feature boundaries. */
test("Module 8 Pass 23 adds simple cash reconciliation screens", async () => {
  const apiFile = await readFrontendPaymentFile("api/payments.api.ts");
  const hooksFile = await readFrontendPaymentFile("hooks/use-payments.ts");
  const formFile = await readFrontendPaymentFile("components/reconciliation-form.tsx");
  const pageFile = await readFrontendPaymentFile("pages/cash-reconciliations-page.tsx");
  const router = await readProjectFile("../../web-admin/src/app/router.tsx");

  assert.match(apiFile, /\/payments\/cash-reconciliations/);
  assert.match(apiFile, /idempotency-key/);
  assert.match(hooksFile, /useConfirmCashReconciliation/);
  assert.match(formFile, /react-hook-form/);
  assert.match(pageFile, /Cash reconciliations/);
  assert.match(pageFile, /window\.confirm/);
  assert.match(pageFile, /Immutable/);
  assert.match(router, /\/payments\/cash-reconciliations/);
  assert.doesNotMatch(pageFile, /fetch\(/);
});

/** Verifies account creation keeps the account and opening movement in one transaction. */
test("Module 8 account opening workflow is transactional", async () => {
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");

  assert.match(service, /export async function createCashAccount[\s\S]*requireTransaction/);
  assert.match(service, /export async function createBankAccount[\s\S]*requireTransaction/);
  assert.match(service, /createCashOpeningMovement/);
  assert.match(service, /createBankOpeningMovement/);
  assert.match(service, /sourceType: "OPENING_BALANCE"/);
});

/** Verifies account opening balances cannot be edited through account update requests. */
test("Module 8 account updates cannot change opening balances", async () => {
  const schema = await readProjectFile("../src/modules/payments/payments.schema.ts");
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");

  const updateCashSection = schema.slice(
    schema.indexOf("export const updateCashAccountSchema"),
    schema.indexOf("export const createBankAccountSchema"),
  );
  const updateBankSection = schema.slice(
    schema.indexOf("export const updateBankAccountSchema"),
    schema.indexOf("export const customerReceiptListQuerySchema"),
  );

  assert.doesNotMatch(updateCashSection, /openingBalance/);
  assert.doesNotMatch(updateBankSection, /openingBalance/);
  assert.doesNotMatch(service, /updateCashAccount[\s\S]{0,900}openingBalance/);
  assert.doesNotMatch(service, /updateBankAccount[\s\S]{0,900}openingBalance/);
});

/** Verifies all approved Payment routes require the existing authentication guard. */
test("Module 8 payment routes are private", async () => {
  const routes = await readProjectFile("../src/modules/payments/payments.routes.ts");

  assert.match(routes, /function privateRoute/);
  assert.match(routes, /preHandler: app\.authenticate/);
  assert.doesNotMatch(routes, /preHandler:\s*\[\s*\]/);
});

/** Verifies every financial mutation uses the shared idempotency implementation. */
test("Module 8 financial routes use idempotency protection", async () => {
  const routes = await readProjectFile("../src/modules/payments/payments.routes.ts");

  for (const functionName of [
    "handleCreateCustomerReceipt",
    "handleReverseCustomerReceipt",
    "handleCreateSupplierPayment",
    "handleReverseSupplierPayment",
    "handleCreateTransfer",
    "handleConfirmCashReconciliation",
  ]) {
    const start = routes.indexOf(`function ${functionName}`);
    assert.notEqual(start, -1, `${functionName} must exist`);
    const section = routes.slice(start, start + 1400);
    assert.match(section, /sendIdempotentMutation/);
  }
});

/** Verifies transfer creation never bypasses account locking or balance validation. */
test("Module 8 transfer creation protects the source balance", async () => {
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");

  const start = service.indexOf("export async function createTransfer");
  const section = service.slice(start, start + 5200);
  assert.match(section, /lockTransferAccounts/);
  assert.match(section, /readTransferAccountBalance/);
  assert.match(section, /INSUFFICIENT_ACCOUNT_BALANCE/);
  assert.match(section, /writeCashOutflow|writeBankOutflow/);
  assert.match(section, /writeCashInflow|writeBankInflow/);
});

/** Verifies reconciliation confirmation recalculates the balance and writes one optional adjustment. */
test("Module 8 reconciliation confirmation is atomic and recalculated", async () => {
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");

  const start = service.indexOf("export async function confirmCashReconciliation");
  const section = service.slice(start, start + 5200);
  assert.match(section, /lockCashReconciliation/);
  assert.match(section, /lockCashAccount/);
  assert.match(section, /readCashAccountBalance/);
  assert.match(section, /confirmDraftCashReconciliation/);
  assert.match(section, /RECONCILIATION_ADJUSTMENT/);
  assert.match(section, /differenceCents > 0n[\s\S]*differenceCents < 0n/);
});

/** Verifies both customer and supplier payment workflows use real source documents. */
test("Module 8 has no staged Sales or Purchase payment workflow", async () => {
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");

  assert.doesNotMatch(service, /SALES_MODULE_NOT_READY|PURCHASE_MODULE_NOT_READY/);
  assert.match(service, /lockCustomerPaymentSales/);
  assert.match(service, /lockSupplierPaymentPurchases/);
  assert.doesNotMatch(service, /fake invoice|mock invoice|placeholder allocation/i);
});

/** Verifies confirmed money records have no normal delete routes. */
test("Module 8 exposes no financial delete routes", async () => {
  const routes = await readProjectFile("../src/modules/payments/payments.routes.ts");

  assert.doesNotMatch(routes, /app\.delete\(/);
  assert.doesNotMatch(routes, /DELETE \/payments/);
});

/** Verifies money arithmetic remains exact throughout payment services and schemas. */
test("Module 8 financial code avoids floating-point arithmetic", async () => {
  const schema = await readProjectFile("../src/modules/payments/payments.schema.ts");
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");

  for (const source of [schema, service]) {
    assert.match(source, /BigInt\(/);
    assert.doesNotMatch(source, /parseFloat\(/);
    assert.doesNotMatch(source, /Number\([^)]*(?:amount|balance|total|difference)/i);
  }
});


/** Verifies the shared transaction helper rejects financial writes without transaction support. */
test("Module 8 financial workflows require PostgreSQL transactions", async () => {
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");

  const start = service.indexOf("async function requireTransaction");
  const section = service.slice(start, start + 1200);
  assert.match(section, /if \(!database\.transaction\)/);
  assert.match(section, /DATABASE_TRANSACTION_REQUIRED/);
  assert.match(section, /database\.transaction\(async \(transaction\)/);
});

/** Verifies opening-account writes use the transaction object for both related records. */
test("Module 8 opening account writes share one transaction object", async () => {
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");

  const cashStart = service.indexOf("export async function createCashAccount");
  const cashSection = service.slice(cashStart, cashStart + 2600);
  assert.match(cashSection, /requireTransaction\(database, async \(transaction\)/);
  assert.match(cashSection, /insertCashAccount\(transaction,/);
  assert.match(cashSection, /createCashOpeningMovement\(transaction, account\)/);

  const bankStart = service.indexOf("export async function createBankAccount");
  const bankSection = service.slice(bankStart, bankStart + 3000);
  assert.match(bankSection, /requireTransaction\(database, async \(transaction\)/);
  assert.match(bankSection, /insertBankAccount\(transaction,/);
  assert.match(bankSection, /createBankOpeningMovement\(transaction, account\)/);
});

/** Verifies transfer header and both account movements use the same transaction. */
test("Module 8 transfer writes share one transaction object", async () => {
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");

  const start = service.indexOf("export async function createTransfer");
  const section = service.slice(start, start + 6200);
  assert.match(section, /requireTransaction\(database, async \(transaction\)/);
  assert.match(section, /lockTransferAccounts\(transaction, input\)/);
  assert.match(section, /insertTransfer\(transaction, transferInput\)/);
  assert.match(section, /writeCashOutflow\(transaction|writeBankOutflow\(transaction/);
  assert.match(section, /writeCashInflow\(transaction|writeBankInflow\(transaction/);
});

/** Verifies reconciliation adjustments belong to the counted business date, not the later confirmation time. */
test("Module 8 reconciliation adjustment uses the reconciliation business date", async () => {
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");

  const start = service.indexOf("export async function confirmCashReconciliation");
  const section = service.slice(start, start + 6200);

  assert.match(
    section,
    /RECONCILIATION_ADJUSTMENT[\s\S]*occurredAt: reconciliation\.reconciliationDate/,
  );
  assert.doesNotMatch(
    section,
    /RECONCILIATION_ADJUSTMENT[\s\S]{0,500}occurredAt: confirmedAt/,
  );
});

/** Verifies reconciliation confirmation and its optional adjustment share one transaction. */
test("Module 8 reconciliation confirmation writes share one transaction object", async () => {
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");

  const start = service.indexOf("export async function confirmCashReconciliation");
  const section = service.slice(start, start + 6200);
  assert.match(section, /requireTransaction\(database, async \(transaction\)/);
  assert.match(section, /lockCashReconciliation\(\s*transaction,/);
  assert.match(section, /lockCashAccount\(\s*transaction,/);
  assert.match(section, /confirmDraftCashReconciliation\(\s*transaction,/);
  assert.match(section, /writeCashInflow\(transaction|writeCashOutflow\(transaction/);
});

/** Verifies payment services use the transaction supplied by the idempotent route wrapper. */
test("Module 8 customer and supplier payment writes stay in the caller transaction", async () => {
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");

  const customerStart = service.indexOf("export async function createCustomerReceipt");
  const supplierStart = service.indexOf("export async function createSupplierPayment");
  const customerSection = service.slice(customerStart, supplierStart);
  const supplierSection = service.slice(supplierStart);

  assert.doesNotMatch(customerSection, /requireTransaction\(database/);
  assert.doesNotMatch(supplierSection, /requireTransaction\(database/);
  assert.match(customerSection, /insertCustomerPayment\(database/);
  assert.match(customerSection, /writeCustomerCredit\(database/);
  assert.match(supplierSection, /insertSupplierPayment\(database/);
  assert.match(supplierSection, /writeSupplierDebit\(database/);
});

/** Verifies service methods keep critical financial amount checks even when called internally. */
test("Module 8 service validates active financial amounts defensively", async () => {
  const service = await readProjectFile(
    "../src/modules/payments/payments.service.ts",
  );

  assert.match(service, /function requireNonNegativeAmount\(/);
  assert.match(service, /Transfer amount must be greater than zero/);
  assert.match(service, /requireNonNegativeAmount\(input\.openingBalance, "openingBalance"\)/);
  assert.match(service, /requireNonNegativeAmount\(input\.countedAmount, "countedAmount"\)/);
});

/** Verifies payment validation keeps the approved party, outstanding, and reversal safeguards. */
test("Module 8 keeps payment allocation and reversal business validation", async () => {
  const schema = await readProjectFile(
    "../src/modules/payments/payments.schema.ts",
  );
  const service = await readProjectFile(
    "../src/modules/payments/payments.service.ts",
  );

  assert.match(schema, /reason: reasonSchema/);
  assert.match(service, /function validateAllocationParty\(/);
  assert.match(service, /function validateOutstandingAmounts\(/);
  assert.match(service, /ALLOCATION_EXCEEDS_OUTSTANDING/);
  assert.match(service, /function validateAccountsAreActive\(/);
});


/** Verifies idempotency reservation, business writes, and saved response share one transaction. */
test("Module 8 idempotency keeps financial effects and replay data atomic", async () => {
  const helper = await readProjectFile("../src/shared/http/idempotency.ts");
  const routes = await readProjectFile("../src/modules/payments/payments.routes.ts");

  assert.match(helper, /return database\.transaction\(async \(transaction\) =>/);
  assert.match(helper, /const response = await operation\(tx\)/);
  assert.match(helper, /\.update\(idempotencyRequests\)[\s\S]*status: "COMPLETED"/);
  assert.doesNotMatch(helper, /catch \(error\)[\s\S]*delete\(idempotencyRequests\)/);
  assert.match(routes, /operation\(transaction\)/);
  assert.match(routes, /createTransfer\(transaction, input\)/);
  assert.match(routes, /confirmCashReconciliation\(transaction, params\.id\)/);
});

/** Verifies all current Module 8 financial POST routes use the shared idempotency wrapper. */
test("Module 8 financial POST routes keep idempotency protection", async () => {
  const routes = await readProjectFile("../src/modules/payments/payments.routes.ts");

  for (const handler of [
    "handleCreateCashAccount",
    "handleCreateBankAccount",
    "handleCreateCustomerReceipt",
    "handleReverseCustomerReceipt",
    "handleCreateSupplierPayment",
    "handleReverseSupplierPayment",
    "handleCreateTransfer",
    "handleConfirmCashReconciliation",
  ]) {
    const start = routes.indexOf(`async function ${handler}`);
    assert.ok(start >= 0, `${handler} must exist`);
    const nextHandler = routes.indexOf("async function ", start + 20);
    const body = routes.slice(start, nextHandler >= 0 ? nextHandler : routes.length);
    assert.match(body, /sendIdempotentMutation\(/, `${handler} must use idempotency`);
  }
});

/** Verifies account creation sends an idempotency key because opening balances create movements. */
test("Module 8 account creation protects opening movements from duplicate browser retries", async () => {
  const api = await readProjectFile(
    "../../web-admin/src/features/payments/api/payments.api.ts",
  );

  const cashStart = api.indexOf("export function createCashAccount");
  const bankStart = api.indexOf("export function createBankAccount");
  const cashSection = api.slice(cashStart, bankStart);
  const bankSection = api.slice(bankStart, api.indexOf("export function updateBankAccount", bankStart));

  assert.match(cashSection, /"Idempotency-Key": crypto\.randomUUID\(\)/);
  assert.match(bankSection, /"Idempotency-Key": crypto\.randomUUID\(\)/);
});


const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";
const SUPPLIER_ID = "22222222-2222-4222-8222-222222222222";
const CASH_ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";
const BANK_ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";
const DOCUMENT_ID = "55555555-5555-4555-8555-555555555555";
const SECOND_DOCUMENT_ID = "66666666-6666-4666-8666-666666666666";

/** Returns a small valid customer receipt request used by runtime validation tests. */
function validCustomerReceiptInput(): CreateCustomerReceiptInput {
  return {
    customerId: CUSTOMER_ID,
    paymentDate: "2026-08-07",
    splits: [
      {
        method: "CASH" as const,
        amount: "100.00",
        cashAccountId: CASH_ACCOUNT_ID,
      },
    ],
    allocations: [{ documentId: DOCUMENT_ID, amount: "100.00" }],
  };
}

/** Returns a small valid supplier payment request used by runtime validation tests. */
function validSupplierPaymentInput(): CreateSupplierPaymentInput {
  return {
    supplierId: SUPPLIER_ID,
    paymentDate: "2026-08-07",
    splits: [
      {
        method: "BANK_TRANSFER" as const,
        amount: "100.00",
        bankAccountId: BANK_ACCOUNT_ID,
      },
    ],
    allocations: [{ documentId: DOCUMENT_ID, amount: "100.00" }],
  };
}

/** Confirms a Zod parse fails and exposes the expected readable message. */
function assertSchemaRejects(result: { success: boolean; error?: { issues: Array<{ message: string }> } }, message: RegExp): void {
  assert.equal(result.success, false);
  assert.ok(result.error);
  assert.match(result.error.issues.map((issue) => issue.message).join(" | "), message);
}

/** Verifies runtime customer receipt validation rejects unequal split and allocation totals. */
test("Module 8 runtime receipt validation rejects mismatched totals", () => {
  const input = validCustomerReceiptInput();
  input.allocations[0]!.amount = "99.99";

  assertSchemaRejects(
    createCustomerReceiptSchema.safeParse(input),
    /Payment split total must equal allocation total/,
  );
});

/** Verifies runtime supplier-payment validation rejects the same purchase twice. */
test("Module 8 runtime supplier validation rejects duplicate allocations", () => {
  const input = validSupplierPaymentInput();
  input.splits[0]!.amount = "200.00";
  input.allocations = [
    { documentId: DOCUMENT_ID, amount: "100.00" },
    { documentId: DOCUMENT_ID, amount: "100.00" },
  ];

  assertSchemaRejects(
    createSupplierPaymentSchema.safeParse(input),
    /same document can be allocated only once/i,
  );
});

/** Verifies a cash split cannot point to a bank account at runtime. */
test("Module 8 runtime split validation rejects CASH with a bank account", () => {
  const input = validCustomerReceiptInput();
  input.splits = [
    {
      method: "CASH" as const,
      amount: "100.00",
      bankAccountId: BANK_ACCOUNT_ID,
    },
  ];

  assertSchemaRejects(
    createCustomerReceiptSchema.safeParse(input),
    /CASH split requires only a cash account/,
  );
});

/** Verifies a bank-transfer split cannot point to a cash account at runtime. */
test("Module 8 runtime split validation rejects BANK_TRANSFER with a cash account", () => {
  const input = validSupplierPaymentInput();
  input.splits = [
    {
      method: "BANK_TRANSFER" as const,
      amount: "100.00",
      cashAccountId: CASH_ACCOUNT_ID,
    },
  ];

  assertSchemaRejects(
    createSupplierPaymentSchema.safeParse(input),
    /BANK_TRANSFER split requires only a bank account/,
  );
});

/** Verifies duplicate payment splits for the same account are rejected. */
test("Module 8 runtime payment validation rejects duplicate account splits", () => {
  const input = validCustomerReceiptInput();
  input.splits = [
    { method: "CASH" as const, amount: "50.00", cashAccountId: CASH_ACCOUNT_ID },
    { method: "CASH" as const, amount: "50.00", cashAccountId: CASH_ACCOUNT_ID },
  ];

  assertSchemaRejects(
    createCustomerReceiptSchema.safeParse(input),
    /same account can appear only once/i,
  );
});

/** Verifies payment amounts must be greater than zero before service execution. */
test("Module 8 runtime payment validation rejects zero amounts", () => {
  const input = validCustomerReceiptInput();
  input.splits[0]!.amount = "0.00";
  input.allocations[0]!.amount = "0.00";

  const result = createCustomerReceiptSchema.safeParse(input);
  assert.equal(result.success, false);
});

/** Verifies a transfer cannot use the same account as source and destination. */
test("Module 8 runtime transfer validation rejects identical accounts", () => {
  assertSchemaRejects(
    createTransferSchema.safeParse({
      sourceAccountType: "CASH",
      sourceAccountId: CASH_ACCOUNT_ID,
      destinationAccountType: "CASH",
      destinationAccountId: CASH_ACCOUNT_ID,
      amount: "10.00",
      transferDate: "2026-08-07",
    }),
    /source and destination must be different accounts/i,
  );
});

/** Verifies reversal requests require a meaningful reason. */
test("Module 8 runtime reversal validation requires a reason", () => {
  const result = reversePaymentSchema.safeParse({ reason: "   " });
  assert.equal(result.success, false);
});

/** Verifies reversed date ranges are rejected by payment list validation. */
test("Module 8 runtime date validation rejects reversed ranges", () => {
  assertSchemaRejects(
    customerReceiptListQuerySchema.safeParse({
      startDate: "2026-08-08",
      endDate: "2026-08-07",
    }),
    /End date must be on or after start date/,
  );
});

/** Verifies a negative reconciliation count is rejected by the schema. */
test("Module 8 runtime reconciliation validation rejects negative counted cash", () => {
  const result = createCashReconciliationSchema.safeParse({
    cashAccountId: CASH_ACCOUNT_ID,
    reconciliationDate: "2026-08-07",
    countedAmount: "-0.01",
  });
  assert.equal(result.success, false);
});

/** Verifies the service itself rejects a non-positive transfer before touching the database. */
test("Module 8 service rejects a non-positive transfer before database access", async () => {
  const fakeDatabase = {} as Parameters<typeof createTransfer>[0];

  await assert.rejects(
    createTransfer(fakeDatabase, {
      sourceAccountType: "CASH",
      sourceAccountId: CASH_ACCOUNT_ID,
      destinationAccountType: "BANK",
      destinationAccountId: BANK_ACCOUNT_ID,
      amount: "0.00",
      transferDate: "2026-08-07",
      notes: null,
    }),
    (error: unknown) =>
      error instanceof AppError && error.code === "PAYMENT_AMOUNT_INVALID",
  );
});

/** Verifies the service itself rejects negative reconciliation cash before database access. */
test("Module 8 service rejects a negative reconciliation count before database access", async () => {
  const fakeDatabase = {} as Parameters<typeof createCashReconciliation>[0];

  await assert.rejects(
    createCashReconciliation(fakeDatabase, {
      cashAccountId: CASH_ACCOUNT_ID,
      reconciliationDate: "2026-08-07",
      countedAmount: "-1.00",
      notes: null,
    }),
    (error: unknown) =>
      error instanceof AppError && error.code === "PAYMENT_AMOUNT_INVALID",
  );
});

/** Verifies customer receipt creation is no longer blocked by the old Sales staging error. */
test("Module 8 customer receipt workflow is enabled after Module 10", async () => {
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");
  const repository = await readProjectFile("../src/modules/payments/payments.repository.ts");

  assert.doesNotMatch(service, /SALES_MODULE_NOT_READY/);
  assert.match(service, /lockCustomerPaymentSales/);
  assert.match(repository, /export async function lockCustomerPaymentSales/);
});

/** Verifies supplier payment creation now validates and writes real Purchase allocations. */
test("Module 8 runtime supplier workflow is no longer Purchase-staged", async () => {
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");
  assert.doesNotMatch(service, /PURCHASE_MODULE_NOT_READY/);
  assert.match(service, /lockSupplierPaymentPurchases/);
  assert.match(service, /ALLOCATION_EXCEEDS_OUTSTANDING/);
});

/** Verifies different documents can still be allocated normally when totals match. */
test("Module 8 runtime receipt validation accepts multiple distinct allocations", () => {
  const input = validCustomerReceiptInput();
  input.splits[0]!.amount = "100.00";
  input.allocations = [
    { documentId: DOCUMENT_ID, amount: "60.00" },
    { documentId: SECOND_DOCUMENT_ID, amount: "40.00" },
  ];

  assert.equal(createCustomerReceiptSchema.safeParse(input).success, true);
});

/** Preserves direct UUID allocation columns so the Purchase and Sales modules can attach real foreign keys when their source tables are created. */
test("Module 8 keeps staged allocation IDs ready for direct future foreign keys", async () => {
  const paymentSchema = await readProjectFile(
    "../src/database/schema/payment.schema.ts",
  );

  assert.match(
    paymentSchema,
    /salesInvoiceId:\s*uuid\("sales_invoice_id"\)\.notNull\(\)/,
  );
  assert.match(
    paymentSchema,
    /purchaseId:\s*uuid\("purchase_id"\)\.notNull\(\)/,
  );
});


/** Verifies customer outstanding queries ignore reversed receipts and reversal rows. */
test("Pass 1 customer outstanding counts only effective confirmed receipts", async () => {
  const customerRepository = await readProjectFile(
    "../src/modules/customers/customers.repository.ts",
  );

  assert.match(
    customerRepository,
    /customerPayments\.status\} = 'CONFIRMED'/,
  );
  assert.match(
    customerRepository,
    /customerPayments\.reversalOfPaymentId\} is null/,
  );
});

/** Verifies supplier outstanding queries ignore reversed payments and reversal rows. */
test("Pass 1 supplier outstanding counts only effective confirmed payments", async () => {
  const supplierRepository = await readProjectFile(
    "../src/modules/suppliers/suppliers.repository.ts",
  );

  assert.match(
    supplierRepository,
    /supplierPayments\.status\} = 'CONFIRMED'/,
  );
  assert.match(
    supplierRepository,
    /supplierPayments\.reversalOfPaymentId\} is null/,
  );
});

/** Verifies new allocations cannot treat reversed customer or supplier payments as still allocated. */
test("Pass 1 allocation locking excludes reversed payment effects", async () => {
  const repository = await readProjectFile(
    "../src/modules/payments/payments.repository.ts",
  );

  const customerStart = repository.indexOf(
    "export async function lockCustomerPaymentSales",
  );
  const customerEnd = repository.indexOf(
    "/** Creates one immutable customer receipt header.",
    customerStart,
  );
  const customerSection = repository.slice(customerStart, customerEnd);

  assert.match(customerSection, /eq\(customerPayments\.status, "CONFIRMED"\)/);
  assert.match(customerSection, /isNull\(customerPayments\.reversalOfPaymentId\)/);

  const supplierStart = repository.indexOf(
    "export async function lockSupplierPaymentPurchases",
  );
  const supplierEnd = repository.indexOf(
    "/** Creates one immutable supplier payment header.",
    supplierStart,
  );
  const supplierSection = repository.slice(supplierStart, supplierEnd);

  assert.match(supplierSection, /eq\(supplierPayments\.status, "CONFIRMED"\)/);
  assert.match(supplierSection, /isNull\(supplierPayments\.reversalOfPaymentId\)/);
});

/** Verifies reversal workflows mark the original payment REVERSED before later outstanding reads. */
test("Pass 1 reversal workflows remove original allocations from outstanding", async () => {
  const repository = await readProjectFile(
    "../src/modules/payments/payments.repository.ts",
  );
  const service = await readProjectFile(
    "../src/modules/payments/payments.service.ts",
  );

  assert.match(
    repository,
    /markCustomerPaymentReversed[\s\S]*\.set\(\{ status: "REVERSED" \}\)/,
  );
  assert.match(
    repository,
    /markSupplierPaymentReversed[\s\S]*\.set\(\{ status: "REVERSED" \}\)/,
  );
  assert.match(
    service,
    /markCustomerPaymentReversed\(\s*database,\s*payment\.id,\s*reversal\.id,?\s*\)/,
  );
  assert.match(
    service,
    /markSupplierPaymentReversed\(database, payment\.id, reversal\.id\)/,
  );
});


/** Verifies customer invoice outstanding subtracts confirmed sales returns as well as effective receipts. */
test("Pass 2 customer outstanding includes confirmed sales returns", async () => {
  const customerRepository = await readProjectFile(
    "../src/modules/customers/customers.repository.ts",
  );

  assert.match(customerRepository, /salesReturns\.originalSaleId/);
  assert.match(customerRepository, /salesReturns\.status\} = 'CONFIRMED'/);
  assert.match(
    customerRepository,
    /salesInvoices\.totalAmount\} - \$\{returnedAmount\} - \$\{paidAmount\}/,
  );
});

/** Verifies payment allocation locking returns both prior return and receipt totals for each invoice. */
test("Pass 2 customer receipt allocation uses return-aware outstanding", async () => {
  const repository = await readProjectFile(
    "../src/modules/payments/payments.repository.ts",
  );
  const service = await readProjectFile(
    "../src/modules/payments/payments.service.ts",
  );

  const customerStart = repository.indexOf(
    "export async function lockCustomerPaymentSales",
  );
  const customerEnd = repository.indexOf(
    "/** Creates one immutable customer receipt header.",
    customerStart,
  );
  const customerSection = repository.slice(customerStart, customerEnd);

  assert.match(customerSection, /salesReturns\.originalSaleId/);
  assert.match(customerSection, /eq\(salesReturns\.status, "CONFIRMED"\)/);
  assert.match(customerSection, /returnedAmount:/);
  assert.match(
    service,
    /moneyToCents\(invoice\.totalAmount\)[\s\S]*moneyToCents\(invoice\.returnedAmount\)[\s\S]*moneyToCents\(invoice\.allocatedAmount\)/,
  );
});

/** Verifies supplier purchase outstanding subtracts confirmed purchase returns as well as effective payments. */
test("Pass 3 supplier outstanding includes confirmed purchase returns", async () => {
  const supplierRepository = await readProjectFile(
    "../src/modules/suppliers/suppliers.repository.ts",
  );

  assert.match(supplierRepository, /purchaseReturns\.originalPurchaseId/);
  assert.match(supplierRepository, /purchaseReturns\.status\} = 'CONFIRMED'/);
  assert.match(
    supplierRepository,
    /purchases\.totalAmount\} - \$\{returnedAmount\} - \$\{paidAmount\}/,
  );
});

/** Verifies supplier payment allocation locking uses both prior returns and effective payment allocations. */
test("Pass 3 supplier payment allocation uses return-aware outstanding", async () => {
  const repository = await readProjectFile(
    "../src/modules/payments/payments.repository.ts",
  );
  const service = await readProjectFile(
    "../src/modules/payments/payments.service.ts",
  );

  const supplierStart = repository.indexOf(
    "export async function lockSupplierPaymentPurchases",
  );
  const supplierEnd = repository.indexOf(
    "/** Creates one immutable supplier payment header.",
    supplierStart,
  );
  const supplierSection = repository.slice(supplierStart, supplierEnd);

  assert.match(supplierSection, /purchaseReturns\.originalPurchaseId/);
  assert.match(supplierSection, /eq\(purchaseReturns\.status, "CONFIRMED"\)/);
  assert.match(supplierSection, /returnedAmount:/);
  assert.match(
    service,
    /moneyToCents\(purchase\.totalAmount\)[\s\S]*moneyToCents\(purchase\.returnedAmount\)[\s\S]*moneyToCents\(purchase\.allocatedAmount\)/,
  );
});

/** Verifies the production daily cash summary repository reads only existing money records. */
test("Production daily cash summary repository provides the required read-only queries", async () => {
  const repository = await readProjectFile(
    "../src/modules/payments/payments.repository.ts",
  );

  for (const functionName of [
    "getCashBalanceBeforeDate",
    "sumCashMovementsForDate",
    "findCashReconciliationForDate",
  ]) {
    assert.match(repository, new RegExp(`export async function ${functionName}\\b`));
  }

  assert.match(repository, /timezone\('Asia\/Karachi',[\s\S]*occurredAt[\s\S]*::date < /);
  assert.match(repository, /timezone\('Asia\/Karachi',[\s\S]*occurredAt[\s\S]*::date = /);
  assert.match(repository, /direction[^\n]*= 'INFLOW'/);
  assert.match(repository, /direction[^\n]*= 'OUTFLOW'/);
  assert.match(repository, /eq\(cashReconciliations\.status, "CONFIRMED"\)/);
  assert.match(repository, /cashReconciliations\.reconciliationDate/);
});

/** Keeps the daily cash summary repository aligned with the approved no-new-table design. */
test("Production daily cash summary reuses cash movements and reconciliations", async () => {
  const repository = await readProjectFile(
    "../src/modules/payments/payments.repository.ts",
  );
  const paymentSchema = await readProjectFile(
    "../src/database/schema/payment.schema.ts",
  );

  assert.match(repository, /from\(cashBankMovements\)/);
  assert.match(repository, /from\(cashReconciliations\)/);
  assert.match(repository, /eq\(cashBankMovements\.cashAccountId, cashAccountId\)/);
  assert.match(repository, /eq\(cashReconciliations\.cashAccountId, cashAccountId\)/);
  assert.doesNotMatch(paymentSchema, /dailyCashSummary|daily_cash_summary/);
});


/** Verifies the daily cash summary accepts only the approved account/date filters. */
test("Production daily cash summary schema accepts only account and business date", () => {
  const parsed = dailyCashSummaryQuerySchema.parse({
    cashAccountId: "11111111-1111-4111-8111-111111111111",
    date: "2026-08-10",
  });

  assert.equal(parsed.cashAccountId, "11111111-1111-4111-8111-111111111111");
  assert.equal(parsed.date, "2026-08-10");
  assert.throws(() =>
    dailyCashSummaryQuerySchema.parse({
      cashAccountId: "11111111-1111-4111-8111-111111111111",
      date: "2026-08-10",
      extra: "not-allowed",
    }),
  );
});

/** Verifies the service uses the three repository reads and exact opening + inflow - outflow arithmetic. */
test("Production daily cash summary service implements the approved read-only calculation", async () => {
  const service = await readProjectFile("../src/modules/payments/payments.service.ts");

  assert.match(service, /export async function getDailyCashSummary\b/);
  assert.match(service, /findCashAccountById\(database, query\.cashAccountId\)/);
  assert.match(service, /getCashBalanceBeforeDate\(database, query\.cashAccountId, query\.date\)/);
  assert.match(service, /sumCashMovementsForDate\(database, query\.cashAccountId, query\.date\)/);
  assert.match(service, /findCashReconciliationForDate\(database, query\.cashAccountId, query\.date\)/);
  assert.match(service, /moneyToCents\(opening\)[\s\S]*\+ moneyToCents\(movements\.inflows\)[\s\S]*- moneyToCents\(movements\.outflows\)/);
  assert.match(service, /countedAmount: reconciliation\?\.countedAmount \?\? null/);
  assert.match(service, /difference: reconciliation\?\.differenceAmount \?\? null/);
});

/** Verifies the production daily cash summary route is authenticated and read-only. */
test("Production daily cash summary registers one authenticated GET route", async () => {
  const routes = await readProjectFile("../src/modules/payments/payments.routes.ts");

  assert.match(routes, /"\/payments\/daily-cash-summary"/);
  assert.match(routes, /privateRoute\(app, "Load daily cash summary"\)/);
  assert.match(routes, /dailyCashSummaryQuerySchema\.parse\(request\.query\)/);
  assert.match(routes, /getDailyCashSummary\(app\.db, query\)/);
  assert.doesNotMatch(routes, /app\.(?:post|patch|delete)\([\s\S]{0,120}"\/payments\/daily-cash-summary"/);
});
