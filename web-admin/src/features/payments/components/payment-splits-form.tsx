import type { ChangeEvent } from "react";

import { Button } from "../../../components/ui/button.tsx";
import type {
  PaymentAccounts,
  PaymentMethod,
  PaymentSplitInput,
} from "../api/payments.api.ts";

interface PaymentSplitsFormProps {
  value: PaymentSplitInput[];
  accounts: PaymentAccounts;
  onChange(value: PaymentSplitInput[]): void;
  errors?: Record<string, string>;
  disabled?: boolean;
  required?: boolean;
}

/** Creates a new empty cash split for the controlled payment form. */
function createEmptySplit(): PaymentSplitInput {
  return {
    method: "CASH",
    amount: "",
    cashAccountId: "",
  };
}

/** Converts a valid two-decimal money string into integer cents for exact totals. */
function moneyToCents(value: string): bigint {
  const trimmedValue = value.trim();

  if (!/^\d+(\.\d{1,2})?$/.test(trimmedValue)) {
    return 0n;
  }

  const [whole, decimal = ""] = trimmedValue.split(".");
  return BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0"));
}

/** Formats integer cents as a two-decimal money string. */
function centsToMoney(value: bigint): string {
  const whole = value / 100n;
  const decimal = (value % 100n).toString().padStart(2, "0");
  return `${whole}.${decimal}`;
}

/** Calculates the exact total of all currently entered split amounts. */
function calculateSplitTotal(splits: PaymentSplitInput[]): string {
  const total = splits.reduce((sum, split) => sum + moneyToCents(split.amount), 0n);
  return centsToMoney(total);
}

/** Returns the field-level error written by a parent receipt or payment form. */
function readSplitError(
  errors: Record<string, string> | undefined,
  index: number,
  field: "method" | "account" | "amount",
): string | undefined {
  return errors?.[`splits.${index}.${field}`];
}

/** Renders reusable cash and bank split rows without performing any API request. */
export function PaymentSplitsForm({
  value,
  accounts,
  onChange,
  errors,
  disabled = false,
  required = true,
}: PaymentSplitsFormProps): React.JSX.Element {
  const activeCashAccounts = accounts.cashAccounts.filter((account) => account.isActive);
  const activeBankAccounts = accounts.bankAccounts.filter((account) => account.isActive);
  const splitTotal = calculateSplitTotal(value);

  /** Replaces one split while keeping the remaining split rows unchanged. */
  function replaceSplit(index: number, split: PaymentSplitInput): void {
    onChange(value.map((currentSplit, currentIndex) => (
      currentIndex === index ? split : currentSplit
    )));
  }

  /** Changes payment method and clears the account that no longer matches it. */
  function changeMethod(index: number, method: PaymentMethod): void {
    const currentSplit = value[index];

    if (!currentSplit) return;

    if (method === "CASH") {
      replaceSplit(index, {
        method,
        amount: currentSplit.amount,
        cashAccountId: "",
      });
      return;
    }

    replaceSplit(index, {
      method,
      amount: currentSplit.amount,
      bankAccountId: "",
    });
  }

  /** Changes the matching cash or bank account for one split row. */
  function changeAccount(index: number, accountId: string): void {
    const currentSplit = value[index];

    if (!currentSplit) return;

    if (currentSplit.method === "CASH") {
      replaceSplit(index, {
        method: "CASH",
        amount: currentSplit.amount,
        cashAccountId: accountId,
      });
      return;
    }

    replaceSplit(index, {
      method: "BANK_TRANSFER",
      amount: currentSplit.amount,
      bankAccountId: accountId,
    });
  }

  /** Changes the amount of one split without converting the decimal to a JavaScript number. */
  function changeAmount(index: number, amount: string): void {
    const currentSplit = value[index];

    if (!currentSplit) return;

    replaceSplit(index, { ...currentSplit, amount });
  }

  /** Adds one new cash split row. */
  function addSplit(): void {
    onChange([...value, createEmptySplit()]);
  }

  /** Removes one split row while leaving the other entered values unchanged. */
  function removeSplit(index: number): void {
    onChange(value.filter((_split, currentIndex) => currentIndex !== index));
  }

  return (
    <section className="payment-splits-form">
      <div className="payment-splits-heading">
        <div>
          <h3>Payment splits</h3>
          <p>Split the payment between cash and bank transfer accounts.</p>
        </div>
        <Button disabled={disabled} label="Add split" onClick={addSplit} />
      </div>

      {required && value.length === 0 ? (
        <p className="form-message">Add at least one cash or bank transfer split.</p>
      ) : null}

      <div className="payment-split-list">
        {value.map((split, index) => {
          const accountError = readSplitError(errors, index, "account");
          const amountError = readSplitError(errors, index, "amount");
          const methodError = readSplitError(errors, index, "method");
          const selectedAccountId = split.method === "CASH"
            ? split.cashAccountId ?? ""
            : split.bankAccountId ?? "";

          /** Handles the method selection for this visible split row. */
          function handleMethodChange(event: ChangeEvent<HTMLSelectElement>): void {
            changeMethod(index, event.target.value as PaymentMethod);
          }

          /** Handles the matching account selection for this visible split row. */
          function handleAccountChange(event: ChangeEvent<HTMLSelectElement>): void {
            changeAccount(index, event.target.value);
          }

          /** Handles the decimal amount entry for this visible split row. */
          function handleAmountChange(event: ChangeEvent<HTMLInputElement>): void {
            changeAmount(index, event.target.value);
          }

          /** Removes this visible split row. */
          function handleRemove(): void {
            removeSplit(index);
          }

          return (
            <div className="payment-split-row" key={index}>
              <label className="ui-field">
                <span>Method</span>
                <select
                  disabled={disabled}
                  onChange={handleMethodChange}
                  value={split.method}
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                </select>
                {methodError ? <small className="error-message">{methodError}</small> : null}
              </label>

              <label className="ui-field">
                <span>{split.method === "CASH" ? "Cash account" : "Bank account"}</span>
                <select
                  disabled={disabled}
                  onChange={handleAccountChange}
                  value={selectedAccountId}
                >
                  <option value="">Select account</option>
                  {split.method === "CASH"
                    ? activeCashAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))
                    : activeBankAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.bankName} — {account.accountName}
                        </option>
                      ))}
                </select>
                {accountError ? <small className="error-message">{accountError}</small> : null}
              </label>

              <label className="ui-field">
                <span>Amount (PKR)</span>
                <input
                  disabled={disabled}
                  inputMode="decimal"
                  onChange={handleAmountChange}
                  placeholder="0.00"
                  value={split.amount}
                />
                {amountError ? <small className="error-message">{amountError}</small> : null}
              </label>

              <div className="payment-split-remove">
                <Button
                  disabled={disabled}
                  label="Remove"
                  onClick={handleRemove}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="payment-split-total">
        <strong>Split total:</strong> PKR {splitTotal}
      </p>
      {errors?.splits ? <p className="error-message">{errors.splits}</p> : null}
    </section>
  );
}
