import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repositoryPath = new URL(
  "../src/modules/products/products.repository.ts",
  import.meta.url,
);

/** Reads the Product repository source used by these focused query-contract tests. */
async function readProductRepository(): Promise<string> {
  return readFile(repositoryPath, "utf8");
}

/** Verifies that product units are ordered with the base unit before other units. */
test("product units place the base unit first", async () => {
  const source = await readProductRepository();

  assert.match(
    source,
    /orderBy\(\s*desc\(productUnits\.isBaseUnit\),\s*asc\(productUnits\.unitName\),\s*asc\(productUnits\.id\),\s*\)/,
  );
});

/** Verifies that unique product business keys use exact normalized equality. */
test("product unique lookups do not use pattern matching", async () => {
  const source = await readProductRepository();

  assert.match(source, /lower\(trim\(\$\{products\.sku\}\)\)/);
  assert.match(source, /lower\(trim\(\$\{productCategories\.name\}\)\)/);
  assert.match(source, /lower\(trim\(\$\{brands\.name\}\)\)/);
  assert.doesNotMatch(source, /where\(ilike\(products\.sku/);
  assert.doesNotMatch(source, /where\(ilike\(productCategories\.name/);
  assert.doesNotMatch(source, /where\(ilike\(brands\.name/);
});

const productSchemaPath = new URL(
  "../src/database/schema/product.schema.ts",
  import.meta.url,
);

const productMigrationPath = new URL(
  "../drizzle/0004_product_unit_source_of_truth.sql",
  import.meta.url,
);

/** Reads the Product database schema used by source-of-truth tests. */
async function readProductSchema(): Promise<string> {
  return readFile(productSchemaPath, "utf8");
}

/** Reads the reviewed migration that removes the duplicated base-unit field. */
async function readProductUnitMigration(): Promise<string> {
  return readFile(productMigrationPath, "utf8");
}

/** Verifies that the base-unit name is read from product_units instead of products. */
test("product units are the base-unit source of truth", async () => {
  const repository = await readProductRepository();
  const schema = await readProductSchema();
  const migration = await readProductUnitMigration();

  assert.match(repository, /baseUnitName:\s*productUnits\.unitName/);
  assert.doesNotMatch(repository, /baseUnitName:\s*products\.baseUnitName/);
  assert.doesNotMatch(schema, /baseUnitName:\s*varchar\("base_unit_name"/);
  assert.match(migration, /DROP COLUMN "base_unit_name"/);
});

/** Verifies that units support safe deactivation while the base unit stays active. */
test("product units include active-state protection", async () => {
  const schema = await readProductSchema();

  assert.match(schema, /isActive:\s*boolean\("is_active"\)\.default\(true\)\.notNull\(\)/);
  assert.match(schema, /product_units_base_active_check/);
});

const productServicePath = new URL(
  "../src/modules/products/products.service.ts",
  import.meta.url,
);

const productValidationPath = new URL(
  "../src/modules/products/products.schema.ts",
  import.meta.url,
);

/** Reads the Product service used by unit-update workflow tests. */
async function readProductService(): Promise<string> {
  return readFile(productServicePath, "utf8");
}

/** Reads the Product request schemas used by unit-update validation tests. */
async function readProductValidation(): Promise<string> {
  return readFile(productValidationPath, "utf8");
}

/** Verifies that saved units are updated by UUID and scoped to their product. */
test("product units update by UUID within the owning product", async () => {
  const repository = await readProductRepository();
  const service = await readProductService();

  assert.match(repository, /eq\(productUnits\.id, unitId\)/);
  assert.match(repository, /eq\(productUnits\.productId, productId\)/);
  assert.match(service, /existingUnitsById\.get\(unitInput\.id\)/);
  assert.match(service, /PRODUCT_UNIT_NOT_FOUND/);
});

/** Verifies that omitted saved units are deactivated instead of deleted. */
test("omitted product units are safely deactivated", async () => {
  const service = await readProductService();

  assert.match(service, /submittedUnitIds/);
  assert.match(service, /\{ isActive: false \}/);
  assert.doesNotMatch(service, /delete\(productUnits\)/);
});

/** Verifies that product-unit input accepts active status and rejects repeated IDs. */
test("product unit input validates active status and repeated IDs", async () => {
  const validation = await readProductValidation();

  assert.match(validation, /isActive:\s*z\.boolean\(\)\.default\(true\)/);
  assert.match(validation, /validateUniqueUnitIds/);
  assert.match(validation, /Product unit appears more than once/);
});
