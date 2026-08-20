import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import type { Customer } from "../api/customers.api.ts";
import {
  useCreateCustomer,
  useUpdateCustomer,
} from "../hooks/use-customers.ts";

const optionalEmailSchema = z
  .string()
  .trim()
  .refine(
    (value) => value.length === 0 || z.string().email().safeParse(value).success,
    "Enter a valid email address.",
  );

/** Converts a valid non-negative money string into integer cents for exact comparisons. */
function moneyToCents(value: string): bigint | null {
  const match = value.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);

  if (!match) {
    return null;
  }

  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

const customerFormSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required."),
  phone: z.string().trim().max(30, "Phone is too long."),
  email: optionalEmailSchema,
  address: z.string().trim().max(500, "Address is too long."),
  creditLimit: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Use a non-negative amount with up to 2 decimals."),
  openingBalance: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Use a non-negative amount with up to 2 decimals."),
  isActive: z.boolean(),
}).superRefine((values, context) => {
  const openingBalance = moneyToCents(values.openingBalance);
  const creditLimit = moneyToCents(values.creditLimit);

  if (openingBalance !== null && creditLimit !== null && openingBalance > creditLimit) {
    context.addIssue({
      code: "custom",
      path: ["openingBalance"],
      message: "Opening balance cannot exceed the credit limit.",
    });
  }
});

type CustomerFormValues = z.infer<typeof customerFormSchema>;

interface CustomerFormProps {
  customer?: Customer;
  onSaved(): void;
  onCancel(): void;
}

/** Converts blank optional form text to the API null value. */
function optionalText(value: string): string | null {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

/** Returns the initial form values for create or edit mode. */
function createDefaultValues(customer?: Customer): CustomerFormValues {
  return {
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
    address: customer?.address ?? "",
    creditLimit: customer?.creditLimit ?? "0.00",
    openingBalance: "0.00",
    isActive: customer?.isActive ?? true,
  };
}

/** Renders the shared create and edit customer form. */
export function CustomerForm({
  customer,
  onSaved,
  onCancel,
}: CustomerFormProps): React.JSX.Element {
  const createMutation = useCreateCustomer();
  const updateMutation = useUpdateCustomer();
  const [formError, setFormError] = useState("");
  const isEditing = Boolean(customer);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: createDefaultValues(customer),
  });

  useEffect(() => {
    reset(createDefaultValues(customer));
  }, [customer, reset]);

  /** Copies API field errors into React Hook Form. */
  function applyApiError(error: unknown): void {
    if (!(error instanceof ApiError)) {
      setFormError("The customer could not be saved.");
      return;
    }

    setFormError(error.message);

    for (const fieldError of error.fieldErrors) {
      const field = fieldError.field as keyof CustomerFormValues;
      setError(field, { message: fieldError.message });
    }
  }

  /** Saves a new customer or updates the current customer. */
  async function saveCustomer(values: CustomerFormValues): Promise<void> {
    setFormError("");

    const commonInput = {
      name: values.name.trim(),
      phone: optionalText(values.phone),
      email: optionalText(values.email),
      address: optionalText(values.address),
      creditLimit: values.creditLimit.trim(),
    };

    try {
      if (customer) {
        await updateMutation.mutateAsync({
          customerId: customer.id,
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
    <form className="customer-form" onSubmit={handleSubmit(saveCustomer)}>
      <div className="customer-form-grid">
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

        <label className="ui-field">
          <span>Credit limit</span>
          <input inputMode="decimal" {...register("creditLimit")} />
          {errors.creditLimit ? <small className="error-message">{errors.creditLimit.message}</small> : null}
        </label>

        {!isEditing ? (
          <label className="ui-field">
            <span>Opening balance</span>
            <input inputMode="decimal" {...register("openingBalance")} />
            <small className="field-help">Enter the customer's existing due, up to the credit limit, or leave 0.00 for a new customer.</small>
            {errors.openingBalance ? (
              <small className="error-message">{errors.openingBalance.message}</small>
            ) : null}
          </label>
        ) : null}

        {isEditing ? (
          <label className="customer-checkbox">
            <input type="checkbox" {...register("isActive")} />
            <span>Customer is active</span>
          </label>
        ) : null}

        <label className="ui-field customer-form-wide">
          <span>Address</span>
          <textarea rows={4} {...register("address")} />
          {errors.address ? <small className="error-message">{errors.address.message}</small> : null}
        </label>
      </div>

      {formError ? <p className="error-message">{formError}</p> : null}

      <div className="form-actions">
        <Button disabled={isSaving} label={isSaving ? "Saving..." : "Save customer"} type="submit" />
        <Button disabled={isSaving} label="Cancel" onClick={onCancel} />
      </div>
    </form>
  );
}
