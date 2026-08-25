import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import { useProducts } from "../../products/hooks/use-products.ts";
import type {
  InventoryAdjustmentReason,
  StockCondition,
  StockDirection,
} from "../api/inventory.api.ts";
import { useCreateInventoryAdjustment } from "../hooks/use-inventory.ts";

const adjustmentFormSchema = z
  .object({
    productId: z.string().uuid("Select a product."),
    stockCondition: z.enum(["SELLABLE", "DAMAGED", "EXPIRED"]),
    direction: z.enum(["IN", "OUT"]),
    quantity: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,3})?$/, "Use up to three decimal places.")
      .refine((value) => Number(value) > 0, "Quantity must be greater than zero."),
    reason: z.enum([
      "FOUND_STOCK",
      "MISSING_STOCK",
      "DAMAGED",
      "EXPIRED",
      "DISPOSAL",
      "DATA_CORRECTION",
      "OTHER",
    ]),
    unitCost: z.string().trim(),
    notes: z.string().trim().max(500, "Notes are too long."),
  })
  .superRefine((values, context) => {
    if (values.direction === "IN") {
      if (!/^\d+(\.\d{1,2})?$/.test(values.unitCost) || Number(values.unitCost) <= 0) {
        context.addIssue({
          code: "custom",
          message: "A positive unit cost with up to two decimals is required.",
          path: ["unitCost"],
        });
      }
    }

    if (values.reason === "OTHER" && values.notes.trim().length === 0) {
      context.addIssue({
        code: "custom",
        message: "Notes are required when the reason is Other.",
        path: ["notes"],
      });
    }
  });

type AdjustmentFormValues = z.infer<typeof adjustmentFormSchema>;

interface InventoryAdjustmentFormProps {
  onSaved(): void;
  onCancel(): void;
}

const stockConditions: Array<{ value: StockCondition; label: string }> = [
  { value: "SELLABLE", label: "Sellable" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "EXPIRED", label: "Expired" },
];

const directions: Array<{ value: StockDirection; label: string }> = [
  { value: "IN", label: "Stock in" },
  { value: "OUT", label: "Stock out" },
];

const adjustmentReasons: Array<{
  value: InventoryAdjustmentReason;
  label: string;
}> = [
  { value: "FOUND_STOCK", label: "Found stock" },
  { value: "MISSING_STOCK", label: "Missing stock" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "EXPIRED", label: "Expired" },
  { value: "DISPOSAL", label: "Disposal" },
  { value: "DATA_CORRECTION", label: "Data correction" },
  { value: "OTHER", label: "Other" },
];

/** Converts optional notes into the API's nullable text value. */
function optionalNotes(value: string): string | null {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

/** Renders the manual inventory adjustment form. */
export function InventoryAdjustmentForm({
  onSaved,
  onCancel,
}: InventoryAdjustmentFormProps): React.JSX.Element {
  const productsQuery = useProducts({ active: true, page: 1, pageSize: 100 });
  const createMutation = useCreateInventoryAdjustment();
  const idempotencyKey = useRef(crypto.randomUUID());
  const [formError, setFormError] = useState("");
  const products = productsQuery.data?.data.items ?? [];

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentFormSchema),
    defaultValues: {
      productId: "",
      stockCondition: "SELLABLE",
      direction: "IN",
      quantity: "",
      reason: "DATA_CORRECTION",
      unitCost: "",
      notes: "",
    },
  });

  const direction = watch("direction");
  const reason = watch("reason");

  /** Sends one clear stock movement to the adjustment API. */
  async function saveAdjustment(values: AdjustmentFormValues): Promise<void> {
    setFormError("");

    try {
      await createMutation.mutateAsync({
        input: {
          productId: values.productId,
          stockCondition: values.stockCondition,
          direction: values.direction,
          quantity: values.quantity,
          reason: values.reason.trim(),
          unitCost: values.direction === "IN" ? values.unitCost : undefined,
          notes: optionalNotes(values.notes),
        },
        idempotencyKey: idempotencyKey.current,
      });
      idempotencyKey.current = crypto.randomUUID();
      onSaved();
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "The inventory adjustment could not be saved.",
      );
    }
  }

  return (
    <form className="inventory-entry-form" onSubmit={handleSubmit(saveAdjustment)}>
      <div className="inventory-adjustment-grid">
        <label className="ui-field inventory-form-wide">
          <span>Product</span>
          <select {...register("productId")}>
            <option value="">Select product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.sku} — {product.name} ({product.baseUnitName})
              </option>
            ))}
          </select>
          {errors.productId ? (
            <small className="error-message">{errors.productId.message}</small>
          ) : null}
        </label>

        <label className="ui-field">
          <span>Stock condition</span>
          <select {...register("stockCondition")}>
            {stockConditions.map((condition) => (
              <option key={condition.value} value={condition.value}>
                {condition.label}
              </option>
            ))}
          </select>
        </label>

        <label className="ui-field">
          <span>Direction</span>
          <select {...register("direction")}>
            {directions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="ui-field">
          <span>Quantity</span>
          <input inputMode="decimal" {...register("quantity")} />
          {errors.quantity ? (
            <small className="error-message">{errors.quantity.message}</small>
          ) : null}
        </label>

        {direction === "IN" ? (
          <label className="ui-field">
            <span>Unit cost (PKR)</span>
            <input inputMode="decimal" {...register("unitCost")} />
            {errors.unitCost ? (
              <small className="error-message">{errors.unitCost.message}</small>
            ) : null}
          </label>
        ) : null}

        <label className="ui-field inventory-form-wide">
          <span>Reason</span>
          <select {...register("reason")}>
            {adjustmentReasons.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          {errors.reason ? (
            <small className="error-message">{errors.reason.message}</small>
          ) : null}
        </label>

        <label className="ui-field inventory-form-wide">
          <span>{reason === "OTHER" ? "Notes (required)" : "Notes"}</span>
          <textarea rows={4} {...register("notes")} />
          {errors.notes ? (
            <small className="error-message">{errors.notes.message}</small>
          ) : null}
        </label>
      </div>

      {productsQuery.isPending ? <p>Loading products...</p> : null}
      {productsQuery.isError ? (
        <p className="error-message">Products could not be loaded.</p>
      ) : null}
      {formError ? <p className="error-message">{formError}</p> : null}

      <div className="form-actions">
        <Button
          disabled={createMutation.isPending || productsQuery.isPending}
          label={createMutation.isPending ? "Saving..." : "Save adjustment"}
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
