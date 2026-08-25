import { Button } from "../../../components/ui/button.tsx";
import { Input } from "../../../components/ui/input.tsx";
import type { ProductCategory } from "../api/products.api.ts";

export interface ProductFilterValues {
  search: string;
  categoryId: string;
  active: "all" | "active" | "inactive";
}

interface ProductFiltersProps {
  values: ProductFilterValues;
  categories: ProductCategory[];
  disabled?: boolean;
  onChange(values: ProductFilterValues): void;
  onApply(): void;
  onReset(): void;
}

/** Renders the filters accepted by the product list API. */
export function ProductFilters({
  values,
  categories,
  disabled = false,
  onChange,
  onApply,
  onReset,
}: ProductFiltersProps): React.JSX.Element {
  /** Updates one product-filter field while preserving the other filters. */
  function changeField(
    field: keyof ProductFilterValues,
    value: string,
  ): void {
    onChange({ ...values, [field]: value });
  }

  /** Handles the submit. */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onApply();
  }

  return (
    <form className="product-filters" onSubmit={handleSubmit}>
      <Input
        id="product-search"
        label="Search product name"
        onChange={(value) => changeField("search", value)}
        value={values.search}
      />

      <label className="ui-field" htmlFor="product-category-filter">
        <span>Category</span>
        <select
          id="product-category-filter"
          onChange={(event) => changeField("categoryId", event.target.value)}
          value={values.categoryId}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <label className="ui-field" htmlFor="product-active-filter">
        <span>Status</span>
        <select
          id="product-active-filter"
          onChange={(event) => changeField("active", event.target.value)}
          value={values.active}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>

      <div className="form-actions product-filter-actions">
        <Button disabled={disabled} label="Apply filters" type="submit" />
        <Button disabled={disabled} label="Reset" onClick={onReset} />
      </div>
    </form>
  );
}
