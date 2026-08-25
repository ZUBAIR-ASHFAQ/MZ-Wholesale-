import { useState, type ChangeEvent, type FormEvent } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import { formatBusinessDateTime } from "../../../lib/utils.ts";
import type {
  SystemImportListFilters,
  SystemImportStatus,
  SystemImportType,
} from "../api/system.api.ts";
import { useSystemImports } from "../hooks/use-system.ts";
import { ImportJobDetail } from "./import-job-detail.tsx";

const importTypeOptions: Array<{ value: SystemImportType; label: string }> = [
  { value: "products", label: "Products" },
  { value: "customers", label: "Customers" },
  { value: "suppliers", label: "Suppliers" },
  { value: "opening-stock", label: "Opening stock" },
  { value: "opening-balances", label: "Opening balances" },
];

interface ImportHistoryFilterValues {
  type: "all" | SystemImportType;
  status: "all" | SystemImportStatus;
}

const emptyFilters: ImportHistoryFilterValues = {
  type: "all",
  status: "all",
};

/** Converts visible history filters into the System API query contract. */
function createApiFilters(
  values: ImportHistoryFilterValues,
  page: number,
): SystemImportListFilters {
  return {
    type: values.type === "all" ? undefined : values.type,
    status: values.status === "all" ? undefined : values.status,
    page,
  };
}

/** Formats an import type for readable table display. */
function importTypeText(value: string): string {
  return value.replaceAll("-", " ");
}

/** Shows paginated import history with type/status filters and inline detail viewing. */
export function ImportHistory(): React.JSX.Element {
  const [draftFilters, setDraftFilters] =
    useState<ImportHistoryFilterValues>(emptyFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<ImportHistoryFilterValues>(emptyFilters);
  const [page, setPage] = useState(1);
  const [selectedImportId, setSelectedImportId] = useState("");

  const importsQuery = useSystemImports(createApiFilters(appliedFilters, page));
  const result = importsQuery.data;
  const totalPages = Math.max(
    1,
    Math.ceil((result?.total ?? 0) / (result?.pageSize ?? 20)),
  );

  /** Updates the selected import-type filter. */
  function changeType(event: ChangeEvent<HTMLSelectElement>): void {
    setDraftFilters({
      ...draftFilters,
      type: event.target.value as ImportHistoryFilterValues["type"],
    });
  }

  /** Updates the selected import-status filter. */
  function changeStatus(event: ChangeEvent<HTMLSelectElement>): void {
    setDraftFilters({
      ...draftFilters,
      status: event.target.value as ImportHistoryFilterValues["status"],
    });
  }

  /** Applies import-history filters and returns to the first page. */
  function applyFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setAppliedFilters(draftFilters);
    setPage(1);
    setSelectedImportId("");
  }

  /** Clears import-history filters and returns to the first page. */
  function resetFilters(): void {
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setPage(1);
    setSelectedImportId("");
  }

  /** Opens a specific import job below the history list. */
  function viewImport(importJobId: string): void {
    setSelectedImportId(importJobId);
  }

  return (
    <div className="system-import-history">
      <section className="management-card">
        <div>
          <p className="eyebrow">Import history</p>
          <h2>Previous import jobs</h2>
          <p>Filter past validations/imports and open a job to review its saved row errors.</p>
        </div>

        <form className="system-import-history-filters" onSubmit={applyFilters}>
          <label className="ui-field" htmlFor="system-history-type">
            <span>Import type</span>
            <select
              disabled={importsQuery.isFetching}
              id="system-history-type"
              onChange={changeType}
              value={draftFilters.type}
            >
              <option value="all">All import types</option>
              {importTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="ui-field" htmlFor="system-history-status">
            <span>Status</span>
            <select
              disabled={importsQuery.isFetching}
              id="system-history-status"
              onChange={changeStatus}
              value={draftFilters.status}
            >
              <option value="all">All statuses</option>
              <option value="VALIDATED">Validated</option>
              <option value="IMPORTED">Imported</option>
              <option value="FAILED">Failed</option>
            </select>
          </label>

          <div className="form-actions system-import-history-filter-actions">
            <Button
              disabled={importsQuery.isFetching}
              label="Apply filters"
              type="submit"
            />
            <button
              className="secondary-button"
              disabled={importsQuery.isFetching}
              onClick={resetFilters}
              type="button"
            >
              Reset
            </button>
          </div>
        </form>

        {importsQuery.isPending ? <p>Loading import history...</p> : null}
        {importsQuery.isError ? (
          <p className="error-message">Could not load import history.</p>
        ) : null}

        {result ? (
          result.items.length > 0 ? (
            <div className="table-scroll">
              <table className="ui-table system-import-history-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Rows</th>
                    <th>Started</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((job) => (
                    <tr key={job.id}>
                      <td>{job.fileName}</td>
                      <td>{importTypeText(job.type)}</td>
                      <td>
                        <StatusBadge status={job.status} />
                      </td>
                      <td>
                        {job.importedRows > 0
                          ? `${job.importedRows}/${job.totalRows} imported`
                          : `${job.validRows}/${job.totalRows} valid`}
                      </td>
                      <td>{formatBusinessDateTime(job.startedAt)}</td>
                      <td>
                        <button
                          className="text-link system-table-action"
                          onClick={() => viewImport(job.id)}
                          type="button"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No import jobs match the selected filters.</p>
          )
        ) : null}

        {result ? (
          <div className="pagination-row">
            <p>
              Page {result.page} of {totalPages} · {result.total} import jobs
            </p>
            <div className="form-actions">
              <Button
                disabled={result.page <= 1 || importsQuery.isFetching}
                label="Previous"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              />
              <Button
                disabled={result.page >= totalPages || importsQuery.isFetching}
                label="Next"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              />
            </div>
          </div>
        ) : null}
      </section>

      {selectedImportId ? (
        <ImportJobDetail
          importJobId={selectedImportId}
          onClose={() => setSelectedImportId("")}
        />
      ) : null}
    </div>
  );
}
