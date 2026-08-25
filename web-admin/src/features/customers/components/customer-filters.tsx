/** Values controlled by the customer list filter form. */
export interface CustomerFilterValues {
  search: string;
  active: "all" | "active" | "inactive";
}

interface CustomerFiltersProps {
  values: CustomerFilterValues;
  disabled: boolean;
  onChange(values: CustomerFilterValues): void;
  onApply(): void;
  onReset(): void;
}

/** Renders the simple search and status filters used by the customer list. */
export function CustomerFilters({
  values,
  disabled,
  onChange,
  onApply,
  onReset,
}: CustomerFiltersProps): React.JSX.Element {
  /** Updates the search text while keeping the selected status. */
  function handleSearchChange(event: React.ChangeEvent<HTMLInputElement>): void {
    onChange({ ...values, search: event.target.value });
  }

  /** Updates the active-status filter while keeping the search text. */
  function handleActiveChange(event: React.ChangeEvent<HTMLSelectElement>): void {
    onChange({
      ...values,
      active: event.target.value as CustomerFilterValues["active"],
    });
  }

  /** Applies the current filters without submitting a browser form. */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onApply();
  }

  return (
    <form className="customer-filters" onSubmit={handleSubmit}>
      <label className="ui-field" htmlFor="customer-search">
        <span>Search</span>
        <input
          disabled={disabled}
          id="customer-search"
          onChange={handleSearchChange}
          placeholder="Customer code, name, or phone"
          type="search"
          value={values.search}
        />
      </label>

      <label className="ui-field" htmlFor="customer-active-filter">
        <span>Status</span>
        <select
          disabled={disabled}
          id="customer-active-filter"
          onChange={handleActiveChange}
          value={values.active}
        >
          <option value="all">All customers</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>

      <div className="form-actions customer-filter-actions">
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
