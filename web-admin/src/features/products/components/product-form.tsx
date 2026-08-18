import { useState, type FormEvent } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import type {
  CreateProductInput,
  ProductDetail,
  ProductUnitInput,
  UpdateProductInput,
} from "../api/products.api.ts";
import {
  useBrands,
  useCreateProduct,
  useProductCategories,
  useUpdateProduct,
} from "../hooks/use-products.ts";

interface ProductFormProps {
  product?: ProductDetail;
  onSaved?(product: ProductDetail): void;
  onCancel?(): void;
}

interface UnitRow extends ProductUnitInput {
  rowId: string;
  isExisting: boolean;
}

interface FormErrors {
  [field: string]: string | undefined;
}

const quantityPattern = /^\d+(\.\d{1,3})?$/;
const moneyPattern = /^\d+(\.\d{1,2})?$/;

const baseUnitGroups = [
  {
    label: "Count and packaging",
    units: [
      "Piece",
      "Pair",
      "Set",
      "Dozen",
      "Pack",
      "Box",
      "Carton",
      "Bundle",
      "Tray",
      "Bag",
      "Sack",
      "Bottle",
      "Can",
      "Roll",
    ],
  },
  {
    label: "Weight",
    units: ["Gram", "Kilogram"],
  },
  {
    label: "Volume",
    units: ["Milliliter", "Liter"],
  },
  {
    label: "Length",
    units: ["Centimeter", "Meter"],
  },
] as const;

const knownBaseUnitNames = new Set<string>(
  baseUnitGroups.flatMap((group) => group.units),
);

/** Creates the initial additional-unit rows for create or edit mode. */
function createInitialUnits(product?: ProductDetail): UnitRow[] {
  if (!product) {
    return [];
  }

  return product.units
    .filter((unit) => !unit.isBaseUnit)
    .map((unit) => ({
      id: unit.id,
      rowId: unit.id,
      unitName: unit.unitName,
      conversionToBase: unit.conversionToBase,
      isActive: unit.isActive,
      isExisting: true,
    }));
}

/** Returns an optional text value as null when the input is blank. */
function optionalText(value: string): string | null {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

/** Builds a stable temporary ID for a new unit row. */
function newRowId(): string {
  return `new-unit-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Displays the API error beside the most useful form field. */
function apiErrors(error: unknown): FormErrors {
  if (!(error instanceof ApiError)) {
    return { form: "The product could not be saved." };
  }

  const errors: FormErrors = { form: error.message };

  for (const fieldError of error.fieldErrors) {
    errors[fieldError.field] = fieldError.message;
  }

  if (error.code === "CATEGORY_INACTIVE") {
    errors.categoryId = error.message;
  }

  if (error.code === "BRAND_INACTIVE") {
    errors.brandId = error.message;
  }

  if (error.code === "INVALID_UNIT_CONVERSION") {
    errors.units = error.message;
  }

  return errors;
}

/** Renders the create/edit form for one product and its allowed units. */
export function ProductForm({
  product,
  onSaved,
  onCancel,
}: ProductFormProps): React.JSX.Element {
  const categoriesQuery = useProductCategories();
  const brandsQuery = useBrands();
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const isEditing = Boolean(product);

  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [brandId, setBrandId] = useState(product?.brandId ?? "");
  const [baseUnitName, setBaseUnitName] = useState(
    product?.baseUnitName ?? "",
  );
  const [reorderLevel, setReorderLevel] = useState(
    product?.reorderLevel ?? "",
  );
  const [referencePurchasePrice, setReferencePurchasePrice] = useState(
    product?.referencePurchasePrice ?? "",
  );
  const [referenceSalePrice, setReferenceSalePrice] = useState(
    product?.referenceSalePrice ?? "",
  );
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [units, setUnits] = useState<UnitRow[]>(createInitialUnits(product));
  const [errors, setErrors] = useState<FormErrors>({});

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const categories = categoriesQuery.data?.data ?? [];
  const brands = brandsQuery.data?.data ?? [];

  /** Adds one empty additional-unit row. */
  function addUnit(): void {
    setUnits((current) => [
      ...current,
      {
        rowId: newRowId(),
        unitName: "",
        conversionToBase: "",
        isActive: true,
        isExisting: false,
      },
    ]);
  }

  /** Changes one field in an additional-unit row. */
  function updateUnit(
    rowId: string,
    field: "unitName" | "conversionToBase" | "isActive",
    value: string | boolean,
  ): void {
    setUnits((current) =>
      current.map((unit) =>
        unit.rowId === rowId ? { ...unit, [field]: value } : unit,
      ),
    );
  }

  /** Removes a unit from the submitted list so saved units become inactive. */
  function removeUnit(rowId: string): void {
    setUnits((current) => current.filter((unit) => unit.rowId !== rowId));
  }

  /** Validates the simple product rules before calling the API. */
  function validate(): FormErrors {
    const nextErrors: FormErrors = {};

    if (!name.trim()) nextErrors.name = "Product name is required.";
    if (!categoryId) nextErrors.categoryId = "Category is required.";
    if (!baseUnitName.trim()) {
      nextErrors.baseUnitName = "Base unit is required.";
    }

    if (
      reorderLevel.trim() &&
      !quantityPattern.test(reorderLevel.trim())
    ) {
      nextErrors.reorderLevel =
        "Reorder level must be a non-negative number with up to 3 decimals.";
    }

    if (
      referencePurchasePrice.trim() &&
      !moneyPattern.test(referencePurchasePrice.trim())
    ) {
      nextErrors.referencePurchasePrice =
        "Reference purchase price must have up to 2 decimals.";
    }

    if (
      referenceSalePrice.trim() &&
      !moneyPattern.test(referenceSalePrice.trim())
    ) {
      nextErrors.referenceSalePrice =
        "Reference sale price must have up to 2 decimals.";
    }

    const usedNames = new Set([baseUnitName.trim().toLowerCase()]);

    for (let index = 0; index < units.length; index += 1) {
      const unit = units[index];
      const unitName = unit.unitName.trim().toLowerCase();

      if (!unitName) {
        nextErrors[`units.${index}.unitName`] = "Unit name is required.";
      } else if (usedNames.has(unitName)) {
        nextErrors[`units.${index}.unitName`] =
          "Unit name must be different from the base and other units.";
      }

      usedNames.add(unitName);

      if (
        !quantityPattern.test(unit.conversionToBase.trim()) ||
        Number(unit.conversionToBase) <= 0
      ) {
        nextErrors[`units.${index}.conversionToBase`] =
          "Conversion must be greater than zero with up to 3 decimals.";
      }
    }

    return nextErrors;
  }

  /** Converts form state to the API product input. */
  function buildInput(): CreateProductInput {
    return {
      name: name.trim(),
      categoryId,
      brandId: brandId || null,
      baseUnitName: baseUnitName.trim(),
      ...(reorderLevel.trim() ? { reorderLevel: reorderLevel.trim() } : {}),
      referencePurchasePrice: optionalText(referencePurchasePrice),
      referenceSalePrice: optionalText(referenceSalePrice),
      units: units.map((unit) => ({
        id: unit.id,
        unitName: unit.unitName.trim(),
        conversionToBase: unit.conversionToBase.trim(),
        isActive: unit.isActive,
      })),
    };
  }

  /** Saves a new product or updates the current product. */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const validationErrors = validate();
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    try {
      const input = buildInput();
      const response = product
        ? await updateMutation.mutateAsync({
            productId: product.id,
            input: { ...input, isActive } satisfies UpdateProductInput,
          })
        : await createMutation.mutateAsync(input);

      setErrors({});
      onSaved?.(response.data);
    } catch (error) {
      setErrors(apiErrors(error));
    }
  }

  if (categoriesQuery.isPending || brandsQuery.isPending) {
    return <p>Loading product form...</p>;
  }

  if (categoriesQuery.isError || brandsQuery.isError) {
    return (
      <p className="error-message">
        Categories and brands could not be loaded.
      </p>
    );
  }

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      <section className="management-card">
        <div>
          <p className="eyebrow">Product information</p>
          <h2>{isEditing ? "Edit product" : "Create product"}</h2>
        </div>

        {errors.form ? (
          <p className="error-message form-message">{errors.form}</p>
        ) : null}

        <div className="product-form-grid">
          <label className="ui-field" htmlFor="product-name">
            <span>Product name</span>
            <input
              id="product-name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
            {errors.name ? <small className="error-message">{errors.name}</small> : null}
          </label>

          <label className="ui-field" htmlFor="product-category">
            <span>Category</span>
            <select
              id="product-category"
              onChange={(event) => setCategoryId(event.target.value)}
              value={categoryId}
            >
              <option value="">Select category</option>
              {categories
                .filter((category) => category.isActive || category.id === categoryId)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}{category.isActive ? "" : " (inactive)"}
                  </option>
                ))}
            </select>
            {errors.categoryId ? (
              <small className="error-message">{errors.categoryId}</small>
            ) : null}
          </label>

          <label className="ui-field" htmlFor="product-brand">
            <span>Brand (optional)</span>
            <select
              id="product-brand"
              onChange={(event) => setBrandId(event.target.value)}
              value={brandId}
            >
              <option value="">No brand</option>
              {brands
                .filter((brand) => brand.isActive || brand.id === brandId)
                .map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}{brand.isActive ? "" : " (inactive)"}
                  </option>
                ))}
            </select>
            {errors.brandId ? (
              <small className="error-message">{errors.brandId}</small>
            ) : null}
          </label>

          <label className="ui-field" htmlFor="product-base-unit">
            <span>Base stock unit</span>
            <select
              id="product-base-unit"
              onChange={(event) => setBaseUnitName(event.target.value)}
              value={baseUnitName}
            >
              <option value="">Select measuring unit</option>
              {baseUnitName && !knownBaseUnitNames.has(baseUnitName) ? (
                <option value={baseUnitName}>{baseUnitName}</option>
              ) : null}
              {baseUnitGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.units.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {errors.baseUnitName ? (
              <small className="error-message">{errors.baseUnitName}</small>
            ) : null}
          </label>

          <label className="ui-field" htmlFor="product-reorder-level">
            <span>Reorder level</span>
            <input
              id="product-reorder-level"
              inputMode="decimal"
              onChange={(event) => setReorderLevel(event.target.value)}
              placeholder="Enter reorder level"
              value={reorderLevel}
            />
            {errors.reorderLevel ? (
              <small className="error-message">{errors.reorderLevel}</small>
            ) : null}
          </label>

          <label className="ui-field" htmlFor="product-purchase-price">
            <span>Reference purchase price (optional)</span>
            <input
              id="product-purchase-price"
              inputMode="decimal"
              onChange={(event) => setReferencePurchasePrice(event.target.value)}
              value={referencePurchasePrice}
            />
            {errors.referencePurchasePrice ? (
              <small className="error-message">
                {errors.referencePurchasePrice}
              </small>
            ) : null}
          </label>

          <label className="ui-field" htmlFor="product-sale-price">
            <span>Reference sale price (optional)</span>
            <input
              id="product-sale-price"
              inputMode="decimal"
              onChange={(event) => setReferenceSalePrice(event.target.value)}
              value={referenceSalePrice}
            />
            {errors.referenceSalePrice ? (
              <small className="error-message">{errors.referenceSalePrice}</small>
            ) : null}
          </label>

          {isEditing ? (
            <label className="product-checkbox product-form-wide">
              <input
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
                type="checkbox"
              />
              <span>Product is active</span>
            </label>
          ) : null}
        </div>
      </section>

      <section className="management-card">
        <div className="product-section-heading">
          <div>
            <p className="eyebrow">Unit conversions</p>
            <h2>Additional units</h2>
          </div>
          <Button label="Add unit" onClick={addUnit} />
        </div>

        <p className="form-message">
          Example: when the base unit is Piece, Box can equal 12.000 pieces.
        </p>

        {errors.units ? (
          <p className="error-message form-message">{errors.units}</p>
        ) : null}

        {units.length === 0 ? (
          <p>No additional units added.</p>
        ) : (
          <div className="product-unit-list">
            {units.map((unit, index) => (
              <div className="product-unit-row" key={unit.rowId}>
                <label className="ui-field">
                  <span>Unit name</span>
                  <input
                    onChange={(event) =>
                      updateUnit(unit.rowId, "unitName", event.target.value)
                    }
                    value={unit.unitName}
                  />
                  {errors[`units.${index}.unitName`] ? (
                    <small className="error-message">
                      {errors[`units.${index}.unitName`]}
                    </small>
                  ) : null}
                </label>

                <label className="ui-field">
                  <span>Conversion to base</span>
                  <input
                    inputMode="decimal"
                    onChange={(event) =>
                      updateUnit(
                        unit.rowId,
                        "conversionToBase",
                        event.target.value,
                      )
                    }
                    value={unit.conversionToBase}
                  />
                  {errors[`units.${index}.conversionToBase`] ? (
                    <small className="error-message">
                      {errors[`units.${index}.conversionToBase`]}
                    </small>
                  ) : null}
                </label>

                <label className="product-checkbox">
                  <input
                    checked={unit.isActive}
                    onChange={(event) =>
                      updateUnit(unit.rowId, "isActive", event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>Unit is active</span>
                </label>

                <Button
                  label={unit.isExisting ? "Deactivate" : "Remove"}
                  onClick={() => removeUnit(unit.rowId)}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="form-actions">
        <Button
          disabled={isSaving}
          label={isSaving ? "Saving..." : isEditing ? "Save changes" : "Create product"}
          type="submit"
        />
        {onCancel ? (
          <Button disabled={isSaving} label="Cancel" onClick={onCancel} />
        ) : null}
      </div>
    </form>
  );
}
