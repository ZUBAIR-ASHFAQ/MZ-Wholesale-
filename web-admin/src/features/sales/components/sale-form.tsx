import { useMemo, useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import { useCustomers } from "../../customers/hooks/use-customers.ts";
import type { PaymentSplitInput } from "../../payments/api/payments.api.ts";
import { PaymentSplitsForm } from "../../payments/components/payment-splits-form.tsx";
import { usePaymentAccounts } from "../../payments/hooks/use-payments.ts";
import type { ProductSummary } from "../../products/api/products.api.ts";
import { useProduct, useProducts } from "../../products/hooks/use-products.ts";
import type { CreateSaleInput, SaleDetail, SaleItemInput } from "../api/sales.api.ts";
import {
  useCancelSale,
  useConfirmSale,
  useCreateSale,
  useUpdateSaleDraft,
} from "../hooks/use-sales.ts";

interface SaleFormProps {
  initialSale?: SaleDetail;
  onSaved(): void;
  onCancel(): void;
}

interface SaleItemRow extends SaleItemInput {
  rowId: string;
}

interface FormErrors {
  [field: string]: string | undefined;
}

interface SaleItemEditorProps {
  row: SaleItemRow;
  index: number;
  products: ProductSummary[];
  disabled: boolean;
  errors: FormErrors;
  onChange(rowId: string, field: keyof SaleItemInput, value: string): void;
  onRemove(rowId: string): void;
}

const moneyPattern = /^\d+(\.\d{1,2})?$/;
const quantityPattern = /^\d+(\.\d{1,3})?$/;

/** Returns today's local calendar date in YYYY-MM-DD format. */
function today(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Builds one stable temporary identifier for a new sale item row. */
function newRowId(): string {
  return `sale-item-${crypto.randomUUID()}`;
}

/** Creates one empty manually priced sale item row. */
function emptyItemRow(): SaleItemRow {
  return {
    rowId: newRowId(),
    productId: "",
    productUnitId: "",
    quantity: "",
    manualUnitPrice: "",
    itemDiscountAmount: "0.00",
  };
}


/** Converts saved sale items into editable form rows. */
function rowsFromSale(sale: SaleDetail | undefined): SaleItemRow[] {
  if (!sale) {
    return [emptyItemRow()];
  }

  return sale.items.map((item) => ({
    rowId: item.id,
    productId: item.productId,
    productUnitId: item.productUnitId,
    quantity: item.quantity,
    manualUnitPrice: item.manualUnitPrice,
    itemDiscountAmount: item.itemDiscountAmount,
  }));
}

/** Returns a readable field-error map for a Sales API failure. */
function readApiErrors(error: unknown): FormErrors {
  if (!(error instanceof ApiError)) {
    return { root: "The sale could not be saved." };
  }

  const errors: FormErrors = { root: error.message };

  for (const fieldError of error.fieldErrors) {
    errors[fieldError.field] = fieldError.message;
  }

  return errors;
}

/** Checks one non-negative PKR amount with at most two decimal places. */
function isMoney(value: string): boolean {
  return moneyPattern.test(value.trim());
}

/** Checks one positive PKR amount with at most two decimal places. */
function isPositiveMoney(value: string): boolean {
  return isMoney(value) && Number(value) > 0;
}

/** Checks one positive quantity with at most three decimal places. */
function isPositiveQuantity(value: string): boolean {
  return quantityPattern.test(value.trim()) && Number(value) > 0;
}

/** Converts a valid money string into integer cents for exact payment comparisons. */
function moneyToCents(value: string): bigint {
  const trimmedValue = value.trim();

  if (!moneyPattern.test(trimmedValue)) {
    return 0n;
  }

  const [whole, decimal = ""] = trimmedValue.split(".");
  return BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0"));
}

/** Formats integer cents as a two-decimal PKR value. */
function centsToMoney(value: bigint): string {
  const whole = value / 100n;
  const decimal = (value % 100n).toString().padStart(2, "0");
  return `${whole}.${decimal}`;
}

/** Calculates the exact total of all entered cash/bank payment splits. */
function calculatePaymentTotal(splits: PaymentSplitInput[]): bigint {
  return splits.reduce((total, split) => total + moneyToCents(split.amount), 0n);
}

/** Calculates one visible line total; the backend remains the source of truth. */
function calculateLineTotal(item: SaleItemInput): number {
  const quantity = Number(item.quantity);
  const unitPrice = Number(item.manualUnitPrice);
  const discount = Number(item.itemDiscountAmount ?? "0");

  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice) || !Number.isFinite(discount)) {
    return 0;
  }

  return Math.max(0, quantity * unitPrice - discount);
}

/** Formats one calculated PKR amount for the form summary. */
function formatMoney(value: number): string {
  return value.toFixed(2);
}

/** Renders one product, unit, quantity, manual-price, and discount row. */
function SaleItemEditor({
  row,
  index,
  products,
  disabled,
  errors,
  onChange,
  onRemove,
}: SaleItemEditorProps): React.JSX.Element {
  const productQuery = useProduct(row.productId);
  const units = productQuery.data?.data.units.filter((unit) => unit.isActive) ?? [];
  const lineTotal = calculateLineTotal(row);

  /** Changes the product and clears any unit selected for the old product. */
  function changeProduct(productId: string): void {
    onChange(row.rowId, "productId", productId);
    onChange(row.rowId, "productUnitId", "");
  }

  return (
    <div className="sale-item-row">
      <label className="ui-field">
        <span>Product</span>
        <select
          disabled={disabled}
          onChange={(event) => changeProduct(event.target.value)}
          value={row.productId}
        >
          <option value="">Select product</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.sku} — {product.name}
            </option>
          ))}
        </select>
        {errors[`items.${index}.productId`] ? (
          <small className="error-message">{errors[`items.${index}.productId`]}</small>
        ) : null}
      </label>

      <label className="ui-field">
        <span>Unit</span>
        <select
          disabled={disabled || !row.productId || productQuery.isPending}
          onChange={(event) => onChange(row.rowId, "productUnitId", event.target.value)}
          value={row.productUnitId}
        >
          <option value="">Select unit</option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.unitName}
            </option>
          ))}
        </select>
        {productQuery.isError ? <small className="error-message">Could not load units.</small> : null}
        {errors[`items.${index}.productUnitId`] ? (
          <small className="error-message">{errors[`items.${index}.productUnitId`]}</small>
        ) : null}
      </label>

      <label className="ui-field">
        <span>Quantity</span>
        <input
          disabled={disabled}
          inputMode="decimal"
          onChange={(event) => onChange(row.rowId, "quantity", event.target.value)}
          placeholder="0.000"
          value={row.quantity}
        />
        {errors[`items.${index}.quantity`] ? (
          <small className="error-message">{errors[`items.${index}.quantity`]}</small>
        ) : null}
      </label>

      <label className="ui-field">
        <span>Manual price (PKR)</span>
        <input
          disabled={disabled}
          inputMode="decimal"
          onChange={(event) => onChange(row.rowId, "manualUnitPrice", event.target.value)}
          placeholder="0.00"
          value={row.manualUnitPrice}
        />
        {errors[`items.${index}.manualUnitPrice`] ? (
          <small className="error-message">{errors[`items.${index}.manualUnitPrice`]}</small>
        ) : null}
      </label>

      <label className="ui-field">
        <span>Item discount (PKR)</span>
        <input
          disabled={disabled}
          inputMode="decimal"
          onChange={(event) => onChange(row.rowId, "itemDiscountAmount", event.target.value)}
          placeholder="0.00"
          value={row.itemDiscountAmount ?? "0.00"}
        />
        {errors[`items.${index}.itemDiscountAmount`] ? (
          <small className="error-message">{errors[`items.${index}.itemDiscountAmount`]}</small>
        ) : null}
      </label>

      <div className="sale-line-total">
        <span>Line total</span>
        <strong>PKR {formatMoney(lineTotal)}</strong>
      </div>

      <div className="sale-item-remove">
        <Button disabled={disabled} label="Remove" onClick={() => onRemove(row.rowId)} />
      </div>
    </div>
  );
}

/** Renders a new or existing editable Counter Sale. */
export function SaleForm({ initialSale, onSaved, onCancel }: SaleFormProps): React.JSX.Element {
  const customersQuery = useCustomers({ active: true, page: 1, pageSize: 100 });
  const productsQuery = useProducts({ active: true, page: 1, pageSize: 100 });
  const createSale = useCreateSale();
  const updateSale = useUpdateSaleDraft();
  const confirmSale = useConfirmSale();
  const cancelSale = useCancelSale();
  const accountsQuery = usePaymentAccounts();

  const [customerId, setCustomerId] = useState(initialSale?.sale.customerId ?? "");
  const [invoiceDate, setInvoiceDate] = useState(initialSale?.sale.invoiceDate ?? today());
  const [items, setItems] = useState<SaleItemRow[]>(rowsFromSale(initialSale));
  const [invoiceDiscountAmount, setInvoiceDiscountAmount] = useState(
    initialSale?.sale.invoiceDiscountAmount ?? "0.00",
  );
  const [notes, setNotes] = useState(initialSale?.sale.notes ?? "");
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplitInput[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});

  const customers = customersQuery.data?.data.items ?? [];
  const products = productsQuery.data?.data.items ?? [];
  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === customerId),
    [customerId, customers],
  );

  const subtotal = useMemo(
    () => items.reduce((total, item) => total + calculateLineTotal(item), 0),
    [items],
  );
  const invoiceDiscount = Number(invoiceDiscountAmount);
  const grandTotal = Math.max(
    0,
    subtotal - (Number.isFinite(invoiceDiscount) ? invoiceDiscount : 0),
  );
  const grandTotalCents = moneyToCents(formatMoney(grandTotal));
  const paidCents = calculatePaymentTotal(paymentSplits);
  const dueCents = grandTotalCents > paidCents ? grandTotalCents - paidCents : 0n;
  const isSaving =
    createSale.isPending ||
    updateSale.isPending ||
    confirmSale.isPending ||
    cancelSale.isPending;
  const savedStatus = initialSale?.sale.status;
  const canCancelDraft = savedStatus === "DRAFT";

  /** Adds one empty item row to the Counter Sale. */
  function addItem(): void {
    setItems((current) => [...current, emptyItemRow()]);
  }

  /** Changes one editable field on one sale item row. */
  function changeItem(rowId: string, field: keyof SaleItemInput, value: string): void {
    setItems((current) =>
      current.map((row) => (row.rowId === rowId ? { ...row, [field]: value } : row)),
    );
  }

  /** Removes one item while keeping at least one editable row visible. */
  function removeItem(rowId: string): void {
    setItems((current) => {
      const remaining = current.filter((row) => row.rowId !== rowId);
      return remaining.length > 0 ? remaining : [emptyItemRow()];
    });
  }

  /** Validates the visible Counter Sale fields before saving a draft. */
  function validateSale(): FormErrors {
    const nextErrors: FormErrors = {};

    if (!customerId) {
      nextErrors.customerId = "Select a customer.";
    } else if (selectedCustomer && !selectedCustomer.isActive) {
      nextErrors.customerId = "New sales require an active customer.";
    }

    if (!invoiceDate) nextErrors.invoiceDate = "Sale date is required.";
    if (!isMoney(invoiceDiscountAmount)) {
      nextErrors.invoiceDiscountAmount = "Invoice discount must have up to two decimals.";
    }
    if (Number(invoiceDiscountAmount) > subtotal) {
      nextErrors.invoiceDiscountAmount = "Invoice discount cannot exceed the subtotal.";
    }
    if (notes.trim().length > 1000) {
      nextErrors.notes = "Notes must be 1000 characters or fewer.";
    }

    items.forEach((item, index) => {
      if (!item.productId) nextErrors[`items.${index}.productId`] = "Select a product.";
      if (!item.productUnitId) nextErrors[`items.${index}.productUnitId`] = "Select a unit.";
      if (!isPositiveQuantity(item.quantity)) {
        nextErrors[`items.${index}.quantity`] = "Enter a positive quantity with up to three decimals.";
      }
      if (!isPositiveMoney(item.manualUnitPrice)) {
        nextErrors[`items.${index}.manualUnitPrice`] = "Enter a manual price greater than zero.";
      }
      if (!isMoney(item.itemDiscountAmount ?? "0.00")) {
        nextErrors[`items.${index}.itemDiscountAmount`] = "Discount must have up to two decimals.";
      } else {
        const gross = Number(item.quantity) * Number(item.manualUnitPrice);
        if (Number(item.itemDiscountAmount ?? "0") > gross) {
          nextErrors[`items.${index}.itemDiscountAmount`] = "Discount cannot exceed the line value.";
        }
      }
    });

    return nextErrors;
  }

  /** Validates cash/bank payment splits before the sale is confirmed. */
  function validatePayment(): FormErrors {
    const nextErrors: FormErrors = {};

    paymentSplits.forEach((split, index) => {
      if (!isPositiveMoney(split.amount)) {
        nextErrors[`splits.${index}.amount`] = "Enter a payment amount greater than zero.";
      }

      if (split.method === "CASH" && !split.cashAccountId) {
        nextErrors[`splits.${index}.account`] = "Select a cash account.";
      }

      if (split.method === "BANK_TRANSFER" && !split.bankAccountId) {
        nextErrors[`splits.${index}.account`] = "Select a bank account.";
      }
    });

    if (paidCents > grandTotalCents) {
      nextErrors.splits = "Payment cannot exceed the sale total.";
    }

    if (selectedCustomer?.isWalkIn && paidCents !== grandTotalCents) {
      nextErrors.splits = "Walk-in Customer must pay the full sale total.";
    }

    return nextErrors;
  }

  /** Builds the common editable sale fields sent when saving a draft or held sale. */
  function buildEditableInput(status: "DRAFT" | "HELD") {
    return {
      customerId,
      invoiceDate,
      status,
      items: items.map((item) => ({
        productId: item.productId,
        productUnitId: item.productUnitId,
        quantity: item.quantity.trim(),
        manualUnitPrice: item.manualUnitPrice.trim(),
        itemDiscountAmount: (item.itemDiscountAmount ?? "0.00").trim(),
      })),
      invoiceDiscountAmount: invoiceDiscountAmount.trim(),
      notes: notes.trim() || null,
    };
  }

  /** Saves the current Counter Sale with the requested editable status. */
  async function saveEditableSale(status: "DRAFT" | "HELD"): Promise<void> {
    const validationErrors = validateSale();
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) return;

    try {
      if (initialSale) {
        await updateSale.mutateAsync({
          saleId: initialSale.sale.id,
          input: buildEditableInput(status),
        });
      } else {
        const input: CreateSaleInput = buildEditableInput(status);
        await createSale.mutateAsync({ input });
      }

      setErrors({});
      onSaved();
    } catch (error) {
      setErrors(readApiErrors(error));
    }
  }

  /** Saves the current sale as a normal editable draft. */
  async function saveDraft(): Promise<void> {
    await saveEditableSale("DRAFT");
  }

  /** Saves the current sale as held so it can be reopened later. */
  async function holdSale(): Promise<void> {
    await saveEditableSale("HELD");
  }

  /** Confirms the sale and records optional cash/bank payment splits atomically. */
  async function confirmCurrentSale(): Promise<void> {
    const validationErrors = { ...validateSale(), ...validatePayment() };
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) return;

    const initialPayment = paymentSplits.length > 0 ? { splits: paymentSplits } : undefined;

    try {
      if (initialSale) {
        await updateSale.mutateAsync({
          saleId: initialSale.sale.id,
          input: buildEditableInput(initialSale.sale.status === "HELD" ? "HELD" : "DRAFT"),
        });

        await confirmSale.mutateAsync({
          saleId: initialSale.sale.id,
          input: { initialPayment },
          idempotencyKey: crypto.randomUUID(),
        });
      } else {
        const input: CreateSaleInput = {
          ...buildEditableInput("DRAFT"),
          status: "CONFIRMED",
          initialPayment,
        };

        await createSale.mutateAsync({
          input,
          idempotencyKey: crypto.randomUUID(),
        });
      }

      setErrors({});
      onSaved();
    } catch (error) {
      setErrors(readApiErrors(error));
    }
  }

  /** Cancels an existing DRAFT sale without changing stock or money. */
  async function cancelDraft(): Promise<void> {
    if (!initialSale || initialSale.sale.status !== "DRAFT") return;

    try {
      await cancelSale.mutateAsync({
        saleId: initialSale.sale.id,
        input: { note: "Cancelled from Counter Sales form." },
      });
      setErrors({});
      onSaved();
    } catch (error) {
      setErrors(readApiErrors(error));
    }
  }

  if (customersQuery.isPending || productsQuery.isPending || accountsQuery.isPending) {
    return <p>Loading sale form...</p>;
  }

  if (customersQuery.isError || productsQuery.isError || accountsQuery.isError) {
    return <p className="error-message">Sale form data could not be loaded.</p>;
  }

  return (
    <div className="management-form sale-form">
      <section className="management-card receipt-form-section">
        <h2>Sale details</h2>
        <div className="payment-filter-grid">
          <label className="ui-field">
            <span>Customer</span>
            <select
              disabled={isSaving}
              onChange={(event) => setCustomerId(event.target.value)}
              value={customerId}
            >
              <option value="">Select customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.code} — {customer.name}{customer.isWalkIn ? " (Walk-in)" : ""}
                </option>
              ))}
            </select>
            {errors.customerId ? <small className="error-message">{errors.customerId}</small> : null}
          </label>

          <label className="ui-field">
            <span>Sale date</span>
            <input
              disabled={isSaving}
              onChange={(event) => setInvoiceDate(event.target.value)}
              type="date"
              value={invoiceDate}
            />
            {errors.invoiceDate ? <small className="error-message">{errors.invoiceDate}</small> : null}
          </label>
        </div>
      </section>

      <section className="management-card receipt-form-section">
        <div className="payment-splits-heading">
          <div>
            <h2>Sale items</h2>
            <p>Select a unit and enter the final price agreed with the customer.</p>
          </div>
          <Button disabled={isSaving} label="Add item" onClick={addItem} />
        </div>

        <div className="sale-item-list">
          {items.map((row, index) => (
            <SaleItemEditor
              disabled={isSaving}
              errors={errors}
              index={index}
              key={row.rowId}
              onChange={changeItem}
              onRemove={removeItem}
              products={products}
              row={row}
            />
          ))}
        </div>
      </section>

      <section className="management-card receipt-form-section">
        <h2>Sale totals</h2>
        <div className="sale-total-grid">
          <article className="summary-card">
            <span>Subtotal</span>
            <strong>PKR {formatMoney(subtotal)}</strong>
          </article>
          <article className="summary-card">
            <span>Grand total</span>
            <strong>PKR {formatMoney(grandTotal)}</strong>
          </article>
        </div>

        <label className="ui-field">
          <span>Invoice discount (PKR)</span>
          <input
            disabled={isSaving}
            inputMode="decimal"
            onChange={(event) => setInvoiceDiscountAmount(event.target.value)}
            value={invoiceDiscountAmount}
          />
          {errors.invoiceDiscountAmount ? (
            <small className="error-message">{errors.invoiceDiscountAmount}</small>
          ) : null}
        </label>

        <label className="ui-field">
          <span>Notes</span>
          <textarea
            disabled={isSaving}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            value={notes}
          />
          {errors.notes ? <small className="error-message">{errors.notes}</small> : null}
        </label>
      </section>

      <section className="management-card receipt-form-section">
        <h2>Payment</h2>
        <p>Leave payment splits empty for a credit sale. Walk-in Customer must be fully paid.</p>

        <PaymentSplitsForm
          accounts={accountsQuery.data.data}
          disabled={isSaving}
          errors={errors as Record<string, string>}
          onChange={setPaymentSplits}
          required={false}
          value={paymentSplits}
        />

        <div className="sale-total-grid">
          <article className="summary-card">
            <span>Paid</span>
            <strong>PKR {centsToMoney(paidCents)}</strong>
          </article>
          <article className="summary-card">
            <span>Due</span>
            <strong>PKR {centsToMoney(dueCents)}</strong>
          </article>
        </div>
      </section>

      {errors.root ? <p className="error-message">{errors.root}</p> : null}

      <div className="form-actions">
        <Button disabled={isSaving} label="Save draft" onClick={saveDraft} />
        <Button disabled={isSaving} label="Hold sale" onClick={holdSale} />
        <Button disabled={isSaving} label="Confirm sale" onClick={confirmCurrentSale} />
        {canCancelDraft ? (
          <Button disabled={isSaving} label="Cancel draft" onClick={cancelDraft} />
        ) : null}
        <Button disabled={isSaving} label="Back" onClick={onCancel} />
      </div>
    </div>
  );
}
