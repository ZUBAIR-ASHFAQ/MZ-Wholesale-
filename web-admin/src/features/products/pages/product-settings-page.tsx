import { useState } from "react";

import { ApiError } from "../../../lib/api-types.ts";
import type { Brand, ProductCategory } from "../api/products.api.ts";
import { BrandForm } from "../components/brand-form.tsx";
import { BrandTable } from "../components/brand-table.tsx";
import { CategoryForm } from "../components/category-form.tsx";
import { CategoryTable } from "../components/category-table.tsx";
import {
  useBrands,
  useProductCategories,
  useUpdateBrand,
  useUpdateProductCategory,
} from "../hooks/use-products.ts";

type ProductSettingsSection = "all" | "categories" | "brands";

interface ProductSettingsPageProps {
  section?: ProductSettingsSection;
}

/** Lets the admin manage the categories and brands used by products. */
export function ProductSettingsPage({
  section = "all",
}: ProductSettingsPageProps): React.JSX.Element {
  const categoriesQuery = useProductCategories();
  const brandsQuery = useBrands();
  const updateCategory = useUpdateProductCategory();
  const updateBrand = useUpdateBrand();
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [pageError, setPageError] = useState("");
  const [changingCategoryId, setChangingCategoryId] = useState<string | null>(null);
  const [changingBrandId, setChangingBrandId] = useState<string | null>(null);

  /** Returns a readable API message for a page-level action. */
  function readError(error: unknown): string {
    if (error instanceof ApiError) {
      return error.message;
    }

    return "The change could not be saved.";
  }

  /** Activates or deactivates one category after confirmation. */
  async function toggleCategory(category: ProductCategory): Promise<void> {
    if (category.isActive && !window.confirm(`Deactivate ${category.name}?`)) {
      return;
    }

    setPageError("");
    setChangingCategoryId(category.id);

    try {
      await updateCategory.mutateAsync({
        categoryId: category.id,
        input: { isActive: !category.isActive },
      });
    } catch (error) {
      setPageError(readError(error));
    } finally {
      setChangingCategoryId(null);
    }
  }

  /** Activates or deactivates one brand after confirmation. */
  async function toggleBrand(brand: Brand): Promise<void> {
    if (brand.isActive && !window.confirm(`Deactivate ${brand.name}?`)) {
      return;
    }

    setPageError("");
    setChangingBrandId(brand.id);

    try {
      await updateBrand.mutateAsync({
        brandId: brand.id,
        input: { isActive: !brand.isActive },
      });
    } catch (error) {
      setPageError(readError(error));
    } finally {
      setChangingBrandId(null);
    }
  }

  const showCategories = section !== "brands";
  const showBrands = section !== "categories";
  const isSingleSection = section !== "all";

  return (
    <section className={`product-settings-page${isSingleSection ? " product-settings-page-single" : ""}`}>
      {section === "all" ? (
        <>
          <p className="eyebrow">Product Management</p>
          <h1>Categories and brands</h1>
          <p>Create, rename, activate, or deactivate the values used by products.</p>
        </>
      ) : null}

      {pageError ? <p className="error-message">{pageError}</p> : null}

      <div className="management-grid">
        {showCategories ? (
        <section className="management-card">
          <CategoryForm
            category={editingCategory}
            onFinished={() => setEditingCategory(null)}
          />
          <h2>Categories</h2>
          {categoriesQuery.isPending ? <p>Loading categories...</p> : null}
          {categoriesQuery.isError ? (
            <p className="error-message">Could not load categories.</p>
          ) : null}
          {categoriesQuery.data ? (
            <CategoryTable
              categories={categoriesQuery.data.data}
              changingCategoryId={changingCategoryId}
              onEdit={setEditingCategory}
              onToggleActive={toggleCategory}
            />
          ) : null}
        </section>
        ) : null}

        {showBrands ? (
        <section className="management-card">
          <BrandForm
            brand={editingBrand}
            onFinished={() => setEditingBrand(null)}
          />
          <h2>Brands</h2>
          {brandsQuery.isPending ? <p>Loading brands...</p> : null}
          {brandsQuery.isError ? (
            <p className="error-message">Could not load brands.</p>
          ) : null}
          {brandsQuery.data ? (
            <BrandTable
              brands={brandsQuery.data.data}
              changingBrandId={changingBrandId}
              onEdit={setEditingBrand}
              onToggleActive={toggleBrand}
            />
          ) : null}
        </section>
        ) : null}
      </div>
    </section>
  );
}
