import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const reportsBackendDirectory = new URL(
  "../src/modules/reports/",
  import.meta.url,
);
const reportsFrontendDirectory = new URL(
  "../../web-admin/src/features/reports/",
  import.meta.url,
);
const repositoryPath = new URL(
  "../src/modules/reports/reports.repository.ts",
  import.meta.url,
);
const routesPath = new URL(
  "../src/modules/reports/reports.routes.ts",
  import.meta.url,
);
const apiPackagePath = new URL("../package.json", import.meta.url);
const webPackagePath = new URL("../../web-admin/package.json", import.meta.url);

/** Reads a UTF-8 source file used by this architecture audit. */
async function readSource(path: URL): Promise<string> {
  return readFile(path, "utf8");
}

/** Returns sorted file or folder names from one audited directory. */
async function listNames(path: URL): Promise<string[]> {
  return (await readdir(path)).sort();
}

test("reports backend keeps the approved five-file module structure", async () => {
  const files = await listNames(reportsBackendDirectory);

  assert.deepEqual(files, [
    "index.ts",
    "reports.repository.ts",
    "reports.routes.ts",
    "reports.schema.ts",
    "reports.service.ts",
  ]);
});

test("reports frontend keeps the approved feature folders", async () => {
  const folders = await listNames(reportsFrontendDirectory);

  assert.deepEqual(folders, ["api", "components", "hooks", "pages"]);
});

test("routes stay thin and repository stays read-only", async () => {
  const [routes, repository] = await Promise.all([
    readSource(routesPath),
    readSource(repositoryPath),
  ]);

  assert.equal((routes.match(/app\.get\(/g) ?? []).length, 18);
  assert.equal(/app\.(post|put|patch|delete)\(/.test(routes), false);
  assert.equal(/\.select\(|\.execute\(/.test(routes), false);
  assert.equal(/\.(insert|update|delete)\(/.test(repository), false);
});

test("approved backend and frontend stacks remain in use", async () => {
  const [apiPackage, webPackage] = await Promise.all([
    readSource(apiPackagePath),
    readSource(webPackagePath),
  ]);

  assert.match(apiPackage, /"fastify"/);
  assert.match(apiPackage, /"drizzle-orm"/);
  assert.match(apiPackage, /"pg"/);
  assert.match(apiPackage, /"zod"/);
  assert.match(apiPackage, /"@fastify\/swagger"/);

  assert.match(webPackage, /"react"/);
  assert.match(webPackage, /"vite"/);
  assert.match(webPackage, /"@tanstack\/react-query"/);
  assert.match(webPackage, /"@tanstack\/react-router"/);
  assert.match(webPackage, /"react-hook-form"/);
  assert.match(webPackage, /"tailwindcss"/);
});

test("reports code does not introduce banned frameworks or infrastructure", async () => {
  const files = [
    new URL("../src/modules/reports/reports.routes.ts", import.meta.url),
    new URL("../src/modules/reports/reports.service.ts", import.meta.url),
    new URL("../src/modules/reports/reports.repository.ts", import.meta.url),
    new URL("../src/modules/reports/reports.schema.ts", import.meta.url),
    new URL("../../web-admin/src/features/reports/api/reports.api.ts", import.meta.url),
    new URL("../../web-admin/src/features/reports/hooks/use-reports.ts", import.meta.url),
  ];
  const source = (await Promise.all(files.map(readSource))).join("\n").toLowerCase();

  for (const bannedName of [
    "@nestjs",
    "prisma",
    "typeorm",
    "sequelize",
    "bullmq",
    "ioredis",
    "turborepo",
    "@nrwl",
    "lerna",
  ]) {
    assert.equal(source.includes(bannedName), false, `${bannedName} must not be added`);
  }
});
