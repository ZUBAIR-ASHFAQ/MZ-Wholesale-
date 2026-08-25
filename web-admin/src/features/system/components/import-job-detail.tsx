import { Button } from "../../../components/ui/button.tsx";
import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import { formatBusinessDateTime } from "../../../lib/utils.ts";
import { Table } from "../../../components/ui/table.tsx";
import type { SystemImportError } from "../api/system.api.ts";
import { useSystemImport } from "../hooks/use-system.ts";

interface ImportJobDetailProps {
  importJobId: string;
  onClose(): void;
}

/** Formats an import type for readable UI text. */
function importTypeText(value: string): string {
  return value.replaceAll("-", " ");
}

/** Safely formats one stored raw import row for an expandable error detail. */
function rawRowText(rawRow: unknown): string {
  if (rawRow === undefined || rawRow === null) {
    return "No raw row data was saved.";
  }

  if (typeof rawRow === "string") {
    return rawRow;
  }

  try {
    return JSON.stringify(rawRow, null, 2);
  } catch {
    return String(rawRow);
  }
}

/** Shows expandable raw source rows for saved import errors. */
function RawErrorRows({ errors }: { errors: SystemImportError[] }): React.JSX.Element | null {
  if (errors.length === 0) {
    return null;
  }

  return (
    <div className="system-import-raw-errors">
      <h3>Row details</h3>
      <p className="form-message">
        Expand a row to review the exact uploaded values saved with this error.
      </p>
      {errors.map((error, index) => (
        <details
          className="system-import-raw-error"
          key={error.id ?? `${error.rowNumber}-${error.columnName}-${index}`}
        >
          <summary>
            Row {error.rowNumber} · {error.columnName || "General"} · {error.errorCode}
          </summary>
          <pre>{rawRowText(error.rawRow)}</pre>
        </details>
      ))}
    </div>
  );
}

/** Shows one saved import job, its totals, and its row-level validation errors. */
export function ImportJobDetail({
  importJobId,
  onClose,
}: ImportJobDetailProps): React.JSX.Element {
  const importQuery = useSystemImport(importJobId);
  const detail = importQuery.data;

  if (importQuery.isPending) {
    return (
      <section className="management-card system-import-history-detail">
        <p>Loading import details...</p>
      </section>
    );
  }

  if (importQuery.isError || !detail) {
    return (
      <section className="management-card system-import-history-detail">
        <div className="system-import-result-heading">
          <div>
            <p className="eyebrow">Import detail</p>
            <h2>Could not load import</h2>
          </div>
          <Button label="Close" onClick={onClose} />
        </div>
        <p className="error-message">The selected import job could not be loaded.</p>
      </section>
    );
  }

  const job = detail.job;
  const errorRows: string[][] = [];

  for (const error of detail.errors) {
    errorRows.push([
      String(error.rowNumber),
      error.columnName || "—",
      error.errorCode,
      error.message,
    ]);
  }

  return (
    <section className="management-card system-import-history-detail">
      <div className="system-import-result-heading">
        <div>
          <p className="eyebrow">Import detail</p>
          <h2>{job.fileName}</h2>
          <p>
            {importTypeText(job.type)} · Started {formatBusinessDateTime(job.startedAt)}
          </p>
        </div>
        <div className="system-import-detail-actions">
          <StatusBadge status={job.status} />
          <Button label="Close" onClick={onClose} />
        </div>
      </div>

      <div className="system-import-summary-grid">
        <div>
          <span>Total rows</span>
          <strong>{job.totalRows}</strong>
        </div>
        <div>
          <span>Valid rows</span>
          <strong>{job.validRows}</strong>
        </div>
        <div>
          <span>Error rows</span>
          <strong>{job.errorRows}</strong>
        </div>
        <div>
          <span>Imported rows</span>
          <strong>{job.importedRows}</strong>
        </div>
      </div>

      <div className="system-import-detail-meta">
        <p>
          <strong>Job ID:</strong> {job.id}
        </p>
        <p>
          <strong>Completed:</strong> {formatBusinessDateTime(job.completedAt)}
        </p>
      </div>

      {job.errorSummary ? <p className="error-message">{job.errorSummary}</p> : null}

      <div>
        <h3>Row errors</h3>
        {errorRows.length > 0 ? (
          <div className="table-scroll">
            <Table headings={["Row", "Column", "Code", "Message"]} rows={errorRows} />
          </div>
        ) : (
          <p className="form-message">No row validation errors were saved for this import.</p>
        )}
      </div>

      <RawErrorRows errors={detail.errors} />
    </section>
  );
}
