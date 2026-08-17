import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import { useProducts } from "../../products/hooks/use-products.ts";
import type { StockCondition } from "../api/inventory.api.ts";
import { useCreateOpeningStock } from "../hooks/use-inventory.ts";

const positiveQuantitySchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/, "Use a quantity with up to three decimal places.")
  .refine((value) => Number(value) > 0, "Quantity must be greater than zero.");

const positiveMoneySchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Use a cost with up to two decimal places.")
  .refine((value) => Number(value) > 0, "Unit cost must be greater than zero.");

const openingStockFormSchema = z
  .object({
    items: z
      .array(
        z.object({
          productId: z.string().uuid("Select a product."),
          stockCondition: z.enum(["SELLABLE", "DAMAGED", "EXPIRED"]),
          quantity: positiveQuantitySchema,
          unitCost: positiveMoneySchema,
        }),
      )
      .min(1, "Add at least one opening-stock item."),
    notes: z.string().trim().max(500, "Notes are too long."),
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

type OpeningStockFormValues = z.infer<typeof openingStockFormSchema>;

interface OpeningStockFormProps {
  onSaved(): void;
  onCancel(): void;
}

const stockConditions: Array<{ value: StockCondition; label: string }> = [
  { value: "SELLABLE", label: "Sellable" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "EXPIRED", label: "Expired" },
];

/** Creates one empty opening-stock row for the form. */
function emptyOpeningStockItem(): OpeningStockFormValues["items"][number] {
  return {
    productId: "",
    stockCondition: "SELLABLE",
    quantity: "",
    unitCost: "",
  };
}

/** Converts optional notes into the API's nullable text value. */
function optionalNotes(value: string): string | null {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

/** Renders the setup-only opening-stock form. */
export function OpeningStockForm({
  onSaved,
  onCancel,
}: OpeningStockFormProps): React.JSX.Element {
  const productsQuery = useProducts({ active: true, page: 1, pageSize: 100 });
  const createMutation = useCreateOpeningStock();
  const [formError, setFormError] = useState("");
  const products = productsQuery.data?.data.items ?? [];

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OpeningStockFormValues>({
    resolver: zodResolver(openingStockFormSchema),
    defaultValues: { items: [emptyOpeningStockItem()], notes: "" },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  /** Adds another opening-stock row. */
  function addItem(): void {
    append(emptyOpeningStockItem());
  }

  /** Removes one opening-stock row while keeping at least one row. */
  function removeItem(index: number): void {
    if (fields.length > 1) {
      remove(index);
    }
  }

  /** Sends all opening-stock rows as one transactional request. */
  async function saveOpeningStock(values: OpeningStockFormValues): Promise<void> {
    setFormError("");

    try {
      await createMutation.mutateAsync({
        items: values.items,
        notes: optionalNotes(values.notes),
      });
      onSaved();
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Opening stock could not be saved.",
      );
    }
  }

  return (
    <form className="inventory-entry-form" onSubmit={handleSubmit(saveOpeningStock)}>
      <div className="inventory-entry-items">
        {fields.map((field, index) => (
          <section className="inventory-entry-row" key={field.id}>
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
              <span>Quantity</span>
              <input inputMode="decimal" {...register(`items.${index}.quantity`)} />
              {errors.items?.[index]?.quantity ? (
                <small className="error-message">
                  {errors.items[index]?.quantity?.message}
                </small>
              ) : null}
            </label>

            <label className="ui-field">
              <span>Unit cost (PKR)</span>
              <input inputMode="decimal" {...register(`items.${index}.unitCost`)} />
              {errors.items?.[index]?.unitCost ? (
                <small className="error-message">
                  {errors.items[index]?.unitCost?.message}
                </small>
              ) : null}
            </label>

            <Button
              disabled={fields.length === 1 || createMutation.isPending}
              label="Remove"
              onClick={() => removeItem(index)}
            />
          </section>
        ))}
      </div>

      <Button
        disabled={createMutation.isPending}
        label="Add another item"
        onClick={addItem}
      />

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
          disabled={createMutation.isPending || productsQuery.isPending}
          label={createMutation.isPending ? "Saving..." : "Save opening stock"}
          type="submit"
        />
        <Button
          disabled={createMutation.isPending}
          label="Cancel"
          onClick={onCancel}
        />
      </div>
    </form>
  );
}
