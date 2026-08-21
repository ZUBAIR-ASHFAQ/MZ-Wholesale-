import { zodResolver } from "@hookform/resolvers/zod";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import { currentBusinessDate } from "../../../lib/utils.ts";
import { usePaymentAccounts } from "../../payments/hooks/use-payments.ts";
import type { EmployeeAdvance } from "../api/employees.api.ts";
import { useRecoverEmployeeAdvance } from "../hooks/use-employees.ts";

const recoveryFormSchema = z
  .object({
    recoveryDate: z.string().min(1, "Recovery date is required."),
    amount: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount with up to two decimals.")
      .refine(isPositiveMoney, "Amount must be greater than zero."),
    paymentMethod: z.enum(["CASH", "BANK_TRANSFER"]),
    cashAccountId: z.string(),
    bankAccountId: z.string(),
    note: z.string().max(500, "Note must be 500 characters or fewer."),
  })
  .superRefine((values, context) => {
    if (values.paymentMethod === "CASH" && !values.cashAccountId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cashAccountId"],
        message: "Select a cash account.",
      });
    }

    if (values.paymentMethod === "BANK_TRANSFER" && !values.bankAccountId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bankAccountId"],
        message: "Select a bank account.",
      });
    }
  });

type RecoveryFormValues = z.infer<typeof recoveryFormSchema>;

/** Returns true only for a syntactically valid positive two-decimal money amount. */
function isPositiveMoney(value: string): boolean {
  const match = value.match(/^(\d+)(?:\.(\d{1,2}))?$/);

  if (!match) {
    return false;
  }

  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0")) > 0n;
}

interface AdvanceRecoveryFormProps {
  advance: EmployeeAdvance;
  onSaved(): void;
  onCancel(): void;
}

/** Returns a readable message from an API or unexpected form error. */
function readError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "The employee advance recovery could not be created.";
}

/** Creates one direct Employee Advance recovery and matching account inflow. */
export function AdvanceRecoveryForm({
  advance,
  onSaved,
  onCancel,
}: AdvanceRecoveryFormProps): React.JSX.Element {
  const accountsQuery = usePaymentAccounts();
  const recoverAdvance = useRecoverEmployeeAdvance();
  const idempotencyKey = useRef(crypto.randomUUID());
  const form = useForm<RecoveryFormValues>({
    resolver: zodResolver(recoveryFormSchema),
    defaultValues: {
      recoveryDate: currentBusinessDate(),
      amount: "",
      paymentMethod: "CASH",
      cashAccountId: "",
      bankAccountId: "",
      note: "",
    },
  });

  const paymentMethod = form.watch("paymentMethod");
  const cashAccounts = (accountsQuery.data?.data.cashAccounts ?? []).filter(
    (account) => account.isActive,
  );
  const bankAccounts = (accountsQuery.data?.data.bankAccounts ?? []).filter(
    (account) => account.isActive,
  );

  /** Changes payment method and clears the account that no longer applies. */
  function changePaymentMethod(method: "CASH" | "BANK_TRANSFER"): void {
    form.setValue("paymentMethod", method, { shouldValidate: true });

    if (method === "CASH") {
      form.setValue("bankAccountId", "");
    } else {
      form.setValue("cashAccountId", "");
    }
  }

  /** Submits one direct recovery while retaining its idempotency key on retries. */
  async function handleSubmit(values: RecoveryFormValues): Promise<void> {
    try {
      await recoverAdvance.mutateAsync({
        employeeAdvanceId: advance.id,
        input: {
          recoveryDate: values.recoveryDate,
          amount: values.amount.trim(),
          paymentMethod: values.paymentMethod,
          cashAccountId: values.paymentMethod === "CASH" ? values.cashAccountId : undefined,
          bankAccountId: values.paymentMethod === "BANK_TRANSFER" ? values.bankAccountId : undefined,
          note: values.note.trim() || null,
        },
        idempotencyKey: idempotencyKey.current,
      });

      idempotencyKey.current = crypto.randomUUID();
      onSaved();
    } catch (error) {
      form.setError("root", { message: readError(error) });
    }
  }

  return (
    <form className="employee-form" onSubmit={form.handleSubmit(handleSubmit)}>
      <p>
        <strong>{advance.employeeName}</strong> · {advance.advanceNumber} · Outstanding PKR {advance.outstandingAmount}
      </p>

      <div className="employee-form-grid">
        <label className="ui-field">
          <span>Recovery date</span>
          <input
            disabled={recoverAdvance.isPending}
            min={advance.advanceDate}
            type="date"
            {...form.register("recoveryDate")}
          />
          {form.formState.errors.recoveryDate ? (
            <small>{form.formState.errors.recoveryDate.message}</small>
          ) : null}
        </label>

        <label className="ui-field">
          <span>Amount (PKR)</span>
          <input
            disabled={recoverAdvance.isPending}
            inputMode="decimal"
            placeholder="0.00"
            {...form.register("amount")}
          />
          {form.formState.errors.amount ? (
            <small>{form.formState.errors.amount.message}</small>
          ) : null}
        </label>

        <label className="ui-field">
          <span>Payment method</span>
          <select
            disabled={recoverAdvance.isPending}
            value={paymentMethod}
            onChange={(event) =>
              changePaymentMethod(event.target.value as "CASH" | "BANK_TRANSFER")
            }
          >
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
          </select>
        </label>

        {paymentMethod === "CASH" ? (
          <label className="ui-field">
            <span>Cash account</span>
            <select
              disabled={recoverAdvance.isPending || accountsQuery.isPending}
              {...form.register("cashAccountId")}
            >
              <option value="">Select cash account</option>
              {cashAccounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
            {form.formState.errors.cashAccountId ? (
              <small>{form.formState.errors.cashAccountId.message}</small>
            ) : null}
          </label>
        ) : (
          <label className="ui-field">
            <span>Bank account</span>
            <select
              disabled={recoverAdvance.isPending || accountsQuery.isPending}
              {...form.register("bankAccountId")}
            >
              <option value="">Select bank account</option>
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.bankName} — {account.accountName} ({account.accountNumber})
                </option>
              ))}
            </select>
            {form.formState.errors.bankAccountId ? (
              <small>{form.formState.errors.bankAccountId.message}</small>
            ) : null}
          </label>
        )}

        <label className="ui-field employee-form-wide">
          <span>Note</span>
          <textarea
            disabled={recoverAdvance.isPending}
            rows={3}
            {...form.register("note")}
          />
          {form.formState.errors.note ? (
            <small>{form.formState.errors.note.message}</small>
          ) : null}
        </label>
      </div>

      {accountsQuery.isError ? (
        <p className="error-message">Cash/bank accounts could not be loaded.</p>
      ) : null}
      {form.formState.errors.root ? (
        <p className="error-message">{form.formState.errors.root.message}</p>
      ) : null}

      <div className="form-actions">
        <Button disabled={recoverAdvance.isPending} label="Cancel" onClick={onCancel} />
        <Button
          disabled={recoverAdvance.isPending || accountsQuery.isPending}
          label={recoverAdvance.isPending ? "Saving..." : "Save recovery"}
          type="submit"
        />
      </div>
    </form>
  );
}
