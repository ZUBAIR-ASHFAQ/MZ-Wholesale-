import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repositoryPath = new URL(
  "../src/modules/business-settings/business-settings.repository.ts",
  import.meta.url,
);
const servicePath = new URL(
  "../src/modules/business-settings/business-settings.service.ts",
  import.meta.url,
);

/** Reads the Business Settings repository source for the lock contract test. */
async function readRepository(): Promise<string> {
  return readFile(repositoryPath, "utf8");
}

/** Reads the Business Settings service source for the lock-order contract test. */
async function readService(): Promise<string> {
  return readFile(servicePath, "utf8");
}

/** Verifies that first-time setup uses one transaction-level advisory lock. */
test("business settings save uses an advisory transaction lock", async () => {
  const source = await readRepository();

  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(
    source,
    /hashtextextended\('wholesale_erp_business_settings_save', 0\)/,
  );
});

/** Verifies that the advisory lock is acquired before checking the singleton row. */
test("business settings save acquires the advisory lock before the row lock", async () => {
  const source = await readService();
  const advisoryLockPosition = source.indexOf(
    "await lockBusinessSettingsSave(transaction)",
  );
  const rowLockPosition = source.indexOf(
    "await lockBusinessSettings(transaction)",
  );

  assert.notEqual(advisoryLockPosition, -1);
  assert.notEqual(rowLockPosition, -1);
  assert.ok(advisoryLockPosition < rowLockPosition);
});

const routesPath = new URL(
  "../src/modules/business-settings/business-settings.routes.ts",
  import.meta.url,
);
const errorHandlerPath = new URL(
  "../src/plugins/error-handler.plugin.ts",
  import.meta.url,
);

/** Reads the Business Settings route source for the route simplicity audit. */
async function readRoutes(): Promise<string> {
  return readFile(routesPath, "utf8");
}

/** Reads the shared error handler source for the constraint mapping audit. */
async function readErrorHandler(): Promise<string> {
  return readFile(errorHandlerPath, "utf8");
}

/** Verifies that Business Settings routes use the shared error handler. */
test("business settings routes contain only HTTP work", async () => {
  const source = await readRoutes();

  assert.doesNotMatch(source, /sendRouteError/);
  assert.doesNotMatch(source, /readRouteError/);
  assert.doesNotMatch(source, /getBusinessSettingsRoutes/);
  assert.match(source, /createDataResponse/);
});

/** Verifies that document sequence conflicts keep their readable field errors. */
test("shared error handler maps document sequence unique constraints", async () => {
  const source = await readErrorHandler();

  assert.match(source, /document_sequences_prefix_unique/);
  assert.match(source, /document_sequences_document_type_unique/);
  assert.match(source, /sequences\.prefix/);
  assert.match(source, /sequences\.documentType/);
});

/** Verifies the normal settings read uses the singleton key explicitly. */
test("business settings read uses the singleton condition", async () => {
  const source = await readRepository();
  const functionStart = source.indexOf("export async function findBusinessSettings");
  const functionEnd = source.indexOf("export async function findDocumentSequences");
  const functionSource = source.slice(functionStart, functionEnd);

  assert.match(functionSource, /where\(eq\(businessSettings\.singletonKey, 1\)\)/);
});
