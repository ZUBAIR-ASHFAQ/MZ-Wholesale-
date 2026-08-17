import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { AppError } from "../../shared/errors/app-error.js";
import {
  createBrand as insertBrand,
  createCategory as insertCategory,
  createProduct as insertProduct,
  createProductUnits,
  findBrandById,
  findBrandByName,
  findCategoryById,
  findCategoryByName,
  findProductByBarcode,
  findProductById,
  findProductBySku,
  listBrands as readBrands,
  listCategories as readCategories,
  listProducts as readProducts,
  updateBrand as saveBrandChanges,
  updateCategory as saveCategoryChanges,
  updateProduct as saveProductChanges,
  updateProductUnit,
  type BrandRecord,
  type PaginatedProductRecords,
  type ProductCategoryRecord,
  type ProductDetailRecord,
  type ProductsDatabase,
  type ProductUnitRecord,
} from "./products.repository.js";
import type {
  CreateBrandInput,
  CreateCategoryInput,
  CreateProductInput,
  ListProductsQuery,
  UpdateBrandInput,
  UpdateCategoryInput,
  UpdateProductInput,
} from "./products.schema.js";

/** Returns a clean optional text value or null. */
function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return value.trim();
}

/** Converts a name to the value used for case-insensitive comparisons. */
function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

/** Creates a stable Product Management business error. */
function productError(
  code: string,
  message: string,
  statusCode = 400,
  field?: string,
): AppError {
  return new AppError(
    code,
    message,
    statusCode,
    field ? [{ field, message }] : undefined,
  );
}

/** Ensures a category exists and is active for a new product assignment. */
async function requireActiveCategory(
  database: ProductsDatabase,
  categoryId: string,
): Promise<ProductCategoryRecord> {
  const category = await findCategoryById(database, categoryId);

  if (!category) {
    throw productError("CATEGORY_NOT_FOUND", "Product category was not found.", 404, "categoryId");
  }

  if (!category.isActive) {
    throw productError("CATEGORY_INACTIVE", "An inactive category cannot be assigned to a new product.", 409, "categoryId");
  }

  return category;
}

/** Ensures an optional brand exists and is active for a new product assignment. */
async function requireActiveBrand(
  database: ProductsDatabase,
  brandId: string | null | undefined,
): Promise<BrandRecord | null> {
  if (!brandId) {
    return null;
  }

  const brand = await findBrandById(database, brandId);

  if (!brand) {
    throw productError("BRAND_NOT_FOUND", "Brand was not found.", 404, "brandId");
  }

  if (!brand.isActive) {
    throw productError("BRAND_INACTIVE", "An inactive brand cannot be assigned to a new product.", 409, "brandId");
  }

  return brand;
}

/** Rejects a SKU already used by another product. */
async function ensureSkuAvailable(
  database: ProductsDatabase,
  sku: string,
  currentProductId?: string,
): Promise<void> {
  const existing = await findProductBySku(database, sku.trim());

  if (existing && existing.id !== currentProductId) {
    throw productError("DUPLICATE_SKU", "SKU is already used by another product.", 409, "sku");
  }
}

/** Rejects a non-null barcode already used by another product. */
async function ensureBarcodeAvailable(
  database: ProductsDatabase,
  barcode: string | null | undefined,
  currentProductId?: string,
): Promise<void> {
  const normalizedBarcode = normalizeOptionalText(barcode);

  if (!normalizedBarcode) {
    return;
  }

  const existing = await findProductByBarcode(database, normalizedBarcode);

  if (existing && existing.id !== currentProductId) {
    throw productError("DUPLICATE_BARCODE", "Barcode is already used by another product.", 409, "barcode");
  }
}

/** Returns a newly saved product or throws when the insert unexpectedly fails. */
async function requireCreatedProduct(
  database: ProductsDatabase,
  input: CreateProductInput,
): Promise<ProductDetailRecord> {
  const product = await insertProduct(database, {
    sku: input.sku.trim(),
    barcode: normalizeOptionalText(input.barcode),
    name: input.name.trim(),
    categoryId: input.categoryId,
    brandId: input.brandId ?? null,
    reorderLevel: input.reorderLevel,
    referencePurchasePrice: input.referencePurchasePrice ?? null,
    referenceSalePrice: input.referenceSalePrice ?? null,
  });

  if (!product) {
    throw productError("PRODUCT_CREATE_FAILED", "Product could not be created.", 500);
  }

  await createProductUnits(database, [
    {
      productId: product.id,
      unitName: input.baseUnitName.trim(),
      conversionToBase: "1.000",
      isBaseUnit: true,
    },
    ...input.units.map((unit) => ({
      productId: product.id,
      unitName: unit.unitName.trim(),
      conversionToBase: unit.conversionToBase,
      isBaseUnit: false,
      isActive: unit.isActive,
    })),
  ]);

  const detail = await findProductById(database, product.id);

  if (!detail) {
    throw productError("PRODUCT_CREATE_FAILED", "Created product could not be loaded.", 500);
  }

  return detail;
}

/** Finds the saved base unit and fails if the database invariant is broken. */
function requireBaseUnit(units: ProductUnitRecord[]): ProductUnitRecord {
  const baseUnit = units.find((unit) => unit.isBaseUnit);

  if (!baseUnit) {
    throw productError("PRODUCT_BASE_UNIT_MISSING", "Product base unit is missing.", 500);
  }

  return baseUnit;
}

/** Updates submitted units and deactivates omitted non-base units. */
async function saveSubmittedUnits(
  database: ProductsDatabase,
  productId: string,
  existingUnits: ProductUnitRecord[],
  input: UpdateProductInput,
): Promise<void> {
  const baseUnit = requireBaseUnit(existingUnits);
  const baseUnitName = input.baseUnitName?.trim();

  if (baseUnitName && baseUnitName !== baseUnit.unitName) {
    const updated = await updateProductUnit(database, productId, baseUnit.id, {
      unitName: baseUnitName,
      conversionToBase: "1.000",
      isActive: true,
    });

    if (!updated) {
      throw productError("PRODUCT_UNIT_UPDATE_FAILED", "Base unit could not be updated.", 500);
    }
  }

  if (!input.units) {
    return;
  }

  const refreshedBaseName = baseUnitName ?? baseUnit.unitName;
  const existingUnitsById = new Map(
    existingUnits
      .filter((unit) => !unit.isBaseUnit)
      .map((unit) => [unit.id, unit]),
  );
  const submittedUnitIds = new Set<string>();
  const newUnits = [];

  for (const unitInput of input.units) {
    if (normalizeName(unitInput.unitName) === normalizeName(refreshedBaseName)) {
      throw productError(
        "INVALID_UNIT_CONVERSION",
        "An additional unit cannot repeat the base unit name.",
        400,
        "units",
      );
    }

    if (unitInput.id) {
      const existingUnit = existingUnitsById.get(unitInput.id);

      if (!existingUnit) {
        throw productError(
          "PRODUCT_UNIT_NOT_FOUND",
          "Product unit does not belong to this product.",
          404,
          "units",
        );
      }

      submittedUnitIds.add(existingUnit.id);
      const updated = await updateProductUnit(
        database,
        productId,
        existingUnit.id,
        {
          unitName: unitInput.unitName.trim(),
          conversionToBase: unitInput.conversionToBase,
          isActive: unitInput.isActive,
        },
      );

      if (!updated) {
        throw productError("PRODUCT_UNIT_UPDATE_FAILED", "Product unit could not be updated.", 500);
      }

      continue;
    }

    newUnits.push({
      productId,
      unitName: unitInput.unitName.trim(),
      conversionToBase: unitInput.conversionToBase,
      isBaseUnit: false,
      isActive: unitInput.isActive,
    });
  }

  for (const existingUnit of existingUnitsById.values()) {
    if (submittedUnitIds.has(existingUnit.id) || !existingUnit.isActive) {
      continue;
    }

    const deactivated = await updateProductUnit(
      database,
      productId,
      existingUnit.id,
      { isActive: false },
    );

    if (!deactivated) {
      throw productError("PRODUCT_UNIT_UPDATE_FAILED", "Product unit could not be deactivated.", 500);
    }
  }

  await createProductUnits(database, newUnits);
}

/** Lists products using the approved filters and pagination. */
export async function listProducts(
  database: ProductsDatabase,
  query: ListProductsQuery,
): Promise<PaginatedProductRecords> {
  return readProducts(database, query);
}

/** Loads one product with its category, brand and units. */
export async function getProduct(
  database: ProductsDatabase,
  productId: string,
): Promise<ProductDetailRecord> {
  const product = await findProductById(database, productId);

  if (!product) {
    throw productError("PRODUCT_NOT_FOUND", "Product was not found.", 404);
  }

  return product;
}

/** Creates a product and all of its units in one database transaction. */
export async function createProduct(
  database: NodePgDatabase,
  input: CreateProductInput,
): Promise<ProductDetailRecord> {
  return database.transaction(async (transaction) => {
    await ensureSkuAvailable(transaction, input.sku);
    await ensureBarcodeAvailable(transaction, input.barcode);
    await requireActiveCategory(transaction, input.categoryId);
    await requireActiveBrand(transaction, input.brandId);
    return requireCreatedProduct(transaction, input);
  });
}

/** Updates allowed product fields and submitted units in one transaction. */
export async function updateProduct(
  database: NodePgDatabase,
  productId: string,
  input: UpdateProductInput,
): Promise<ProductDetailRecord> {
  return database.transaction(async (transaction) => {
    const current = await findProductById(transaction, productId);

    if (!current) {
      throw productError("PRODUCT_NOT_FOUND", "Product was not found.", 404);
    }

    if (input.sku !== undefined) {
      await ensureSkuAvailable(transaction, input.sku, productId);
    }

    if (input.barcode !== undefined) {
      await ensureBarcodeAvailable(transaction, input.barcode, productId);
    }

    if (input.categoryId !== undefined && input.categoryId !== current.categoryId) {
      await requireActiveCategory(transaction, input.categoryId);
    }

    if (input.brandId !== undefined && input.brandId !== current.brandId) {
      await requireActiveBrand(transaction, input.brandId);
    }

    const productChanges = { ...input };
    delete productChanges.units;
    delete productChanges.baseUnitName;

    const saved = await saveProductChanges(transaction, productId, {
      ...productChanges,
      sku: productChanges.sku?.trim(),
      barcode:
        productChanges.barcode === undefined
          ? undefined
          : normalizeOptionalText(productChanges.barcode),
      name: productChanges.name?.trim(),
      brandId: productChanges.brandId === undefined ? undefined : productChanges.brandId,
    });

    if (!saved) {
      throw productError("PRODUCT_UPDATE_FAILED", "Product could not be updated.", 500);
    }

    await saveSubmittedUnits(transaction, productId, current.units, input);

    const updated = await findProductById(transaction, productId);

    if (!updated) {
      throw productError("PRODUCT_NOT_FOUND", "Updated product could not be loaded.", 500);
    }

    return updated;
  });
}

/** Lists all categories in stable name order. */
export async function listCategories(
  database: ProductsDatabase,
): Promise<ProductCategoryRecord[]> {
  return readCategories(database);
}

/** Creates one category after checking its normalized name. */
export async function createCategory(
  database: ProductsDatabase,
  input: CreateCategoryInput,
): Promise<ProductCategoryRecord> {
  const existing = await findCategoryByName(database, input.name);

  if (existing) {
    throw productError("DUPLICATE_CATEGORY_NAME", "Category name already exists.", 409, "name");
  }

  const category = await insertCategory(database, { name: input.name.trim() });

  if (!category) {
    throw productError("CATEGORY_CREATE_FAILED", "Category could not be created.", 500);
  }

  return category;
}

/** Renames or activates/deactivates one category. */
export async function updateCategory(
  database: ProductsDatabase,
  categoryId: string,
  input: UpdateCategoryInput,
): Promise<ProductCategoryRecord> {
  const current = await findCategoryById(database, categoryId);

  if (!current) {
    throw productError("CATEGORY_NOT_FOUND", "Product category was not found.", 404);
  }

  if (input.name !== undefined) {
    const duplicate = await findCategoryByName(database, input.name);

    if (duplicate && duplicate.id !== categoryId) {
      throw productError("DUPLICATE_CATEGORY_NAME", "Category name already exists.", 409, "name");
    }
  }

  const category = await saveCategoryChanges(database, categoryId, {
    ...input,
    name: input.name?.trim(),
  });

  if (!category) {
    throw productError("CATEGORY_UPDATE_FAILED", "Category could not be updated.", 500);
  }

  return category;
}

/** Lists all brands in stable name order. */
export async function listBrands(database: ProductsDatabase): Promise<BrandRecord[]> {
  return readBrands(database);
}

/** Creates one brand after checking its normalized name. */
export async function createBrand(
  database: ProductsDatabase,
  input: CreateBrandInput,
): Promise<BrandRecord> {
  const existing = await findBrandByName(database, input.name);

  if (existing) {
    throw productError("DUPLICATE_BRAND_NAME", "Brand name already exists.", 409, "name");
  }

  const brand = await insertBrand(database, { name: input.name.trim() });

  if (!brand) {
    throw productError("BRAND_CREATE_FAILED", "Brand could not be created.", 500);
  }

  return brand;
}

/** Renames or activates/deactivates one brand. */
export async function updateBrand(
  database: ProductsDatabase,
  brandId: string,
  input: UpdateBrandInput,
): Promise<BrandRecord> {
  const current = await findBrandById(database, brandId);

  if (!current) {
    throw productError("BRAND_NOT_FOUND", "Brand was not found.", 404);
  }

  if (input.name !== undefined) {
    const duplicate = await findBrandByName(database, input.name);

    if (duplicate && duplicate.id !== brandId) {
      throw productError("DUPLICATE_BRAND_NAME", "Brand name already exists.", 409, "name");
    }
  }

  const brand = await saveBrandChanges(database, brandId, {
    ...input,
    name: input.name?.trim(),
  });

  if (!brand) {
    throw productError("BRAND_UPDATE_FAILED", "Brand could not be updated.", 500);
  }

  return brand;
}
