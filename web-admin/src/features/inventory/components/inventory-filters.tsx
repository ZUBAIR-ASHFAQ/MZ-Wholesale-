import { Button } from "../../../components/ui/button.tsx";
import { Input } from "../../../components/ui/input.tsx";

export interface InventoryFilterValues {
  search: string;
  lowStock: boolean;
}

interface InventoryFiltersProps {
  values: InventoryFilterValues;
  disabled?: boolean;
  onChange(values: InventoryFilterValues): void;
  onApply(): void;
  onReset(): void;
}

/** Renders current-stock search and low-stock filters. */
export function InventoryFilters({
  values,
  disabled = false,
  onChange,
  onApply,
  onReset,
}: InventoryFiltersProps): React.JSX.Element {
  /** Applies the visible filter values without reloading the page. */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onApply();
  }

  return (
    <form className="inventory-filters" onSubmit={handleSubmit}>
      <Input
        id="inventory-search"
        label="Search product, SKU, barcode, category, or brand"
        onChange={(search) => onChange({ ...values, search })}
        value={values.search}
      />

      <label className="product-checkbox" htmlFor="inventory-low-stock">
        <input
          checked={values.lowStock}
          id="inventory-low-stock"
          onChange={(event) =>
            onChange({ ...values, lowStock: event.target.checked })
          }
          type="checkbox"
        />
        Show low stock only
      </label>

      <div className="form-actions inventory-filter-actions">
        <Button disabled={disabled} label="Apply filters" type="submit" />
        <Button disabled={disabled} label="Reset" onClick={onReset} />
      </div>
    </form>
  );
}
