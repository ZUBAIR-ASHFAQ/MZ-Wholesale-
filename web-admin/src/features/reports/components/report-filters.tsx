/** Values controlled by the shared report date-range form. */
export interface ReportDateRangeFilterValues {
  startDate: string;
  endDate: string;
}

interface ReportDateRangeFilterProps {
  values: ReportDateRangeFilterValues;
  disabled?: boolean;
  onChange(values: ReportDateRangeFilterValues): void;
  onApply(): void;
  onReset(): void;
}

/** Renders the reusable start-date and end-date controls used by dated reports. */
export function ReportDateRangeFilter({
  values,
  disabled = false,
  onChange,
  onApply,
  onReset,
}: ReportDateRangeFilterProps): React.JSX.Element {
  /** Updates one date while keeping the other date unchanged. */
  function handleDateChange(
    field: keyof ReportDateRangeFilterValues,
    event: React.ChangeEvent<HTMLInputElement>,
  ): void {
    onChange({ ...values, [field]: event.target.value });
  }

  /** Applies the current date range without reloading the page. */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onApply();
  }

  return (
    <form className="report-filters" onSubmit={handleSubmit}>
      <label className="ui-field" htmlFor="report-start-date">
        <span>Start date</span>
        <input
          disabled={disabled}
          id="report-start-date"
          onChange={(event) => handleDateChange("startDate", event)}
          type="date"
          value={values.startDate}
        />
      </label>

      <label className="ui-field" htmlFor="report-end-date">
        <span>End date</span>
        <input
          disabled={disabled}
          id="report-end-date"
          onChange={(event) => handleDateChange("endDate", event)}
          type="date"
          value={values.endDate}
        />
      </label>

      <div className="form-actions report-filter-actions">
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

/** Values controlled by the shared paginated report search form. */
export interface ReportSearchFilterValues {
  search: string;
  pageSize: number;
}

interface ReportSearchFilterProps {
  values: ReportSearchFilterValues;
  disabled?: boolean;
  onChange(values: ReportSearchFilterValues): void;
  onApply(): void;
  onReset(): void;
}

/** Renders reusable search and page-size controls for paginated reports. */
export function ReportSearchFilter({
  values,
  disabled = false,
  onChange,
  onApply,
  onReset,
}: ReportSearchFilterProps): React.JSX.Element {
  /** Updates the search text without changing the selected page size. */
  function handleSearchChange(event: React.ChangeEvent<HTMLInputElement>): void {
    onChange({ ...values, search: event.target.value });
  }

  /** Keeps the page size inside the backend-supported 1 to 100 range. */
  function handlePageSizeChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const nextPageSize = Number(event.target.value);

    if (!Number.isInteger(nextPageSize) || nextPageSize < 1 || nextPageSize > 100) {
      return;
    }

    onChange({ ...values, pageSize: nextPageSize });
  }

  /** Applies the current search filters without reloading the page. */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onApply();
  }

  return (
    <form className="report-filters" onSubmit={handleSubmit}>
      <label className="ui-field" htmlFor="report-search">
        <span>Search</span>
        <input
          disabled={disabled}
          id="report-search"
          onChange={handleSearchChange}
          placeholder="Search"
          type="search"
          value={values.search}
        />
      </label>

      <label className="ui-field" htmlFor="report-page-size">
        <span>Rows per page</span>
        <input
          disabled={disabled}
          id="report-page-size"
          max={100}
          min={1}
          onChange={handlePageSizeChange}
          type="number"
          value={values.pageSize}
        />
      </label>

      <div className="form-actions report-filter-actions">
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
