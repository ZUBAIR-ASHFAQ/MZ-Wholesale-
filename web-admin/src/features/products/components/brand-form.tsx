import { useEffect, useState } from "react";

import { Button } from "../../../components/ui/button.tsx";
import { Input } from "../../../components/ui/input.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import type { Brand } from "../api/products.api.ts";
import { useCreateBrand, useUpdateBrand } from "../hooks/use-products.ts";

interface BrandFormProps {
  brand: Brand | null;
  onFinished(): void;
}

/** Creates a brand or renames the selected brand. */
export function BrandForm({
  brand,
  onFinished,
}: BrandFormProps): React.JSX.Element {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const createBrand = useCreateBrand();
  const updateBrand = useUpdateBrand();
  const isEditing = brand !== null;
  const isSaving = createBrand.isPending || updateBrand.isPending;

  useEffect(() => {
    setName(brand?.name ?? "");
    setMessage("");
    createBrand.reset();
    updateBrand.reset();
  }, [brand]);

  /** Returns a readable message from an API or unexpected error. */
  function readError(error: unknown): string {
    if (error instanceof ApiError) {
      return error.message;
    }

    return "The brand could not be saved.";
  }

  /** Validates and saves the brand name. */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setMessage("Brand name is required.");
      return;
    }

    setMessage("");

    try {
      if (brand) {
        await updateBrand.mutateAsync({
          brandId: brand.id,
          input: { name: trimmedName },
        });
      } else {
        await createBrand.mutateAsync({ name: trimmedName });
      }

      setName("");
      setMessage(isEditing ? "Brand updated." : "Brand created.");
      onFinished();
    } catch (error) {
      setMessage(readError(error));
    }
  }

  return (
    <form className="management-form" onSubmit={handleSubmit}>
      <h3>{isEditing ? "Rename brand" : "Add brand"}</h3>
      <Input
        id="brand-name"
        label="Brand name"
        onChange={setName}
        value={name}
      />
      {message ? <p className="form-message">{message}</p> : null}
      <div className="form-actions">
        <Button
          disabled={isSaving}
          label={isSaving ? "Saving..." : isEditing ? "Save changes" : "Add brand"}
          type="submit"
        />
        {isEditing ? <Button label="Cancel" onClick={onFinished} /> : null}
      </div>
    </form>
  );
}
