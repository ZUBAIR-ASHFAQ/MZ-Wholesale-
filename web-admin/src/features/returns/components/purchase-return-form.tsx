import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import { usePurchase, usePurchases } from "../../purchases/hooks/use-purchases.ts";
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
    returnDate: z.string().min(1, "Return date is required."),
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
  onSaved(): void;
  onCancel(): void;
}

/** Returns today's local form date in YYYY-MM-DD format. */
function today(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
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
  const confirmedPurchasesQuery = usePurchases({
    status: "CONFIRMED",
    page: 1,
    pageSize: 100,
  });
  const createReturn = useCreatePurchaseReturn();
  const [formError, setFormError] = useState("");

  const {
    control,
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<PurchaseReturnFormValues>({
    resolver: zodResolver(purchaseReturnFormSchema),
    defaultValues: {
      originalPurchaseId: initialOriginalPurchaseId,
      returnDate: today(),
      reason: "",
      items: [],
    },
  });

  const { fields, replace } = useFieldArray({ control, name: "items" });
  const originalPurchaseId = watch("originalPurchaseId");
  const selectedPurchaseQuery = usePurchase(originalPurchaseId);
  const selectedPurchase = selectedPurchaseQuery.data?.data;
  const confirmedPurchases = confirmedPurchasesQuery.data?.data.items ?? [];

  useEffect(() => {
    if (!selectedPurchase) {
      replace([]);
      return;
    }

    replace(
      selectedPurchase.items.map((item) => ({
        originalPurchaseItemId: item.id,
        quantity: "",
      })),
    );
  }, [replace, selectedPurchase]);

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

    const items = values.items
      .filter((item) => Number(item.quantity) > 0)
      .map((item) => ({
        originalPurchaseItemId: item.originalPurchaseItemId,
        quantity: item.quantity.trim(),
      }));

    try {
      await createReturn.mutateAsync({
        input: {
          originalPurchaseId: values.originalPurchaseId,
          returnDate: values.returnDate,
          reason: values.reason.trim(),
          items,
        },
        idempotencyKey: crypto.randomUUID(),
      });
      onSaved();
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
            <span>Confirmed purchase</span>
            <select
              disabled={createReturn.isPending || confirmedPurchasesQuery.isPending}
              {...register("originalPurchaseId")}
            >
              <option value="">Select confirmed purchase</option>
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
              type="date"
              {...register("returnDate")}
            />
            {errors.returnDate ? (
              <small className="error-message">{errors.returnDate.message}</small>
            ) : null}
          </label>
        </div>

        {confirmedPurchasesQuery.isError ? (
          <p className="error-message">Confirmed purchases could not be loaded.</p>
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
            Enter only the quantity being returned. The server checks previously
            returned quantities before confirmation.
          </p>

          <div className="table-scroll">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Purchased qty</th>
                  <th>Cost</th>
                  <th>Return qty</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => {
                  const purchaseItem = selectedPurchase.items[index];

                  if (!purchaseItem) return null;

                  return (
                    <tr key={field.id}>
                      <td>
                        {purchaseItem.productSkuSnapshot} - {purchaseItem.productNameSnapshot} ({purchaseItem.unitNameSnapshot})
                      </td>
                      <td>{purchaseItem.quantity}</td>
                      <td>PKR {purchaseItem.landedUnitCost}</td>
                      <td>
                        <label className="ui-field compact-money-field">
                          <span className="sr-only">
                            Return quantity for {purchaseItem.productNameSnapshot}
                          </span>
                          <input
                            disabled={createReturn.isPending}
                            inputMode="decimal"
                            placeholder="0.000"
                            {...register(`items.${index}.quantity`)}
                          />
                          {errors.items?.[index]?.quantity ? (
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
