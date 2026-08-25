import { useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { Dialog } from "../../../components/ui/dialog.tsx";
import type { ProductListFilters } from "../api/products.api.ts";
import {
  ProductFilters,
  type ProductFilterValues,
} from "../components/product-filters.tsx";
import { ProductForm } from "../components/product-form.tsx";
import { ProductTable } from "../components/product-table.tsx";
import {
  useProductCategories,
  useProducts,
} from "../hooks/use-products.ts";
import { ProductSettingsPage } from "./product-settings-page.tsx";

const pageSize = 20;

const emptyFilters: ProductFilterValues = {
  search: "",
  categoryId: "",
  active: "all",
};

/** Converts visible form values to the API filter contract. */
function apiFilters(
  values: ProductFilterValues,
  page: number,
): ProductListFilters {
  return {
    search: values.search || undefined,
    categoryId: values.categoryId || undefined,
    active:
      values.active === "all" ? undefined : values.active === "active",
    page,
    pageSize,
  };
}

/** Shows the searchable and paginated product catalogue. */
export function ProductListPage(): React.JSX.Element {
  const [draftFilters, setDraftFilters] =
    useState<ProductFilterValues>(emptyFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<ProductFilterValues>(emptyFilters);
  const [page, setPage] = useState(1);
  const [activeModal, setActiveModal] =
    useState<"product" | "categories" | "brands" | null>(null);

  const productsQuery = useProducts(apiFilters(appliedFilters, page));
  const categoriesQuery = useProductCategories();
  const categories = categoriesQuery.data?.data ?? [];
  const result = productsQuery.data?.data;
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  /** Applies the filters. */
  function applyFilters(): void {
    setAppliedFilters(draftFilters);
    setPage(1);
  }

  /** Restores the product filters to their default values. */
  function resetFilters(): void {
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setPage(1);
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Product Management</p>
          <h1>Products</h1>
          <p>Search, review, and maintain the wholesale product catalogue.</p>
        </div>
        <div className="form-actions">
          <Button
            label="Add product"
            onClick={() => setActiveModal("product")}
          />
          <Button
            label="Categories"
            onClick={() => setActiveModal("categories")}
          />
          <Button
            label="Brands"
            onClick={() => setActiveModal("brands")}
          />
        </div>
      </div>

      <Dialog
        isOpen={activeModal === "product"}
        onClose={() => setActiveModal(null)}
        title="Add product"
        wide
      >
        <div className="product-modal-content">
          <ProductForm
            onCancel={() => setActiveModal(null)}
            onSaved={() => setActiveModal(null)}
          />
        </div>
      </Dialog>

      <Dialog
        isOpen={activeModal === "categories"}
        onClose={() => setActiveModal(null)}
        title="Categories"
        wide
      >
        <ProductSettingsPage section="categories" />
      </Dialog>

      <Dialog
        isOpen={activeModal === "brands"}
        onClose={() => setActiveModal(null)}
        title="Brands"
        wide
      >
        <ProductSettingsPage section="brands" />
      </Dialog>

      <section className="management-card product-list-card">
        <ProductFilters
          categories={categories}
          disabled={productsQuery.isFetching}
          onApply={applyFilters}
          onChange={setDraftFilters}
          onReset={resetFilters}
          values={draftFilters}
        />

        {productsQuery.isPending ? <p>Loading products...</p> : null}
        {productsQuery.isError ? (
          <p className="error-message">Could not load products.</p>
        ) : null}

        {result ? <ProductTable products={result.items} /> : null}

        {result ? (
          <div className="pagination-row">
            <p>
              Page {page} of {totalPages} · {result.total} products
            </p>
            <div className="form-actions">
              <Button
                disabled={page <= 1 || productsQuery.isFetching}
                label="Previous"
                onClick={() => setPage((current) => current - 1)}
              />
              <Button
                disabled={page >= totalPages || productsQuery.isFetching}
                label="Next"
                onClick={() => setPage((current) => current + 1)}
              />
            </div>
          </div>
        ) : null}
      </section>
    </section>
  );
}
