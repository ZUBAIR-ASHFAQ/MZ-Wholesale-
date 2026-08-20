import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import type { Supplier } from "../api/suppliers.api.ts";
import {
  useCreateSupplier,
  useUpdateSupplier,
} from "../hooks/use-suppliers.ts";

const optionalEmailSchema = z
  .string()
  .trim()
  .refine(
    (value) => value.length === 0 || z.string().email().safeParse(value).success,
    "Enter a valid email address.",
  );

const supplierFormSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required."),
  phone: z.string().trim().max(30, "Phone is too long."),
  email: optionalEmailSchema,
  address: z.string().trim().max(500, "Address is too long."),
  openingBalance: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Use a non-negative amount with up to 2 decimals."),
  isActive: z.boolean(),
});

type SupplierFormValues = z.infer<typeof supplierFormSchema>;

interface SupplierFormProps {
  supplier?: Supplier;
  onSaved(): void;
  onCancel(): void;
}

/** Converts blank optional text into the null value accepted by the API. */
function optionalText(value: string): string | null {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

/** Returns the starting values for create or edit mode. */
function createDefaultValues(supplier?: Supplier): SupplierFormValues {
  return {
    name: supplier?.name ?? "",
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
    address: supplier?.address ?? "",
    openingBalance: "0.00",
    isActive: supplier?.isActive ?? true,
  };
}

/** Renders the shared create and edit supplier form. */
export function SupplierForm({
  supplier,
  onSaved,
  onCancel,
}: SupplierFormProps): React.JSX.Element {
  const createMutation = useCreateSupplier();
  const updateMutation = useUpdateSupplier();
  const [formError, setFormError] = useState("");
  const isEditing = Boolean(supplier);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: createDefaultValues(supplier),
  });

  useEffect(() => {
    reset(createDefaultValues(supplier));
  }, [supplier, reset]);

  /** Copies API validation errors into React Hook Form fields. */
  function applyApiError(error: unknown): void {
    if (!(error instanceof ApiError)) {
      setFormError("The supplier could not be saved.");
      return;
    }

    setFormError(error.message);

    for (const fieldError of error.fieldErrors) {
      const field = fieldError.field as keyof SupplierFormValues;
      setError(field, { message: fieldError.message });
    }
  }

  /** Creates a supplier or saves changes to the current supplier. */
  async function saveSupplier(values: SupplierFormValues): Promise<void> {
    setFormError("");

    const commonInput = {
      name: values.name.trim(),
      phone: optionalText(values.phone),
      email: optionalText(values.email),
      address: optionalText(values.address),
    };

    try {
      if (supplier) {
        await updateMutation.mutateAsync({
          supplierId: supplier.id,
          input: { ...commonInput, isActive: values.isActive },
        });
      } else {
        await createMutation.mutateAsync({
          ...commonInput,
          openingBalance: values.openingBalance.trim(),
        });
      }

      onSaved();
    } catch (error) {
      applyApiError(error);
    }
  }

  return (
    <form className="supplier-form" onSubmit={handleSubmit(saveSupplier)}>
      <div className="supplier-form-grid">
        <label className="ui-field">
          <span>Name</span>
          <input {...register("name")} />
          {errors.name ? <small className="error-message">{errors.name.message}</small> : null}
        </label>

        <label className="ui-field">
          <span>Phone</span>
          <input {...register("phone")} />
          {errors.phone ? <small className="error-message">{errors.phone.message}</small> : null}
        </label>

        <label className="ui-field">
          <span>Email</span>
          <input type="email" {...register("email")} />
          {errors.email ? <small className="error-message">{errors.email.message}</small> : null}
        </label>

        {!isEditing ? (
          <label className="ui-field">
            <span>Opening payable</span>
            <input inputMode="decimal" {...register("openingBalance")} />
            <small className="field-help">Enter an existing amount owed to this supplier, or leave 0.00 for a new supplier.</small>
            {errors.openingBalance ? (
              <small className="error-message">{errors.openingBalance.message}</small>
            ) : null}
          </label>
        ) : null}

        {isEditing ? (
          <label className="supplier-checkbox">
            <input type="checkbox" {...register("isActive")} />
            <span>Supplier is active</span>
          </label>
        ) : null}

        <label className="ui-field supplier-form-wide">
          <span>Address</span>
          <textarea rows={4} {...register("address")} />
          {errors.address ? <small className="error-message">{errors.address.message}</small> : null}
        </label>
      </div>

      {formError ? <p className="error-message">{formError}</p> : null}

      <div className="form-actions">
        <Button disabled={isSaving} label={isSaving ? "Saving..." : "Save supplier"} type="submit" />
        <Button disabled={isSaving} label="Cancel" onClick={onCancel} />
      </div>
    </form>
  );
}
