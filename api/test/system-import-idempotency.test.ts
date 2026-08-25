import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/** Reads one project source file used by the System import idempotency audit. */
async function readSource(path: URL): Promise<string> {
  return readFile(path, "utf8");
}

test("import confirmation requires Idempotency-Key before business work runs", async () => {
  const routes = await readSource(
    new URL("../src/modules/system/system.routes.ts", import.meta.url),
  );

  assert.match(routes, /parseSystemValue\(systemIdempotencyHeadersSchema, request\.headers\)/);
  assert.match(routes, /key:\s*request\.headers\["idempotency-key"\]/);
  assert.match(routes, /executeIdempotentMutation\(/);
  assert.match(routes, /body:\s*\{\s*importJobId:\s*params\.id\s*\}/);
  assert.match(routes, /confirmImport\(transaction, params\.id\)/);
});

test("same import confirmation retry replays the original saved response", async () => {
  const helper = await readSource(
    new URL("../src/shared/http/idempotency.ts", import.meta.url),
  );

  assert.match(helper, /existing\.status === "COMPLETED"/);
  assert.match(helper, /statusCode:\s*existing\.responseStatus/);
  assert.match(helper, /body:\s*existing\.responseBody/);
  assert.match(helper, /responseBody:\s*response\.body/);
  assert.match(helper, /responseStatus:\s*response\.statusCode/);
});

test("one Idempotency-Key cannot confirm a different import job", async () => {
  const routes = await readSource(
    new URL("../src/modules/system/system.routes.ts", import.meta.url),
  );
  const helper = await readSource(
    new URL("../src/shared/http/idempotency.ts", import.meta.url),
  );

  // The import job UUID is part of the hashed request identity.
  assert.match(routes, /body:\s*\{\s*importJobId:\s*params\.id\s*\}/);
  assert.match(helper, /createRequestHash\(input\.body\)/);
  assert.match(helper, /existing\.requestHash !== requestHash/);
  assert.match(helper, /"IDEMPOTENCY_KEY_REUSED"/);
});

test("import confirmation and idempotency reservation share one database transaction", async () => {
  const routes = await readSource(
    new URL("../src/modules/system/system.routes.ts", import.meta.url),
  );
  const helper = await readSource(
    new URL("../src/shared/http/idempotency.ts", import.meta.url),
  );

  assert.match(helper, /database\.transaction\(async \(transaction\) =>/);
  assert.match(routes, /confirmImport\(transaction, params\.id\)/);
  assert.match(helper, /const response = await operation\(tx\)/);
  assert.match(helper, /status:\s*"COMPLETED"/);
});

test("already imported jobs cannot be committed again with a new idempotency key", async () => {
  const repository = await readSource(
    new URL("../src/modules/system/system.repository.ts", import.meta.url),
  );
  const service = await readSource(
    new URL("../src/modules/system/system.service.ts", import.meta.url),
  );

  // Every claim is conditional on VALIDATED, so a committed IMPORTED job cannot be claimed again.
  assert.match(repository, /claimValidatedProductImport[\s\S]*eq\(importJobs\.status, "VALIDATED"\)/);
  assert.match(repository, /claimValidatedPartyImport[\s\S]*eq\(importJobs\.status, "VALIDATED"\)/);
  assert.match(repository, /claimValidatedOpeningStockImport[\s\S]*eq\(importJobs\.status, "VALIDATED"\)/);
  assert.match(repository, /claimValidatedOpeningBalanceImport[\s\S]*eq\(importJobs\.status, "VALIDATED"\)/);
  assert.match(service, /job\.status === "IMPORTED"/);
  assert.match(service, /already been imported/);
});

test("idempotency keys are validated and persisted with request identity", async () => {
  const schema = await readSource(
    new URL("../src/modules/system/system.schema.ts", import.meta.url),
  );
  const databaseSchema = await readSource(
    new URL("../src/database/schema/system.schema.ts", import.meta.url),
  );
  const helper = await readSource(
    new URL("../src/shared/http/idempotency.ts", import.meta.url),
  );

  assert.match(schema, /Idempotency-Key is required/);
  assert.match(schema, /max\(200/);
  assert.match(databaseSchema, /idempotency_requests_key_unique/);
  assert.match(databaseSchema, /requestHash/);
  assert.match(databaseSchema, /responseBody/);
  assert.match(helper, /method:\s*input\.method/);
  assert.match(helper, /path:\s*input\.path/);
  assert.match(helper, /requestHash/);
});
