import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import { Table } from "../../../components/ui/table.tsx";
import type {
  SystemImportConfirmationResult,
  SystemImportError,
  SystemImportValidationResult,
} from "../api/system.api.ts";

interface ImportValidationResultProps {
  result: SystemImportValidationResult;
  confirmation?: SystemImportConfirmationResult;
}

interface ConfirmationMetric {
  label: string;
  value: number;
}

/** Builds readable table rows from row-level import validation errors. */
function errorRows(result: SystemImportValidationResult): string[][] {
  const rows: string[][] = [];

  for (const error of result.errors) {
    rows.push([
      String(error.rowNumber),
      error.columnName || "-",
      error.errorCode,
      error.message,
    ]);
  }

  return rows;
}

/** Returns only the business counters supplied by the confirmed import type. */
function confirmationMetrics(
  confirmation?: SystemImportConfirmationResult,
): ConfirmationMetric[] {
  if (!confirmation) {
    return [];
  }

  const metrics: ConfirmationMetric[] = [];

  if (confirmation.productsCreated !== undefined) {
    metrics.push({ label: "Products created", value: confirmation.productsCreated });
  }

  if (confirmation.recordsCreated !== undefined) {
    metrics.push({ label: "Records created", value: confirmation.recordsCreated });
  }

  if (confirmation.movementsCreated !== undefined) {
    metrics.push({ label: "Stock movements created", value: confirmation.movementsCreated });
  }

  if (confirmation.customerEntriesCreated !== undefined) {
    metrics.push({
      label: "Customer opening entries created",
      value: confirmation.customerEntriesCreated,
    });
  }

  if (confirmation.supplierEntriesCreated !== undefined) {
    metrics.push({
      label: "Supplier opening entries created",
      value: confirmation.supplierEntriesCreated,
    });
  }

  return metrics;
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

/** Shows expandable raw source rows only when validation errors exist. */
function RawErrorRows({ errors }: { errors: SystemImportError[] }): React.JSX.Element | null {
  if (errors.length === 0) {
    return null;
  }

  return (
    <div className="system-import-raw-errors">
      <h3>Row details</h3>
      <p className="form-message">
        Expand a row to compare the original uploaded values with its validation error.
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

/** Shows validation totals, import status, row errors, and an optional confirmation result. */
export function ImportValidationResult({
  result,
  confirmation,
}: ImportValidationResultProps): React.JSX.Element {
  const job = result.job;
  const rows = errorRows(result);
  const metrics = confirmationMetrics(confirmation);

  return (
    <section className="management-card system-import-result">
      <div className="system-import-result-heading">
        <div>
          <p className="eyebrow">Validation result</p>
          <h2>{job.fileName}</h2>
        </div>
        <StatusBadge status={job.status} />
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
          <strong>{confirmation?.job.importedRows ?? job.importedRows}</strong>
        </div>
      </div>

      {job.errorSummary ? <p className="error-message">{job.errorSummary}</p> : null}

      {confirmation ? (
        <div className="system-import-confirmation-result">
          <p className="form-message">
            Import confirmed successfully. {confirmation.job.importedRows} row(s)
            were imported.
          </p>

          {metrics.length > 0 ? (
            <div className="system-import-confirmation-grid">
              {metrics.map((metric) => (
                <div key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div>
          <h3>Row errors</h3>
          <div className="table-scroll">
            <Table
              headings={["Row", "Column", "Code", "Message"]}
              rows={rows}
            />
          </div>
        </div>
      ) : (
        <p className="form-message">No row validation errors were found.</p>
      )}

      <RawErrorRows errors={result.errors} />
    </section>
  );
}
