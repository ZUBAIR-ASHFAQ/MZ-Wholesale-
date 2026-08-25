import { useState, type ChangeEvent, type FormEvent } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import type { SystemImportType } from "../api/system.api.ts";
import {
  useConfirmSystemImport,
  useDownloadImportTemplate,
  useValidateSystemImport,
} from "../hooks/use-system.ts";
import { ImportValidationResult } from "./import-validation-result.tsx";

const importTypeOptions: Array<{ value: SystemImportType; label: string }> = [
  { value: "products", label: "Products" },
  { value: "customers", label: "Customers" },
  { value: "suppliers", label: "Suppliers" },
  { value: "opening-stock", label: "Opening stock" },
  { value: "opening-balances", label: "Opening balances" },
];

/** Creates one stable idempotency key for a user-triggered import operation. */
function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** Converts an unknown mutation failure into a readable message. */
function importErrorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "The import request could not be completed.";
}

/** Starts a browser download for a file returned by the API. */
function downloadBrowserFile(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

/** Renders the required two-step import workflow: validate first, then confirm. */
export function ImportWorkflow(): React.JSX.Element {
  const templateMutation = useDownloadImportTemplate();
  const validateMutation = useValidateSystemImport();
  const confirmMutation = useConfirmSystemImport();
  const [importType, setImportType] = useState<SystemImportType>("products");
  const [file, setFile] = useState<File | null>(null);
  const [validationKey, setValidationKey] = useState(newIdempotencyKey);
  const [confirmationKey, setConfirmationKey] = useState(newIdempotencyKey);
  const [message, setMessage] = useState("");

  const validationResult = validateMutation.data;
  const confirmationResult = confirmMutation.data;
  const canConfirm = validationResult?.job.status === "VALIDATED" && !confirmationResult;

  /** Resets validation state when the user chooses another import type. */
  function changeImportType(event: ChangeEvent<HTMLSelectElement>): void {
    setImportType(event.target.value as SystemImportType);
    setFile(null);
    validateMutation.reset();
    confirmMutation.reset();
    setValidationKey(newIdempotencyKey());
    setConfirmationKey(newIdempotencyKey());
    setMessage("");
  }

  /** Stores the selected CSV and starts a fresh idempotent validation action. */
  function changeFile(event: ChangeEvent<HTMLInputElement>): void {
    setFile(event.target.files?.[0] ?? null);
    validateMutation.reset();
    confirmMutation.reset();
    setValidationKey(newIdempotencyKey());
    setConfirmationKey(newIdempotencyKey());
    setMessage("");
  }

  /** Downloads the approved CSV template for the selected import type. */
  async function downloadTemplate(): Promise<void> {
    setMessage("");

    try {
      const result = await templateMutation.mutateAsync(importType);
      downloadBrowserFile(result.blob, result.fileName ?? `${importType}-template.csv`);
    } catch (error) {
      setMessage(importErrorMessage(error));
    }
  }

  /** Uploads the selected CSV for validation without committing business data. */
  async function validateFile(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage("");

    if (!file) {
      setMessage("Choose a CSV file before validation.");
      return;
    }

    try {
      await validateMutation.mutateAsync({
        type: importType,
        file,
        idempotencyKey: validationKey,
      });
      setConfirmationKey(newIdempotencyKey());
    } catch (error) {
      setMessage(importErrorMessage(error));
    }
  }

  /** Confirms the currently validated import as a separate explicit action. */
  async function confirmImport(): Promise<void> {
    if (!validationResult || validationResult.job.status !== "VALIDATED") {
      return;
    }

    setMessage("");

    try {
      await confirmMutation.mutateAsync({
        importJobId: validationResult.job.id,
        idempotencyKey: confirmationKey,
      });
    } catch (error) {
      setMessage(importErrorMessage(error));
    }
  }

  return (
    <div className="system-import-workflow">
      <section className="management-card">
        <div>
          <p className="eyebrow">Step 1</p>
          <h2>Prepare import file</h2>
          <p>Download the approved template, fill it, then upload the CSV for validation.</p>
        </div>

        <form className="system-import-form" onSubmit={validateFile}>
          <label className="ui-field" htmlFor="system-import-type">
            <span>Import type</span>
            <select id="system-import-type" onChange={changeImportType} value={importType}>
              {importTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="ui-field" htmlFor="system-import-file">
            <span>CSV file</span>
            <input
              accept=".csv,text/csv"
              id="system-import-file"
              key={importType}
              onChange={changeFile}
              type="file"
            />
          </label>

          <div className="form-actions">
            <Button
              disabled={templateMutation.isPending}
              label={templateMutation.isPending ? "Downloading..." : "Download template"}
              onClick={() => void downloadTemplate()}
            />
            <Button
              disabled={validateMutation.isPending || !file}
              label={validateMutation.isPending ? "Validating..." : "Validate file"}
              type="submit"
            />
          </div>

          {file ? <p className="form-message">Selected file: {file.name}</p> : null}
          {message ? <p className="error-message">{message}</p> : null}
        </form>
      </section>

      {validationResult ? (
        <>
          <ImportValidationResult
            confirmation={confirmationResult}
            result={validationResult}
          />

          <section className="management-card">
            <div>
              <p className="eyebrow">Step 2</p>
              <h2>Confirm validated import</h2>
              <p>
                Confirmation writes the validated rows to the ERP. Failed imports must be corrected and validated again first.
              </p>
            </div>

            <div className="form-actions">
              <Button
                disabled={!canConfirm || confirmMutation.isPending}
                label={confirmMutation.isPending ? "Confirming..." : "Confirm import"}
                onClick={() => void confirmImport()}
              />
            </div>

            {confirmMutation.isError ? (
              <p className="error-message">
                {importErrorMessage(confirmMutation.error)}
              </p>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
