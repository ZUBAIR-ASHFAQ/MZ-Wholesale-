import { useRef, useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import { currentBusinessDate, formatMoney } from "../../../lib/utils.ts";
import type { PaymentSplitInput } from "../../payments/api/payments.api.ts";
import { PaymentSplitsForm } from "../../payments/components/payment-splits-form.tsx";
import { usePaymentAccounts } from "../../payments/hooks/use-payments.ts";
import type { PayrollItem } from "../api/employees.api.ts";
import { useCreateSalaryPayment } from "../hooks/use-employees.ts";

interface SalaryPaymentFormProps {
  payrollNumber: string;
  periodEnd: string;
  item: PayrollItem;
  onSaved(): void;
  onCancel(): void;
}

/** Converts a valid two-decimal money string into exact integer cents. */
function moneyToCents(value: string): bigint | null {
  const match = value.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

/** Returns a readable API or unexpected financial mutation error. */
function readError(error: unknown): string {
  return error instanceof ApiError ? error.message : "The salary payment could not be created.";
}

/** Creates one partial or full Salary Payment against a confirmed Payroll Item. */
export function SalaryPaymentForm({
  payrollNumber,
  periodEnd,
  item,
  onSaved,
  onCancel,
}: SalaryPaymentFormProps): React.JSX.Element {
  const today = currentBusinessDate();
  const accountsQuery = usePaymentAccounts();
  const createPayment = useCreateSalaryPayment();
  const idempotencyKey = useRef(crypto.randomUUID());
  const [paymentDate, setPaymentDate] = useState(today < periodEnd ? periodEnd : today);
  const [amount, setAmount] = useState(item.remainingDueAmount);
  const [notes, setNotes] = useState("");
  const [splits, setSplits] = useState<PaymentSplitInput[]>([
    { method: "CASH", amount: item.remainingDueAmount, cashAccountId: "" },
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const accounts = accountsQuery.data?.data;

  /** Validates exact amounts and account selections before calling the authoritative backend. */
  function validate(): boolean {
    const nextErrors: Record<string, string> = {};
    const amountCents = moneyToCents(amount);
    const remainingCents = moneyToCents(item.remainingDueAmount) ?? 0n;

    if (!paymentDate) nextErrors.paymentDate = "Payment date is required.";
    else if (paymentDate < periodEnd) nextErrors.paymentDate = "Payment date cannot be before payroll period end.";
    else if (paymentDate > today) nextErrors.paymentDate = "Payment date cannot be in the future.";

    if (amountCents === null || amountCents <= 0n) {
      nextErrors.amount = "Enter a positive amount with up to two decimals.";
    } else if (amountCents > remainingCents) {
      nextErrors.amount = "Amount cannot exceed the remaining salary payable.";
    }

    if (splits.length === 0) nextErrors.splits = "Add at least one payment split.";
    const seenAccounts = new Set<string>();
    let splitTotal = 0n;

    splits.forEach((split, index) => {
      const splitCents = moneyToCents(split.amount);
      const accountId = split.method === "CASH" ? split.cashAccountId : split.bankAccountId;

      if (splitCents === null || splitCents <= 0n) {
        nextErrors[`splits.${index}.amount`] = "Enter a positive amount.";
      } else {
        splitTotal += splitCents;
      }

      if (!accountId) {
        nextErrors[`splits.${index}.account`] = "Select an account.";
      } else {
        const key = `${split.method}:${accountId}`;
        if (seenAccounts.has(key)) nextErrors[`splits.${index}.account`] = "Use each account only once.";
        seenAccounts.add(key);
      }
    });

    if (amountCents !== null && splitTotal !== amountCents) {
      nextErrors.splits = "Payment split total must equal the salary amount.";
    }

    if (notes.trim().length > 500) nextErrors.notes = "Notes must be 500 characters or fewer.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  /** Submits one idempotent Salary Payment and retains its key across retry attempts. */
  async function submitPayment(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!validate()) return;

    try {
      await createPayment.mutateAsync({
        input: {
          employeeId: item.employeeId,
          paymentDate,
          splits: splits.map((split) => ({
            method: split.method,
            amount: split.amount.trim(),
            cashAccountId: split.method === "CASH" ? split.cashAccountId : undefined,
            bankAccountId: split.method === "BANK_TRANSFER" ? split.bankAccountId : undefined,
          })),
          allocations: [{ payrollItemId: item.id, amount: amount.trim() }],
          notes: notes.trim() || null,
        },
        idempotencyKey: idempotencyKey.current,
      });
      idempotencyKey.current = crypto.randomUUID();
      onSaved();
    } catch (error) {
      setErrors((current) => ({ ...current, root: readError(error) }));
    }
  }

  return (
    <form className="employee-form salary-payment-form" onSubmit={submitPayment}>
      <p>
        <strong>{item.employeeNameSnapshot}</strong> · {item.employeeCodeSnapshot} · {payrollNumber}<br />
        Remaining salary payable: <strong>{formatMoney(item.remainingDueAmount)}</strong>
      </p>

      <div className="employee-form-grid">
        <label className="ui-field">
          <span>Payment date</span>
          <input
            disabled={createPayment.isPending}
            max={today}
            min={periodEnd}
            onChange={(event) => setPaymentDate(event.target.value)}
            type="date"
            value={paymentDate}
          />
          {errors.paymentDate ? <small className="error-message">{errors.paymentDate}</small> : null}
        </label>

        <label className="ui-field">
          <span>Salary amount (PKR)</span>
          <input
            disabled={createPayment.isPending}
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
            value={amount}
          />
          {errors.amount ? <small className="error-message">{errors.amount}</small> : null}
        </label>
      </div>

      {accounts ? (
        <PaymentSplitsForm
          accounts={accounts}
          disabled={createPayment.isPending}
          errors={errors}
          onChange={setSplits}
          value={splits}
        />
      ) : null}
      {accountsQuery.isPending ? <p>Loading cash/bank accounts...</p> : null}
      {accountsQuery.isError ? <p className="error-message">Cash/bank accounts could not be loaded.</p> : null}

      <label className="ui-field">
        <span>Notes</span>
        <textarea
          disabled={createPayment.isPending}
          maxLength={500}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          value={notes}
        />
        {errors.notes ? <small className="error-message">{errors.notes}</small> : null}
      </label>

      {errors.root ? <p className="error-message">{errors.root}</p> : null}

      <div className="form-actions">
        <Button disabled={createPayment.isPending} label="Cancel" onClick={onCancel} />
        <Button
          disabled={createPayment.isPending || accountsQuery.isPending || !accounts}
          label={createPayment.isPending ? "Paying..." : "Pay salary"}
          type="submit"
        />
      </div>
    </form>
  );
}
