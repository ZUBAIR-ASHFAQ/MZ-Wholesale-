import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const dashboardModuleUrl = new URL("../src/modules/dashboard/", import.meta.url);
const dashboardRepositoryUrl = new URL(
  "../src/modules/dashboard/dashboard.repository.ts",
  import.meta.url,
);
const dashboardRoutesUrl = new URL(
  "../src/modules/dashboard/dashboard.routes.ts",
  import.meta.url,
);
const dashboardServiceUrl = new URL(
  "../src/modules/dashboard/dashboard.service.ts",
  import.meta.url,
);
const dashboardIndexUrl = new URL(
  "../src/modules/dashboard/index.ts",
  import.meta.url,
);
const frontendFeatureUrl = new URL(
  "../../web-admin/src/features/dashboard/",
  import.meta.url,
);
const drizzleUrl = new URL("../drizzle/", import.meta.url);

/** Reads one text source file used by the architecture audit. */
async function readSource(path: URL): Promise<string> {
  return readFile(path, "utf8");
}

test("Dashboard backend keeps exactly the approved five module files", async () => {
  const files = (await readdir(dashboardModuleUrl)).sort();

  assert.deepEqual(files, [
    "dashboard.repository.ts",
    "dashboard.routes.ts",
    "dashboard.schema.ts",
    "dashboard.service.ts",
    "index.ts",
  ]);
});

test("Dashboard repository stays read-only", async () => {
  const repository = await readSource(dashboardRepositoryUrl);

  assert.doesNotMatch(repository, /\.insert\s*\(/);
  assert.doesNotMatch(repository, /\.update\s*\(/);
  assert.doesNotMatch(repository, /\.delete\s*\(/);
  assert.doesNotMatch(repository, /\bINSERT\b/i);
  assert.doesNotMatch(repository, /\bUPDATE\b/i);
  assert.doesNotMatch(repository, /\bDELETE\b/i);
});

test("Dashboard exposes only the two approved GET routes", async () => {
  const routes = await readSource(dashboardRoutesUrl);

  assert.match(routes, /app\.get\(\s*"\/dashboard\/overview"/);
  assert.match(routes, /app\.get\(\s*"\/dashboard\/low-stock"/);
  assert.doesNotMatch(routes, /app\.(post|patch|put|delete)\s*\(/);
});

test("Dashboard routes delegate to the service and do not query Drizzle directly", async () => {
  const routes = await readSource(dashboardRoutesUrl);

  assert.match(routes, /getDashboardOverview/);
  assert.match(routes, /getDashboardLowStock/);
  assert.doesNotMatch(routes, /from\s+"drizzle-orm"/);
  assert.doesNotMatch(routes, /request\.server\.db/);
  assert.doesNotMatch(routes, /app\.db/);
});

test("Dashboard service remains orchestration-only and does not add infrastructure", async () => {
  const service = await readSource(dashboardServiceUrl);

  assert.doesNotMatch(service, /from\s+"drizzle-orm"/);
  assert.doesNotMatch(service, /redis/i);
  assert.doesNotMatch(service, /bullmq/i);
  assert.doesNotMatch(service, /websocket/i);
  assert.doesNotMatch(service, /eventemitter/i);
});

test("Dashboard module index only performs Fastify module registration", async () => {
  const indexSource = await readSource(dashboardIndexUrl);

  assert.match(indexSource, /dashboardRoutes/);
  assert.doesNotMatch(indexSource, /drizzle-orm/);
  assert.doesNotMatch(indexSource, /redis/i);
  assert.doesNotMatch(indexSource, /bullmq/i);
});

test("Dashboard frontend keeps the approved feature folders", async () => {
  const entries = await readdir(frontendFeatureUrl, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(directories, ["api", "components", "hooks", "pages"]);
});

test("Dashboard adds no database migration", async () => {
  const migrationFiles = await readdir(drizzleUrl);

  assert.equal(
    migrationFiles.some((file) => file.toLowerCase().includes("dashboard")),
    false,
  );
});
