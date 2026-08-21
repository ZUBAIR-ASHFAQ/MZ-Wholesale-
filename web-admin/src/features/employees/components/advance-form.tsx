import { zodResolver } from "@hookform/resolvers/zod";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import { currentBusinessDate } from "../../../lib/utils.ts";
import { usePaymentAccounts } from "../../payments/hooks/use-payments.ts";
import type { Employee } from "../api/employees.api.ts";
import { useCreateEmployeeAdvance } from "../hooks/use-employees.ts";

const advanceFormSchema = z
  .object({
    employeeId: z.string().uuid("Select an employee."),
    advanceDate: z.string().min(1, "Advance date is required."),
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

type AdvanceFormValues = z.infer<typeof advanceFormSchema>;

/** Returns true only for a syntactically valid positive two-decimal money amount. */
function isPositiveMoney(value: string): boolean {
  const match = value.match(/^(\d+)(?:\.(\d{1,2}))?$/);

  if (!match) {
    return false;
  }

  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0")) > 0n;
}

interface AdvanceFormProps {
  employees: Employee[];
  onSaved(): void;
  onCancel(): void;
}

/** Returns a readable message from an API or unexpected form error. */
function readError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "The employee advance could not be created.";
}

/** Creates one confirmed Employee Advance and matching account outflow. */
export function AdvanceForm({
  employees,
  onSaved,
  onCancel,
}: AdvanceFormProps): React.JSX.Element {
  const accountsQuery = usePaymentAccounts();
  const createAdvance = useCreateEmployeeAdvance();
  const idempotencyKey = useRef(crypto.randomUUID());
  const form = useForm<AdvanceFormValues>({
    resolver: zodResolver(advanceFormSchema),
    defaultValues: {
      employeeId: "",
      advanceDate: currentBusinessDate(),
      amount: "",
      paymentMethod: "CASH",
      cashAccountId: "",
      bankAccountId: "",
      note: "",
    },
  });

  const paymentMethod = form.watch("paymentMethod");
  const activeEmployees = employees.filter((employee) => employee.isActive);
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

  /** Submits one advance while retaining the same idempotency key on retries. */
  async function handleSubmit(values: AdvanceFormValues): Promise<void> {
    try {
      await createAdvance.mutateAsync({
        input: {
          employeeId: values.employeeId,
          advanceDate: values.advanceDate,
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
      <div className="employee-form-grid">
        <label className="ui-field">
          <span>Employee</span>
          <select
            disabled={createAdvance.isPending}
            {...form.register("employeeId")}
          >
            <option value="">Select employee</option>
            {activeEmployees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.employeeCode} · {employee.name}
              </option>
            ))}
          </select>
          {form.formState.errors.employeeId ? (
            <small>{form.formState.errors.employeeId.message}</small>
          ) : null}
        </label>

        <label className="ui-field">
          <span>Advance date</span>
          <input
            disabled={createAdvance.isPending}
            type="date"
            {...form.register("advanceDate")}
          />
          {form.formState.errors.advanceDate ? (
            <small>{form.formState.errors.advanceDate.message}</small>
          ) : null}
        </label>

        <label className="ui-field">
          <span>Amount (PKR)</span>
          <input
            disabled={createAdvance.isPending}
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
            disabled={createAdvance.isPending}
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
              disabled={createAdvance.isPending || accountsQuery.isPending}
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
              disabled={createAdvance.isPending || accountsQuery.isPending}
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
            disabled={createAdvance.isPending}
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
        <Button disabled={createAdvance.isPending} label="Cancel" onClick={onCancel} />
        <Button
          disabled={createAdvance.isPending || accountsQuery.isPending}
          label={createAdvance.isPending ? "Saving..." : "Save advance"}
          type="submit"
        />
      </div>
    </form>
  );
}
