import { useMemo, useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import {
  useCustomerOpenInvoices,
  useCustomers,
} from "../../customers/hooks/use-customers.ts";
import type {
  CustomerInvoiceSummary,
} from "../../customers/api/customers.api.ts";
import type {
  PaymentAccounts,
  PaymentAllocationInput,
  PaymentSplitInput,
} from "../api/payments.api.ts";
import { useCreateCustomerReceipt } from "../hooks/use-payments.ts";
import { PaymentSplitsForm } from "./payment-splits-form.tsx";

interface CustomerReceiptFormProps {
  accounts: PaymentAccounts;
  onSaved(): void;
  onCancel(): void;
}

interface ReceiptFormErrors {
  customerId?: string;
  paymentDate?: string;
  allocations?: string;
  splits?: string;
  notes?: string;
  root?: string;
  splitFields: Record<string, string>;
  allocationFields: Record<string, string>;
}

const emptyErrors: ReceiptFormErrors = {
  splitFields: {},
  allocationFields: {},
};

/** Returns today's date in the YYYY-MM-DD format expected by the API. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Converts a valid money string into integer cents for exact comparison. */
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

/** Calculates an exact total from payment or allocation amount strings. */
function amountTotal(items: Array<{ amount: string }>): bigint {
  return items.reduce((total, item) => total + moneyToCents(item.amount), 0n);
}

/** Reads a clear message from the shared API error type. */
function readReceiptError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "The customer receipt could not be created.";
}

/** Keeps only positive allocation rows before the request is submitted. */
function selectedAllocations(
  invoices: CustomerInvoiceSummary[],
  amounts: Record<string, string>,
): PaymentAllocationInput[] {
  return invoices.flatMap((invoice) => {
    const amount = amounts[invoice.id]?.trim() ?? "";

    if (moneyToCents(amount) <= 0n) {
      return [];
    }

    return [{ documentId: invoice.id, amount }];
  });
}

/** Validates one customer receipt before calling the financial mutation. */
function validateReceipt(
  customerId: string,
  paymentDate: string,
  invoices: CustomerInvoiceSummary[],
  allocationAmounts: Record<string, string>,
  splits: PaymentSplitInput[],
  notes: string,
): ReceiptFormErrors {
  const errors: ReceiptFormErrors = {
    splitFields: {},
    allocationFields: {},
  };

  if (!customerId) errors.customerId = "Select a customer.";
  if (!paymentDate) errors.paymentDate = "Payment date is required.";
  if (notes.trim().length > 500) errors.notes = "Notes must be 500 characters or fewer.";

  const allocations = selectedAllocations(invoices, allocationAmounts);

  for (const invoice of invoices) {
    const enteredAmount = allocationAmounts[invoice.id]?.trim() ?? "";

    if (!enteredAmount) continue;

    if (!/^\d+(\.\d{1,2})?$/.test(enteredAmount) || moneyToCents(enteredAmount) <= 0n) {
      errors.allocationFields[invoice.id] = "Enter a positive amount with up to two decimals.";
      continue;
    }

    if (moneyToCents(enteredAmount) > moneyToCents(invoice.dueAmount)) {
      errors.allocationFields[invoice.id] = "Allocation cannot exceed the invoice due amount.";
    }
  }

  if (allocations.length === 0) {
    errors.allocations = "Allocate a positive amount to at least one invoice.";
  }

  if (splits.length === 0) {
    errors.splits = "Add at least one cash or bank transfer split.";
  }

  splits.forEach((split, index) => {
    if (!/^\d+(\.\d{1,2})?$/.test(split.amount.trim()) || moneyToCents(split.amount) <= 0n) {
      errors.splitFields[`splits.${index}.amount`] = "Enter a positive amount with up to two decimals.";
    }

    if (split.method === "CASH" && !split.cashAccountId) {
      errors.splitFields[`splits.${index}.account`] = "Select a cash account.";
    }

    if (split.method === "BANK_TRANSFER" && !split.bankAccountId) {
      errors.splitFields[`splits.${index}.account`] = "Select a bank account.";
    }
  });

  const allocationTotal = amountTotal(allocations);
  const splitTotal = amountTotal(splits);

  if (allocationTotal > 0n && splitTotal > 0n && allocationTotal !== splitTotal) {
    errors.splits = "Payment split total must equal the allocation total.";
  }

  return errors;
}

/** Reports whether the receipt validation result contains any error. */
function hasErrors(errors: ReceiptFormErrors): boolean {
  return Boolean(
    errors.customerId ||
      errors.paymentDate ||
      errors.allocations ||
      errors.splits ||
      errors.notes ||
      errors.root ||
      Object.keys(errors.splitFields).length > 0 ||
      Object.keys(errors.allocationFields).length > 0,
  );
}

/** Renders the complete customer receipt entry workflow without owning API routing. */
export function CustomerReceiptForm({
  accounts,
  onSaved,
  onCancel,
}: CustomerReceiptFormProps): React.JSX.Element {
  const customersQuery = useCustomers({ active: true, page: 1, pageSize: 100 });
  const createReceipt = useCreateCustomerReceipt();
  const [customerId, setCustomerId] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [splits, setSplits] = useState<PaymentSplitInput[]>([
    { method: "CASH", amount: "", cashAccountId: "" },
  ]);
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<ReceiptFormErrors>(emptyErrors);
  const openInvoicesQuery = useCustomerOpenInvoices(customerId, { page: 1, pageSize: 100 });
  const customers = customersQuery.data?.data.items ?? [];
  const invoices = openInvoicesQuery.data?.data.items ?? [];
  const allocations = useMemo(
    () => selectedAllocations(invoices, allocationAmounts),
    [allocationAmounts, invoices],
  );
  const allocationTotal = centsToMoney(amountTotal(allocations));
  const splitTotal = centsToMoney(amountTotal(splits));

  /** Clears invoice allocations whenever the selected customer changes. */
  function changeCustomer(value: string): void {
    setCustomerId(value);
    setAllocationAmounts({});
    setErrors(emptyErrors);
  }

  /** Stores one invoice allocation as an exact decimal string. */
  function changeAllocation(invoiceId: string, amount: string): void {
    setAllocationAmounts((current) => ({ ...current, [invoiceId]: amount }));
  }

  /** Submits one validated receipt using a fresh idempotency key. */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const nextErrors = validateReceipt(
      customerId,
      paymentDate,
      invoices,
      allocationAmounts,
      splits,
      notes,
    );

    if (hasErrors(nextErrors)) {
      setErrors(nextErrors);
      return;
    }

    try {
      await createReceipt.mutateAsync({
        input: {
          customerId,
          paymentDate,
          allocations,
          splits,
          notes: notes.trim() || null,
        },
        idempotencyKey: crypto.randomUUID(),
      });
      onSaved();
    } catch (error) {
      setErrors({ ...nextErrors, root: readReceiptError(error) });
    }
  }

  return (
    <form className="management-form" onSubmit={handleSubmit}>
      <section className="management-card receipt-form-section">
        <h2>Receipt details</h2>
        <div className="payment-filter-grid">
          <label className="ui-field">
            <span>Customer</span>
            <select
              disabled={createReceipt.isPending || customersQuery.isPending}
              onChange={(event) => changeCustomer(event.target.value)}
              value={customerId}
            >
              <option value="">Select customer</option>
              {customers
                .filter((customer) => !customer.isWalkIn)
                .map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.code} — {customer.name}
                  </option>
                ))}
            </select>
            {errors.customerId ? <small className="error-message">{errors.customerId}</small> : null}
          </label>

          <label className="ui-field">
            <span>Payment date</span>
            <input
              disabled={createReceipt.isPending}
              onChange={(event) => setPaymentDate(event.target.value)}
              type="date"
              value={paymentDate}
            />
            {errors.paymentDate ? <small className="error-message">{errors.paymentDate}</small> : null}
          </label>
        </div>
      </section>

      <section className="management-card receipt-form-section">
        <div>
          <h2>Invoice allocations</h2>
          <p>Choose how much of this receipt applies to each outstanding invoice.</p>
        </div>

        {!customerId ? <p>Select a customer to load open invoices.</p> : null}
        {openInvoicesQuery.isPending && customerId ? <p>Loading open invoices...</p> : null}
        {openInvoicesQuery.isError ? (
          <p className="error-message">
            Open invoices are not available yet. The Sales module must be implemented before customer receipts can be confirmed.
          </p>
        ) : null}
        {customerId && !openInvoicesQuery.isPending && !openInvoicesQuery.isError && invoices.length === 0 ? (
          <p>This customer has no outstanding invoices.</p>
        ) : null}

        {invoices.length > 0 ? (
          <div className="table-scroll">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Due</th>
                  <th>Allocate</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.invoiceNumber}</td>
                    <td>{new Date(invoice.invoiceDate).toLocaleDateString()}</td>
                    <td>PKR {invoice.dueAmount}</td>
                    <td>
                      <label className="ui-field compact-money-field">
                        <span className="sr-only">Allocation for {invoice.invoiceNumber}</span>
                        <input
                          disabled={createReceipt.isPending}
                          inputMode="decimal"
                          onChange={(event) => changeAllocation(invoice.id, event.target.value)}
                          placeholder="0.00"
                          value={allocationAmounts[invoice.id] ?? ""}
                        />
                        {errors.allocationFields[invoice.id] ? (
                          <small className="error-message">{errors.allocationFields[invoice.id]}</small>
                        ) : null}
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <p className="payment-split-total"><strong>Allocation total:</strong> PKR {allocationTotal}</p>
        {errors.allocations ? <p className="error-message">{errors.allocations}</p> : null}
      </section>

      <section className="management-card receipt-form-section">
        <PaymentSplitsForm
          accounts={accounts}
          disabled={createReceipt.isPending}
          errors={{ ...errors.splitFields, ...(errors.splits ? { splits: errors.splits } : {}) }}
          onChange={setSplits}
          value={splits}
        />
        <p className="receipt-total-check">
          Allocation total: <strong>PKR {allocationTotal}</strong> · Split total: <strong>PKR {splitTotal}</strong>
        </p>
      </section>

      <section className="management-card receipt-form-section">
        <label className="ui-field">
          <span>Notes</span>
          <textarea
            disabled={createReceipt.isPending}
            maxLength={500}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            value={notes}
          />
          {errors.notes ? <small className="error-message">{errors.notes}</small> : null}
        </label>
      </section>

      {customersQuery.isError ? <p className="error-message">Customers could not be loaded.</p> : null}
      {errors.root ? <p className="error-message">{errors.root}</p> : null}

      <div className="form-actions">
        <Button
          disabled={
            createReceipt.isPending ||
            customersQuery.isPending ||
            openInvoicesQuery.isFetching ||
            invoices.length === 0
          }
          label={createReceipt.isPending ? "Saving receipt..." : "Confirm receipt"}
          type="submit"
        />
        <Button disabled={createReceipt.isPending} label="Cancel" onClick={onCancel} />
      </div>
    </form>
  );
}
