import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createBrand,
  createProduct,
  createProductCategory,
  loadBrands,
  loadProduct,
  loadProductCategories,
  loadProducts,
  updateBrand,
  updateProduct,
  updateProductCategory,
  type CreateBrandInput,
  type CreateCategoryInput,
  type CreateProductInput,
  type ProductListFilters,
  type UpdateBrandInput,
  type UpdateCategoryInput,
  type UpdateProductInput,
} from "../api/products.api.ts";

/** Stable cache keys used by every Product Management screen. */
export const productQueryKeys = {
  all: ["products"] as const,
  lists: () => ["products", "list"] as const,
  list: (filters: ProductListFilters) =>
    ["products", "list", filters] as const,
  details: () => ["products", "detail"] as const,
  detail: (productId: string) =>
    ["products", "detail", productId] as const,
  categories: ["products", "categories"] as const,
  brands: ["products", "brands"] as const,
};

/** Loads one filtered and paginated product list. */
export function useProducts(filters: ProductListFilters = {}) {
  return useQuery({
    queryKey: productQueryKeys.list(filters),
    queryFn: () => loadProducts(filters),
  });
}

/** Loads one product with all allowed units. */
export function useProduct(productId: string) {
  return useQuery({
    queryKey: productQueryKeys.detail(productId),
    queryFn: () => loadProduct(productId),
    enabled: productId.length > 0,
  });
}

/** Creates a product and refreshes cached product lists. */
export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProductInput) => createProduct(input),
    onSuccess: async (response) => {
      queryClient.setQueryData(
        productQueryKeys.detail(response.data.id),
        response,
      );
      await queryClient.invalidateQueries({
        queryKey: productQueryKeys.lists(),
      });
    },
  });
}

interface UpdateProductVariables {
  productId: string;
  input: UpdateProductInput;
}

/** Updates one product and refreshes its cached detail and list rows. */
export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, input }: UpdateProductVariables) =>
      updateProduct(productId, input),
    onSuccess: async (response) => {
      queryClient.setQueryData(
        productQueryKeys.detail(response.data.id),
        response,
      );
      await queryClient.invalidateQueries({
        queryKey: productQueryKeys.lists(),
      });
    },
  });
}

/** Loads all product categories. */
export function useProductCategories() {
  return useQuery({
    queryKey: productQueryKeys.categories,
    queryFn: loadProductCategories,
  });
}

/** Creates a category and refreshes category selectors. */
export function useCreateProductCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCategoryInput) => createProductCategory(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: productQueryKeys.categories,
      });
    },
  });
}

interface UpdateCategoryVariables {
  categoryId: string;
  input: UpdateCategoryInput;
}

/** Renames or activates/deactivates one product category. */
export function useUpdateProductCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ categoryId, input }: UpdateCategoryVariables) =>
      updateProductCategory(categoryId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: productQueryKeys.categories,
        }),
        queryClient.invalidateQueries({
          queryKey: productQueryKeys.lists(),
        }),
      ]);
    },
  });
}

/** Loads all brands. */
export function useBrands() {
  return useQuery({
    queryKey: productQueryKeys.brands,
    queryFn: loadBrands,
  });
}

/** Creates a brand and refreshes brand selectors. */
export function useCreateBrand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBrandInput) => createBrand(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: productQueryKeys.brands,
      });
    },
  });
}

interface UpdateBrandVariables {
  brandId: string;
  input: UpdateBrandInput;
}

/** Renames or activates/deactivates one brand. */
export function useUpdateBrand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ brandId, input }: UpdateBrandVariables) =>
      updateBrand(brandId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: productQueryKeys.brands,
        }),
        queryClient.invalidateQueries({
          queryKey: productQueryKeys.lists(),
        }),
      ]);
    },
  });
}
