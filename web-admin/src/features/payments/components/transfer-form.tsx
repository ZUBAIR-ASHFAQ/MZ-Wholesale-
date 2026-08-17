import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import type { PaymentAccounts } from "../api/payments.api.ts";
import { useCreateTransfer } from "../hooks/use-payments.ts";

const moneyPattern = /^\d{1,12}(\.\d{1,2})?$/;

const transferSchema = z
  .object({
    sourceAccountType: z.enum(["CASH", "BANK"]),
    sourceAccountId: z.string().uuid("Select a source account."),
    destinationAccountType: z.enum(["CASH", "BANK"]),
    destinationAccountId: z.string().uuid("Select a destination account."),
    amount: z.string().regex(moneyPattern, "Enter a valid positive amount."),
    transferDate: z.string().min(1, "Transfer date is required."),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((value) => moneyToCents(value.amount) > 0n, {
    path: ["amount"],
    message: "Transfer amount must be greater than zero.",
  })
  .refine(
    (value) =>
      value.sourceAccountType !== value.destinationAccountType ||
      value.sourceAccountId !== value.destinationAccountId,
    {
      path: ["destinationAccountId"],
      message: "Source and destination must be different accounts.",
    },
  );

/** Converts a validated money string into exact integer cents. */
function moneyToCents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

type TransferValues = z.infer<typeof transferSchema>;

interface TransferFormProps {
  accounts: PaymentAccounts;
  onFinished(): void;
}

interface AccountOption {
  id: string;
  label: string;
}

/** Returns today in the date-input format used by the API. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Converts cash or bank accounts into simple select options. */
function accountOptions(
  accounts: PaymentAccounts,
  accountType: "CASH" | "BANK",
): AccountOption[] {
  if (accountType === "CASH") {
    return accounts.cashAccounts
      .filter((account) => account.isActive)
      .map((account) => ({ id: account.id, label: `${account.name} · PKR ${account.balance}` }));
  }

  return accounts.bankAccounts
    .filter((account) => account.isActive)
    .map((account) => ({
      id: account.id,
      label: `${account.bankName} - ${account.accountName} · PKR ${account.balance}`,
    }));
}

/** Reads a clear transfer error returned by the API. */
function readTransferError(error: unknown): string {
  return error instanceof ApiError ? error.message : "The transfer could not be created.";
}

/** Creates one immutable cash or bank transfer. */
export function TransferForm({
  accounts,
  onFinished,
}: TransferFormProps): React.JSX.Element {
  const createTransfer = useCreateTransfer();
  const form = useForm<TransferValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      sourceAccountType: "CASH",
      sourceAccountId: "",
      destinationAccountType: "BANK",
      destinationAccountId: "",
      amount: "",
      transferDate: today(),
      notes: "",
    },
  });
  const sourceType = form.watch("sourceAccountType");
  const destinationType = form.watch("destinationAccountType");
  const sourceOptions = useMemo(
    () => accountOptions(accounts, sourceType),
    [accounts, sourceType],
  );
  const destinationOptions = useMemo(
    () => accountOptions(accounts, destinationType),
    [accounts, destinationType],
  );

  /** Clears the selected source account when its type changes. */
  function changeSourceType(value: "CASH" | "BANK"): void {
    form.setValue("sourceAccountType", value);
    form.setValue("sourceAccountId", "");
  }

  /** Clears the selected destination account when its type changes. */
  function changeDestinationType(value: "CASH" | "BANK"): void {
    form.setValue("destinationAccountType", value);
    form.setValue("destinationAccountId", "");
  }

  /** Sends the validated transfer to the Fastify API. */
  async function handleSubmit(values: TransferValues): Promise<void> {
    try {
      await createTransfer.mutateAsync({
        ...values,
        notes: values.notes?.trim() || null,
      });
      onFinished();
    } catch (error) {
      form.setError("root", { message: readTransferError(error) });
    }
  }

  return (
    <form className="management-form" onSubmit={form.handleSubmit(handleSubmit)}>
      <div className="payment-filter-grid">
        <label className="ui-field">
          <span>Source account type</span>
          <select
            value={sourceType}
            onChange={(event) => changeSourceType(event.target.value as "CASH" | "BANK")}
          >
            <option value="CASH">Cash</option>
            <option value="BANK">Bank</option>
          </select>
        </label>
        <label className="ui-field">
          <span>Source account</span>
          <select {...form.register("sourceAccountId")}>
            <option value="">Select source</option>
            {sourceOptions.map((account) => (
              <option key={account.id} value={account.id}>{account.label}</option>
            ))}
          </select>
          {form.formState.errors.sourceAccountId ? <small>{form.formState.errors.sourceAccountId.message}</small> : null}
        </label>
        <label className="ui-field">
          <span>Destination account type</span>
          <select
            value={destinationType}
            onChange={(event) => changeDestinationType(event.target.value as "CASH" | "BANK")}
          >
            <option value="CASH">Cash</option>
            <option value="BANK">Bank</option>
          </select>
        </label>
        <label className="ui-field">
          <span>Destination account</span>
          <select {...form.register("destinationAccountId")}>
            <option value="">Select destination</option>
            {destinationOptions.map((account) => (
              <option key={account.id} value={account.id}>{account.label}</option>
            ))}
          </select>
          {form.formState.errors.destinationAccountId ? <small>{form.formState.errors.destinationAccountId.message}</small> : null}
        </label>
        <label className="ui-field">
          <span>Amount</span>
          <input inputMode="decimal" placeholder="0.00" {...form.register("amount")} />
          {form.formState.errors.amount ? <small>{form.formState.errors.amount.message}</small> : null}
        </label>
        <label className="ui-field">
          <span>Transfer date</span>
          <input type="date" {...form.register("transferDate")} />
          {form.formState.errors.transferDate ? <small>{form.formState.errors.transferDate.message}</small> : null}
        </label>
      </div>
      <label className="ui-field">
        <span>Notes</span>
        <textarea rows={3} {...form.register("notes")} />
      </label>
      {form.formState.errors.root ? <p className="error-message">{form.formState.errors.root.message}</p> : null}
      <div className="form-actions">
        <Button disabled={createTransfer.isPending} label={createTransfer.isPending ? "Transferring..." : "Confirm transfer"} type="submit" />
        <Button label="Cancel" onClick={onFinished} />
      </div>
    </form>
  );
}
