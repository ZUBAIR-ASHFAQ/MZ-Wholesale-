import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(testDirectory, "..");
const projectRoot = path.resolve(apiRoot, "..");
const modulesRoot = path.join(apiRoot, "src", "modules");
const frontendFeaturesRoot = path.join(projectRoot, "web-admin", "src", "features");

const approvedBackendModules = [
  "auth",
  "business-settings",
  "customers",
  "dashboard",
  "expenses",
  "inventory",
  "ledgers",
  "operations",
  "payments",
  "products",
  "purchases",
  "reports",
  "returns",
  "sales",
  "suppliers",
  "system",
] as const;

const approvedFrontendFeatures = [
  "auth",
  "business-settings",
  "customers",
  "dashboard",
  "expenses",
  "inventory",
  "ledgers",
  "payments",
  "products",
  "purchases",
  "reports",
  "returns",
  "sales",
  "suppliers",
  "system",
] as const;

const forbiddenDependencyNames = [
  "@nestjs/common",
  "@nestjs/core",
  "bullmq",
  "ioredis",
  "redis",
  "socket.io",
  "socket.io-client",
  "ws",
] as const;

/** Reads and parses one package.json file. */
async function readPackageJson(relativePath: string): Promise<{
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}> {
  const source = await readFile(path.join(projectRoot, relativePath), "utf8");
  return JSON.parse(source) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

/** Returns only direct child directory names for an architecture folder. */
async function listDirectories(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Returns only direct child file names for one backend module. */
async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

/** Builds the exact five approved files for one backend module. */
function expectedModuleFiles(moduleName: string): string[] {
  const filePrefix = moduleName;
  return [
    `${filePrefix}.repository.ts`,
    `${filePrefix}.routes.ts`,
    `${filePrefix}.schema.ts`,
    `${filePrefix}.service.ts`,
    "index.ts",
  ].sort();
}

test("backend contains exactly the approved 15 business modules plus Production Operations", async () => {
  assert.deepEqual(
    await listDirectories(modulesRoot),
    [...approvedBackendModules].sort(),
  );
});

test("every backend module keeps the required five-file structure", async () => {
  for (const moduleName of approvedBackendModules) {
    const moduleDirectory = path.join(modulesRoot, moduleName);
    assert.deepEqual(
      await listFiles(moduleDirectory),
      expectedModuleFiles(moduleName),
      `${moduleName} must contain only routes, service, repository, schema and index files`,
    );
  }
});

test("business modules contain no controller, DTO, event, use-case, interface or constants folders", async () => {
  const forbiddenNames = new Set([
    "controller",
    "controllers",
    "dto",
    "dtos",
    "event",
    "events",
    "interface",
    "interfaces",
    "use-case",
    "use-cases",
    "usecase",
    "usecases",
    "constant",
    "constants",
  ]);

  for (const moduleName of approvedBackendModules) {
    const entries = await readdir(path.join(modulesRoot, moduleName), {
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      assert.equal(
        forbiddenNames.has(entry.name.toLowerCase()),
        false,
        `${moduleName} contains forbidden architecture folder ${entry.name}`,
      );
    }
  }
});

test("API keeps Fastify, Drizzle, PostgreSQL and Zod without forbidden infrastructure", async () => {
  const packageJson = await readPackageJson("api/package.json");
  const dependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  };

  assert.ok(dependencies.fastify, "Fastify must remain the backend framework");
  assert.ok(dependencies["drizzle-orm"], "Drizzle ORM must remain installed");
  assert.ok(dependencies.pg, "PostgreSQL pg driver must remain installed");
  assert.ok(dependencies.zod, "Zod must remain installed");

  for (const dependency of forbiddenDependencyNames) {
    assert.equal(
      dependency in dependencies,
      false,
      `${dependency} must not be introduced into the API`,
    );
  }
});

test("web-admin keeps the approved React application stack", async () => {
  const packageJson = await readPackageJson("web-admin/package.json");
  const dependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  };

  for (const dependency of [
    "react",
    "react-dom",
    "vite",
    "tailwindcss",
    "react-hook-form",
    "zod",
    "@tanstack/react-query",
    "@tanstack/react-router",
  ]) {
    assert.ok(dependencies[dependency], `${dependency} must remain installed`);
  }

  for (const dependency of forbiddenDependencyNames) {
    assert.equal(
      dependency in dependencies,
      false,
      `${dependency} must not be introduced into web-admin`,
    );
  }
});

test("frontend feature folders remain aligned with the approved ERP modules", async () => {
  assert.deepEqual(
    await listDirectories(frontendFeaturesRoot),
    [...approvedFrontendFeatures].sort(),
  );
});

test("Production Operations adds no database schema file or frontend feature unnecessarily", async () => {
  const databaseSchemaDirectory = path.join(apiRoot, "src", "database", "schema");
  const schemaFiles = await readdir(databaseSchemaDirectory);

  assert.equal(
    schemaFiles.some((fileName) => /operations/i.test(fileName)),
    false,
    "Production Operations must not create a business table/schema file",
  );
  assert.equal(
    (await listDirectories(frontendFeaturesRoot)).includes("operations"),
    false,
    "Operations frontend feature is optional and should not exist unless needed",
  );
});

test("project root remains a single repository with api and web-admin applications", async () => {
  for (const requiredPath of [
    "api",
    "web-admin",
    "docker-compose.yml",
    ".env.example",
    "README.md",
  ]) {
    const info = await stat(path.join(projectRoot, requiredPath));
    assert.ok(info.isDirectory() || info.isFile(), `${requiredPath} must exist`);
  }

  for (const forbiddenWorkspaceFile of ["pnpm-workspace.yaml", "turbo.json", "nx.json"] as const) {
    try {
      await stat(path.join(projectRoot, forbiddenWorkspaceFile));
      assert.fail(`${forbiddenWorkspaceFile} would turn the approved simple project into workspace/monorepo tooling`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
});

test("application registers Production Operations and all business modules without a second framework", async () => {
  const appSource = await readFile(path.join(apiRoot, "src", "app.ts"), "utf8");

  assert.match(appSource, /register\(operationsModule/);
  assert.doesNotMatch(appSource, /@nestjs\//);

  const requiredRegistrationOrder = [
    "businessSettingsModule",
    "productsModule",
    "customersModule",
    "suppliersModule",
    "inventoryModule",
    "ledgersModule",
    "paymentsModule",
    "purchasesModule",
    "salesModule",
    "returnsModule",
    "expensesModule",
    "reportsModule",
    "dashboardModule",
    "systemModule",
  ];

  let previousIndex = -1;
  for (const moduleName of requiredRegistrationOrder) {
    const currentIndex = appSource.indexOf(`await app.register(${moduleName})`);
    assert.ok(currentIndex > previousIndex, `${moduleName} must remain in dependency order`);
    previousIndex = currentIndex;
  }
});

test("approved production report and daily-cash additions do not create duplicate summary tables", async () => {
  const databaseSchemaDirectory = path.join(apiRoot, "src", "database", "schema");
  const schemaFiles = (await readdir(databaseSchemaDirectory)).join("\n");

  for (const forbiddenSummaryTableName of [
    "inventory_valuation",
    "customer_aging",
    "supplier_aging",
    "daily_cash_summary",
  ]) {
    assert.doesNotMatch(
      schemaFiles,
      new RegExp(forbiddenSummaryTableName, "i"),
      `${forbiddenSummaryTableName} must be calculated from existing immutable source data`,
    );
  }
});
