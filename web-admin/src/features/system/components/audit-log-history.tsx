import { useState, type ChangeEvent, type FormEvent } from "react";

import { Button } from "../../../components/ui/button.tsx";
import type {
  SystemAuditLog,
  SystemAuditLogFilters,
} from "../api/system.api.ts";
import { useSystemAuditLogs } from "../hooks/use-system.ts";

interface AuditFilterValues {
  action: string;
  entity: string;
  startDate: string;
  endDate: string;
}

const emptyFilters: AuditFilterValues = {
  action: "",
  entity: "",
  startDate: "",
  endDate: "",
};

/** Converts visible audit filters into the API query contract. */
function createApiFilters(values: AuditFilterValues, page: number): SystemAuditLogFilters {
  return {
    action: values.action || undefined,
    entity: values.entity || undefined,
    startDate: values.startDate || undefined,
    endDate: values.endDate || undefined,
    page,
  };
}

/** Formats one stored timestamp for the browser locale. */
function dateTimeText(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/** Formats nullable text values without leaving empty table cells. */
function optionalText(value: string | null): string {
  return value?.trim() || "—";
}

/** Formats audit JSON in a readable, safe text block. */
function jsonText(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Unable to display saved audit data.";
  }
}

/** Renders one audit row with expandable before/after details. */
function AuditLogRow({ log }: { log: SystemAuditLog }): React.JSX.Element {
  return (
    <tr>
      <td>{dateTimeText(log.createdAt)}</td>
      <td>{log.action}</td>
      <td>{log.entity}</td>
      <td>
        <div className="system-audit-admin">
          <strong>{optionalText(log.adminName)}</strong>
          <span>{optionalText(log.adminEmail)}</span>
        </div>
      </td>
      <td>{optionalText(log.ipAddress)}</td>
      <td>{log.requestId}</td>
      <td>
        <details className="system-audit-details">
          <summary>View</summary>
          <div className="system-audit-json-grid">
            <div>
              <strong>Device</strong>
              <p>{optionalText(log.device)}</p>
            </div>
            <div>
              <strong>Before</strong>
              <pre>{jsonText(log.beforeData)}</pre>
            </div>
            <div>
              <strong>After</strong>
              <pre>{jsonText(log.afterData)}</pre>
            </div>
          </div>
        </details>
      </td>
    </tr>
  );
}

/** Shows immutable audit-log history with simple filters and pagination. */
export function AuditLogHistory(): React.JSX.Element {
  const [draftFilters, setDraftFilters] = useState<AuditFilterValues>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<AuditFilterValues>(emptyFilters);
  const [page, setPage] = useState(1);

  const auditQuery = useSystemAuditLogs(createApiFilters(appliedFilters, page));
  const result = auditQuery.data;
  const totalPages = Math.max(
    1,
    Math.ceil((result?.total ?? 0) / (result?.pageSize ?? 20)),
  );

  /** Updates one text/date filter while the user edits the filter form. */
  function changeFilter(
    field: keyof AuditFilterValues,
    event: ChangeEvent<HTMLInputElement>,
  ): void {
    setDraftFilters({ ...draftFilters, [field]: event.target.value });
  }

  /** Applies the current filters and restarts pagination. */
  function applyFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setAppliedFilters(draftFilters);
    setPage(1);
  }

  /** Clears every audit filter and returns to the first page. */
  function resetFilters(): void {
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setPage(1);
  }

  return (
    <section className="management-card system-audit-history">
      <div>
        <p className="eyebrow">Audit history</p>
        <h2>Important activity</h2>
        <p>
          Review immutable business and security activity. Normal report and dashboard views are not logged.
        </p>
      </div>

      <form className="system-audit-filters" onSubmit={applyFilters}>
        <label className="ui-field" htmlFor="system-audit-action">
          <span>Action</span>
          <input
            id="system-audit-action"
            onChange={(event) => changeFilter("action", event)}
            placeholder="e.g. SALE_CONFIRMED"
            type="text"
            value={draftFilters.action}
          />
        </label>

        <label className="ui-field" htmlFor="system-audit-entity">
          <span>Entity</span>
          <input
            id="system-audit-entity"
            onChange={(event) => changeFilter("entity", event)}
            placeholder="e.g. sale"
            type="text"
            value={draftFilters.entity}
          />
        </label>

        <label className="ui-field" htmlFor="system-audit-start-date">
          <span>Start date</span>
          <input
            id="system-audit-start-date"
            onChange={(event) => changeFilter("startDate", event)}
            type="date"
            value={draftFilters.startDate}
          />
        </label>

        <label className="ui-field" htmlFor="system-audit-end-date">
          <span>End date</span>
          <input
            id="system-audit-end-date"
            onChange={(event) => changeFilter("endDate", event)}
            type="date"
            value={draftFilters.endDate}
          />
        </label>

        <div className="form-actions system-audit-filter-actions">
          <Button disabled={auditQuery.isFetching} label="Apply filters" type="submit" />
          <button
            className="secondary-button"
            disabled={auditQuery.isFetching}
            onClick={resetFilters}
            type="button"
          >
            Reset
          </button>
        </div>
      </form>

      {auditQuery.isPending ? <p>Loading audit logs...</p> : null}
      {auditQuery.isError ? (
        <p className="error-message">Could not load audit logs.</p>
      ) : null}

      {result ? (
        result.items.length > 0 ? (
          <div className="table-scroll">
            <table className="ui-table system-audit-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Admin</th>
                  <th>IP</th>
                  <th>Request ID</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((log) => (
                  <AuditLogRow key={log.id} log={log} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No audit logs match the selected filters.</p>
        )
      ) : null}

      {result ? (
        <div className="pagination-row">
          <p>
            Page {result.page} of {totalPages} · {result.total} audit logs
          </p>
          <div className="form-actions">
            <Button
              disabled={result.page <= 1 || auditQuery.isFetching}
              label="Previous"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            />
            <Button
              disabled={result.page >= totalPages || auditQuery.isFetching}
              label="Next"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
