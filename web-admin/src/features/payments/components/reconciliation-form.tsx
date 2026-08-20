import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import { currentBusinessDate } from "../../../lib/utils.ts";
import type { CashAccount, CashReconciliation } from "../api/payments.api.ts";
import {
  useCreateCashReconciliation,
  useUpdateCashReconciliation,
} from "../hooks/use-payments.ts";

const moneyPattern = /^\d{1,12}(\.\d{1,2})?$/;

const reconciliationSchema = z.object({
  cashAccountId: z.string().uuid("Select a cash account."),
  reconciliationDate: z
    .string()
    .min(1, "Reconciliation date is required.")
    .refine((value) => value <= today(), "Reconciliation date cannot be in the future."),
  countedAmount: z.string().regex(moneyPattern, "Enter a valid cash amount."),
  notes: z.string().trim().max(500).optional(),
});

type ReconciliationValues = z.infer<typeof reconciliationSchema>;

interface ReconciliationFormProps {
  cashAccounts: CashAccount[];
  reconciliation?: CashReconciliation;
  onFinished(): void;
}

/** Returns today in the date format accepted by the API. */
function today(): string {
  return currentBusinessDate();
}

/** Reads a clear reconciliation error returned by the API. */
function readReconciliationError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "The cash reconciliation could not be saved.";
}

/** Creates or edits one draft cash reconciliation. */
export function ReconciliationForm({
  cashAccounts,
  reconciliation,
  onFinished,
}: ReconciliationFormProps): React.JSX.Element {
  const createReconciliation = useCreateCashReconciliation();
  const updateReconciliation = useUpdateCashReconciliation();
  const isEditing = reconciliation !== undefined;
  const form = useForm<ReconciliationValues>({
    resolver: zodResolver(reconciliationSchema),
    defaultValues: {
      cashAccountId: reconciliation?.cashAccountId ?? "",
      reconciliationDate: reconciliation?.reconciliationDate.slice(0, 10) ?? today(),
      countedAmount: reconciliation?.countedAmount ?? "",
      notes: reconciliation?.notes ?? "",
    },
  });
  const isSaving = createReconciliation.isPending || updateReconciliation.isPending;

  /** Sends the valid draft values to the Fastify API. */
  async function handleSubmit(values: ReconciliationValues): Promise<void> {
    try {
      if (reconciliation) {
        await updateReconciliation.mutateAsync({
          reconciliationId: reconciliation.id,
          input: {
            countedAmount: values.countedAmount,
            notes: values.notes?.trim() || null,
          },
        });
      } else {
        await createReconciliation.mutateAsync({
          cashAccountId: values.cashAccountId,
          reconciliationDate: values.reconciliationDate,
          countedAmount: values.countedAmount,
          notes: values.notes?.trim() || null,
        });
      }

      onFinished();
    } catch (error) {
      form.setError("root", { message: readReconciliationError(error) });
    }
  }

  return (
    <form className="management-form" onSubmit={form.handleSubmit(handleSubmit)}>
      <div className="payment-filter-grid">
        <label className="ui-field">
          <span>Cash account</span>
          <select disabled={isEditing} {...form.register("cashAccountId")}>
            <option value="">Select cash account</option>
            {cashAccounts
              .filter((account) => account.isActive || account.id === reconciliation?.cashAccountId)
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · PKR {account.balance}
                </option>
              ))}
          </select>
          {form.formState.errors.cashAccountId ? (
            <small>{form.formState.errors.cashAccountId.message}</small>
          ) : null}
        </label>

        <label className="ui-field">
          <span>Reconciliation date</span>
          <input
            disabled={isEditing}
            max={today()}
            type="date"
            {...form.register("reconciliationDate")}
          />
          {form.formState.errors.reconciliationDate ? (
            <small>{form.formState.errors.reconciliationDate.message}</small>
          ) : null}
        </label>

        <label className="ui-field">
          <span>Counted cash</span>
          <input inputMode="decimal" placeholder="0.00" {...form.register("countedAmount")} />
          {form.formState.errors.countedAmount ? (
            <small>{form.formState.errors.countedAmount.message}</small>
          ) : null}
        </label>
      </div>

      <label className="ui-field">
        <span>Notes</span>
        <textarea rows={3} {...form.register("notes")} />
      </label>

      {form.formState.errors.root ? (
        <p className="error-message">{form.formState.errors.root.message}</p>
      ) : null}

      <div className="form-actions">
        <Button
          disabled={isSaving}
          label={isSaving ? "Saving..." : isEditing ? "Update draft" : "Create draft"}
          type="submit"
        />
        <Button label="Cancel" onClick={onFinished} />
      </div>
    </form>
  );
}
