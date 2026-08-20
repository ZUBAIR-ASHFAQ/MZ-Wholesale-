import { useMemo, useRef, useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import { currentBusinessDate } from "../../../lib/utils.ts";
import type { PaymentSplitInput } from "../../payments/api/payments.api.ts";
import { PaymentSplitsForm } from "../../payments/components/payment-splits-form.tsx";
import { usePaymentAccounts } from "../../payments/hooks/use-payments.ts";
import type { ProductSummary } from "../../products/api/products.api.ts";
import { useProduct, useProducts } from "../../products/hooks/use-products.ts";
import { useSuppliers } from "../../suppliers/hooks/use-suppliers.ts";
import type {
  CreatePurchaseInput,
  PurchaseDetail,
  PurchaseItemInput,
  PurchasePaymentSplitInput,
  UpdatePurchaseDraftInput,
} from "../api/purchases.api.ts";
import {
  useConfirmPurchase,
  useCreatePurchase,
  useUpdatePurchaseDraft,
} from "../hooks/use-purchases.ts";

interface PurchaseFormProps {
  purchaseDetail?: PurchaseDetail;
  onSaved(): void;
  onCancel(): void;
}

interface PurchaseItemRow extends PurchaseItemInput {
  rowId: string;
}

interface FormErrors {
  [field: string]: string | undefined;
}

interface PurchaseItemEditorProps {
  row: PurchaseItemRow;
  index: number;
  products: ProductSummary[];
  disabled: boolean;
  errors: FormErrors;
  onChange(rowId: string, field: keyof PurchaseItemInput, value: string): void;
  onRemove(rowId: string): void;
}

const moneyPattern = /^\d+(\.\d{1,2})?$/;
const quantityPattern = /^\d+(\.\d{1,3})?$/;

/** Returns today's local calendar date in YYYY-MM-DD format. */
function today(): string {
  return currentBusinessDate();
}

/** Builds one stable temporary identifier for a new purchase item row. */
function newRowId(): string {
  return `purchase-item-${crypto.randomUUID()}`;
}

/** Creates one empty purchase item row. */
function emptyItemRow(): PurchaseItemRow {
  return {
    rowId: newRowId(),
    productId: "",
    productUnitId: "",
    quantity: "",
    unitCost: "",
    itemDiscountAmount: "0.00",
  };
}

/** Converts saved purchase items into editable draft rows. */
function initialItemRows(purchaseDetail?: PurchaseDetail): PurchaseItemRow[] {
  if (!purchaseDetail) {
    return [emptyItemRow()];
  }

  return purchaseDetail.items.map((item) => ({
    rowId: item.id,
    productId: item.productId,
    productUnitId: item.productUnitId,
    quantity: item.quantity,
    unitCost: item.unitCost,
    itemDiscountAmount: item.itemDiscountAmount,
  }));
}

/** Returns a readable message for a Purchase API failure. */
function readApiErrors(error: unknown): FormErrors {
  if (!(error instanceof ApiError)) {
    return { root: "The purchase could not be saved." };
  }

  const errors: FormErrors = { root: error.message };

  for (const fieldError of error.fieldErrors) {
    errors[fieldError.field] = fieldError.message;
  }

  return errors;
}

/** Validates one non-negative amount with at most two decimal places. */
function isMoney(value: string): boolean {
  return moneyPattern.test(value.trim());
}

/** Validates one positive amount with at most two decimal places. */
function isPositiveMoney(value: string): boolean {
  return isMoney(value) && Number(value) > 0;
}

/** Validates one positive quantity with at most three decimal places. */
function isPositiveQuantity(value: string): boolean {
  return quantityPattern.test(value.trim()) && Number(value) > 0;
}

/** Validates one optional initial payment split before confirmation. */
function validatePaymentSplits(splits: PaymentSplitInput[]): FormErrors {
  const errors: FormErrors = {};

  splits.forEach((split, index) => {
    if (!isPositiveMoney(split.amount)) {
      errors[`splits.${index}.amount`] = "Enter a positive amount with up to two decimals.";
    }

    if (split.method === "CASH" && !split.cashAccountId) {
      errors[`splits.${index}.account`] = "Select a cash account.";
    }

    if (split.method === "BANK_TRANSFER" && !split.bankAccountId) {
      errors[`splits.${index}.account`] = "Select a bank account.";
    }
  });

  return errors;
}

/** Converts shared Payment split rows to the Purchase initial-payment input shape. */
function buildPurchaseSplits(splits: PaymentSplitInput[]): PurchasePaymentSplitInput[] {
  return splits.map((split) => ({
    method: split.method,
    amount: split.amount.trim(),
    cashAccountId: split.method === "CASH" ? split.cashAccountId : undefined,
    bankAccountId: split.method === "BANK_TRANSFER" ? split.bankAccountId : undefined,
  }));
}

/** Renders one product/unit/quantity/rate row in the Purchase form. */
function PurchaseItemEditor({
  row,
  index,
  products,
  disabled,
  errors,
  onChange,
  onRemove,
}: PurchaseItemEditorProps): React.JSX.Element {
  const productQuery = useProduct(row.productId);
  const units = productQuery.data?.data.units ?? [];

  /** Changes the selected product and clears the previously selected unit. */
  function changeProduct(productId: string): void {
    onChange(row.rowId, "productId", productId);
    onChange(row.rowId, "productUnitId", "");
  }

  return (
    <div className="purchase-item-row">
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
              {product.sku} — {product.name}{product.isActive ? "" : " (inactive)"}
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
              {unit.unitName}{unit.isActive ? "" : " (inactive)"}
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
        <span>Purchase rate (PKR)</span>
        <input
          disabled={disabled}
          inputMode="decimal"
          onChange={(event) => onChange(row.rowId, "unitCost", event.target.value)}
          placeholder="0.00"
          value={row.unitCost}
        />
        {errors[`items.${index}.unitCost`] ? (
          <small className="error-message">{errors[`items.${index}.unitCost`]}</small>
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

      <div className="purchase-item-remove">
        <Button disabled={disabled} label="Remove" onClick={() => onRemove(row.rowId)} />
      </div>
    </div>
  );
}

/** Renders the Purchase create/edit form and its draft/confirm actions. */
export function PurchaseForm({
  purchaseDetail,
  onSaved,
  onCancel,
}: PurchaseFormProps): React.JSX.Element {
  const purchase = purchaseDetail?.purchase;
  const isEditing = Boolean(purchase);
  const suppliersQuery = useSuppliers({ page: 1, pageSize: 100 });
  const productsQuery = useProducts({ page: 1, pageSize: 100 });
  const accountsQuery = usePaymentAccounts();
  const createPurchase = useCreatePurchase();
  const updateDraft = useUpdatePurchaseDraft();
  const confirmPurchase = useConfirmPurchase();
  const confirmationKey = useRef(crypto.randomUUID());
  const confirmationRequestStarted = useRef(false);

  const [supplierId, setSupplierId] = useState(purchase?.supplierId ?? "");
  const [purchaseDate, setPurchaseDate] = useState(purchase?.purchaseDate ?? today());
  const [items, setItems] = useState<PurchaseItemRow[]>(initialItemRows(purchaseDetail));
  const [invoiceDiscountAmount, setInvoiceDiscountAmount] = useState(
    purchase?.invoiceDiscountAmount ?? "0.00",
  );
  const [extraCostAmount, setExtraCostAmount] = useState(purchase?.extraCostAmount ?? "0.00");
  const [notes, setNotes] = useState(purchase?.notes ?? "");
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplitInput[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});

  const suppliers = suppliersQuery.data?.data.items ?? [];
  const products = productsQuery.data?.data.items ?? [];
  const accounts = accountsQuery.data?.data;
  const isSaving = createPurchase.isPending || updateDraft.isPending || confirmPurchase.isPending;

  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === supplierId),
    [supplierId, suppliers],
  );

  /** Adds one empty item row to the Purchase form. */
  function addItem(): void {
    setItems((current) => [...current, emptyItemRow()]);
  }

  /** Changes one editable field in a Purchase item row. */
  function changeItem(
    rowId: string,
    field: keyof PurchaseItemInput,
    value: string,
  ): void {
    setItems((current) =>
      current.map((row) => (row.rowId === rowId ? { ...row, [field]: value } : row)),
    );
  }

  /** Removes one Purchase item row while keeping at least one visible row. */
  function removeItem(rowId: string): void {
    setItems((current) => {
      const remaining = current.filter((row) => row.rowId !== rowId);
      return remaining.length > 0 ? remaining : [emptyItemRow()];
    });
  }

  /** Validates the Purchase master fields and item rows before any API mutation. */
  function validatePurchase(): FormErrors {
    const nextErrors: FormErrors = {};

    if (!supplierId) {
      nextErrors.supplierId = "Select a supplier.";
    } else if (selectedSupplier && !selectedSupplier.isActive) {
      nextErrors.supplierId = "New purchases require an active supplier.";
    }

    if (!purchaseDate) nextErrors.purchaseDate = "Purchase date is required.";
    else if (purchaseDate > today()) nextErrors.purchaseDate = "Purchase date cannot be in the future.";
    if (items.length === 0) nextErrors.items = "Add at least one purchase item.";
    if (!isMoney(invoiceDiscountAmount)) {
      nextErrors.invoiceDiscountAmount = "Invoice discount must have up to two decimals.";
    }
    if (!isMoney(extraCostAmount)) {
      nextErrors.extraCostAmount = "Extra cost must have up to two decimals.";
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
      if (!isPositiveMoney(item.unitCost)) {
        nextErrors[`items.${index}.unitCost`] = "Enter a positive rate with up to two decimals.";
      }
      if (!isMoney(item.itemDiscountAmount ?? "0.00")) {
        nextErrors[`items.${index}.itemDiscountAmount`] = "Discount must have up to two decimals.";
      }
    });

    return nextErrors;
  }

  /** Builds the common Purchase fields submitted for create or draft update. */
  function buildPurchaseFields(): Omit<CreatePurchaseInput, "status" | "initialPayment"> {
    return {
      supplierId,
      purchaseDate,
      items: items.map((item) => ({
        productId: item.productId,
        productUnitId: item.productUnitId,
        quantity: item.quantity.trim(),
        unitCost: item.unitCost.trim(),
        itemDiscountAmount: (item.itemDiscountAmount ?? "0.00").trim(),
      })),
      invoiceDiscountAmount: invoiceDiscountAmount.trim(),
      extraCostAmount: extraCostAmount.trim(),
      notes: notes.trim() || null,
    };
  }

  /** Saves the current form as an editable DRAFT purchase. */
  async function saveDraft(): Promise<void> {
    const validationErrors = validatePurchase();
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) return;

    try {
      if (purchase) {
        const input: UpdatePurchaseDraftInput = buildPurchaseFields();
        await updateDraft.mutateAsync({ purchaseId: purchase.id, input });
      } else {
        await createPurchase.mutateAsync({
          input: { ...buildPurchaseFields(), status: "DRAFT" },
        });
      }

      setErrors({});
      onSaved();
    } catch (error) {
      setErrors(readApiErrors(error));
    }
  }

  /** Confirms the Purchase now and optionally records the entered initial payment splits. */
  async function confirmNow(): Promise<void> {
    const validationErrors = validatePurchase();
    const splitErrors = paymentSplits.length > 0 ? validatePaymentSplits(paymentSplits) : {};
    const nextErrors = { ...validationErrors, ...splitErrors };
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    const initialPayment = paymentSplits.length > 0
      ? { splits: buildPurchaseSplits(paymentSplits) }
      : undefined;

    try {
      if (purchase) {
        if (!confirmationRequestStarted.current) {
          await updateDraft.mutateAsync({
            purchaseId: purchase.id,
            input: buildPurchaseFields(),
          });
        }

        confirmationRequestStarted.current = true;
        await confirmPurchase.mutateAsync({
          purchaseId: purchase.id,
          input: { initialPayment },
          idempotencyKey: confirmationKey.current,
        });
      } else {
        confirmationRequestStarted.current = true;
        await createPurchase.mutateAsync({
          input: {
            ...buildPurchaseFields(),
            status: "CONFIRMED",
            initialPayment,
          },
          idempotencyKey: confirmationKey.current,
        });
      }

      confirmationKey.current = crypto.randomUUID();
      confirmationRequestStarted.current = false;
      setErrors({});
      onSaved();
    } catch (error) {
      if (
        error instanceof ApiError &&
        !["IDEMPOTENCY_REQUEST_IN_PROGRESS", "IDEMPOTENCY_KEY_REUSED"].includes(error.code)
      ) {
        confirmationRequestStarted.current = false;
      }
      setErrors(readApiErrors(error));
    }
  }

  if (suppliersQuery.isPending || productsQuery.isPending || accountsQuery.isPending) {
    return <p>Loading purchase form...</p>;
  }

  if (suppliersQuery.isError || productsQuery.isError || accountsQuery.isError || !accounts) {
    return <p className="error-message">Purchase form data could not be loaded.</p>;
  }

  if (purchase && purchase.status !== "DRAFT") {
    return <p className="error-message">Only draft purchases can be edited.</p>;
  }

  return (
    <div className="management-form purchase-form">
      <section className="management-card receipt-form-section">
        <h2>Purchase details</h2>
        <div className="payment-filter-grid">
          <label className="ui-field">
            <span>Supplier</span>
            <select
              disabled={isSaving}
              onChange={(event) => setSupplierId(event.target.value)}
              value={supplierId}
            >
              <option value="">Select supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.code} — {supplier.name}{supplier.isActive ? "" : " (inactive)"}
                </option>
              ))}
            </select>
            {errors.supplierId ? <small className="error-message">{errors.supplierId}</small> : null}
          </label>

          <label className="ui-field">
            <span>Purchase date</span>
            <input
              disabled={isSaving}
              max={today()}
              onChange={(event) => setPurchaseDate(event.target.value)}
              type="date"
              value={purchaseDate}
            />
            {errors.purchaseDate ? <small className="error-message">{errors.purchaseDate}</small> : null}
          </label>
        </div>
      </section>

      <section className="management-card receipt-form-section">
        <div className="payment-splits-heading">
          <div>
            <h2>Purchase items</h2>
            <p>Select the product unit, quantity, purchase rate, and optional item discount.</p>
          </div>
          <Button disabled={isSaving} label="Add item" onClick={addItem} />
        </div>

        <div className="purchase-item-list">
          {items.map((row, index) => (
            <PurchaseItemEditor
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
        {errors.items ? <p className="error-message">{errors.items}</p> : null}
      </section>

      <section className="management-card receipt-form-section">
        <h2>Purchase totals</h2>
        <div className="payment-filter-grid">
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
            <span>Extra cost (PKR)</span>
            <input
              disabled={isSaving}
              inputMode="decimal"
              onChange={(event) => setExtraCostAmount(event.target.value)}
              value={extraCostAmount}
            />
            {errors.extraCostAmount ? <small className="error-message">{errors.extraCostAmount}</small> : null}
          </label>
        </div>

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
        <div>
          <h2>Optional initial payment</h2>
          <p>Leave payment splits empty to confirm the full purchase as supplier due.</p>
        </div>
        <PaymentSplitsForm
          accounts={accounts}
          disabled={isSaving}
          errors={errors}
          onChange={setPaymentSplits}
          required={false}
          value={paymentSplits}
        />
      </section>

      {errors.root ? <p className="error-message">{errors.root}</p> : null}

      <div className="form-actions">
        <Button disabled={isSaving} label="Save draft" onClick={saveDraft} />
        <Button disabled={isSaving} label="Confirm purchase" onClick={confirmNow} />
        <Button disabled={isSaving} label="Cancel" onClick={onCancel} />
      </div>
    </div>
  );
}
