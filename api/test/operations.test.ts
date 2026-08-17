import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

async function readProjectFile(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

/** Verifies the technical Operations module keeps the approved five-file structure. */
test("operations module keeps exactly the approved five backend files", async () => {
  const moduleDirectory = new URL("../src/modules/operations/", import.meta.url);
  const files = (await readdir(moduleDirectory)).sort();

  assert.deepEqual(files, [
    "index.ts",
    "operations.repository.ts",
    "operations.routes.ts",
    "operations.schema.ts",
    "operations.service.ts",
  ]);
});

/** Verifies liveness is public, lightweight, and independent from PostgreSQL. */
test("GET /health/live checks only process liveness", async () => {
  const routes = await readProjectFile("../src/modules/operations/operations.routes.ts");
  const service = await readProjectFile("../src/modules/operations/operations.service.ts");

  assert.match(routes, /app\.get\(\s*["']\/health\/live["']/);
  assert.match(routes, /getOperationsLiveness\(\)/);
  assert.match(service, /export function getOperationsLiveness\(\)/);
  assert.match(service, /return \{ status: ["']ok["'] \}/);

  const livenessStart = routes.indexOf("async function handleLiveness");
  const readinessStart = routes.indexOf("async function handleReadiness");
  const livenessHandler = routes.slice(livenessStart, readinessStart);

  assert.doesNotMatch(livenessHandler, /app\.db|database|execute\(|checkDatabaseReady/);
  assert.doesNotMatch(livenessHandler, /authenticate|preHandler/);
});

/** Verifies readiness uses one safe database check and maps failure to HTTP 503. */
test("GET /health/ready reports PostgreSQL readiness safely", async () => {
  const routes = await readProjectFile("../src/modules/operations/operations.routes.ts");
  const service = await readProjectFile("../src/modules/operations/operations.service.ts");
  const repository = await readProjectFile("../src/modules/operations/operations.repository.ts");

  assert.match(routes, /app\.get\(\s*["']\/health\/ready["']/);
  assert.match(routes, /getOperationsReadiness\(app\.db\)/);
  assert.match(routes, /result\.status === ["']unavailable["']/);
  assert.match(routes, /\.status\(503\)/);
  assert.match(routes, /SERVICE_UNAVAILABLE/);
  assert.match(service, /const isReady = await checkDatabaseReady\(database\)/);
  assert.match(service, /status: isReady \? ["']ready["'] : ["']unavailable["']/);
  assert.match(repository, /await database\.execute\(sql`select 1`\)/);
  assert.match(repository, /catch\s*\{/);
  assert.match(repository, /return false/);

  // Raw PostgreSQL errors must not be sent back by the route.
  assert.doesNotMatch(routes, /error\.message|error\.stack|databaseError|DATABASE_URL/);
});

/** Verifies the support endpoint exposes only safe build metadata. */
test("GET /operations/version exposes only safe version fields", async () => {
  const routes = await readProjectFile("../src/modules/operations/operations.routes.ts");
  const service = await readProjectFile("../src/modules/operations/operations.service.ts");
  const schema = await readProjectFile("../src/modules/operations/operations.schema.ts");
  const index = await readProjectFile("../src/modules/operations/index.ts");
  const env = await readProjectFile("../src/env.ts");

  assert.match(routes, /app\.get\(\s*["']\/operations\/version["']/);
  assert.match(service, /version: options\.version/);
  assert.match(service, /build: options\.build/);
  assert.match(service, /environment: options\.environment/);
  assert.match(schema, /version: string/);
  assert.match(schema, /build: string/);
  assert.match(schema, /environment: ["']development["'] \| ["']test["'] \| ["']production["']/);
  assert.match(index, /version: string/);
  assert.match(index, /build: string/);
  assert.match(env, /APP_VERSION/);
  assert.match(env, /APP_BUILD/);

  const combinedPublicContract = `${routes}\n${service}\n${schema}\n${index}`;
  for (const secretName of [
    "DATABASE_URL",
    "AUTH_SIGNING_SECRET",
    "COOKIE_SECRET",
    "JWT_SECRET",
    "SENTRY_DSN",
  ]) {
    assert.doesNotMatch(combinedPublicContract, new RegExp(secretName));
  }
});

/** Verifies all Operations endpoints remain read-only public GET routes. */
test("operations endpoints remain read-only and do not add unnecessary mutations", async () => {
  const routes = await readProjectFile("../src/modules/operations/operations.routes.ts");

  assert.equal([...routes.matchAll(/app\.get\(/g)].length, 3);
  assert.doesNotMatch(routes, /app\.(?:post|put|patch|delete)\(/);
});
