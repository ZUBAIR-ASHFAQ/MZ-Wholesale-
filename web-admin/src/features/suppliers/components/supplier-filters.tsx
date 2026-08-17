/** Values controlled by the supplier list filter form. */
export interface SupplierFilterValues {
  search: string;
  active: "all" | "active" | "inactive";
}

interface SupplierFiltersProps {
  values: SupplierFilterValues;
  disabled: boolean;
  onChange(values: SupplierFilterValues): void;
  onApply(): void;
  onReset(): void;
}

/** Renders the search and status filters used by the supplier list. */
export function SupplierFilters({
  values,
  disabled,
  onChange,
  onApply,
  onReset,
}: SupplierFiltersProps): React.JSX.Element {
  /** Updates the search text while keeping the selected status. */
  function handleSearchChange(event: React.ChangeEvent<HTMLInputElement>): void {
    onChange({ ...values, search: event.target.value });
  }

  /** Updates the active-status filter while keeping the search text. */
  function handleActiveChange(event: React.ChangeEvent<HTMLSelectElement>): void {
    onChange({
      ...values,
      active: event.target.value as SupplierFilterValues["active"],
    });
  }

  /** Applies the current filters without submitting a browser form. */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onApply();
  }

  return (
    <form className="supplier-filters" onSubmit={handleSubmit}>
      <label className="ui-field" htmlFor="supplier-search">
        <span>Search</span>
        <input
          disabled={disabled}
          id="supplier-search"
          onChange={handleSearchChange}
          placeholder="Supplier code, name, or phone"
          type="search"
          value={values.search}
        />
      </label>

      <label className="ui-field" htmlFor="supplier-active-filter">
        <span>Status</span>
        <select
          disabled={disabled}
          id="supplier-active-filter"
          onChange={handleActiveChange}
          value={values.active}
        >
          <option value="all">All suppliers</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>

      <div className="form-actions supplier-filter-actions">
        <button className="ui-button" disabled={disabled} type="submit">
          Apply filters
        </button>
        <button
          className="secondary-button"
          disabled={disabled}
          onClick={onReset}
          type="button"
        >
          Reset
        </button>
      </div>
    </form>
  );
}
