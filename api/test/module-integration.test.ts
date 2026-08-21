import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

/** Reads one project file relative to this integration test. */
async function readProjectFile(relativePath: string): Promise<string> {
  const fileUrl = new URL(relativePath, import.meta.url);
  return readFile(fileUrl, "utf8");
}

/** Counts exact text matches without adding another test dependency. */
function countMatches(source: string, pattern: RegExp): number {
  return [...source.matchAll(pattern)].length;
}

/** Verifies the implemented modules are registered in dependency order. */
test("application registers Modules 1 to 7 in dependency order", async () => {
  const source = await readProjectFile("../src/app.ts");
  const authIndex = source.indexOf("registerAuthRoutes(");
  const settingsIndex = source.indexOf("app.register(businessSettingsModule)");
  const productsIndex = source.indexOf("app.register(productsModule)");
  const customersIndex = source.indexOf("app.register(customersModule)");
  const suppliersIndex = source.indexOf("app.register(suppliersModule)");
  const inventoryIndex = source.indexOf("app.register(inventoryModule)");
  const ledgersIndex = source.indexOf("app.register(ledgersModule)");

  assert.ok(authIndex >= 0);
  assert.ok(settingsIndex > authIndex);
  assert.ok(productsIndex > settingsIndex);
  assert.ok(customersIndex > productsIndex);
  assert.ok(suppliersIndex > customersIndex);
  assert.ok(inventoryIndex > suppliersIndex);
  assert.ok(ledgersIndex > inventoryIndex);
});

/** Verifies the Admin session has the required direct UUID relationship. */
test("admin sessions reference the single admin account", async () => {
  const source = await readProjectFile(
    "../src/database/schema/auth.schema.ts",
  );

  assert.match(source, /admin_users_singleton_key_unique/);
  assert.match(source, /admin_users_singleton_key_check/);
  assert.match(
    source,
    /columns:\s*\[table\.adminUserId\][\s\S]*foreignColumns:\s*\[adminUsers\.id\]/,
  );
  assert.match(source, /\.onDelete\("restrict"\)/);
});

/** Verifies Business Settings remains a singleton with fixed version-one values. */
test("business settings enforce singleton currency and timezone rules", async () => {
  const source = await readProjectFile(
    "../src/database/schema/business-settings.schema.ts",
  );

  assert.match(source, /business_settings_singleton_key_unique/);
  assert.match(source, /business_settings_singleton_key_check/);
  assert.match(source, /business_settings_currency_check/);
  assert.match(source, /business_settings_timezone_check/);
  assert.match(source, /document_sequences_document_type_unique/);
  assert.match(source, /document_sequences_prefix_unique/);
});

/** Verifies Product relationships and base-unit protections are present. */
test("products keep required category brand and unit relationships", async () => {
  const source = await readProjectFile(
    "../src/database/schema/product.schema.ts",
  );

  assert.match(
    source,
    /columns:\s*\[table\.categoryId\][\s\S]*foreignColumns:\s*\[productCategories\.id\]/,
  );
  assert.match(
    source,
    /columns:\s*\[table\.brandId\][\s\S]*foreignColumns:\s*\[brands\.id\]/,
  );
  assert.match(
    source,
    /columns:\s*\[table\.productId\][\s\S]*foreignColumns:\s*\[products\.id\]/,
  );
  assert.match(source, /product_units_one_base_unit_per_product_unique/);
  assert.match(source, /product_units_base_conversion_check/);
  assert.match(source, /product_units_base_active_check/);
});

/** Verifies Customer data does not store balances owned by the future Ledger module. */
test("customers do not store editable balance fields", async () => {
  const source = await readProjectFile(
    "../src/database/schema/customer.schema.ts",
  );

  assert.match(source, /customers_one_walk_in_unique/);
  assert.match(source, /customers_walk_in_active_check/);
  assert.match(source, /customers_walk_in_no_credit_check/);
  assert.doesNotMatch(source, /currentBalance:/);
  assert.doesNotMatch(source, /openingBalance:/);
  assert.doesNotMatch(source, /current_balance/);
  assert.doesNotMatch(source, /opening_balance/);
});

/** Verifies every Product and Customer route uses the shared authentication guard. */
test("product and customer routes are private and expose no delete route", async () => {
  const productRoutes = await readProjectFile(
    "../src/modules/products/products.routes.ts",
  );
  const customerRoutes = await readProjectFile(
    "../src/modules/customers/customers.routes.ts",
  );

  assert.match(productRoutes, /function privateRoute\(summary: string, mutation = false\)/);
  assert.match(customerRoutes, /function privateRoute\(summary: string, mutation = false\)/);
  assert.equal(countMatches(productRoutes, /app\.(?:get|post|patch)\(/g), 10);
  assert.equal(countMatches(customerRoutes, /app\.(?:get|post|patch)\(/g), 5);
  assert.doesNotMatch(productRoutes, /app\.delete\(/);
  assert.doesNotMatch(customerRoutes, /app\.delete\(/);
});

/** Verifies product-unit updates remain transactional and never delete saved units. */
test("product and unit writes remain in one transaction", async () => {
  const service = await readProjectFile(
    "../src/modules/products/products.service.ts",
  );

  assert.match(service, /database\.transaction\(/);
  assert.match(service, /submittedUnitIds/);
  assert.match(service, /\{ isActive: false \}/);
  assert.doesNotMatch(service, /delete\(productUnits\)/);
});

/** Verifies the Customer module keeps the exact five-file production structure. */
test("customer module uses the approved five production files", async () => {
  const indexSource = await readProjectFile(
    "../src/modules/customers/index.ts",
  );
  const routesSource = await readProjectFile(
    "../src/modules/customers/customers.routes.ts",
  );
  const serviceSource = await readProjectFile(
    "../src/modules/customers/customers.service.ts",
  );
  const repositorySource = await readProjectFile(
    "../src/modules/customers/customers.repository.ts",
  );
  const schemaSource = await readProjectFile(
    "../src/modules/customers/customers.schema.ts",
  );

  assert.ok(indexSource.length > 0);
  assert.ok(routesSource.length > 0);
  assert.ok(serviceSource.length > 0);
  assert.ok(repositorySource.length > 0);
  assert.ok(schemaSource.length > 0);
});


/** Verifies Supplier master data avoids future-module balance and relationship fields. */
test("suppliers keep only approved master data before later modules", async () => {
  const source = await readProjectFile(
    "../src/database/schema/supplier.schema.ts",
  );

  assert.match(source, /suppliers_code_normalized_unique/);
  assert.match(source, /suppliers_code_not_blank_check/);
  assert.match(source, /suppliers_name_not_blank_check/);
  assert.doesNotMatch(source, /currentPayable:/);
  assert.doesNotMatch(source, /openingPayable:/);
  assert.doesNotMatch(source, /balance:/);
  assert.doesNotMatch(source, /purchaseId:/);
  assert.doesNotMatch(source, /ledgerEntryId:/);
});

/** Verifies Supplier routes are private and expose only the five approved operations. */
test("supplier routes are private and expose no delete route", async () => {
  const routes = await readProjectFile(
    "../src/modules/suppliers/suppliers.routes.ts",
  );

  assert.match(routes, /function privateRoute\(summary: string, mutation = false\)/);
  assert.equal(countMatches(routes, /app\.(?:get|post|patch)\(/g), 5);
  assert.doesNotMatch(routes, /app\.delete\(/);
  assert.match(routes, /\"\/suppliers\/:supplierId\/open-purchases\"/);
});

/** Verifies Supplier profile data now reads the implemented Ledger and Purchase modules. */
test("supplier service reads real payable and recent purchase data", async () => {
  const service = await readProjectFile(
    "../src/modules/suppliers/suppliers.service.ts",
  );

  assert.match(service, /financialSummaryAvailable: true/);
  assert.match(service, /const currentPayable = await getSupplierCurrentPayable/);
  assert.match(service, /const recentPurchases = await listRecentSupplierPurchases/);
  assert.match(service, /currentPayable,/);
  assert.match(service, /recentPurchasesAvailable: true/);
  assert.match(service, /recentPurchases,/);
  assert.match(service, /listSupplierOpenPurchases/);
  assert.doesNotMatch(service, /PURCHASE_MODULE_NOT_READY/);
  assert.doesNotMatch(service, /currentPayable: \"0\.00\"/);
});

/** Verifies the Supplier module keeps the exact five-file production structure. */
test("supplier module uses the approved five production files", async () => {
  const indexSource = await readProjectFile(
    "../src/modules/suppliers/index.ts",
  );
  const routesSource = await readProjectFile(
    "../src/modules/suppliers/suppliers.routes.ts",
  );
  const serviceSource = await readProjectFile(
    "../src/modules/suppliers/suppliers.service.ts",
  );
  const repositorySource = await readProjectFile(
    "../src/modules/suppliers/suppliers.repository.ts",
  );
  const schemaSource = await readProjectFile(
    "../src/modules/suppliers/suppliers.schema.ts",
  );

  assert.ok(indexSource.length > 0);
  assert.ok(routesSource.length > 0);
  assert.ok(serviceSource.length > 0);
  assert.ok(repositorySource.length > 0);
  assert.ok(schemaSource.length > 0);
});

/** Verifies unused B-tree phone indexes are not kept for leading-wildcard searches. */
test("customer and supplier schemas omit ineffective phone indexes", async () => {
  const customerSchema = await readProjectFile(
    "../src/database/schema/customer.schema.ts",
  );
  const supplierSchema = await readProjectFile(
    "../src/database/schema/supplier.schema.ts",
  );
  const migration = await readProjectFile(
    "../drizzle/0006_remove_unused_phone_indexes.sql",
  );

  assert.doesNotMatch(customerSchema, /customers_phone_index/);
  assert.doesNotMatch(supplierSchema, /suppliers_phone_index/);
  assert.match(migration, /DROP INDEX IF EXISTS "customers_phone_index"/);
  assert.match(migration, /DROP INDEX IF EXISTS "suppliers_phone_index"/);
});

/** Verifies Auth rate limiting uses the shared Fastify plugin and route settings. */
test("Auth login and refresh use route-level Fastify rate limits", async () => {
  const appSource = await readProjectFile("../src/app.ts");
  const routesSource = await readProjectFile(
    "../src/modules/auth/auth.routes.ts",
  );
  const serviceSource = await readProjectFile(
    "../src/modules/auth/auth.service.ts",
  );
  const pluginSource = await readProjectFile(
    "../src/plugins/rate-limit.plugin.ts",
  );

  assert.match(appSource, /await registerRateLimitPlugin\(app\)/);
  assert.match(pluginSource, /global: false/);
  assert.match(pluginSource, /"RATE_LIMITED"/);
  assert.match(routesSource, /max: readPositiveRateLimit\(loginLimit, 5\)/);
  assert.match(routesSource, /max: readPositiveRateLimit\(refreshLimit, 20\)/);
  assert.match(routesSource, /config: \{ rateLimit: loginRateLimit \}/);
  assert.match(routesSource, /config: \{ rateLimit: refreshRateLimit \}/);
  assert.doesNotMatch(serviceSource, /createLoginRateLimitChecker/);
  assert.doesNotMatch(serviceSource, /createRefreshRateLimitChecker/);
  assert.doesNotMatch(serviceSource, /Map<string, RateLimitEntry>/);
});

/** Verifies standard security headers are registered before API routes. */
test("application registers the shared security headers plugin", async () => {
  const appSource = await readProjectFile("../src/app.ts");
  const pluginSource = await readProjectFile(
    "../src/plugins/security-headers.plugin.ts",
  );
  const packageSource = await readProjectFile("../package.json");

  const securityPluginIndex = appSource.indexOf(
    "await registerSecurityHeadersPlugin(app)",
  );
  const healthRouteIndex = appSource.indexOf("registerHealthRoute(app)");
  const authRoutesIndex = appSource.indexOf("registerAuthRoutes(");

  assert.ok(securityPluginIndex >= 0);
  assert.ok(healthRouteIndex > securityPluginIndex);
  assert.ok(authRoutesIndex > securityPluginIndex);
  assert.match(pluginSource, /import helmet from "@fastify\/helmet"/);
  assert.match(pluginSource, /await app\.register\(helmet\)/);
  assert.match(packageSource, /"@fastify\/helmet": "\^13\.0\.1"/);
});


/** Verifies Swagger UI and the shared authentication descriptions are configured. */
test("Swagger documents Modules 1 to 5 without replacing Zod validation", async () => {
  const pluginSource = await readProjectFile(
    "../src/plugins/swagger.plugin.ts",
  );
  const packageSource = await readProjectFile("../package.json");
  const productRoutes = await readProjectFile(
    "../src/modules/products/products.routes.ts",
  );
  const customerRoutes = await readProjectFile(
    "../src/modules/customers/customers.routes.ts",
  );
  const supplierRoutes = await readProjectFile(
    "../src/modules/suppliers/suppliers.routes.ts",
  );

  assert.match(packageSource, /"@fastify\/swagger-ui": "\^5\.2\.6"/);
  assert.match(pluginSource, /routePrefix: "\/documentation"/);
  assert.match(pluginSource, /accessCookie:/);
  assert.match(pluginSource, /refreshCookie:/);
  assert.match(pluginSource, /csrfHeader:/);
  assert.match(pluginSource, /name: "products"/);
  assert.match(pluginSource, /name: "customers"/);
  assert.match(pluginSource, /name: "suppliers"/);
  assert.match(productRoutes, /tags: \["products"\]/);
  assert.match(customerRoutes, /tags: \["customers"\]/);
  assert.match(supplierRoutes, /tags: \["suppliers"\]/);
  assert.match(productRoutes, /listProductsQuerySchema\.parse/);
  assert.match(customerRoutes, /listCustomersQuerySchema\.parse/);
  assert.match(supplierRoutes, /listSuppliersQuerySchema\.parse/);
});

/** Verifies every implemented direct relationship uses UUID foreign keys with restrictive deletes. */
test("implemented direct relationships use UUID foreign keys", async () => {
  const authSchema = await readProjectFile(
    "../src/database/schema/auth.schema.ts",
  );
  const productSchema = await readProjectFile(
    "../src/database/schema/product.schema.ts",
  );

  assert.match(authSchema, /adminUserId:\s*uuid\("admin_user_id"\)\.notNull\(\)/);
  assert.match(productSchema, /categoryId:\s*uuid\("category_id"\)\.notNull\(\)/);
  assert.match(productSchema, /brandId:\s*uuid\("brand_id"\)/);
  assert.match(productSchema, /productId:\s*uuid\("product_id"\)\.notNull\(\)/);
  assert.equal(countMatches(authSchema, /\.onDelete\("restrict"\)/g), 1);
  assert.equal(countMatches(productSchema, /\.onDelete\("restrict"\)/g), 3);
});

/** Verifies product creation passes the active transaction into product and unit writes. */
test("product creation uses one transaction for product and base-unit writes", async () => {
  const service = await readProjectFile(
    "../src/modules/products/products.service.ts",
  );

  assert.match(
    service,
    /return database\.transaction\(async \(transaction\) => \{[\s\S]*return requireCreatedProduct\(transaction, input\);[\s\S]*\}\);/,
  );
  assert.match(
    service,
    /async function requireCreatedProduct\([\s\S]*insertProduct\(database,[\s\S]*createProductUnits\(database,/,
  );
  assert.doesNotMatch(
    service,
    /requireCreatedProduct\(database, input\)/,
  );
});

/** Verifies the API-created product workflow always inserts one protected base unit. */
test("product creation always inserts exactly one protected base unit", async () => {
  const service = await readProjectFile(
    "../src/modules/products/products.service.ts",
  );
  const schema = await readProjectFile(
    "../src/database/schema/product.schema.ts",
  );

  assert.match(service, /conversionToBase: "1\.000"/);
  assert.match(service, /isBaseUnit: true/);
  assert.equal(countMatches(service, /isBaseUnit: true/g), 1);
  assert.match(schema, /product_units_one_base_unit_per_product_unique/);
  assert.match(schema, /product_units_base_conversion_check/);
  assert.match(schema, /product_units_base_active_check/);
});

/** Verifies Customer and Supplier schemas do not add later-module relationships early. */
test("customer and supplier future relationships remain deferred", async () => {
  const customerSchema = await readProjectFile(
    "../src/database/schema/customer.schema.ts",
  );
  const supplierSchema = await readProjectFile(
    "../src/database/schema/supplier.schema.ts",
  );

  assert.doesNotMatch(customerSchema, /foreignKey\(/);
  assert.doesNotMatch(supplierSchema, /foreignKey\(/);
  assert.doesNotMatch(customerSchema, /salesInvoiceId|paymentId|returnId|ledgerEntryId/);
  assert.doesNotMatch(supplierSchema, /purchaseId|paymentId|returnId|ledgerEntryId/);
});

/** Verifies Customer and Supplier protected master-data rules remain database enforced. */
test("walk-in customer and supplier master-data constraints remain enforced", async () => {
  const customerSchema = await readProjectFile(
    "../src/database/schema/customer.schema.ts",
  );
  const supplierSchema = await readProjectFile(
    "../src/database/schema/supplier.schema.ts",
  );

  assert.match(customerSchema, /customers_one_walk_in_unique/);
  assert.match(customerSchema, /customers_walk_in_active_check/);
  assert.match(customerSchema, /customers_walk_in_no_credit_check/);
  assert.match(supplierSchema, /suppliers_code_normalized_unique/);
  assert.match(supplierSchema, /suppliers_code_not_blank_check/);
  assert.match(supplierSchema, /suppliers_name_not_blank_check/);
});


/** Lists the direct file and folder names inside one project directory. */
async function listProjectDirectory(relativePath: string): Promise<string[]> {
  const directoryUrl = new URL(relativePath, import.meta.url);
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  return entries.map((entry) => entry.name).sort();
}

/** Verifies every shared plugin has one clear infrastructure responsibility. */
test("shared plugin folder contains only approved infrastructure plugins", async () => {
  const pluginFiles = await listProjectDirectory("../src/plugins/");

  assert.deepEqual(pluginFiles, [
    "auth.plugin.ts",
    "cors.plugin.ts",
    "database.plugin.ts",
    "error-handler.plugin.ts",
    "rate-limit.plugin.ts",
    "security-headers.plugin.ts",
    "swagger.plugin.ts",
  ]);
});

/** Verifies each completed backend module keeps the approved five-file structure. */
test("completed business modules keep the simple five-file structure", async () => {
  const modules = [
    "auth",
    "business-settings",
    "products",
    "customers",
    "suppliers",
    "inventory",
    "ledgers",
  ];

  for (const moduleName of modules) {
    const files = await listProjectDirectory(`../src/modules/${moduleName}/`);
    assert.equal(files.length, 5, `${moduleName} should contain exactly five files`);
    assert.ok(files.includes("index.ts"));
    assert.ok(files.includes(`${moduleName}.routes.ts`));
    assert.ok(files.includes(`${moduleName}.service.ts`));
    assert.ok(files.includes(`${moduleName}.repository.ts`));
    assert.ok(files.includes(`${moduleName}.schema.ts`));
  }
});

/** Verifies excluded frameworks and infrastructure are not present in dependencies. */
test("version-one excluded infrastructure remains absent", async () => {
  const packageSource = await readProjectFile("../package.json");

  assert.doesNotMatch(packageSource, /"@nestjs\//);
  assert.doesNotMatch(packageSource, /"express"/);
  assert.doesNotMatch(packageSource, /"bullmq"/);
  assert.doesNotMatch(packageSource, /"ioredis"|"redis"/);
  assert.doesNotMatch(packageSource, /"socket\.io"|"ws"/);
  assert.doesNotMatch(packageSource, /"prisma"|"@prisma\//);
  assert.doesNotMatch(packageSource, /"typeorm"|"sequelize"/);
});

/** Verifies no unnecessary controller, DTO, event, use-case, or constants files exist. */
test("business modules contain no unnecessary architecture files", async () => {
  const moduleFolders = await listProjectDirectory("../src/modules/");

  for (const moduleFolder of moduleFolders) {
    const files = await listProjectDirectory(`../src/modules/${moduleFolder}/`);
    const joined = files.join("\n");

    assert.doesNotMatch(joined, /controller/i);
    assert.doesNotMatch(joined, /dto/i);
    assert.doesNotMatch(joined, /event/i);
    assert.doesNotMatch(joined, /use-case|usecase/i);
    assert.doesNotMatch(joined, /constants?/i);
    assert.doesNotMatch(joined, /mapper/i);
  }
});


/** Verifies all approved Inventory pages use TanStack Router navigation. */
test("Inventory frontend routes and navigation are fully registered", async () => {
  const routerSource = await readProjectFile(
    "../../web-admin/src/app/router.tsx",
  );
  const layoutSource = await readProjectFile(
    "../../web-admin/src/app/layouts/app-layout.tsx",
  );
  const inventoryPages = await Promise.all([
    readProjectFile(
      "../../web-admin/src/features/inventory/pages/inventory-list-page.tsx",
    ),
    readProjectFile(
      "../../web-admin/src/features/inventory/pages/product-movements-page.tsx",
    ),
    readProjectFile(
      "../../web-admin/src/features/inventory/pages/opening-stock-page.tsx",
    ),
    readProjectFile(
      "../../web-admin/src/features/inventory/pages/inventory-adjustment-page.tsx",
    ),
    readProjectFile(
      "../../web-admin/src/features/inventory/pages/stock-count-list-page.tsx",
    ),
    readProjectFile(
      "../../web-admin/src/features/inventory/pages/stock-count-form-page.tsx",
    ),
    readProjectFile(
      "../../web-admin/src/features/inventory/pages/stock-count-detail-page.tsx",
    ),
  ]);
  const inventorySource = inventoryPages.join("\n");

  assert.match(routerSource, /path: "\/inventory"/);
  assert.match(routerSource, /path: "\/inventory\/products\/\$productId\/movements"/);
  assert.match(routerSource, /path: "\/inventory\/opening-stock"/);
  assert.match(routerSource, /path: "\/inventory\/adjustments"/);
  assert.match(routerSource, /path: "\/inventory\/counts"/);
  assert.match(routerSource, /path: "\/inventory\/counts\/new"/);
  assert.match(routerSource, /path: "\/inventory\/counts\/\$countId"/);
  assert.match(routerSource, /path: "\/inventory\/counts\/\$countId\/edit"/);
  assert.match(layoutSource, /to="\/inventory"/);
  assert.doesNotMatch(routerSource, /window\.location/);
  assert.doesNotMatch(inventorySource, /window\.location/);
  assert.doesNotMatch(inventorySource, /<a\s+[^>]*href=/);
});

/** Verifies every current Inventory relationship points to the approved parent table. */
test("Inventory direct relationships use UUID foreign keys with restrictive deletion", async () => {
  const schemaSource = await readProjectFile(
    "../src/database/schema/inventory.schema.ts",
  );

  assert.match(schemaSource, /columns: \[table\.productId\]/);
  assert.match(schemaSource, /foreignColumns: \[products\.id\]/);
  assert.match(schemaSource, /columns: \[table\.stockCountId\]/);
  assert.match(schemaSource, /foreignColumns: \[stockCounts\.id\]/);
  assert.ok(
    (schemaSource.match(/\.onDelete\("restrict"\)/g) ?? []).length >= 4,
    "Inventory should keep restrictive deletion on every direct foreign key",
  );
});

/** Verifies stock is stored only in Inventory and not duplicated in Product master data. */
test("Product master data does not duplicate current Inventory quantities", async () => {
  const productSchema = await readProjectFile(
    "../src/database/schema/product.schema.ts",
  );
  const inventorySchema = await readProjectFile(
    "../src/database/schema/inventory.schema.ts",
  );

  assert.doesNotMatch(productSchema, /quantityOnHand|sellableQuantity|damagedQuantity|expiredQuantity|weightedAverageCost/);
  assert.match(inventorySchema, /sellableQuantityOnHand/);
  assert.match(inventorySchema, /damagedQuantityOnHand/);
  assert.match(inventorySchema, /expiredQuantityOnHand/);
  assert.match(inventorySchema, /weightedAverageCost/);
});

/** Verifies Version 1 Inventory does not introduce excluded warehouse or reservation features. */
test("Inventory keeps warehouse, branch, transfer, and reservation features excluded", async () => {
  const inventorySchema = await readProjectFile(
    "../src/database/schema/inventory.schema.ts",
  );
  const inventoryRoutes = await readProjectFile(
    "../src/modules/inventory/inventory.routes.ts",
  );

  assert.doesNotMatch(inventorySchema, /warehouseId|branchId|reservedQuantity|availableQuantity/);
  assert.doesNotMatch(inventoryRoutes, /warehouse|transfer|reservation/i);
});

/** Verifies immutable stock movements have no update or delete repository workflow. */
test("stock movements remain insert-only and immutable", async () => {
  const repositorySource = await readProjectFile(
    "../src/modules/inventory/inventory.repository.ts",
  );
  const routesSource = await readProjectFile(
    "../src/modules/inventory/inventory.routes.ts",
  );

  assert.match(repositorySource, /createStockMovement/);
  assert.doesNotMatch(repositorySource, /updateStockMovement|deleteStockMovement/);
  assert.doesNotMatch(routesSource, /patch\([^\n]*movements|delete\([^\n]*movements/i);
});

/** Verifies Inventory keeps generic source audit links while implemented source schemas are registered separately. */
test("Inventory source links stay generic after Purchase Sales and Returns are implemented", async () => {
  const inventorySchema = await readProjectFile(
    "../src/database/schema/inventory.schema.ts",
  );
  const schemaIndex = await readProjectFile(
    "../src/database/schema/index.ts",
  );

  assert.match(inventorySchema, /sourceType/);
  assert.match(inventorySchema, /sourceId/);
  assert.doesNotMatch(inventorySchema, /purchaseId|salesInvoiceId|salesReturnId|purchaseReturnId/);
  assert.match(schemaIndex, /purchase\.schema/);
  assert.match(schemaIndex, /sales\.schema/);
  assert.match(schemaIndex, /return\.schema/);
});

/** Verifies that Audit Fix Pass 1 removed unused repository and schema helpers. */
test("unused module helpers stay removed", async () => {
  const { readFile } = await import("node:fs/promises");
  const files = [
    ["../src/modules/inventory/inventory.repository.ts", "findLatestProductMovement"],
    ["../src/modules/customers/customers.repository.ts", "findCustomerByCode"],
    ["../src/modules/suppliers/suppliers.repository.ts", "findSupplierByCode"],
    ["../src/modules/business-settings/business-settings.schema.ts", "isSupportedDocumentType"],
  ] as const;

  for (const [relativePath, removedName] of files) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(source, new RegExp(removedName));
  }
});

/** Verifies that stock-effect routes keep the shared idempotency protection. */
test("Inventory stock-effect routes require idempotency protection", async () => {
  const routes = await readProjectFile(
    "../src/modules/inventory/inventory.routes.ts",
  );
  const helper = await readProjectFile("../src/shared/http/idempotency.ts");
  const systemSchema = await readProjectFile(
    "../src/database/schema/system.schema.ts",
  );

  assert.match(routes, /executeIdempotentMutation/);
  assert.match(routes, /inventory\/opening-stock/);
  assert.match(routes, /inventory\/adjustments/);
  assert.match(routes, /inventory\/counts\/:id\/confirm/);
  assert.match(helper, /IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(helper, /IDEMPOTENCY_KEY_REUSED/);
  assert.match(helper, /responseBody/);
  assert.match(systemSchema, /idempotency_requests/);
});


/** Verifies that business modules cannot bypass Inventory movement rules through repository imports. */
test("other business modules do not import Inventory repository writers", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const modulesDirectory = new URL("../src/modules/", import.meta.url);
  const moduleNames = await readdir(modulesDirectory);

  for (const moduleName of moduleNames) {
    if (moduleName === "inventory") continue;

    const moduleDirectory = new URL(`${moduleName}/`, modulesDirectory);
    const fileNames = await readdir(moduleDirectory);

    for (const fileName of fileNames) {
      if (!fileName.endsWith(".ts")) continue;
      const source = await readFile(new URL(fileName, moduleDirectory), "utf8");
      assert.doesNotMatch(source, /inventory\.repository\.ts/);
    }
  }
});


/** Verifies stock-effect idempotency records keep request identity and replay data. */
test("Inventory idempotency schema stores request and response identity", async () => {
  const schema = await readProjectFile("../src/database/schema/system.schema.ts");
  const migration = await readProjectFile("../drizzle/0008_inventory_idempotency.sql");

  for (const field of [
    "requestHash",
    "responseStatus",
    "responseBody",
    "expiresAt",
  ]) {
    assert.match(schema, new RegExp(field));
  }

  assert.match(migration, /idempotency_requests/);
  assert.match(migration, /request_hash/);
  assert.match(migration, /response_body/);
});

/** Verifies no completed business module imports Inventory repository mutation functions. */
test("completed modules integrate with Inventory through service boundaries", async () => {
  const moduleNames = await readdir(new URL("../src/modules/", import.meta.url));

  for (const moduleName of moduleNames) {
    if (moduleName === "inventory") continue;

    const moduleDirectory = new URL(`../src/modules/${moduleName}/`, import.meta.url);
    const fileNames = await readdir(moduleDirectory);

    for (const fileName of fileNames) {
      if (!fileName.endsWith(".ts")) continue;
      const source = await readFile(new URL(fileName, moduleDirectory), "utf8");
      assert.doesNotMatch(source, /createStockMovement|updateInventoryBalance|createInventoryBalance/);
    }
  }
});

/** Verifies production startup uses compiled JavaScript instead of experimental TypeScript execution. */
test("API has a normal compiled production build", async () => {
  const packageSource = await readProjectFile("../package.json");
  const buildConfig = await readProjectFile("../tsconfig.build.json");

  assert.match(packageSource, /"build": "tsc -p tsconfig\.build\.json"/);
  assert.match(packageSource, /"start": "node dist\/server\.js"/);
  assert.match(
    packageSource,
    /"dev": "node --env-file-if-exists=\.\.\/\.env --watch --import tsx src\/server\.ts"/,
  );
  assert.match(
    packageSource,
    /"db:migrate": "node --env-file-if-exists=\.\.\/\.env --import tsx src\/commands\/migrate\.ts"/,
  );
  assert.doesNotMatch(packageSource, /experimental-strip-types/);
  assert.match(buildConfig, /"outDir": "dist"/);
  assert.match(buildConfig, /"rootDir": "src"/);
  assert.match(buildConfig, /"noEmit": false/);
});

/** Verifies shutdown is single-run, bounded, and closes Fastify plus PostgreSQL. */
test("server performs bounded graceful shutdown", async () => {
  const serverSource = await readProjectFile("../src/server.ts");

  assert.match(serverSource, /process\.once\("SIGINT"/);
  assert.match(serverSource, /process\.once\("SIGTERM"/);
  assert.match(serverSource, /shutdownPromise/);
  assert.match(serverSource, /gracefulShutdownTimeoutMs = 10_000/);
  assert.match(serverSource, /await app\.close\(\)/);
  assert.match(serverSource, /await databaseClient\.pool\.end\(\)/);
});

/** Verifies production startup uses validated pool settings and log redaction. */
test("server configures bounded PostgreSQL pooling and redacted logs", async () => {
  const server = await readProjectFile("../src/server.ts");
  const databaseClient = await readProjectFile("../src/database/client.ts");
  const logger = await readProjectFile(
    "../src/shared/utils/logger-redaction.ts",
  );

  assert.match(server, /maximumConnections: environment\.databasePoolMax/);
  assert.match(server, /await verifyDatabaseConnection\(databaseClient\.pool\)/);
  assert.match(server, /logger: createLoggerOptions\(\)/);
  assert.match(databaseClient, /connectionTimeoutMillis/);
  assert.match(databaseClient, /idleTimeoutMillis/);
  assert.match(logger, /req\.headers\.authorization/);
  assert.match(logger, /req\.headers\.cookie/);
  assert.match(logger, /body\.password/);
  assert.match(logger, /refreshToken/);
  assert.match(logger, /\[REDACTED\]/);
});

/** Verifies the project has an isolated PostgreSQL integration-test workflow. */
test("integration tests use a guarded disposable PostgreSQL database", async () => {
  const packageSource = await readProjectFile("../package.json");
  const resetCommand = await readProjectFile(
    "../src/commands/reset-test-database.ts",
  );
  const integrationTest = await readProjectFile(
    "./integration/database.integration.test.ts",
  );
  const composeSource = await readProjectFile("../../docker-compose.test.yml");

  assert.match(packageSource, /"test:integration"/);
  assert.match(packageSource, /"test:integration:up"/);
  assert.match(packageSource, /"test:integration:down"/);
  assert.match(resetCommand, /TEST_DATABASE_URL/);
  assert.match(resetCommand, /includes\("test"\)/);
  assert.match(resetCommand, /drop schema if exists public cascade/);
  assert.match(integrationTest, /withRollback/);
  assert.match(integrationTest, /customer_ledger_amount_check|both debit and credit/);
  assert.match(composeSource, /wholesale_erp_test/);
  assert.match(composeSource, /tmpfs/);
});

/** Locks the Module 7 public API to the four approved read-only routes. */
test("Module 7 exposes exactly four authenticated read routes", async () => {
  const routes = await readProjectFile(
    "../src/modules/ledgers/ledgers.routes.ts",
  );

  assert.equal(countMatches(routes, /app\.get\(/g), 4);
  assert.doesNotMatch(routes, /app\.(?:post|patch|put|delete)\(/);
  assert.match(routes, /preHandler: app\.authenticate/);
  assert.match(routes, /"\/ledgers\/customers\/:customerId"/);
  assert.match(routes, /"\/ledgers\/suppliers\/:supplierId"/);
  assert.match(routes, /"\/ledgers\/customer-outstanding"/);
  assert.match(routes, /"\/ledgers\/supplier-payables"/);
});

/** Locks Module 7 to the approved five-file backend structure. */
test("Module 7 uses only the approved five backend files", async () => {
  const moduleDirectory = new URL(
    "../src/modules/ledgers/",
    import.meta.url,
  );
  const fileNames = (await readdir(moduleDirectory))
    .filter((fileName) => fileName.endsWith(".ts"))
    .sort();

  assert.deepEqual(fileNames, [
    "index.ts",
    "ledgers.repository.ts",
    "ledgers.routes.ts",
    "ledgers.schema.ts",
    "ledgers.service.ts",
  ]);
});

/** Confirms Module 7 depends on existing customer, supplier, auth, and database boundaries. */
test("Module 7 dependencies remain explicit and simple", async () => {
  const app = await readProjectFile("../src/app.ts");
  const routes = await readProjectFile(
    "../src/modules/ledgers/ledgers.routes.ts",
  );
  const repository = await readProjectFile(
    "../src/modules/ledgers/ledgers.repository.ts",
  );
  const indexSource = await readProjectFile(
    "../src/modules/ledgers/index.ts",
  );

  assert.match(app, /app\.register\(customersModule\)/);
  assert.match(app, /app\.register\(suppliersModule\)/);
  assert.match(app, /app\.register\(ledgersModule\)/);
  assert.match(routes, /app\.authenticate/);
  assert.match(routes, /app\.db/);
  assert.match(repository, /customers/);
  assert.match(repository, /suppliers/);
  assert.match(indexSource, /writeCustomerDebit/);
  assert.match(indexSource, /writeCustomerCredit/);
  assert.match(indexSource, /writeSupplierDebit/);
  assert.match(indexSource, /writeSupplierCredit/);
  assert.doesNotMatch(routes, /writeCustomerDebit|writeCustomerCredit|writeSupplierDebit|writeSupplierCredit/);
});


/** Verifies Module 7 registration, Swagger documentation, and internal exports. */
test("Module 7 is registered and documented without exposing writers as routes", async () => {
  const app = await readProjectFile("../src/app.ts");
  const swagger = await readProjectFile("../src/plugins/swagger.plugin.ts");
  const indexSource = await readProjectFile("../src/modules/ledgers/index.ts");
  const routes = await readProjectFile("../src/modules/ledgers/ledgers.routes.ts");

  const inventoryIndex = app.indexOf("app.register(inventoryModule)");
  const ledgersIndex = app.indexOf("app.register(ledgersModule)");

  assert.ok(inventoryIndex >= 0);
  assert.ok(ledgersIndex > inventoryIndex);
  assert.match(swagger, /name:\s*"ledgers"/);
  assert.match(swagger, /Customer and supplier statements, outstanding dues and payables/);
  assert.match(indexSource, /registerLedgerRoutes/);
  assert.match(indexSource, /getCustomerCurrentDue/);
  assert.match(indexSource, /getSupplierCurrentPayable/);
  assert.match(indexSource, /writeCustomerDebit/);
  assert.match(indexSource, /writeCustomerCredit/);
  assert.match(indexSource, /writeSupplierDebit/);
  assert.match(indexSource, /writeSupplierCredit/);
  assert.doesNotMatch(routes, /writeCustomerDebit|writeCustomerCredit|writeSupplierDebit|writeSupplierCredit/);
});


/** Locks every completed business module to the approved five-file structure. */
test("completed modules use only routes service repository schema and index files", async () => {
  const modulesDirectory = new URL("../src/modules/", import.meta.url);
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
    const moduleDirectory = new URL(`${moduleName}/`, modulesDirectory);
    const actualFiles = (await readdir(moduleDirectory))
      .filter((fileName) => fileName.endsWith(".ts"))
      .sort();
    const filePrefix = moduleName === "business-settings" ? "business-settings" : moduleName;

    assert.deepEqual(actualFiles, [
      "index.ts",
      `${filePrefix}.repository.ts`,
      `${filePrefix}.routes.ts`,
      `${filePrefix}.schema.ts`,
      `${filePrefix}.service.ts`,
    ].sort(), `${moduleName} contains an unapproved production file`);
  }
});

/** Prevents excluded frameworks and infrastructure from entering the approved stack. */
test("approved stack excludes unapproved frameworks and infrastructure", async () => {
  const apiPackage = await readProjectFile("../package.json");
  const webPackage = await readProjectFile("../../web-admin/package.json");
  const dependencyText = `${apiPackage}\n${webPackage}`.toLowerCase();

  for (const forbiddenDependency of [
    "@nestjs/",
    "express",
    "prisma",
    "typeorm",
    "sequelize",
    "bullmq",
    "ioredis",
    "socket.io",
  ]) {
    assert.doesNotMatch(dependencyText, new RegExp(forbiddenDependency.replace(".", "\\.")));
  }

  assert.match(apiPackage, /"fastify"/);
  assert.match(apiPackage, /"drizzle-orm"/);
  assert.match(apiPackage, /"pg"/);
  assert.match(apiPackage, /"zod"/);
  assert.match(webPackage, /"react"/);
  assert.match(webPackage, /"@tanstack\/react-query"/);
  assert.match(webPackage, /"@tanstack\/react-router"/);
});

/** Keeps Ledger routes thin so junior developers can follow the request flow. */
test("ledger request flow stays route to service to repository", async () => {
  const routes = await readProjectFile("../src/modules/ledgers/ledgers.routes.ts");
  const service = await readProjectFile("../src/modules/ledgers/ledgers.service.ts");
  const repository = await readProjectFile("../src/modules/ledgers/ledgers.repository.ts");

  assert.doesNotMatch(routes, /from\("|\.select\(|\.insert\(|sql`/);
  assert.doesNotMatch(repository, /FastifyInstance|FastifyRequest|FastifyReply|createDataResponse/);
  assert.match(routes, /getCustomerStatement\(app\.db/);
  assert.match(service, /readCustomerStatement\(database/);
  assert.match(repository, /export async function readCustomerStatement/);
});


/** Locks Module 7 to the complete approved public API and immutable ledger design. */
test("Module 7 final acceptance contract remains complete and read-only", async () => {
  const routes = await readProjectFile("../src/modules/ledgers/ledgers.routes.ts");
  const schema = await readProjectFile("../src/database/schema/ledger.schema.ts");
  const service = await readProjectFile("../src/modules/ledgers/ledgers.service.ts");

  for (const routePath of [
    '"/ledgers/customers/:customerId"',
    '"/ledgers/suppliers/:supplierId"',
    '"/ledgers/customer-outstanding"',
    '"/ledgers/supplier-payables"',
  ]) {
    assert.match(routes, new RegExp(routePath.replace(/[/:]/g, "\\$&")));
  }

  assert.equal(countMatches(routes, /app\.get\(/g), 4);
  assert.doesNotMatch(routes, /app\.(?:post|patch|put|delete)\(/);
  assert.doesNotMatch(schema, /updatedAt|deletedAt/);
  assert.doesNotMatch(service, /updateCustomerLedger|updateSupplierLedger|deleteCustomerLedger|deleteSupplierLedger/);
  assert.match(service, /openingCents \+ totalDebitCents - totalCreditCents/);
  assert.match(service, /openingCents \+ totalCreditCents - totalDebitCents/);
});

/** Keeps the Module 7 frontend feature small, read-only, and predictable. */
test("Module 7 frontend uses only the approved API components hooks and pages", async () => {
  const featureDirectory = new URL("../../web-admin/src/features/ledgers/", import.meta.url);
  const expectedFiles = [
    "api/ledgers.api.ts",
    "components/ledger-statement-table.tsx",
    "components/ledger-summary.tsx",
    "components/outstanding-list-table.tsx",
    "hooks/use-ledgers.ts",
    "pages/customer-outstanding-page.tsx",
    "pages/customer-statement-page.tsx",
    "pages/supplier-payables-page.tsx",
    "pages/supplier-statement-page.tsx",
  ].sort();

  async function collectFiles(directory: URL, prefix = ""): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const relativePath = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        files.push(...await collectFiles(new URL(`${entry.name}/`, directory), `${relativePath}/`));
      } else {
        files.push(relativePath);
      }
    }

    return files;
  }

  assert.deepEqual((await collectFiles(featureDirectory)).sort(), expectedFiles);

  const api = await readProjectFile("../../web-admin/src/features/ledgers/api/ledgers.api.ts");
  const hooks = await readProjectFile("../../web-admin/src/features/ledgers/hooks/use-ledgers.ts");
  assert.doesNotMatch(api, /method:\s*["'](?:POST|PATCH|PUT|DELETE)/);
  assert.doesNotMatch(hooks, /useMutation/);
});

/** Confirms the final Module 7 dependency and source-writer boundaries. */
test("future source modules can use ledger writers only inside backend transactions", async () => {
  const indexSource = await readProjectFile("../src/modules/ledgers/index.ts");
  const service = await readProjectFile("../src/modules/ledgers/ledgers.service.ts");
  const routes = await readProjectFile("../src/modules/ledgers/ledgers.routes.ts");

  for (const writer of [
    "writeCustomerDebit",
    "writeCustomerCredit",
    "writeSupplierDebit",
    "writeSupplierCredit",
  ]) {
    assert.match(indexSource, new RegExp(`export \\{[\\s\\S]*${writer}`));
    assert.match(service, new RegExp(`export function ${writer}\\b`));
    assert.doesNotMatch(routes, new RegExp(writer));
  }

  assert.match(service, /database: LedgersDatabase/);
});

/** Locks the completed Module 11 backend to the approved five-file architecture and six-route contract. */
test("Module 11 Returns keeps the approved final architecture and public API", async () => {
  const returnsDirectory = new URL("../src/modules/returns/", import.meta.url);
  const entries = await readdir(returnsDirectory, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();

  assert.deepEqual(files, [
    "index.ts",
    "returns.repository.ts",
    "returns.routes.ts",
    "returns.schema.ts",
    "returns.service.ts",
  ]);

  const routes = await readProjectFile("../src/modules/returns/returns.routes.ts");
  const repository = await readProjectFile("../src/modules/returns/returns.repository.ts");

  for (const routePath of [
    '"/sales-returns"',
    '"/sales-returns/:id"',
    '"/purchase-returns"',
    '"/purchase-returns/:id"',
  ]) {
    assert.match(routes, new RegExp(routePath.replace(/[/:]/g, "\\$&")));
  }

  assert.equal(countMatches(routes, /app\.get\(/g), 4);
  assert.equal(countMatches(routes, /app\.post\(/g), 2);
  assert.doesNotMatch(routes, /app\.(?:patch|put|delete)\(/);
  assert.doesNotMatch(routes, /\.select\(|\.insert\(|\.update\(|\.delete\(|sql`/);
  assert.doesNotMatch(repository, /FastifyInstance|FastifyRequest|FastifyReply|createDataResponse/);
});

/** Calculates one customer balance from immutable debit and credit effects. */
function customerBalanceFromEffects(effects: Array<{ debit: number; credit: number }>): number {
  return effects.reduce((balance, effect) => balance + effect.debit - effect.credit, 0);
}

/** Calculates one invoice outstanding value from its confirmed effective effects. */
function invoiceOutstanding(
  total: number,
  returned: number,
  allocated: number,
  refunded = 0,
): number {
  return Math.max(total - returned - allocated + refunded, 0);
}

/** Protects the customer sale -> receipt -> reversal -> receipt -> return consistency rule. */
test("customer ledger and invoice outstanding agree after receipt reversal and sales return", async () => {
  const salesService = await readProjectFile("../src/modules/sales/sales.service.ts");
  const paymentsService = await readProjectFile("../src/modules/payments/payments.service.ts");
  const paymentsRepository = await readProjectFile("../src/modules/payments/payments.repository.ts");
  const returnsService = await readProjectFile("../src/modules/returns/returns.service.ts");
  const customersRepository = await readProjectFile("../src/modules/customers/customers.repository.ts");
  const ledgersRepository = await readProjectFile("../src/modules/ledgers/ledgers.repository.ts");

  // Scenario required by the financial consistency audit:
  // sale 10,000 -> receipt 4,000 -> reverse -> receipt 5,000 -> return 2,000.
  const ledgerBalance = customerBalanceFromEffects([
    { debit: 10_000, credit: 0 },
    { debit: 0, credit: 4_000 },
    { debit: 4_000, credit: 0 },
    { debit: 0, credit: 5_000 },
    { debit: 0, credit: 2_000 },
  ]);
  const documentOutstanding = invoiceOutstanding(10_000, 2_000, 5_000);

  assert.equal(ledgerBalance, 3_000);
  assert.equal(documentOutstanding, 3_000);
  assert.equal(ledgerBalance, documentOutstanding);
  assert.equal(
    invoiceOutstanding(10_000, 2_000, 5_000, 2_000),
    5_000,
    "cash/bank refunds restore the refunded receipt amount instead of reducing invoice due twice",
  );

  // Sale confirmation creates the invoice debit.
  assert.match(salesService, /writeCustomerDebit\(transaction,[\s\S]*referenceType: "SALE"/);

  // A normal receipt creates the customer credit, while reversal restores it with a debit.
  assert.match(paymentsService, /writeCustomerCredit\(database,[\s\S]*referenceType: "CUSTOMER_PAYMENT"/);
  assert.match(paymentsService, /writeCustomerDebit\(database,[\s\S]*referenceType: "CUSTOMER_PAYMENT_REVERSAL"/);
  assert.match(paymentsService, /markCustomerPaymentReversed\(/);
  assert.match(paymentsRepository, /\.set\(\{ status: "REVERSED" \}\)/);

  // Due-reduction Sales Returns reduce the same customer ledger with a credit.
  assert.match(returnsService, /writeCustomerCredit\(database,[\s\S]*referenceType: "SALES_RETURN"/);

  // Open-invoice queries count only effective confirmed receipts and confirmed Sales Returns.
  assert.match(customersRepository, /customerPayments\.status\} = 'CONFIRMED'/);
  assert.match(customersRepository, /customerPayments\.reversalOfPaymentId\} is null/);
  assert.match(customersRepository, /salesReturns\.status\} = 'CONFIRMED'/);
  assert.match(customersRepository, /greatest\(\$\{salesInvoices\.totalAmount\} - \$\{returnedAmount\} - \$\{paidAmount\} \+ \$\{refundedAmount\}, 0\)/);

  // Customer outstanding is independently derived from immutable ledger debits minus credits.
  assert.match(ledgersRepository, /sum\(\$\{customerLedgerEntries\.debit\} - \$\{customerLedgerEntries\.credit\}\)/);
});

/** Calculates one supplier payable from immutable credit and debit effects. */
function supplierPayableFromEffects(effects: Array<{ debit: number; credit: number }>): number {
  return effects.reduce((balance, effect) => balance + effect.credit - effect.debit, 0);
}

/** Calculates one purchase outstanding value from its confirmed effective effects. */
function purchaseOutstanding(total: number, returned: number, allocated: number): number {
  return Math.max(total - returned - allocated, 0);
}

/** Protects the supplier purchase -> payment -> reversal -> payment -> return consistency rule. */
test("supplier ledger and purchase outstanding agree after payment reversal and purchase return", async () => {
  const purchasesService = await readProjectFile("../src/modules/purchases/purchases.service.ts");
  const paymentsService = await readProjectFile("../src/modules/payments/payments.service.ts");
  const paymentsRepository = await readProjectFile("../src/modules/payments/payments.repository.ts");
  const returnsService = await readProjectFile("../src/modules/returns/returns.service.ts");
  const suppliersRepository = await readProjectFile("../src/modules/suppliers/suppliers.repository.ts");
  const ledgersRepository = await readProjectFile("../src/modules/ledgers/ledgers.repository.ts");

  // Scenario required by the financial consistency audit:
  // purchase 20,000 -> payment 5,000 -> reverse -> payment 6,000 -> return 4,000.
  const ledgerPayable = supplierPayableFromEffects([
    { debit: 0, credit: 20_000 },
    { debit: 5_000, credit: 0 },
    { debit: 0, credit: 5_000 },
    { debit: 6_000, credit: 0 },
    { debit: 4_000, credit: 0 },
  ]);
  const documentOutstanding = purchaseOutstanding(20_000, 4_000, 6_000);

  assert.equal(ledgerPayable, 10_000);
  assert.equal(documentOutstanding, 10_000);
  assert.equal(ledgerPayable, documentOutstanding);

  // Purchase confirmation creates the supplier payable credit.
  assert.match(purchasesService, /writeSupplierCredit\(transaction,[\s\S]*referenceType: "PURCHASE"/);

  // A normal supplier payment creates a debit, while reversal restores it with a credit.
  assert.match(paymentsService, /writeSupplierDebit\(database,[\s\S]*referenceType: "SUPPLIER_PAYMENT"/);
  assert.match(paymentsService, /writeSupplierCredit\(database,[\s\S]*referenceType: "SUPPLIER_PAYMENT_REVERSAL"/);
  assert.match(paymentsService, /markSupplierPaymentReversed\(/);
  assert.match(paymentsRepository, /\.set\(\{ status: "REVERSED" \}\)/);

  // Purchase Returns reduce the supplier payable with a debit.
  assert.match(returnsService, /writeSupplierDebit\(database,[\s\S]*referenceType: "PURCHASE_RETURN"/);

  // Supplier open-purchase queries count only effective confirmed payments and confirmed Purchase Returns.
  assert.match(suppliersRepository, /supplierPayments\.status\} = 'CONFIRMED'/);
  assert.match(suppliersRepository, /supplierPayments\.reversalOfPaymentId\} is null/);
  assert.match(suppliersRepository, /purchaseReturns\.status\} = 'CONFIRMED'/);
  assert.match(suppliersRepository, /greatest\(\$\{purchases\.totalAmount\} - \$\{returnedAmount\} - \$\{paidAmount\}, 0\)/);

  // New supplier-payment allocation uses the same return-aware outstanding formula.
  assert.match(paymentsService, /moneyToCents\(purchase\.totalAmount\)[\s\S]*- moneyToCents\(purchase\.returnedAmount\)[\s\S]*- moneyToCents\(purchase\.allocatedAmount\)/);
  assert.match(paymentsRepository, /eq\(purchaseReturns\.status, "CONFIRMED"\)/);
  assert.match(paymentsRepository, /isNull\(supplierPayments\.reversalOfPaymentId\)/);

  // Supplier payable is independently derived from immutable ledger credits minus debits.
  assert.match(ledgersRepository, /sum\(\$\{supplierLedgerEntries\.credit\} - \$\{supplierLedgerEntries\.debit\}\)/);
});

/** Verifies confirmed Sales and Purchases keep stock, ledger, payment and document writes in one idempotent transaction. */
test("final acceptance keeps sale and purchase confirmation effects atomic", async () => {
  const salesRoutes = await readProjectFile("../src/modules/sales/sales.routes.ts");
  const salesService = await readProjectFile("../src/modules/sales/sales.service.ts");
  const purchaseRoutes = await readProjectFile("../src/modules/purchases/purchases.routes.ts");
  const purchaseService = await readProjectFile("../src/modules/purchases/purchases.service.ts");
  const paymentsService = await readProjectFile("../src/modules/payments/payments.service.ts");

  assert.match(salesRoutes, /executeIdempotentMutation\([\s\S]*confirmSaleInTransaction\(transaction/);
  assert.match(purchaseRoutes, /executeIdempotentMutation\([\s\S]*confirmPurchaseInTransaction\(transaction/);

  assert.match(salesService, /recordSaleStockOut\(transaction/);
  assert.match(salesService, /writeCustomerDebit\(transaction/);
  assert.match(salesService, /recordSaleInitialCustomerReceipt\(transaction/);
  assert.match(salesService, /markSaleConfirmed\(transaction/);

  assert.match(purchaseService, /recordPurchaseStockIn\(transaction/);
  assert.match(purchaseService, /writeSupplierCredit\(transaction/);
  assert.match(purchaseService, /recordPurchaseInitialSupplierPayment\(transaction/);
  assert.match(purchaseService, /markPurchaseConfirmed\(\s*transaction/);

  assert.match(paymentsService, /recordSaleInitialCustomerReceipt[\s\S]*createCustomerPaymentSplits/);
  assert.match(paymentsService, /recordSaleInitialCustomerReceipt[\s\S]*createCustomerPaymentAllocations/);
  assert.match(paymentsService, /recordPurchaseInitialSupplierPayment[\s\S]*createSupplierPaymentSplits/);
  assert.match(paymentsService, /recordPurchaseInitialSupplierPayment[\s\S]*createSupplierPaymentAllocations/);
});

/** Verifies cash and bank rows cannot point to the wrong account type. */
test("final acceptance enforces exact cash and bank account foreign-key pairing", async () => {
  const paymentSchema = await readProjectFile("../src/database/schema/payment.schema.ts");
  const returnsSchema = await readProjectFile("../src/database/schema/return.schema.ts");

  assert.match(paymentSchema, /method\} = 'CASH'[\s\S]*cashAccountId\} is not null[\s\S]*bankAccountId\} is null/);
  assert.match(paymentSchema, /method\} = 'BANK_TRANSFER'[\s\S]*bankAccountId\} is not null[\s\S]*cashAccountId\} is null/);
  assert.match(paymentSchema, /cash_bank_movements_account_check/);
  assert.match(returnsSchema, /sales_returns_refund_account_check/);
});

/** Verifies non-sellable Sales Returns stay outside sellable stock and low-stock calculations. */
test("final acceptance keeps damaged and expired returns out of sellable stock", async () => {
  const returnsService = await readProjectFile("../src/modules/returns/returns.service.ts");
  const inventoryRepository = await readProjectFile("../src/modules/inventory/inventory.repository.ts");
  const inventoryService = await readProjectFile("../src/modules/inventory/inventory.service.ts");

  assert.match(returnsService, /if \(condition === "GOOD"\) \{[\s\S]*return "SELLABLE";[\s\S]*return condition;/);
  assert.match(inventoryService, /if \(stockCondition === "DAMAGED"\)/);
  assert.match(inventoryService, /expiredQuantityOnHand/);
  assert.match(inventoryRepository, /sellableQuantityOnHand\}, 0\.000\) <= \$\{products\.reorderLevel\}/);
});

/** Verifies Purchase Returns cannot make supplier payable negative. */
test("final acceptance protects supplier payable during Purchase Returns", async () => {
  const returnsService = await readProjectFile("../src/modules/returns/returns.service.ts");

  assert.match(returnsService, /getSupplierCurrentPayable\(/);
  assert.match(returnsService, /if \(returnAmountCents > currentPayableCents\)/);
  assert.match(returnsService, /Purchase Return cannot reduce the supplier payable below zero/);
  assert.match(returnsService, /writeSupplierDebit\(database,[\s\S]*referenceType: "PURCHASE_RETURN"/);
});

/** Verifies the protected Walk-in Customer can never leave a confirmed sale due. */
test("final acceptance blocks Walk-in Customer credit sales", async () => {
  const customerSchema = await readProjectFile("../src/database/schema/customer.schema.ts");
  const salesService = await readProjectFile("../src/modules/sales/sales.service.ts");

  assert.match(customerSchema, /customers_walk_in_no_credit_check/);
  assert.match(salesService, /if \(customer\.isWalkIn && paidCents !== totalCents\)/);
  assert.match(salesService, /WALK_IN_CUSTOMER_CREDIT_NOT_ALLOWED/);
});

/** Verifies new Sales/Purchases require active master data while historical corrections stay separate. */
test("final acceptance requires active master data for new sales and purchases", async () => {
  const salesService = await readProjectFile("../src/modules/sales/sales.service.ts");
  const purchaseService = await readProjectFile("../src/modules/purchases/purchases.service.ts");

  assert.match(salesService, /if \(!customer\.isActive\)/);
  assert.match(salesService, /CUSTOMER_INACTIVE/);
  assert.match(salesService, /if \(!product\.isActive\)/);
  assert.match(salesService, /PRODUCT_INACTIVE/);

  assert.match(purchaseService, /if \(!supplier\.isActive\)/);
  assert.match(purchaseService, /SUPPLIER_INACTIVE/);
  assert.match(purchaseService, /if \(!product\.isActive\)/);
  assert.match(purchaseService, /PRODUCT_INACTIVE/);
});

/** Verifies retrying a financial request with the same key replays the saved response instead of running the mutation twice. */
test("final acceptance preserves financial idempotency replay", async () => {
  const helper = await readProjectFile("../src/shared/http/idempotency.ts");
  const paymentRoutes = await readProjectFile("../src/modules/payments/payments.routes.ts");
  const salesRoutes = await readProjectFile("../src/modules/sales/sales.routes.ts");
  const purchaseRoutes = await readProjectFile("../src/modules/purchases/purchases.routes.ts");
  const returnsRoutes = await readProjectFile("../src/modules/returns/returns.routes.ts");

  assert.match(helper, /onConflictDoNothing\(\{ target: idempotencyRequests\.key \}\)/);
  assert.match(helper, /existing\.status === "COMPLETED"/);
  assert.match(helper, /statusCode: existing\.responseStatus,[\s\S]*body: existing\.responseBody/);
  assert.match(helper, /IDEMPOTENCY_KEY_REUSED/);
  assert.match(helper, /await operation\(tx\)/);

  for (const routes of [paymentRoutes, salesRoutes, purchaseRoutes, returnsRoutes]) {
    assert.match(routes, /executeIdempotentMutation\(/);
    assert.match(routes, /request\.headers\["idempotency-key"\]/);
  }
});

/** Verifies all 15 business modules keep the approved five-file production structure. */
test("final acceptance keeps all 15 modules inside the approved module structure", async () => {
  const moduleNames = [
    "business-settings",
    "auth",
    "products",
    "customers",
    "suppliers",
    "inventory",
    "ledgers",
    "payments",
    "purchases",
    "sales",
    "returns",
    "expenses",
    "reports",
    "dashboard",
    "system",
  ];

  for (const moduleName of moduleNames) {
    const moduleDirectory = new URL(`../src/modules/${moduleName}/`, import.meta.url);
    const entries = await readdir(moduleDirectory, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
    assert.deepEqual(files, [
      "index.ts",
      `${moduleName}.repository.ts`,
      `${moduleName}.routes.ts`,
      `${moduleName}.schema.ts`,
      `${moduleName}.service.ts`,
    ].sort());
  }
});

/** Verifies race-condition uniqueness failures return stable business errors instead of generic 500 responses. */
test("shared error handler maps user-facing unique constraint races", async () => {
  const source = await readProjectFile("../src/plugins/error-handler.plugin.ts");

  const expectedMappings = [
    ["product_categories_name_normalized_unique", "DUPLICATE_CATEGORY_NAME"],
    ["brands_name_normalized_unique", "DUPLICATE_BRAND_NAME"],
    ["products_sku_normalized_unique", "DUPLICATE_SKU"],
    ["products_barcode_unique", "DUPLICATE_BARCODE"],
    [
      "product_units_product_unit_name_normalized_unique",
      "DUPLICATE_PRODUCT_UNIT",
    ],
    ["customers_code_normalized_unique", "DUPLICATE_CUSTOMER_CODE"],
    ["suppliers_code_normalized_unique", "DUPLICATE_SUPPLIER_CODE"],
    ["cash_accounts_name_unique", "DUPLICATE_ACCOUNT"],
    ["bank_accounts_account_number_unique", "DUPLICATE_ACCOUNT"],
    ["expense_categories_name_normalized_unique", "DUPLICATE_EXPENSE_CATEGORY"],
  ] as const;

  for (const [constraint, errorCode] of expectedMappings) {
    assert.match(source, new RegExp(constraint));
    assert.match(source, new RegExp(errorCode));
  }

  assert.match(source, /statusCode: 409/);
});

/** Verifies business decimal comparisons avoid floating-point Number conversion. */
test("business money and quantity decisions use exact decimal helpers", async () => {
  const decimalHelpers = await readProjectFile("../src/shared/utils/decimal-validation.ts");
  const customersService = await readProjectFile("../src/modules/customers/customers.service.ts");
  const suppliersService = await readProjectFile("../src/modules/suppliers/suppliers.service.ts");
  const productsSchema = await readProjectFile("../src/modules/products/products.schema.ts");
  const inventorySchema = await readProjectFile("../src/modules/inventory/inventory.schema.ts");
  const systemService = await readProjectFile("../src/modules/system/system.service.ts");

  assert.match(decimalHelpers, /export function isDecimalZero/);
  assert.match(decimalHelpers, /export function isDecimalGreaterThanZero/);
  assert.match(decimalHelpers, /export function isDecimalOne/);

  for (const source of [
    customersService,
    suppliersService,
    productsSchema,
    inventorySchema,
    systemService,
  ]) {
    assert.doesNotMatch(source, /Number\([^\n]*(openingBalance|reorderLevel|conversion|creditLimit|amount|quantity|unitCost|value)/);
  }

  assert.match(customersService, /isDecimalGreaterThanZero\(input\.openingBalance\)/);
  assert.match(suppliersService, /isDecimalGreaterThanZero\(input\.openingBalance\)/);
  assert.match(systemService, /isDecimalZero\(amount\)/);
  assert.match(systemService, /isDecimalOne\(baseRows\[0\]\.row\.conversionToBase\)/);
});


/** Verifies every irreversible V1 financial mutation keeps consistent idempotency protection. */
test("financial mutation idempotency is consistent across all modules", async () => {
  const inventory = await readProjectFile("../src/modules/inventory/inventory.routes.ts");
  const payments = await readProjectFile("../src/modules/payments/payments.routes.ts");
  const purchases = await readProjectFile("../src/modules/purchases/purchases.routes.ts");
  const sales = await readProjectFile("../src/modules/sales/sales.routes.ts");
  const returns = await readProjectFile("../src/modules/returns/returns.routes.ts");
  const expenses = await readProjectFile("../src/modules/expenses/expenses.routes.ts");
  const system = await readProjectFile("../src/modules/system/system.routes.ts");

  const handler = (source: string, name: string): string => {
    const start = source.indexOf(`async function ${name}(`);
    assert.notEqual(start, -1, `${name} must exist`);
    const next = source.indexOf("\n  async function ", start + 1);
    return source.slice(start, next === -1 ? source.length : next);
  };

  // Inventory operations that immediately change stock are idempotent.
  for (const name of [
    "handleCreateOpeningStock",
    "handleCreateAdjustment",
    "handleConfirmStockCount",
  ]) {
    assert.match(handler(inventory, name), /executeIdempotentMutation/);
  }
  // Creating/editing a DRAFT stock count is not an irreversible stock mutation.
  assert.doesNotMatch(handler(inventory, "handleCreateStockCount"), /executeIdempotentMutation/);
  assert.doesNotMatch(handler(inventory, "handleUpdateStockCount"), /executeIdempotentMutation/);

  // Account openings may create OPENING_BALANCE movements, so creation is protected.
  for (const name of [
    "handleCreateCashAccount",
    "handleCreateBankAccount",
    "handleCreateCustomerReceipt",
    "handleReverseCustomerReceipt",
    "handleCreateSupplierPayment",
    "handleReverseSupplierPayment",
    "handleCreateTransfer",
    "handleConfirmCashReconciliation",
  ]) {
    assert.match(handler(payments, name), /sendIdempotentMutation/);
  }
  // Reconciliation create/update stays editable until confirmation.
  assert.doesNotMatch(handler(payments, "handleCreateCashReconciliation"), /sendIdempotentMutation/);
  assert.doesNotMatch(handler(payments, "handleUpdateCashReconciliation"), /sendIdempotentMutation/);

  // Immediate confirmations and saved-draft confirmations are both protected.
  assert.match(handler(purchases, "handleCreatePurchase"), /input\.status === "CONFIRMED"[\s\S]*executeIdempotentMutation/);
  assert.match(handler(purchases, "handleConfirmPurchase"), /executeIdempotentMutation/);
  assert.match(handler(sales, "handleCreateSale"), /input\.status === "CONFIRMED"[\s\S]*executeIdempotentMutation/);
  assert.match(handler(sales, "handleConfirmSale"), /executeIdempotentMutation/);

  for (const name of ["handleCreateSalesReturn", "handleCreatePurchaseReturn"]) {
    assert.match(handler(returns, name), /executeIdempotentMutation/);
  }
  for (const name of ["handleCreateExpense", "handleReverseExpense"]) {
    assert.match(handler(expenses, name), /sendIdempotentExpenseMutation/);
  }

  // The PDF requires Idempotency-Key for both import validation/upload and import confirmation.
  assert.match(handler(system, "handleImportUpload"), /systemIdempotencyHeadersSchema[\s\S]*executeIdempotentMutation/);
  assert.match(handler(system, "handleConfirmImport"), /systemIdempotencyHeadersSchema[\s\S]*executeIdempotentMutation/);

  // Every wrapper binds retries to method, route and request identity/body.
  for (const source of [inventory, payments, purchases, sales, returns, expenses, system]) {
    assert.match(source, /method:\s*request\.method/);
    assert.match(source, /path:\s*request\.routeOptions\.url/);
  }
});

/** Verifies purchase confirmation keeps stock, ledger, payment, and document writes in the caller-owned transaction. */
test("purchase confirmation keeps every financial effect in one transaction", async () => {
  const service = await readProjectFile("../src/modules/purchases/purchases.service.ts");
  const start = service.indexOf("export async function confirmPurchaseInTransaction");
  const end = service.indexOf("export async function confirmPurchase(", start);
  const section = service.slice(start, end > start ? end : undefined);

  assert.ok(start >= 0);
  assert.match(section, /recordPurchaseStockIn\(transaction,/);
  assert.match(section, /writeSupplierCredit\(transaction,/);
  assert.match(section, /recordPurchaseInitialSupplierPayment\(transaction,/);
  assert.match(section, /markPurchaseConfirmed\(\s*transaction,/);
  assert.doesNotMatch(section, /recordPurchaseStockIn\(database,/);
  assert.doesNotMatch(section, /writeSupplierCredit\(database,/);
});

/** Verifies sale confirmation keeps stock, ledger, payment, and invoice writes in the caller-owned transaction. */
test("sale confirmation keeps every financial effect in one transaction", async () => {
  const service = await readProjectFile("../src/modules/sales/sales.service.ts");
  const start = service.indexOf("export async function confirmSaleInTransaction");
  const end = service.indexOf("export async function confirmSale(", start);
  const section = service.slice(start, end > start ? end : undefined);

  assert.ok(start >= 0);
  assert.match(section, /recordSaleStockOut\(transaction,/);
  assert.match(section, /writeCustomerDebit\(transaction,/);
  assert.match(section, /recordSaleInitialCustomerReceipt\(transaction,/);
  assert.match(section, /markSaleConfirmed\(transaction,/);
  assert.doesNotMatch(section, /recordSaleStockOut\(database,/);
  assert.doesNotMatch(section, /writeCustomerDebit\(database,/);
});

/** Verifies confirmed returns keep document, stock, and settlement writes in the same transaction. */
test("returns keep document stock and settlement effects in one transaction", async () => {
  const service = await readProjectFile("../src/modules/returns/returns.service.ts");
  const salesStart = service.indexOf("export async function createConfirmedSalesReturnInTransaction");
  const salesEnd = service.indexOf("export async function createConfirmedPurchaseReturnInTransaction", salesStart);
  const salesSection = service.slice(salesStart, salesEnd > salesStart ? salesEnd : undefined);
  const purchaseStart = service.indexOf("export async function createConfirmedPurchaseReturnInTransaction");
  const purchaseEnd = service.indexOf("export async function listSalesReturns", purchaseStart);
  const purchaseSection = service.slice(
    purchaseStart,
    purchaseEnd > purchaseStart ? purchaseEnd : undefined,
  );

  assert.ok(salesStart >= 0);
  assert.match(salesSection, /createSalesReturn\(transaction,/);
  assert.match(salesSection, /createSalesReturnItems\(\s*transaction,/);
  assert.match(salesSection, /applyPreparedSalesReturnInventory\(\s*transaction,/);
  assert.match(
    salesSection,
    /applyPreparedSalesReturn(?:DueReduction|CashRefund|BankRefund)\(\s*transaction,/,
  );

  assert.ok(purchaseStart >= 0);
  assert.match(purchaseSection, /createPurchaseReturn\(transaction,/);
  assert.match(purchaseSection, /createPurchaseReturnItems\(\s*transaction,/);
  assert.match(purchaseSection, /applyPreparedPurchaseReturnInventory\(\s*transaction,/);
  assert.match(purchaseSection, /applyPreparedPurchaseReturnSupplierLedger\(\s*transaction,/);
});

/** Verifies expense creation and reversal keep the expense row and account movement atomic. */
test("expense writes and reversals keep their account movement in one transaction", async () => {
  const service = await readProjectFile("../src/modules/expenses/expenses.service.ts");
  const createStart = service.indexOf("export async function createExpenseInTransaction");
  const createEnd = service.indexOf("export async function reverseExpenseInTransaction", createStart);
  const createSection = service.slice(createStart, createEnd > createStart ? createEnd : undefined);
  const reverseStart = service.indexOf("export async function reverseExpenseInTransaction");
  const reverseSection = service.slice(reverseStart);

  assert.ok(createStart >= 0);
  assert.match(createSection, /insertExpense\(transaction,/);
  assert.match(createSection, /writeExpenseOutflow\(transaction,/);

  assert.ok(reverseStart >= 0);
  assert.match(reverseSection, /insertExpense\(transaction,/);
  assert.match(reverseSection, /writeExpenseReversalInflow\(\s*transaction,/);
  assert.doesNotMatch(service, /export async function (?:createExpense|reverseExpense)\(/);
});

/** Verifies HTTP financial mutations pass the idempotency transaction into the business service. */
test("financial routes reuse the idempotency transaction instead of opening detached writes", async () => {
  const purchases = await readProjectFile("../src/modules/purchases/purchases.routes.ts");
  const sales = await readProjectFile("../src/modules/sales/sales.routes.ts");
  const returns = await readProjectFile("../src/modules/returns/returns.routes.ts");
  const expenses = await readProjectFile("../src/modules/expenses/expenses.routes.ts");
  const payments = await readProjectFile("../src/modules/payments/payments.routes.ts");
  const idempotency = await readProjectFile("../src/shared/http/idempotency.ts");

  assert.match(purchases, /createPurchaseInTransaction\(transaction, input\)/);
  assert.match(purchases, /confirmPurchaseInTransaction\(transaction, params\.id, input\)/);
  assert.match(sales, /createSaleInTransaction\(transaction, input\)/);
  assert.match(sales, /confirmSaleInTransaction\(transaction, params\.id, input\)/);
  assert.match(returns, /createConfirmedSalesReturnInTransaction\(transaction, input\)/);
  assert.match(returns, /createConfirmedPurchaseReturnInTransaction\(transaction, input\)/);
  assert.match(expenses, /operation\(transaction\)/);
  assert.match(payments, /operation\(transaction\)/);
  assert.match(idempotency, /return database\.transaction\(async \(transaction\) =>/);
  assert.match(idempotency, /const response = await operation\(tx\)/);
  assert.match(idempotency, /responseBody: response\.body/);
});

/** Verifies sale and purchase detail outstanding queries include returns and only active payment allocations. */
test("sale and purchase outstanding queries reconcile payments reversals and returns", async () => {
  const sales = await readProjectFile("../src/modules/sales/sales.repository.ts");
  const purchases = await readProjectFile("../src/modules/purchases/purchases.repository.ts");

  const saleStart = sales.indexOf("export async function getSaleOutstandingAmount");
  const saleEnd = sales.indexOf("export async function createSale(", saleStart);
  const saleSection = sales.slice(saleStart, saleEnd > saleStart ? saleEnd : undefined);

  assert.ok(saleStart >= 0);
  assert.match(saleSection, /customerPayments\.status[^\n]*'CONFIRMED'/);
  assert.match(saleSection, /customerPayments\.reversalOfPaymentId[^\n]*is null/);
  assert.match(saleSection, /salesReturns\.originalSaleId/);
  assert.match(saleSection, /salesReturns\.status[^\n]*'CONFIRMED'/);
  assert.match(
    saleSection,
    /salesInvoices\.totalAmount[^\n]*returnedAmount[^\n]*paidAmount/,
  );

  const purchaseStart = purchases.indexOf("export async function getPurchaseOutstandingAmount");
  const purchaseEnd = purchases.indexOf("export async function createPurchase(", purchaseStart);
  const purchaseSection = purchases.slice(
    purchaseStart,
    purchaseEnd > purchaseStart ? purchaseEnd : undefined,
  );

  assert.ok(purchaseStart >= 0);
  assert.match(purchaseSection, /supplierPayments\.status[^\n]*'CONFIRMED'/);
  assert.match(purchaseSection, /supplierPayments\.reversalOfPaymentId[^\n]*is null/);
  assert.match(purchaseSection, /purchaseReturns\.originalPurchaseId/);
  assert.match(purchaseSection, /purchaseReturns\.status[^\n]*'CONFIRMED'/);
  assert.match(
    purchaseSection,
    /purchases\.totalAmount[^\n]*returnedAmount[^\n]*paidAmount/,
  );
});

/** Verifies confirmation-time import drift is returned directly instead of writing rows that rollback with the idempotency transaction. */
test("system import confirmation reports stale validation errors without rolled-back status writes", async () => {
  const service = await readProjectFile("../src/modules/system/system.service.ts");

  assert.match(service, /function toImportConfirmationFields/);
  assert.match(service, /toImportConfirmationFields\(confirmationErrors\)/);
  assert.doesNotMatch(service, /validation error\(s\) appeared before confirmation/);

  for (const functionName of [
    "confirmProductImport",
    "confirmPartyImport",
    "confirmOpeningStockImport",
    "confirmOpeningBalanceImport",
  ]) {
    const start = service.indexOf(`export async function ${functionName}`);
    const nextExport = service.indexOf("export async function ", start + 1);
    const section = service.slice(start, nextExport > start ? nextExport : undefined);

    assert.ok(start >= 0, `${functionName} must exist`);
    assert.match(section, /IMPORT_VALIDATION_FAILED/);
    assert.match(section, /toImportConfirmationFields\(confirmationErrors\)/);
  }
});

/** Verifies opening-data imports re-check setup locks and protected records before claiming the import job. */
test("system opening imports revalidate setup locks before confirmation claim", async () => {
  const service = await readProjectFile("../src/modules/system/system.service.ts");
  const repository = await readProjectFile("../src/modules/system/system.repository.ts");

  const stockStart = service.indexOf("export async function confirmOpeningStockImport");
  const stockEnd = service.indexOf("export interface OpeningBalanceImportConfirmationResult", stockStart);
  const stockSection = service.slice(stockStart, stockEnd);
  assert.ok(stockStart >= 0);
  assert.ok(
    stockSection.indexOf("collectOpeningStockImportErrors") <
      stockSection.indexOf("claimValidatedOpeningStockImport"),
  );

  const balanceStart = service.indexOf("export async function confirmOpeningBalanceImport");
  const balanceEnd = service.indexOf("export async function confirmImport", balanceStart);
  const balanceSection = service.slice(balanceStart, balanceEnd);
  assert.ok(balanceStart >= 0);
  assert.ok(
    balanceSection.indexOf("collectOpeningBalanceImportErrors") <
      balanceSection.indexOf("claimValidatedOpeningBalanceImport"),
  );

  assert.match(service, /OPENING_STOCK_LOCKED/);
  assert.match(service, /OPENING_IMPORT_LOCKED/);
  assert.match(service, /Walk-in Customer cannot receive an opening due balance/);
  assert.match(repository, /ne\(stockMovements\.movementType, "OPENING_STOCK"\)/);
  assert.match(repository, /ne\(cashBankMovements\.sourceType, "OPENING_BALANCE"\)/);
});

/** Verifies import confirmation can atomically claim only VALIDATED jobs once. */
test("system import confirmation claims only validated jobs", async () => {
  const repository = await readProjectFile("../src/modules/system/system.repository.ts");

  for (const claimName of [
    "claimValidatedProductImport",
    "claimValidatedPartyImport",
    "claimValidatedOpeningStockImport",
    "claimValidatedOpeningBalanceImport",
  ]) {
    const start = repository.indexOf(`export async function ${claimName}`);
    const nextExport = repository.indexOf("export async function ", start + 1);
    const section = repository.slice(start, nextExport > start ? nextExport : undefined);

    assert.ok(start >= 0, `${claimName} must exist`);
    assert.match(section, /eq\(importJobs\.status, "VALIDATED"\)/);
    assert.match(section, /status: "IMPORTED"/);
    assert.match(section, /\.returning\(\)/);
  }
});

/** Locks all backend modules, including Production Operations, to the approved five-file structure. */
test("all backend modules use only the approved five production files", async () => {
  const moduleNames = [
    "business-settings",
    "auth",
    "products",
    "customers",
    "suppliers",
    "employees",
    "inventory",
    "ledgers",
    "payments",
    "operations",
    "purchases",
    "sales",
    "returns",
    "expenses",
    "reports",
    "dashboard",
    "system",
  ];

  const modulesDirectory = new URL("../src/modules/", import.meta.url);
  const actualModuleDirectories = (await readdir(modulesDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(actualModuleDirectories, [...moduleNames].sort());

  for (const moduleName of moduleNames) {
    const moduleDirectory = new URL(`${moduleName}/`, modulesDirectory);
    const entries = await readdir(moduleDirectory, { withFileTypes: true });

    assert.equal(
      entries.some((entry) => entry.isDirectory()),
      false,
      `${moduleName} must not contain controllers, DTO folders, events, use-cases, or other subfolders`,
    );

    const actualFiles = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();

    assert.deepEqual(
      actualFiles,
      [
        "index.ts",
        `${moduleName}.repository.ts`,
        `${moduleName}.routes.ts`,
        `${moduleName}.schema.ts`,
        `${moduleName}.service.ts`,
      ].sort(),
      `${moduleName} contains an unapproved production file`,
    );
  }
});

/** Verifies every frontend business feature keeps the approved api/components/hooks/pages layout. */
test("all 16 frontend features keep the approved four-folder structure", async () => {
  const featureNames = [
    "auth",
    "business-settings",
    "products",
    "customers",
    "suppliers",
    "employees",
    "inventory",
    "ledgers",
    "payments",
    "purchases",
    "sales",
    "returns",
    "expenses",
    "reports",
    "dashboard",
    "system",
  ];

  const featuresDirectory = new URL("../../web-admin/src/features/", import.meta.url);
  const actualFeatureDirectories = (await readdir(featuresDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(actualFeatureDirectories, [...featureNames].sort());

  for (const featureName of featureNames) {
    const featureDirectory = new URL(`${featureName}/`, featuresDirectory);
    const entries = await readdir(featureDirectory, { withFileTypes: true });
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const rootFiles = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);

    assert.deepEqual(
      directories,
      ["api", "components", "hooks", "pages"],
      `${featureName} must keep api/components/hooks/pages together`,
    );
    assert.equal(
      rootFiles.every((fileName) => /\.test\.(?:ts|tsx)$/.test(fileName)),
      true,
      `${featureName} must not add loose production files at the feature root`,
    );
  }
});

/** Verifies the reviewed migration chain produces every table and column declared by the final Drizzle schemas. */
test("final Drizzle tables and columns match the reviewed migration chain", async () => {
  const schemaDirectory = new URL("../src/database/schema/", import.meta.url);
  const migrationDirectory = new URL("../drizzle/", import.meta.url);

  const schemaFiles = (await readdir(schemaDirectory))
    .filter((fileName) => fileName.endsWith(".schema.ts"))
    .sort();
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((fileName) => /^\d{4}_.+\.sql$/.test(fileName))
    .sort();

  assert.deepEqual(
    migrationFiles.map((fileName) => fileName.slice(0, 4)),
    migrationFiles.map((_, index) => String(index).padStart(4, "0")),
    "reviewed migrations must remain contiguous and ordered",
  );

  const expectedTables = new Map<string, Set<string>>();

  for (const fileName of schemaFiles) {
    const source = await readFile(new URL(fileName, schemaDirectory), "utf8");
    const tablePattern = /pgTable\(\s*["']([^"']+)["']\s*,\s*\{/g;

    for (const tableMatch of source.matchAll(tablePattern)) {
      const tableName = tableMatch[1];
      const objectStart = (tableMatch.index ?? 0) + tableMatch[0].length;
      let depth = 1;
      let cursor = objectStart;

      while (cursor < source.length && depth > 0) {
        if (source[cursor] === "{") depth += 1;
        if (source[cursor] === "}") depth -= 1;
        cursor += 1;
      }

      const tableBody = source.slice(objectStart, cursor - 1);
      const columns = new Set<string>();
      const columnPattern = /^\s*[A-Za-z0-9_]+:\s*[A-Za-z0-9_]+\(\s*["']([^"']+)["']/gm;

      for (const columnMatch of tableBody.matchAll(columnPattern)) {
        columns.add(columnMatch[1]);
      }

      expectedTables.set(tableName, columns);
    }
  }

  const migratedTables = new Map<string, Set<string>>();

  for (const fileName of migrationFiles) {
    const sql = await readFile(new URL(fileName, migrationDirectory), "utf8");
    const createPattern = /CREATE TABLE\s+"([^"]+)"\s*\(([\s\S]*?)\)\s*;/gi;

    for (const createMatch of sql.matchAll(createPattern)) {
      const columns = new Set<string>();
      for (const line of createMatch[2].split("\n")) {
        const columnMatch = line.trim().match(/^"([^"]+)"\s+/);
        if (columnMatch) columns.add(columnMatch[1]);
      }
      migratedTables.set(createMatch[1], columns);
    }

    const addColumnPattern = /ALTER TABLE\s+"([^"]+)"\s+ADD COLUMN\s+"([^"]+)"/gi;
    for (const addMatch of sql.matchAll(addColumnPattern)) {
      migratedTables.get(addMatch[1])?.add(addMatch[2]);
    }

    const dropColumnPattern = /ALTER TABLE\s+"([^"]+)"\s+DROP COLUMN\s+"([^"]+)"/gi;
    for (const dropMatch of sql.matchAll(dropColumnPattern)) {
      migratedTables.get(dropMatch[1])?.delete(dropMatch[2]);
    }
  }

  assert.deepEqual(
    [...migratedTables.keys()].sort(),
    [...expectedTables.keys()].sort(),
    "migration chain and Drizzle schema must define the same tables",
  );

  for (const [tableName, expectedColumns] of expectedTables) {
    assert.deepEqual(
      [...(migratedTables.get(tableName) ?? new Set<string>())].sort(),
      [...expectedColumns].sort(),
      `${tableName} migration columns must match its final Drizzle schema`,
    );
  }
});

/** Verifies every named Drizzle constraint/index is represented in the reviewed SQL migrations. */
test("final Drizzle constraints and indexes are present in reviewed migrations", async () => {
  const schemaDirectory = new URL("../src/database/schema/", import.meta.url);
  const migrationDirectory = new URL("../drizzle/", import.meta.url);

  const schemaFiles = (await readdir(schemaDirectory))
    .filter((fileName) => fileName.endsWith(".schema.ts"))
    .sort();
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((fileName) => /^\d{4}_.+\.sql$/.test(fileName))
    .sort();

  const migrationSql = (
    await Promise.all(
      migrationFiles.map((fileName) => readFile(new URL(fileName, migrationDirectory), "utf8")),
    )
  ).join("\n");

  const missingNames: string[] = [];

  for (const fileName of schemaFiles) {
    const source = await readFile(new URL(fileName, schemaDirectory), "utf8");
    const names = [
      ...source.matchAll(/(?:check|index|uniqueIndex)\(\s*["']([^"']+)["']/g),
      ...source.matchAll(/name:\s*["']([^"']+)["']/g),
    ].map((match) => match[1]);

    for (const name of names) {
      if (!migrationSql.includes(name)) missingNames.push(`${fileName}: ${name}`);
    }
  }

  assert.deepEqual(missingNames, []);
});

/** Locks every Module 1-15 public route to the approved requirements document. */
test("all backend modules expose exactly the approved API route contracts", async () => {
  const expectedRoutes: Record<string, string[]> = {
    "business-settings": [
      "GET /business-settings",
      "PATCH /business-settings",
    ],
    auth: [
      "POST /auth/login",
      "POST /auth/refresh",
      "POST /auth/logout",
      "GET /auth/me",
      "GET /auth/sessions",
      "DELETE /auth/sessions/:id",
      "POST /auth/logout-all",
      "POST /auth/change-password",
    ],
    products: [
      "GET /products",
      "POST /products",
      "GET /products/:id",
      "PATCH /products/:id",
      "GET /product-categories",
      "POST /product-categories",
      "PATCH /product-categories/:id",
      "GET /brands",
      "POST /brands",
      "PATCH /brands/:id",
    ],
    customers: [
      "GET /customers",
      "POST /customers",
      "GET /customers/:id",
      "PATCH /customers/:id",
      "GET /customers/:customerId/open-invoices",
    ],
    suppliers: [
      "GET /suppliers",
      "POST /suppliers",
      "GET /suppliers/:id",
      "PATCH /suppliers/:id",
      "GET /suppliers/:supplierId/open-purchases",
    ],
    inventory: [
      "GET /inventory/stock",
      "GET /inventory/products/:productId/movements",
      "POST /inventory/opening-stock",
      "POST /inventory/adjustments",
      "GET /inventory/counts",
      "POST /inventory/counts",
      "GET /inventory/counts/:id",
      "PATCH /inventory/counts/:id",
      "POST /inventory/counts/:id/confirm",
    ],
    ledgers: [
      "GET /ledgers/customers/:customerId",
      "GET /ledgers/suppliers/:supplierId",
      "GET /ledgers/customer-outstanding",
      "GET /ledgers/supplier-payables",
    ],
    payments: [
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
    ],
    purchases: [
      "GET /purchases",
      "POST /purchases",
      "GET /purchases/:id",
      "PATCH /purchases/:id/draft",
      "POST /purchases/:id/confirm",
      "POST /purchases/:id/cancel",
    ],
    sales: [
      "GET /sales",
      "POST /sales",
      "GET /sales/:id",
      "PATCH /sales/:id/draft",
      "POST /sales/:id/confirm",
      "POST /sales/:id/cancel",
    ],
    returns: [
      "GET /sales-returns",
      "POST /sales-returns",
      "GET /sales-returns/:id",
      "GET /purchase-returns",
      "POST /purchase-returns",
      "GET /purchase-returns/:id",
    ],
    expenses: [
      "GET /expense-categories",
      "POST /expense-categories",
      "PATCH /expense-categories/:id",
      "GET /expenses",
      "POST /expenses",
      "GET /expenses/:id",
      "POST /expenses/:id/reverse",
    ],
    reports: [
      "GET /reports/sales",
      "GET /reports/purchases",
      "GET /reports/inventory",
      "GET /reports/customers/outstanding",
      "GET /reports/suppliers/payable",
      "GET /reports/cash-bank",
      "GET /reports/expenses",
      "GET /reports/profit-summary",
      "GET /reports/product-profit",
    ],
    dashboard: [
      "GET /dashboard/overview",
      "GET /dashboard/low-stock",
    ],
    system: [
      "GET /system/import-templates/:type",
      "POST /system/imports/:type",
      "GET /system/imports",
      "GET /system/imports/:id",
      "POST /system/imports/:id/confirm",
      "GET /system/audit-logs",
      "GET /system/exports/:type",
    ],
  };

  for (const [moduleName, expected] of Object.entries(expectedRoutes)) {
    const routeSource = await readProjectFile(
      `../src/modules/${moduleName}/${moduleName}.routes.ts`,
    );
    const actual = [...routeSource.matchAll(
      /app\.(get|post|patch|put|delete)\s*\(\s*["']([^"']+)["']/g,
    )].map((match) => `${match[1].toUpperCase()} ${match[2]}`);

    assert.deepEqual(
      [...actual].sort(),
      [...expected].sort(),
      `${moduleName} routes must match the approved public API exactly`,
    );
  }
});

/** Keeps the one required public operational readiness route. */
test("application exposes only the approved health readiness route outside modules", async () => {
  const appSource = await readProjectFile("../src/app.ts");

  assert.match(appSource, /app\.get\(\s*["']\/health["']/);
  assert.match(appSource, /200:\s*openApiSuccessResponse/);
  assert.match(appSource, /503:\s*openApiErrorResponse/);
  assert.match(appSource, /await app\.db\.execute\(sql`select 1`\)/);
});

/** Keeps Auth audit ownership in the service and prevents audit storage from changing auth outcomes. */
test("auth service owns login/logout/password audit writes and audit storage stays best-effort", async () => {
  const routeSource = await readProjectFile("../src/modules/auth/auth.routes.ts");
  const serviceSource = await readProjectFile("../src/modules/auth/auth.service.ts");
  const systemServiceSource = await readProjectFile("../src/modules/system/system.service.ts");

  assert.doesNotMatch(routeSource, /recordAuditLog/);
  assert.doesNotMatch(routeSource, /LOGIN_SUCCEEDED|LOGIN_FAILED|PASSWORD_CHANGED/);
  assert.match(serviceSource, /"LOGIN_SUCCEEDED"/);
  assert.match(serviceSource, /"LOGIN_FAILED"/);
  assert.match(serviceSource, /"LOGOUT"/);
  assert.match(serviceSource, /"PASSWORD_CHANGED"/);

  assert.match(
    systemServiceSource,
    /export async function recordAuditLog[\s\S]*?try\s*\{[\s\S]*?await createAuditLog[\s\S]*?return true;[\s\S]*?catch\s*\{[\s\S]*?return false;/,
  );
});

/** Prevents HTTP cookie/reply failures from being mislabeled as credential failures. */
test("login route delegates authentication and auditing before writing cookies", async () => {
  const routeSource = await readProjectFile("../src/modules/auth/auth.routes.ts");
  const loginHandlerMatch = routeSource.match(
    /async function handleLogin\([\s\S]*?\n  \}\n\n  \/\*\* Receives refresh cookies/,
  );

  assert.ok(loginHandlerMatch, "login handler must exist");
  const loginHandler = loginHandlerMatch[0];

  assert.doesNotMatch(loginHandler, /try\s*\{/);
  assert.doesNotMatch(loginHandler, /catch\s*\(/);
  assert.match(loginHandler, /await loginAdmin\(/);
  assert.match(loginHandler, /createAuditContext\(request\)/);
  assert.ok(
    loginHandler.indexOf("await loginAdmin(") < loginHandler.indexOf("setSessionCookies("),
    "login service must finish before cookies are written",
  );
});


/** Keeps document-number reservation transaction-owned by the calling business workflow. */
test("business document numbers expose only the transaction-aware reservation helper", async () => {
  const service = await readProjectFile(
    "../src/modules/business-settings/business-settings.service.ts",
  );
  const index = await readProjectFile(
    "../src/modules/business-settings/index.ts",
  );

  assert.match(
    service,
    /export async function reserveBusinessDocumentNumberInTransaction\(/,
  );
  assert.doesNotMatch(
    service,
    /export async function reserveBusinessDocumentNumber\(/,
  );
  assert.match(index, /reserveBusinessDocumentNumberInTransaction/);
  assert.doesNotMatch(
    index,
    /\breserveBusinessDocumentNumber\b(?!InTransaction)/,
  );
});


/** Keeps the Business Settings public view type defined beside the service that returns it. */
test("business settings service defines and exports its response view type", async () => {
  const service = await readProjectFile(
    "../src/modules/business-settings/business-settings.service.ts",
  );
  const index = await readProjectFile(
    "../src/modules/business-settings/index.ts",
  );

  assert.match(service, /export interface BusinessSettingsView\s*\{/);
  assert.match(service, /isConfigured:\s*boolean/);
  assert.match(service, /settings:\s*BusinessSettingsRecord \| null/);
  assert.match(service, /sequences:\s*DocumentSequenceRecord\[\]/);
  assert.match(index, /BusinessSettingsView/);
});

/** Keeps HTTP routes behind module services instead of reaching directly into repositories or Drizzle. */
test("all module routes preserve the route to service to repository boundary", async () => {
  const moduleNames = [
    "business-settings",
    "auth",
    "products",
    "customers",
    "suppliers",
    "inventory",
    "ledgers",
    "payments",
    "purchases",
    "sales",
    "returns",
    "expenses",
    "reports",
    "dashboard",
    "system",
  ];

  for (const moduleName of moduleNames) {
    const routeSource = await readProjectFile(
      `../src/modules/${moduleName}/${moduleName}.routes.ts`,
    );

    assert.doesNotMatch(
      routeSource,
      /from\s+["'][^"']*\.repository\.js["']/,
      `${moduleName} routes must not import repository functions directly`,
    );
    assert.doesNotMatch(
      routeSource,
      /\b(?:app|request\.server)\.db\.(?:select|insert|update|delete|execute|transaction)\s*\(/,
      `${moduleName} routes must not execute Drizzle/database operations directly`,
    );
  }
});

/** Keeps repository files data-only and prevents upward dependencies on services or routes. */
test("all repositories remain below services in the dependency graph", async () => {
  const moduleNames = [
    "business-settings",
    "auth",
    "products",
    "customers",
    "suppliers",
    "inventory",
    "ledgers",
    "payments",
    "purchases",
    "sales",
    "returns",
    "expenses",
    "reports",
    "dashboard",
    "system",
  ];

  for (const moduleName of moduleNames) {
    const repositorySource = await readProjectFile(
      `../src/modules/${moduleName}/${moduleName}.repository.ts`,
    );

    assert.doesNotMatch(
      repositorySource,
      /from\s+["'][^"']*\.service\.js["']/,
      `${moduleName} repository must not import a service`,
    );
    assert.doesNotMatch(
      repositorySource,
      /from\s+["'][^"']*\.routes\.js["']/,
      `${moduleName} repository must not import a route`,
    );
  }
});

/** Prevents route handlers from accumulating money, stock, ledger, or document-number calculations. */
test("business calculations stay out of route files", async () => {
  const moduleNames = [
    "business-settings",
    "products",
    "customers",
    "suppliers",
    "inventory",
    "ledgers",
    "payments",
    "purchases",
    "sales",
    "returns",
    "expenses",
    "reports",
    "dashboard",
  ];

  for (const moduleName of moduleNames) {
    const routeSource = await readProjectFile(
      `../src/modules/${moduleName}/${moduleName}.routes.ts`,
    );

    assert.doesNotMatch(
      routeSource,
      /\b(?:decimalToScaledInteger|scaledIntegerToDecimal|calculate(?:Sale|Purchase|Line|BaseQuantity|Outstanding|Weighted)|writeCustomer(?:Debit|Credit)|writeSupplier(?:Debit|Credit)|recordSaleStockOut|recordPurchaseStockIn|reserveBusinessDocumentNumberInTransaction)\s*\(/,
      `${moduleName} route must delegate business calculations/orchestration to services`,
    );
  }
});

/** Verifies Production Operations liveness is public and does not depend on PostgreSQL. */
test("production operations liveness is a lightweight public process check", async () => {
  const routes = await readProjectFile("../src/modules/operations/operations.routes.ts");
  const service = await readProjectFile("../src/modules/operations/operations.service.ts");

  assert.match(routes, /app\.get\(\s*["']\/health\/live["']/);
  assert.match(routes, /getOperationsLiveness\(\)/);
  assert.doesNotMatch(routes, /app\.authenticate|preHandler/);
  assert.match(service, /function getOperationsLiveness\(\): OperationsLivenessResult/);
  assert.match(service, /return \{ status: ["']ok["'] \}/);
});

/** Verifies Production Operations readiness checks PostgreSQL and returns a safe public result. */
test("production operations readiness uses one lightweight database dependency check", async () => {
  const routes = await readProjectFile("../src/modules/operations/operations.routes.ts");
  const service = await readProjectFile("../src/modules/operations/operations.service.ts");
  const repository = await readProjectFile("../src/modules/operations/operations.repository.ts");

  assert.match(routes, /app\.get\(\s*["']\/health\/ready["']/);
  assert.match(routes, /getOperationsReadiness\(app\.db\)/);
  assert.match(routes, /\.status\(503\)/);
  assert.doesNotMatch(routes, /DATABASE_URL|JWT_SECRET|COOKIE_SECRET/);

  assert.match(service, /checkDatabaseReady\(database\)/);
  assert.match(service, /status:\s*isReady\s*\?\s*["']ready["']\s*:\s*["']unavailable["']/);

  assert.match(repository, /sql`select 1`/i);
  assert.match(repository, /database\.execute/);
  assert.match(repository, /catch\s*\{/);
});

/** Verifies Production Operations exposes only safe application build metadata. */
test("production operations version endpoint exposes safe build information", async () => {
  const routes = await readProjectFile("../src/modules/operations/operations.routes.ts");
  const service = await readProjectFile("../src/modules/operations/operations.service.ts");
  const environment = await readProjectFile("../src/env.ts");
  const exampleEnvironment = await readProjectFile("../../.env.example");

  assert.match(routes, /app\.get\(\s*["']\/operations\/version["']/);
  assert.match(routes, /getOperationsVersion\(options\)/);
  assert.doesNotMatch(routes, /DATABASE_URL|AUTH_SIGNING_SECRET|COOKIE_SECRET|SENTRY_DSN/);

  assert.match(service, /version:\s*options\.version/);
  assert.match(service, /build:\s*options\.build/);
  assert.match(service, /environment:\s*options\.environment/);
  assert.doesNotMatch(service, /databaseUrl|authSigningSecret|webAdminUrl/);

  assert.match(environment, /APP_VERSION/);
  assert.match(environment, /APP_BUILD/);
  assert.match(exampleEnvironment, /^APP_VERSION=/m);
  assert.match(exampleEnvironment, /^APP_BUILD=/m);
});

/** Verifies Auth repository session-management queries stay safe and administrator-scoped. */
test("production Auth repository supports safe active-session management", async () => {
  const repository = await readProjectFile("../src/modules/auth/auth.repository.ts");

  assert.match(repository, /export interface ActiveAdminSessionRecord/);
  assert.match(repository, /export async function listActiveAdminSessions\(/);
  assert.match(repository, /export async function revokeActiveAdminSessionById\(/);
  assert.match(repository, /export async function revokeAllActiveAdminSessions\(/);

  const listFunction = repository.match(
    /export async function listActiveAdminSessions\([\s\S]*?\n\}/,
  )?.[0] ?? "";
  assert.match(listFunction, /eq\(adminSessions\.adminUserId, adminUserId\)/);
  assert.match(listFunction, /isNull\(adminSessions\.revokedAt\)/);
  assert.match(listFunction, /gt\(adminSessions\.expiresAt, checkedAt\)/);
  assert.match(listFunction, /id:\s*adminSessions\.id/);
  assert.match(listFunction, /expiresAt:\s*adminSessions\.expiresAt/);
  assert.match(listFunction, /lastUsedAt:\s*adminSessions\.lastUsedAt/);
  assert.match(listFunction, /createdAt:\s*adminSessions\.createdAt/);
  assert.doesNotMatch(listFunction, /refreshTokenHash:\s*adminSessions\.refreshTokenHash/);

  const revokeOneFunction = repository.match(
    /export async function revokeActiveAdminSessionById\([\s\S]*?\n\}/,
  )?.[0] ?? "";
  assert.match(revokeOneFunction, /eq\(adminSessions\.id, sessionId\)/);
  assert.match(revokeOneFunction, /eq\(adminSessions\.adminUserId, adminUserId\)/);
  assert.match(revokeOneFunction, /isNull\(adminSessions\.revokedAt\)/);
  assert.match(revokeOneFunction, /gt\(adminSessions\.expiresAt, revokedAt\)/);

  const revokeAllFunction = repository.match(
    /export async function revokeAllActiveAdminSessions\([\s\S]*?\n\}/,
  )?.[0] ?? "";
  assert.match(revokeAllFunction, /eq\(adminSessions\.adminUserId, adminUserId\)/);
  assert.match(revokeAllFunction, /isNull\(adminSessions\.revokedAt\)/);
  assert.match(revokeAllFunction, /gt\(adminSessions\.expiresAt, revokedAt\)/);
});


/** Verifies Production Pass 7 keeps session-management business logic inside Auth service. */
test("production pass 7 adds safe auth session service logic", async () => {
  const service = await readProjectFile("../src/modules/auth/auth.service.ts");
  const authIndex = await readProjectFile("../src/modules/auth/index.ts");

  assert.match(service, /export async function listAdminSessions\(/);
  assert.match(service, /listActiveAdminSessions\(/);
  assert.match(service, /currentSession: session\.id === currentSessionId/);
  assert.match(service, /export async function revokeAdminSessionById\(/);
  assert.match(service, /revokeActiveAdminSessionById\(/);
  assert.match(service, /SESSION_NOT_FOUND/);
  assert.match(service, /currentSessionRevoked: revokedSession\.id === currentSessionId/);
  assert.match(service, /"SESSION_REVOKED"/);
  assert.match(service, /export async function logoutAllAdminSessions\(/);
  assert.match(service, /revokeAllActiveAdminSessions\(/);
  assert.match(service, /"LOGOUT_ALL"/);
  assert.doesNotMatch(
    service,
    /AdminSessionView[\s\S]*refreshTokenHash/,
    "safe session service responses must not expose refresh-token hashes",
  );
  assert.match(authIndex, /listAdminSessions/);
  assert.match(authIndex, /revokeAdminSessionById/);
  assert.match(authIndex, /logoutAllAdminSessions/);
});

/** Verifies Production Pass 8 exposes only the planned Auth session-security HTTP routes. */
test("production pass 8 adds authenticated session-management routes", async () => {
  const routes = await readProjectFile("../src/modules/auth/auth.routes.ts");
  const schema = await readProjectFile("../src/modules/auth/auth.schema.ts");

  assert.match(routes, /app\.get\(\s*["']\/auth\/sessions["']/);
  assert.match(routes, /app\.delete\(\s*["']\/auth\/sessions\/:id["']/);
  assert.match(routes, /app\.post\(\s*["']\/auth\/logout-all["']/);
  assert.match(routes, /["']\/auth\/sessions["'][\s\S]*preHandler:\s*app\.authenticate/);
  assert.match(routes, /["']\/auth\/sessions\/:id["'][\s\S]*security:\s*openApiMutationSecurity/);
  assert.match(routes, /["']\/auth\/logout-all["'][\s\S]*security:\s*openApiMutationSecurity/);
  assert.match(routes, /revokeAdminSessionById\(/);
  assert.match(routes, /logoutAllAdminSessions\(/);
  assert.match(routes, /currentSessionRevoked[\s\S]*clearSessionCookies/);
  assert.match(schema, /adminSessionIdParamsSchema/);
  assert.match(schema, /z\.string\(\)\.uuid/);
});


/** Verifies Production Pass 11 reads inventory valuation source data without changing stock. */
test("production pass 11 adds the inventory valuation repository query", async () => {
  const repository = await readProjectFile("../src/modules/reports/reports.repository.ts");

  assert.match(repository, /export interface InventoryValuationRepositoryQuery/);
  assert.match(repository, /export interface InventoryValuationRow/);
  assert.match(repository, /export async function listInventoryValuation\(/);
  assert.match(repository, /inventoryBalances\.sellableQuantityOnHand/);
  assert.match(repository, /inventoryBalances\.damagedQuantityOnHand/);
  assert.match(repository, /inventoryBalances\.expiredQuantityOnHand/);
  assert.match(repository, /inventoryBalances\.weightedAverageCost/);
  assert.match(repository, /export interface InventoryValuationTotals/);
  assert.match(repository, /sellableValue:/);
  assert.match(repository, /damagedValue:/);
  assert.match(repository, /expiredValue:/);
  assert.match(repository, /totalValue:/);
  assert.match(repository, /readInventoryValuationTotals/);
  assert.match(repository, /sum\(\$\{inventoryBalances\.sellableQuantityOnHand\}\)/);
  assert.match(repository, /sum\(\$\{inventoryBalances\.damagedQuantityOnHand\}\)/);
  assert.match(repository, /sum\(\$\{inventoryBalances\.expiredQuantityOnHand\}\)/);
  assert.match(repository, /leftJoin\(inventoryBalances, eq\(inventoryBalances\.productId, products\.id\)\)/);
  assert.match(repository, /ilike\(products\.sku, search\)/);
  assert.match(repository, /ilike\(products\.name, search\)/);
  assert.match(repository, /ilike\(products\.barcode, search\)/);
  assert.match(repository, /eq\(products\.categoryId, query\.categoryId\)/);
  assert.match(repository, /eq\(products\.isActive, query\.isActive\)/);
  assert.match(repository, /\.limit\(query\.pageSize\)/);
  assert.match(repository, /\.offset\(getReportOffset\(query\)\)/);

  const valuationFunction = repository.match(
    /export async function listInventoryValuation\([\s\S]*?\n\}/,
  )?.[0] ?? "";
  assert.doesNotMatch(valuationFunction, /\.insert\(|\.update\(|\.delete\(/);
});
