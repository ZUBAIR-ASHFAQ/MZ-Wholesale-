import { useNavigate } from "@tanstack/react-router";

import { ProductForm } from "../components/product-form.tsx";
import { useProduct } from "../hooks/use-products.ts";

interface ProductFormPageProps {
  productId?: string;
}

/** Hosts the product form for both create and edit routes. */
export function ProductFormPage({
  productId,
}: ProductFormPageProps): React.JSX.Element {
  const navigate = useNavigate();
  const isEditing = Boolean(productId);
  const productQuery = useProduct(productId ?? "");

  if (isEditing && productQuery.isPending) {
    return <p>Loading product...</p>;
  }

  if (isEditing && productQuery.isError) {
    return <p className="error-message">Could not load this product.</p>;
  }

  /** Returns to the product list without reloading the browser. */
  function returnToProducts(): void {
    void navigate({ to: "/products" });
  }

  return (
    <section>
      <p className="eyebrow">Product Management</p>
      <h1>{isEditing ? "Edit product" : "Add product"}</h1>
      <p>
        {isEditing
          ? "Update the product master data and allowed units."
          : "Create a product with its base unit and optional conversions."}
      </p>

      <section className="management-card product-form-card">
        <ProductForm
          onCancel={returnToProducts}
          onSaved={returnToProducts}
          product={productQuery.data?.data}
        />
      </section>
    </section>
  );
}
