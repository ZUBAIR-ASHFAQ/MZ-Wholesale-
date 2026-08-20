import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import { currentBusinessDate } from "../../../lib/utils.ts";
import { useProducts } from "../../products/hooks/use-products.ts";
import type {
  StockCondition,
  StockCountDetail,
} from "../api/inventory.api.ts";
import {
  useCreateStockCount,
  useUpdateStockCount,
} from "../hooks/use-inventory.ts";

const countedQuantitySchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/, "Use a quantity with up to three decimal places.");

const stockCountFormSchema = z
  .object({
    countDate: z
      .string()
      .min(1, "Count date is required.")
      .refine((value) => value <= todayDate(), "Count date cannot be in the future."),
    notes: z.string().trim().max(500, "Notes are too long."),
    items: z
      .array(
        z.object({
          productId: z.string().uuid("Select a product."),
          stockCondition: z.enum(["SELLABLE", "DAMAGED", "EXPIRED"]),
          countedQuantity: countedQuantitySchema,
        }),
      )
      .min(1, "Add at least one product to the count."),
  })
  .superRefine((values, context) => {
    const uniqueItems = new Set<string>();

    for (let index = 0; index < values.items.length; index += 1) {
      const item = values.items[index];
      const key = `${item.productId}:${item.stockCondition}`;

      if (uniqueItems.has(key)) {
        context.addIssue({
          code: "custom",
          message: "The same product and stock condition cannot be repeated.",
          path: ["items", index, "productId"],
        });
      }

      uniqueItems.add(key);
    }
  });

type StockCountFormValues = z.infer<typeof stockCountFormSchema>;

interface StockCountFormProps {
  stockCountId?: string;
  existingDetail?: StockCountDetail;
  onSaved(stockCountId: string): void;
  onCancel(): void;
}

const stockConditions: Array<{ value: StockCondition; label: string }> = [
  { value: "SELLABLE", label: "Sellable" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "EXPIRED", label: "Expired" },
];

/** Returns today's browser-local date in YYYY-MM-DD format. */
function todayDate(): string {
  return currentBusinessDate();
}

/** Creates one empty stock-count item row. */
function emptyCountItem(): StockCountFormValues["items"][number] {
  return {
    productId: "",
    stockCondition: "SELLABLE",
    countedQuantity: "0",
  };
}

/** Converts optional form notes into the nullable API value. */
function optionalNotes(value: string): string | null {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

/** Converts saved stock-count data into editable form values. */
function detailToFormValues(detail: StockCountDetail): StockCountFormValues {
  return {
    countDate: detail.stockCount.countDate,
    notes: detail.stockCount.notes ?? "",
    items: detail.items.map((item) => ({
      productId: item.productId,
      stockCondition: item.stockCondition,
      countedQuantity: item.countedQuantity,
    })),
  };
}

/** Renders the shared create and edit form for draft stock counts. */
export function StockCountForm({
  stockCountId,
  existingDetail,
  onSaved,
  onCancel,
}: StockCountFormProps): React.JSX.Element {
  const isEdit = Boolean(stockCountId);
  const productsQuery = useProducts({ active: true, page: 1, pageSize: 100 });
  const createMutation = useCreateStockCount();
  const updateMutation = useUpdateStockCount();
  const [formError, setFormError] = useState("");
  const products = productsQuery.data?.data.items ?? [];
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<StockCountFormValues>({
    resolver: zodResolver(stockCountFormSchema),
    defaultValues: {
      countDate: todayDate(),
      notes: "",
      items: [emptyCountItem()],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  useEffect(() => {
    if (existingDetail) {
      reset(detailToFormValues(existingDetail));
    }
  }, [existingDetail, reset]);

  /** Adds one empty product row to the draft count. */
  function addItem(): void {
    append(emptyCountItem());
  }

  /** Removes one row while preserving at least one count item. */
  function removeItem(index: number): void {
    if (fields.length > 1) {
      remove(index);
    }
  }

  /** Creates or updates a draft stock count through the existing API hooks. */
  async function saveStockCount(values: StockCountFormValues): Promise<void> {
    setFormError("");

    try {
      if (stockCountId) {
        const response = await updateMutation.mutateAsync({
          stockCountId,
          input: {
            notes: optionalNotes(values.notes),
            items: values.items,
          },
        });
        onSaved(response.data.stockCount.id);
        return;
      }

      const response = await createMutation.mutateAsync({
        countDate: values.countDate,
        notes: optionalNotes(values.notes),
        items: values.items,
      });
      onSaved(response.data.stockCount.id);
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "The stock count could not be saved.",
      );
    }
  }

  return (
    <form className="inventory-entry-form" onSubmit={handleSubmit(saveStockCount)}>
      <label className="ui-field">
        <span>Count date</span>
        <input disabled={isEdit} max={todayDate()} type="date" {...register("countDate")} />
        {errors.countDate ? (
          <small className="error-message">{errors.countDate.message}</small>
        ) : null}
      </label>

      <div className="inventory-entry-items">
        {fields.map((field, index) => (
          <section className="inventory-entry-row stock-count-entry-row" key={field.id}>
            <label className="ui-field">
              <span>Product</span>
              <select {...register(`items.${index}.productId`)}>
                <option value="">Select product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.sku} — {product.name} ({product.baseUnitName})
                  </option>
                ))}
              </select>
              {errors.items?.[index]?.productId ? (
                <small className="error-message">
                  {errors.items[index]?.productId?.message}
                </small>
              ) : null}
            </label>

            <label className="ui-field">
              <span>Stock condition</span>
              <select {...register(`items.${index}.stockCondition`)}>
                {stockConditions.map((condition) => (
                  <option key={condition.value} value={condition.value}>
                    {condition.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="ui-field">
              <span>Counted quantity</span>
              <input
                inputMode="decimal"
                {...register(`items.${index}.countedQuantity`)}
              />
              {errors.items?.[index]?.countedQuantity ? (
                <small className="error-message">
                  {errors.items[index]?.countedQuantity?.message}
                </small>
              ) : null}
            </label>

            <Button
              disabled={fields.length === 1 || isSaving}
              label="Remove"
              onClick={() => removeItem(index)}
            />
          </section>
        ))}
      </div>

      {errors.items?.root ? (
        <p className="error-message">{errors.items.root.message}</p>
      ) : null}

      <Button disabled={isSaving} label="Add another item" onClick={addItem} />

      <label className="ui-field">
        <span>Notes</span>
        <textarea rows={4} {...register("notes")} />
        {errors.notes ? (
          <small className="error-message">{errors.notes.message}</small>
        ) : null}
      </label>

      {productsQuery.isPending ? <p>Loading products...</p> : null}
      {productsQuery.isError ? (
        <p className="error-message">Products could not be loaded.</p>
      ) : null}
      {formError ? <p className="error-message">{formError}</p> : null}

      <div className="form-actions">
        <Button
          disabled={isSaving || productsQuery.isPending}
          label={isSaving ? "Saving..." : isEdit ? "Update draft" : "Create draft"}
          type="submit"
        />
        <Button disabled={isSaving} label="Cancel" onClick={onCancel} />
      </div>
    </form>
  );
}
