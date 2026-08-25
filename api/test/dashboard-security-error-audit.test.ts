import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardRoutesUrl = new URL(
  "../src/modules/dashboard/dashboard.routes.ts",
  import.meta.url,
);
const dashboardSchemaUrl = new URL(
  "../src/modules/dashboard/dashboard.schema.ts",
  import.meta.url,
);
const authPluginUrl = new URL(
  "../src/plugins/auth.plugin.ts",
  import.meta.url,
);
const errorHandlerUrl = new URL(
  "../src/plugins/error-handler.plugin.ts",
  import.meta.url,
);

/** Reads one source file used by the Dashboard security and error audit. */
async function readSource(path: URL): Promise<string> {
  return readFile(path, "utf8");
}

test("Dashboard routes require the shared authenticated admin pre-handler", async () => {
  const routes = await readSource(dashboardRoutesUrl);

  assert.match(routes, /preHandler:\s*app\.authenticate/);
  assert.match(routes, /security:\s*openApiAccessSecurity/);
});

test("Dashboard exposes safe GET requests only and therefore needs no CSRF mutation handling", async () => {
  const routes = await readSource(dashboardRoutesUrl);
  const authPlugin = await readSource(authPluginUrl);

  assert.match(routes, /app\.get\(\s*"\/dashboard\/overview"/);
  assert.match(routes, /app\.get\(\s*"\/dashboard\/low-stock"/);
  assert.doesNotMatch(routes, /app\.(post|patch|put|delete)\s*\(/);
  assert.match(authPlugin, /method === "GET" \|\| method === "HEAD" \|\| method === "OPTIONS"/);
});

test("Dashboard query validation returns the stable VALIDATION_ERROR code", async () => {
  const routes = await readSource(dashboardRoutesUrl);

  assert.match(routes, /"VALIDATION_ERROR"/);
  assert.match(routes, /new AppError\(/);
  assert.match(routes, /400/);
  assert.match(routes, /result\.error\.issues\.map/);
});

test("Dashboard overview rejects unknown query fields and validates real calendar dates", async () => {
  const schema = await readSource(dashboardSchemaUrl);

  assert.match(schema, /dashboardOverviewQuerySchema/);
  assert.match(schema, /\.strict\(\)/);
  assert.match(schema, /Date must use YYYY-MM-DD format\./);
  assert.match(schema, /Date must be a valid calendar date\./);
});

test("Dashboard low-stock pagination accepts only positive integer pages", async () => {
  const schema = await readSource(dashboardSchemaUrl);

  assert.match(schema, /z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.default\(1\)/);
});

test("Shared authentication returns UNAUTHENTICATED for missing or invalid sessions", async () => {
  const authPlugin = await readSource(authPluginUrl);

  assert.match(authPlugin, /"UNAUTHENTICATED"/);
  assert.match(authPlugin, /"An active admin session is required\."/);
  assert.match(authPlugin, /401/);
});

test("Unexpected Dashboard database failures are converted to the shared safe 500 response", async () => {
  const errorHandler = await readSource(errorHandlerUrl);

  assert.match(errorHandler, /"INTERNAL_SERVER_ERROR"/);
  assert.match(errorHandler, /"The request could not be completed\."/);
  assert.match(errorHandler, /\.status\(500\)/);
  assert.match(errorHandler, /requestId:\s*request\.id/);
});

test("Unexpected errors are logged without exposing stack traces or database details in the response", async () => {
  const errorHandler = await readSource(errorHandlerUrl);

  assert.match(errorHandler, /app\.log\.error/);
  assert.match(errorHandler, /errorName:\s*error\.name/);
  assert.match(errorHandler, /method:\s*request\.method/);
  assert.match(errorHandler, /url:\s*request\.url/);
  assert.doesNotMatch(
    errorHandler,
    /createErrorResponse\([\s\S]*?error\.message[\s\S]*?\)/,
  );
});

test("Dashboard normal viewing does not create audit-log writes", async () => {
  const routes = await readSource(dashboardRoutesUrl);

  assert.doesNotMatch(routes, /audit[_-]?log/i);
  assert.doesNotMatch(routes, /\.insert\s*\(/);
  assert.doesNotMatch(routes, /\.update\s*\(/);
  assert.doesNotMatch(routes, /\.delete\s*\(/);
});
