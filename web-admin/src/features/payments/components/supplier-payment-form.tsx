import { useMemo, useRef, useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import { currentBusinessDate } from "../../../lib/utils.ts";
import type { SupplierPurchaseSummary } from "../../suppliers/api/suppliers.api.ts";
import {
  useSupplierOpenPurchases,
  useSuppliers,
} from "../../suppliers/hooks/use-suppliers.ts";
import type {
  PaymentAccounts,
  PaymentAllocationInput,
  PaymentSplitInput,
} from "../api/payments.api.ts";
import { useCreateSupplierPayment } from "../hooks/use-payments.ts";
import { PaymentSplitsForm } from "./payment-splits-form.tsx";

interface SupplierPaymentFormProps {
  accounts: PaymentAccounts;
  onSaved(): void;
  onCancel(): void;
}

interface SupplierPaymentFormErrors {
  supplierId?: string;
  paymentDate?: string;
  allocations?: string;
  supplierPayableAmount?: string;
  splits?: string;
  notes?: string;
  root?: string;
  splitFields: Record<string, string>;
  allocationFields: Record<string, string>;
}

const emptyErrors: SupplierPaymentFormErrors = {
  splitFields: {},
  allocationFields: {},
};

/** Returns today's date in the YYYY-MM-DD format expected by the API. */
function today(): string {
  return currentBusinessDate();
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
function readPaymentError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "The supplier payment could not be created.";
}

/** Keeps only positive purchase allocations before the request is submitted. */
function selectedAllocations(
  purchases: SupplierPurchaseSummary[],
  amounts: Record<string, string>,
): PaymentAllocationInput[] {
  return purchases.flatMap((purchase) => {
    const amount = amounts[purchase.id]?.trim() ?? "";

    if (moneyToCents(amount) <= 0n) {
      return [];
    }

    return [{ documentId: purchase.id, amount }];
  });
}

/** Validates one supplier payment before calling the financial mutation. */
function validatePayment(
  supplierId: string,
  paymentDate: string,
  purchases: SupplierPurchaseSummary[],
  allocationAmounts: Record<string, string>,
  supplierPayableAmount: string,
  availableSupplierPayableAmount: string,
  splits: PaymentSplitInput[],
  notes: string,
): SupplierPaymentFormErrors {
  const errors: SupplierPaymentFormErrors = {
    splitFields: {},
    allocationFields: {},
  };

  if (!supplierId) errors.supplierId = "Select a supplier.";
  if (!paymentDate) errors.paymentDate = "Payment date is required.";
  else if (paymentDate > today()) errors.paymentDate = "Payment date cannot be in the future.";
  if (notes.trim().length > 500) errors.notes = "Notes must be 500 characters or fewer.";

  const allocations = selectedAllocations(purchases, allocationAmounts);
  const allocatedPurchaseIds = new Set(allocations.map((allocation) => allocation.documentId));
  const laterPurchase = paymentDate
    ? purchases.find(
        (purchase) =>
          allocatedPurchaseIds.has(purchase.id) && purchase.purchaseDate > paymentDate,
      )
    : undefined;

  if (laterPurchase) {
    errors.paymentDate = `Payment date cannot be before an allocated purchase date (${laterPurchase.purchaseDate}).`;
  }

  for (const purchase of purchases) {
    const enteredAmount = allocationAmounts[purchase.id]?.trim() ?? "";

    if (!enteredAmount) continue;

    if (!/^\d+(\.\d{1,2})?$/.test(enteredAmount) || moneyToCents(enteredAmount) <= 0n) {
      errors.allocationFields[purchase.id] = "Enter a positive amount with up to two decimals.";
      continue;
    }

    if (moneyToCents(enteredAmount) > moneyToCents(purchase.dueAmount)) {
      errors.allocationFields[purchase.id] = "Allocation cannot exceed the purchase due amount.";
    }
  }

  const enteredSupplierPayableAmount = supplierPayableAmount.trim();
  const supplierPayableCents = moneyToCents(enteredSupplierPayableAmount);

  if (enteredSupplierPayableAmount) {
    if (!/^\d+(\.\d{1,2})?$/.test(enteredSupplierPayableAmount) || supplierPayableCents <= 0n) {
      errors.supplierPayableAmount = "Enter a positive amount with up to two decimals.";
    } else if (supplierPayableCents > moneyToCents(availableSupplierPayableAmount)) {
      errors.supplierPayableAmount = "Supplier payable payment cannot exceed the available payable.";
    }
  }

  if (allocations.length === 0 && supplierPayableCents <= 0n) {
    errors.allocations = "Enter a payment against a purchase or the supplier's existing payable.";
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

  const paymentTotal = amountTotal(allocations) + supplierPayableCents;
  const splitTotal = amountTotal(splits);

  if (paymentTotal > 0n && splitTotal > 0n && paymentTotal !== splitTotal) {
    errors.splits = "Payment split total must equal purchase allocations plus supplier payable payment.";
  }

  return errors;
}

/** Reports whether the supplier payment validation result contains any error. */
function hasErrors(errors: SupplierPaymentFormErrors): boolean {
  return Boolean(
    errors.supplierId ||
      errors.paymentDate ||
      errors.allocations ||
      errors.supplierPayableAmount ||
      errors.splits ||
      errors.notes ||
      errors.root ||
      Object.keys(errors.splitFields).length > 0 ||
      Object.keys(errors.allocationFields).length > 0,
  );
}

/** Renders the complete supplier payment entry workflow without owning API routing. */
export function SupplierPaymentForm({
  accounts,
  onSaved,
  onCancel,
}: SupplierPaymentFormProps): React.JSX.Element {
  const suppliersQuery = useSuppliers({ active: true, page: 1, pageSize: 100 });
  const createPayment = useCreateSupplierPayment();
  const idempotencyKey = useRef(crypto.randomUUID());
  const [supplierId, setSupplierId] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [splits, setSplits] = useState<PaymentSplitInput[]>([
    { method: "CASH", amount: "", cashAccountId: "" },
  ]);
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({});
  const [supplierPayableAmount, setSupplierPayableAmount] = useState("");
  const [errors, setErrors] = useState<SupplierPaymentFormErrors>(emptyErrors);
  const openPurchasesQuery = useSupplierOpenPurchases(supplierId, { page: 1, pageSize: 100 });
  const suppliers = suppliersQuery.data?.data.items ?? [];
  const purchases = openPurchasesQuery.data?.data.items ?? [];
  const availableSupplierPayableAmount = openPurchasesQuery.data?.data.unallocatedPayableAmount ?? "0.00";
  const allocations = useMemo(
    () => selectedAllocations(purchases, allocationAmounts),
    [allocationAmounts, purchases],
  );
  const allocationTotalCents = amountTotal(allocations);
  const supplierPayableCents = moneyToCents(supplierPayableAmount);
  const allocationTotal = centsToMoney(allocationTotalCents);
  const paymentTotal = centsToMoney(allocationTotalCents + supplierPayableCents);
  const splitTotal = centsToMoney(amountTotal(splits));

  /** Clears purchase allocations whenever the selected supplier changes. */
  function changeSupplier(value: string): void {
    setSupplierId(value);
    setAllocationAmounts({});
    setSupplierPayableAmount("");
    setErrors(emptyErrors);
  }

  /** Stores one purchase allocation as an exact decimal string. */
  function changeAllocation(purchaseId: string, amount: string): void {
    setAllocationAmounts((current) => ({ ...current, [purchaseId]: amount }));
  }

  /** Submits one validated supplier payment while preserving its idempotency key across retries. */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const nextErrors = validatePayment(
      supplierId,
      paymentDate,
      purchases,
      allocationAmounts,
      supplierPayableAmount,
      availableSupplierPayableAmount,
      splits,
      notes,
    );

    if (hasErrors(nextErrors)) {
      setErrors(nextErrors);
      return;
    }

    try {
      await createPayment.mutateAsync({
        input: {
          supplierId,
          paymentDate,
          allocations,
          supplierPayableAmount: supplierPayableAmount.trim() || "0.00",
          splits,
          notes: notes.trim() || null,
        },
        idempotencyKey: idempotencyKey.current,
      });
      idempotencyKey.current = crypto.randomUUID();
      onSaved();
    } catch (error) {
      setErrors({ ...nextErrors, root: readPaymentError(error) });
    }
  }

  return (
    <form className="management-form supplier-payment-form" onSubmit={handleSubmit}>
      <section className="management-card receipt-form-section">
        <h2>Payment details</h2>
        <div className="payment-filter-grid">
          <label className="ui-field">
            <span>Supplier</span>
            <select
              disabled={createPayment.isPending || suppliersQuery.isPending}
              onChange={(event) => changeSupplier(event.target.value)}
              value={supplierId}
            >
              <option value="">Select supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.code} — {supplier.name}
                </option>
              ))}
            </select>
            {errors.supplierId ? <small className="error-message">{errors.supplierId}</small> : null}
          </label>

          <label className="ui-field">
            <span>Payment date</span>
            <input
              disabled={createPayment.isPending}
              max={today()}
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
          <h2>Purchase allocations</h2>
          <p>Choose how much of this payment applies to each outstanding purchase.</p>
        </div>

        {!supplierId ? <p>Select a supplier to load open purchases.</p> : null}
        {openPurchasesQuery.isPending && supplierId ? <p>Loading open purchases...</p> : null}
        {openPurchasesQuery.isError ? (
          <p className="error-message">
            Open purchases are not available yet. The Purchase module must be implemented before supplier payments can be confirmed.
          </p>
        ) : null}
        {supplierId && !openPurchasesQuery.isPending && !openPurchasesQuery.isError && purchases.length === 0 ? (
          moneyToCents(availableSupplierPayableAmount) > 0n
            ? <p>This supplier has no outstanding purchases, but has an existing supplier payable that can be paid below.</p>
            : <p>This supplier has no outstanding balance.</p>
        ) : null}

        {purchases.length > 0 ? (
          <div className="table-scroll">
            <table className="ui-table supplier-payment-purchase-table">
              <thead>
                <tr>
                  <th>Purchase</th>
                  <th>Date</th>
                  <th>Due</th>
                  <th>Allocate</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => (
                  <tr key={purchase.id}>
                    <td>{purchase.purchaseNumber}</td>
                    <td>{new Date(purchase.purchaseDate).toLocaleDateString()}</td>
                    <td>PKR {purchase.dueAmount}</td>
                    <td>
                      <label className="ui-field compact-money-field">
                        <input
                          disabled={createPayment.isPending}
                          inputMode="decimal"
                          onChange={(event) => changeAllocation(purchase.id, event.target.value)}
                          placeholder="0.00"
                          value={allocationAmounts[purchase.id] ?? ""}
                        />
                        {errors.allocationFields[purchase.id] ? (
                          <small className="error-message">{errors.allocationFields[purchase.id]}</small>
                        ) : null}
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {supplierId && !openPurchasesQuery.isPending && moneyToCents(availableSupplierPayableAmount) > 0n ? (
          <>
            <div>
              <h3>Existing supplier payable</h3>
              <p>Allocate payment to opening or previous supplier payable that is not linked to an open purchase.</p>
            </div>
            <div className="table-scroll">
              <table className="ui-table supplier-payment-payable-table">
                <thead>
                  <tr>
                    <th>Payable type</th>
                    <th>Payable</th>
                    <th>Allocate</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Existing supplier payable</td>
                    <td>PKR {availableSupplierPayableAmount}</td>
                    <td>
                      <label className="ui-field compact-money-field">
                        <span className="sr-only">Allocation for existing supplier payable</span>
                        <input
                          disabled={createPayment.isPending}
                          inputMode="decimal"
                          onChange={(event) => setSupplierPayableAmount(event.target.value)}
                          placeholder="0.00"
                          value={supplierPayableAmount}
                        />
                        {errors.supplierPayableAmount ? (
                          <small className="error-message">{errors.supplierPayableAmount}</small>
                        ) : null}
                      </label>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {errors.allocations ? <p className="error-message">{errors.allocations}</p> : null}
        <p className="form-summary">Purchase allocation total: PKR {allocationTotal}</p>
        <p className="form-summary">Total payment: PKR {paymentTotal}</p>
      </section>

      <section className="management-card receipt-form-section">
        <PaymentSplitsForm
          accounts={accounts}
          disabled={createPayment.isPending}
          errors={errors.splitFields}
          onChange={setSplits}
          value={splits}
        />
        {errors.splits ? <p className="error-message">{errors.splits}</p> : null}
        <p className="form-summary">Payment total: PKR {paymentTotal} · Split total: PKR {splitTotal}</p>
      </section>

      <section className="management-card receipt-form-section">
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
      </section>

      {errors.root ? <p className="error-message">{errors.root}</p> : null}

      <div className="form-actions">
        <Button
          disabled={createPayment.isPending}
          label={createPayment.isPending ? "Saving..." : "Create supplier payment"}
          type="submit"
        />
        <Button disabled={createPayment.isPending} label="Cancel" onClick={onCancel} />
      </div>
    </form>
  );
}
