import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import type { ExpenseCategory } from "../api/expenses.api.ts";
import {
  useCreateExpenseCategory,
  useUpdateExpenseCategory,
} from "../hooks/use-expenses.ts";

const expenseCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Category name is required.")
    .max(120, "Category name must be 120 characters or fewer."),
});

type ExpenseCategoryFormValues = z.infer<typeof expenseCategorySchema>;

interface ExpenseCategoryFormProps {
  category: ExpenseCategory | null;
  onFinished(): void;
}

/** Returns a readable message from an API or unexpected form error. */
function readError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "The expense category could not be saved.";
}

/** Creates a new expense category or renames the selected category. */
export function ExpenseCategoryForm({
  category,
  onFinished,
}: ExpenseCategoryFormProps): React.JSX.Element {
  const createCategory = useCreateExpenseCategory();
  const updateCategory = useUpdateExpenseCategory();
  const isSaving = createCategory.isPending || updateCategory.isPending;
  const form = useForm<ExpenseCategoryFormValues>({
    resolver: zodResolver(expenseCategorySchema),
    defaultValues: { name: "" },
  });

  useEffect(() => {
    form.reset({ name: category?.name ?? "" });
  }, [category, form]);

  /** Saves the validated category name. */
  async function handleSubmit(
    values: ExpenseCategoryFormValues,
  ): Promise<void> {
    try {
      if (category) {
        await updateCategory.mutateAsync({
          categoryId: category.id,
          input: { name: values.name.trim() },
        });
      } else {
        await createCategory.mutateAsync({ name: values.name.trim() });
      }

      form.reset({ name: "" });
      onFinished();
    } catch (error) {
      form.setError("root", { message: readError(error) });
    }
  }

  return (
    <form
      className="management-form"
      onSubmit={form.handleSubmit(handleSubmit)}
    >
      <h3>{category ? "Rename expense category" : "Add expense category"}</h3>

      <label className="ui-field">
        <span>Category name</span>
        <input {...form.register("name")} />
        {form.formState.errors.name ? (
          <small>{form.formState.errors.name.message}</small>
        ) : null}
      </label>

      {form.formState.errors.root ? (
        <p className="error-message">{form.formState.errors.root.message}</p>
      ) : null}

      <div className="form-actions">
        <Button
          disabled={isSaving}
          label={
            isSaving
              ? "Saving..."
              : category
                ? "Save changes"
                : "Add category"
          }
          type="submit"
        />
        {category ? <Button label="Cancel" onClick={onFinished} /> : null}
      </div>
    </form>
  );
}
