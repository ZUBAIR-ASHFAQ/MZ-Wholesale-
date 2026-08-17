import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const backendModuleUrl = new URL("../src/modules/system/", import.meta.url);
const frontendFeatureUrl = new URL(
  "../../web-admin/src/features/system/",
  import.meta.url,
);
const repositoryUrl = new URL(
  "../src/modules/system/system.repository.ts",
  import.meta.url,
);
const routesUrl = new URL(
  "../src/modules/system/system.routes.ts",
  import.meta.url,
);
const serviceUrl = new URL(
  "../src/modules/system/system.service.ts",
  import.meta.url,
);
const indexUrl = new URL(
  "../src/modules/system/index.ts",
  import.meta.url,
);
const apiPackageUrl = new URL("../package.json", import.meta.url);
const drizzleUrl = new URL("../drizzle/", import.meta.url);

/** Reads one UTF-8 source file used by the architecture audit. */
async function readSource(path: URL): Promise<string> {
  return readFile(path, "utf8");
}

/** Returns sorted directory entries. */
async function listNames(path: URL): Promise<string[]> {
  return (await readdir(path)).sort();
}

test("System backend keeps exactly the approved five production files", async () => {
  const files = await listNames(backendModuleUrl);

  assert.deepEqual(files, [
    "index.ts",
    "system.repository.ts",
    "system.routes.ts",
    "system.schema.ts",
    "system.service.ts",
  ]);
});

test("System frontend keeps the approved feature folder structure", async () => {
  const folders = await listNames(frontendFeatureUrl);

  assert.deepEqual(folders, ["api", "components", "hooks", "pages"]);
});

test("System repository remains the only System layer with Drizzle query operations", async () => {
  const routes = await readSource(routesUrl);
  const service = await readSource(serviceUrl);
  const repository = await readSource(repositoryUrl);

  for (const source of [routes, service]) {
    assert.doesNotMatch(source, /\.select\s*\(/);
    assert.doesNotMatch(source, /\.insert\s*\(/);
    assert.doesNotMatch(source, /\.update\s*\(/);
    assert.doesNotMatch(source, /\.delete\s*\(/);
  }

  assert.match(repository, /\.select\s*\(/);
});

test("System routes stay HTTP-focused and delegate work to the service layer", async () => {
  const routes = await readSource(routesUrl);

  assert.doesNotMatch(routes, /from\s+["'][^"']*database\/schema/);
  assert.doesNotMatch(routes, /drizzle-orm/);
  assert.match(routes, /systemService/);
  assert.doesNotMatch(routes, /new\s+Worker\s*\(/);
  assert.doesNotMatch(routes, /Queue\s*\(/);
});

test("System index only performs Fastify module registration", async () => {
  const index = await readSource(indexUrl);

  assert.match(index, /FastifyPluginAsync/);
  assert.match(index, /registerSystemRoutes/);
  assert.doesNotMatch(index, /\.select\s*\(/);
  assert.doesNotMatch(index, /\.insert\s*\(/);
  assert.doesNotMatch(index, /\.update\s*\(/);
  assert.doesNotMatch(index, /\.delete\s*\(/);
});

test("System module introduces no Redis, BullMQ, WebSocket, worker, or event infrastructure", async () => {
  const sources = await Promise.all(
    (await listNames(backendModuleUrl))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => readSource(new URL(`../src/modules/system/${name}`, import.meta.url))),
  );

  const combined = sources.join("\n").toLowerCase();

  assert.doesNotMatch(combined, /from\s+["']redis["']/);
  assert.doesNotMatch(combined, /from\s+["']ioredis["']/);
  assert.doesNotMatch(combined, /from\s+["']bullmq["']/);
  assert.doesNotMatch(combined, /\bwebsocket\b/);
  assert.doesNotMatch(combined, /\bworker_threads\b/);
  assert.doesNotMatch(combined, /\beventemitter\b/);
});

test("API dependencies do not include prohibited infrastructure packages", async () => {
  const packageJson = JSON.parse(await readSource(apiPackageUrl)) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const dependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  };

  for (const forbidden of [
    "redis",
    "ioredis",
    "bullmq",
    "socket.io",
    "ws",
    "@nestjs/core",
    "@nestjs/common",
  ]) {
    assert.equal(dependencies[forbidden], undefined);
  }
});

test("System module has no controller, DTO, use-case, event, worker, or extra helper production files", async () => {
  const files = await listNames(backendModuleUrl);
  const combined = files.join("\n").toLowerCase();

  assert.doesNotMatch(combined, /controller/);
  assert.doesNotMatch(combined, /\.dto\./);
  assert.doesNotMatch(combined, /use-case/);
  assert.doesNotMatch(combined, /event/);
  assert.doesNotMatch(combined, /worker/);
  assert.doesNotMatch(combined, /helper/);
  assert.doesNotMatch(combined, /mapper/);
  assert.doesNotMatch(combined, /interface/);
  assert.doesNotMatch(combined, /constant/);
});

test("System database changes remain limited to the approved system/import/audit migrations", async () => {
  const migrationFiles = (await listNames(drizzleUrl)).filter((name) =>
    name.endsWith(".sql"),
  );

  const module15Migrations = migrationFiles.filter((name) =>
    name.includes("module_15"),
  );

  assert.deepEqual(module15Migrations, [
    "0016_module_15_import_jobs.sql",
    "0017_module_15_validated_import_snapshot.sql",
    "0018_module_15_audit_logs.sql",
    "0019_module_15_failed_login_audit.sql",
  ]);
});

test("System service does not contain placeholder or unfinished implementation markers", async () => {
  const service = await readSource(serviceUrl);

  assert.doesNotMatch(service, /\bTODO\b/i);
  assert.doesNotMatch(service, /\bFIXME\b/i);
  assert.doesNotMatch(service, /throw new Error\(["']not implemented/i);
});
