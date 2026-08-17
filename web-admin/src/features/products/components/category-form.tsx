import { useEffect, useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { Input } from "../../../components/ui/input.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import type { ProductCategory } from "../api/products.api.ts";
import {
  useCreateProductCategory,
  useUpdateProductCategory,
} from "../hooks/use-products.ts";

interface CategoryFormProps {
  category: ProductCategory | null;
  onFinished(): void;
}

/** Creates a category or renames the selected category. */
export function CategoryForm({
  category,
  onFinished,
}: CategoryFormProps): React.JSX.Element {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const createCategory = useCreateProductCategory();
  const updateCategory = useUpdateProductCategory();
  const isEditing = category !== null;
  const isSaving = createCategory.isPending || updateCategory.isPending;

  useEffect(() => {
    setName(category?.name ?? "");
    setMessage("");
    createCategory.reset();
    updateCategory.reset();
  }, [category]);

  /** Returns a readable message from an API or unexpected error. */
  function readError(error: unknown): string {
    if (error instanceof ApiError) {
      return error.message;
    }

    return "The category could not be saved.";
  }

  /** Validates and saves the category name. */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setMessage("Category name is required.");
      return;
    }

    setMessage("");

    try {
      if (category) {
        await updateCategory.mutateAsync({
          categoryId: category.id,
          input: { name: trimmedName },
        });
      } else {
        await createCategory.mutateAsync({ name: trimmedName });
      }

      setName("");
      setMessage(isEditing ? "Category updated." : "Category created.");
      onFinished();
    } catch (error) {
      setMessage(readError(error));
    }
  }

  return (
    <form className="management-form" onSubmit={handleSubmit}>
      <h3>{isEditing ? "Rename category" : "Add category"}</h3>
      <Input
        id="category-name"
        label="Category name"
        onChange={setName}
        value={name}
      />
      {message ? <p className="form-message">{message}</p> : null}
      <div className="form-actions">
        <Button
          disabled={isSaving}
          label={isSaving ? "Saving..." : isEditing ? "Save changes" : "Add category"}
          type="submit"
        />
        {isEditing ? <Button label="Cancel" onClick={onFinished} /> : null}
      </div>
    </form>
  );
}
