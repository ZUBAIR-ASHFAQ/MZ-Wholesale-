import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import { currentBusinessDate } from "../../../lib/utils.ts";
import { usePurchase, usePurchases } from "../../purchases/hooks/use-purchases.ts";
import { useSuppliers } from "../../suppliers/hooks/use-suppliers.ts";
import { useCreatePurchaseReturn } from "../hooks/use-returns.ts";

const quantitySchema = z
  .string()
  .trim()
  .refine(
    (value) => value.length === 0 || /^\d+(\.\d{1,3})?$/.test(value),
    "Use a quantity with up to 3 decimals.",
  );

const purchaseReturnFormSchema = z
  .object({
    originalPurchaseId: z.string().min(1, "Select a confirmed purchase."),
    returnDate: z
      .string()
      .min(1, "Return date is required.")
      .refine((value) => value <= today(), "Return date cannot be in the future."),
    reason: z
      .string()
      .trim()
      .min(1, "Return reason is required.")
      .max(500, "Reason must be 500 characters or fewer."),
    items: z.array(
      z.object({
        originalPurchaseItemId: z.string(),
        quantity: quantitySchema,
      }),
    ),
  })
  .superRefine((values, context) => {
    const selectedItems = values.items.filter((item) => Number(item.quantity) > 0);

    if (selectedItems.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "Enter a positive return quantity for at least one item.",
      });
    }
  });

type PurchaseReturnFormValues = z.infer<typeof purchaseReturnFormSchema>;

interface PurchaseReturnFormProps {
  initialOriginalPurchaseId?: string;
  onSaved(purchaseReturnId: string): void;
  onCancel(): void;
}

/** Returns today's local form date in YYYY-MM-DD format. */
function today(): string {
  return currentBusinessDate();
}

/** Converts one valid quantity string to thousandths for exact comparisons. */
function quantityToUnits(value: string): bigint | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,3})?$/.test(trimmed)) return null;

  const [wholePart, fractionPart = ""] = trimmed.split(".");
  return BigInt(wholePart) * 1000n + BigInt(fractionPart.padEnd(3, "0"));
}

/** Returns whether a requested return quantity exceeds one available quantity. */
function exceedsAvailableQuantity(returnQuantity: string, availableQuantity: string): boolean {
  const returnUnits = quantityToUnits(returnQuantity);
  const availableUnits = quantityToUnits(availableQuantity);
  return returnUnits !== null && availableUnits !== null && returnUnits > availableUnits;
}

/** Reads one user-friendly error message from the shared API error type. */
function readReturnError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "The Purchase Return could not be created.";
}

/** Renders the confirmed Purchase Return entry form using original purchase snapshots. */
export function PurchaseReturnForm({
  initialOriginalPurchaseId = "",
  onSaved,
  onCancel,
}: PurchaseReturnFormProps): React.JSX.Element {
  const createReturn = useCreatePurchaseReturn();
  const idempotencyKey = useRef(crypto.randomUUID());
  const suppliersQuery = useSuppliers({ page: 1, pageSize: 100 });
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const confirmedPurchasesQuery = usePurchases({
    supplierId: selectedSupplierId || undefined,
    status: "CONFIRMED",
    returnableOnly: true,
    page: 1,
    pageSize: 100,
  });
  const [formError, setFormError] = useState("");
  const [returnItems, setReturnItems] = useState<PurchaseReturnFormValues["items"]>([]);
  const [quantityErrors, setQuantityErrors] = useState<Record<number, string>>({});

  const {
    register,
    handleSubmit,
    watch,
    clearErrors,
    setError,
    setValue,
    formState: { errors },
  } = useForm<PurchaseReturnFormValues>({
    defaultValues: {
      originalPurchaseId: initialOriginalPurchaseId,
      returnDate: today(),
      reason: "",
      items: [],
    },
  });

  const originalPurchaseId = watch("originalPurchaseId", initialOriginalPurchaseId) ?? "";
  const selectedPurchaseQuery = usePurchase(originalPurchaseId);
  const selectedPurchase = selectedPurchaseQuery.data?.data;
  const returnAvailabilityByItemId = new Map(
    (selectedPurchase?.returnAvailability ?? []).map((availability) => [
      availability.originalPurchaseItemId,
      availability,
    ]),
  );
  const suppliers = suppliersQuery.data?.data.items ?? [];
  const confirmedPurchases = selectedSupplierId
    ? (confirmedPurchasesQuery.data?.data.items ?? []).filter(
        (purchase) => purchase.supplierId === selectedSupplierId,
      )
    : [];

  useEffect(() => {
    if (selectedPurchase?.purchase.supplierId) {
      setSelectedSupplierId(selectedPurchase.purchase.supplierId);
    }

    setReturnItems(
      (selectedPurchase?.items ?? []).map((item) => ({
        originalPurchaseItemId: item.id,
        quantity: "",
      })),
    );
    setQuantityErrors({});
    clearErrors("items");
  }, [clearErrors, selectedPurchase]);

  /** Copies API field errors into React Hook Form when the server provides them. */
  function applyApiErrors(error: unknown): void {
    setFormError(readReturnError(error));

    if (!(error instanceof ApiError)) return;

    for (const fieldError of error.fieldErrors) {
      const field = fieldError.field as keyof PurchaseReturnFormValues;

      if (
        field === "originalPurchaseId" ||
        field === "returnDate" ||
        field === "reason"
      ) {
        setError(field, { message: fieldError.message });
      }
    }
  }

  /** Creates one confirmed Purchase Return using only lines with a positive quantity. */
  async function savePurchaseReturn(values: PurchaseReturnFormValues): Promise<void> {
    setFormError("");
    clearErrors();
    setQuantityErrors({});

    if (!selectedSupplierId) {
      setFormError("Select a supplier before selecting a purchase.");
      return;
    }

    if (
      !selectedPurchase
      || selectedPurchase.purchase.id !== values.originalPurchaseId
      || selectedPurchase.purchase.supplierId !== selectedSupplierId
    ) {
      setFormError("Select a confirmed purchase and wait for its items to load.");
      return;
    }

    const parsed = purchaseReturnFormSchema.safeParse({
      ...values,
      items: returnItems,
    });

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const fieldName = issue.path.join(".");

        if (!fieldName) {
          setFormError(issue.message);
          continue;
        }

        setError(fieldName as Parameters<typeof setError>[0], {
          type: "manual",
          message: issue.message,
        });
      }
      return;
    }

    const validatedValues = parsed.data;

    if (validatedValues.returnDate < selectedPurchase.purchase.purchaseDate) {
      setError("returnDate", {
        message: `Return date cannot be before the original purchase date (${selectedPurchase.purchase.purchaseDate}).`,
      });
      return;
    }

    const availableQuantityErrors: Record<number, string> = {};

    validatedValues.items.forEach((item, index) => {
      const purchaseItem = selectedPurchase.items[index];
      if (!purchaseItem || Number(item.quantity) <= 0) return;

      const availability = returnAvailabilityByItemId.get(purchaseItem.id);
      const remainingQuantity = availability?.remainingReturnableQuantity ?? purchaseItem.quantity;
      const currentStockQuantity = availability?.currentStockQuantity ?? purchaseItem.quantity;

      if (exceedsAvailableQuantity(item.quantity, remainingQuantity)) {
        availableQuantityErrors[index] = `Return quantity cannot exceed remaining returnable quantity (${remainingQuantity}).`;
      } else if (exceedsAvailableQuantity(item.quantity, currentStockQuantity)) {
        availableQuantityErrors[index] = `Return quantity cannot exceed current sellable stock (${currentStockQuantity}).`;
      }
    });

    if (Object.keys(availableQuantityErrors).length > 0) {
      setQuantityErrors(availableQuantityErrors);
      return;
    }

    const items = validatedValues.items
      .filter((item) => Number(item.quantity) > 0)
      .map((item) => ({
        originalPurchaseItemId: item.originalPurchaseItemId,
        quantity: item.quantity.trim(),
      }));

    try {
      const response = await createReturn.mutateAsync({
        input: {
          originalPurchaseId: validatedValues.originalPurchaseId,
          returnDate: validatedValues.returnDate,
          reason: validatedValues.reason.trim(),
          items,
        },
        idempotencyKey: idempotencyKey.current,
      });
      idempotencyKey.current = crypto.randomUUID();
      onSaved(response.data.purchaseReturn.id);
    } catch (error) {
      applyApiErrors(error);
    }
  }

  return (
    <form className="management-form" onSubmit={handleSubmit(savePurchaseReturn)}>
      <section className="management-card">
        <h2>Original purchase</h2>
        <div className="payment-filter-grid">
          <label className="ui-field">
            <span>Supplier</span>
            <select
              disabled={createReturn.isPending || suppliersQuery.isPending}
              onChange={(event) => {
                const supplierId = event.target.value;
                setSelectedSupplierId(supplierId);
                setValue("originalPurchaseId", "");
                setReturnItems([]);
                setQuantityErrors({});
                clearErrors("originalPurchaseId");
                setFormError("");
              }}
              value={selectedSupplierId}
            >
              <option value="">Select supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.code} · {supplier.name}
                </option>
              ))}
            </select>
          </label>

          <label className="ui-field">
            <span>Confirmed purchase</span>
            <select
              disabled={!selectedSupplierId || createReturn.isPending || confirmedPurchasesQuery.isPending}
              {...register("originalPurchaseId")}
            >
              <option value="">{selectedSupplierId ? "Select confirmed purchase" : "Select supplier first"}</option>
              {confirmedPurchases.map((purchase) => (
                <option key={purchase.id} value={purchase.id}>
                  {purchase.purchaseNumber ?? "Confirmed purchase"} · {purchase.purchaseDate} · PKR {purchase.totalAmount}
                </option>
              ))}
            </select>
            {errors.originalPurchaseId ? (
              <small className="error-message">{errors.originalPurchaseId.message}</small>
            ) : null}
          </label>

          <label className="ui-field">
            <span>Return date</span>
            <input
              disabled={createReturn.isPending}
              max={today()}
              min={selectedPurchase?.purchase.purchaseDate}
              type="date"
              {...register("returnDate")}
            />
            {errors.returnDate ? (
              <small className="error-message">{errors.returnDate.message}</small>
            ) : null}
          </label>
        </div>

        {suppliersQuery.isError ? (
          <p className="error-message">Suppliers could not be loaded.</p>
        ) : null}
        {selectedSupplierId && confirmedPurchasesQuery.isError ? (
          <p className="error-message">Confirmed purchases could not be loaded.</p>
        ) : null}
        {selectedSupplierId && !confirmedPurchasesQuery.isPending && !confirmedPurchasesQuery.isError && confirmedPurchases.length === 0 ? (
          <p>No confirmed purchases were found for this supplier.</p>
        ) : null}
        {selectedPurchaseQuery.isPending && originalPurchaseId ? (
          <p>Loading purchase items...</p>
        ) : null}
        {selectedPurchaseQuery.isError ? (
          <p className="error-message">The selected purchase could not be loaded.</p>
        ) : null}
      </section>

      {selectedPurchase ? (
        <section className="management-card">
          <h2>Returned items</h2>
          <p>
            Enter only the quantity being returned. Previously returned quantity and
            current sellable stock are shown for each original purchase line.
          </p>

          <div className="table-scroll">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Purchased qty</th>
                  <th>Already returned</th>
                  <th>Remaining qty</th>
                  <th>Stock on hand</th>
                  <th>Cost</th>
                  <th>Return qty</th>
                </tr>
              </thead>
              <tbody>
                {returnItems.map((returnItem, index) => {
                  const purchaseItem = selectedPurchase.items[index];

                  if (!purchaseItem) return null;

                  const availability = returnAvailabilityByItemId.get(purchaseItem.id);
                  const returnedQuantity = availability?.returnedQuantity ?? "0.000";
                  const remainingQuantity = availability?.remainingReturnableQuantity ?? purchaseItem.quantity;
                  const currentStockQuantity = availability?.currentStockQuantity ?? "0.000";
                  const canReturn = Number(remainingQuantity) > 0 && Number(currentStockQuantity) > 0;

                  return (
                    <tr key={purchaseItem.id}>
                      <td>
                        {purchaseItem.productSkuSnapshot} - {purchaseItem.productNameSnapshot} ({purchaseItem.unitNameSnapshot})
                      </td>
                      <td>{purchaseItem.quantity}</td>
                      <td>{returnedQuantity}</td>
                      <td>{remainingQuantity}</td>
                      <td>{currentStockQuantity}</td>
                      <td>PKR {purchaseItem.landedUnitCost}</td>
                      <td>
                        <label className="ui-field compact-money-field">
                          <span className="sr-only">
                            Return quantity for {purchaseItem.productNameSnapshot}
                          </span>
                          <input
                            disabled={createReturn.isPending || !canReturn}
                            inputMode="decimal"
                            onChange={(event) => {
                              const quantity = event.target.value;
                              setReturnItems((currentItems) =>
                                currentItems.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, quantity } : item,
                                ),
                              );
                              setQuantityErrors((currentErrors) => {
                                const nextErrors = { ...currentErrors };
                                if (exceedsAvailableQuantity(quantity, remainingQuantity)) {
                                  nextErrors[index] = `Return quantity cannot exceed remaining returnable quantity (${remainingQuantity}).`;
                                } else if (exceedsAvailableQuantity(quantity, currentStockQuantity)) {
                                  nextErrors[index] = `Return quantity cannot exceed current sellable stock (${currentStockQuantity}).`;
                                } else {
                                  delete nextErrors[index];
                                }
                                return nextErrors;
                              });
                              clearErrors("items");
                            }}
                            placeholder="0.000"
                            value={returnItem.quantity}
                          />
                          {quantityErrors[index] ? (
                            <small className="error-message">{quantityErrors[index]}</small>
                          ) : errors.items?.[index]?.quantity ? (
                            <small className="error-message">
                              {errors.items[index]?.quantity?.message}
                            </small>
                          ) : null}
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {errors.items?.message ? (
            <p className="error-message">{errors.items.message}</p>
          ) : null}
        </section>
      ) : null}

      <section className="management-card">
        <label className="ui-field">
          <span>Return reason</span>
          <textarea
            disabled={createReturn.isPending}
            rows={3}
            {...register("reason")}
          />
          {errors.reason ? (
            <small className="error-message">{errors.reason.message}</small>
          ) : null}
        </label>
      </section>

      {formError ? <p className="error-message">{formError}</p> : null}

      <div className="form-actions">
        <Button
          disabled={createReturn.isPending}
          label={createReturn.isPending ? "Creating..." : "Confirm Purchase Return"}
          type="submit"
        />
        <Button
          disabled={createReturn.isPending}
          label="Cancel"
          onClick={onCancel}
          type="button"
        />
      </div>
    </form>
  );
}
