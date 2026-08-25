import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import {
  openApiAccessSecurity,
  openApiMutationSecurity,
  openApiPrivateErrors,
  openApiSuccessResponse,
} from "../../shared/http/openapi.js";
import { createDataResponse } from "../../shared/http/response.js";
import { recordAuditLog } from "../system/system.service.js";
import {
  brandIdParamsSchema,
  categoryIdParamsSchema,
  createBrandSchema,
  createCategorySchema,
  createProductSchema,
  listProductsQuerySchema,
  productIdParamsSchema,
  updateBrandSchema,
  updateCategorySchema,
  updateProductSchema,
} from "./products.schema.js";
import {
  createBrand,
  createCategory,
  createProduct,
  getProduct,
  listBrands,
  listCategories,
  listProducts,
  updateBrand,
  updateCategory,
  updateProduct,
} from "./products.service.js";

/** Registers the nine Product Management routes approved for version 1. */
export async function registerProductRoutes(app: FastifyInstance): Promise<void> {
  /** Records one important successful mutation without changing the business response if audit storage is unavailable. */
  async function auditMutation(request: FastifyRequest, action: string, entity: string, afterData: unknown): Promise<void> {
    await recordAuditLog(app.db, {
      adminUserId: request.admin?.adminUserId ?? null,
      requestId: request.id,
      ipAddress: request.ip ?? null,
      device: request.headers["user-agent"] ?? null,
    }, action, entity, null, afterData);
  }

  /** Returns a filtered and paginated product list. */
  async function handleListProducts(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = listProductsQuerySchema.parse(request.query);
    const result = await listProducts(app.db, query);
    reply.send(createDataResponse(result));
  }

  /** Creates one product and its base and additional units. */
  async function handleCreateProduct(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createProductSchema.parse(request.body);
    const product = await createProduct(app.db, input);
    await auditMutation(request, "PRODUCT_CREATED", "PRODUCT", product);
    reply.status(201).send(createDataResponse(product));
  }

  /** Returns one product with its category, brand and units. */
  async function handleGetProduct(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = productIdParamsSchema.parse(request.params);
    const product = await getProduct(app.db, params.id);
    reply.send(createDataResponse(product));
  }

  /** Updates allowed product fields without deleting historical units. */
  async function handleUpdateProduct(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = productIdParamsSchema.parse(request.params);
    const input = updateProductSchema.parse(request.body);
    const product = await updateProduct(app.db, params.id, input);
    await auditMutation(request, "PRODUCT_UPDATED", "PRODUCT", product);
    reply.send(createDataResponse(product));
  }

  /** Returns all product categories in stable name order. */
  async function handleListCategories(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const categories = await listCategories(app.db);
    reply.send(createDataResponse(categories));
  }

  /** Creates one product category. */
  async function handleCreateCategory(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createCategorySchema.parse(request.body);
    const category = await createCategory(app.db, input);
    await auditMutation(request, "PRODUCT_CATEGORY_CREATED", "PRODUCT_CATEGORY", category);
    reply.status(201).send(createDataResponse(category));
  }

  /** Renames or activates/deactivates one product category. */
  async function handleUpdateCategory(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = categoryIdParamsSchema.parse(request.params);
    const input = updateCategorySchema.parse(request.body);
    const category = await updateCategory(app.db, params.id, input);
    await auditMutation(request, "PRODUCT_CATEGORY_UPDATED", "PRODUCT_CATEGORY", category);
    reply.send(createDataResponse(category));
  }

  /** Returns all brands in stable name order. */
  async function handleListBrands(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const brands = await listBrands(app.db);
    reply.send(createDataResponse(brands));
  }

  /** Creates one brand. */
  async function handleCreateBrand(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createBrandSchema.parse(request.body);
    const brand = await createBrand(app.db, input);
    await auditMutation(request, "BRAND_CREATED", "BRAND", brand);
    reply.status(201).send(createDataResponse(brand));
  }

  /** Renames or activates/deactivates one brand. */
  async function handleUpdateBrand(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = brandIdParamsSchema.parse(request.params);
    const input = updateBrandSchema.parse(request.body);
    const brand = await updateBrand(app.db, params.id, input);
    await auditMutation(request, "BRAND_UPDATED", "BRAND", brand);
    reply.send(createDataResponse(brand));
  }

  /** Builds one documented private route option without changing validation. */
  function privateRoute(summary: string, mutation = false) {
    return {
      preHandler: app.authenticate,
      schema: {
        tags: ["products"],
        summary,
        security: mutation ? openApiMutationSecurity : openApiAccessSecurity,
        response: { 200: openApiSuccessResponse, 201: openApiSuccessResponse, ...openApiPrivateErrors },
      },
    };
  }

  app.get("/products", privateRoute("List and search products"), handleListProducts);
  app.post("/products", privateRoute("Create a product and its units", true), handleCreateProduct);
  app.get("/products/:id", privateRoute("Load one product"), handleGetProduct);
  app.patch("/products/:id", privateRoute("Update one product", true), handleUpdateProduct);

  app.get("/product-categories", privateRoute("List product categories"), handleListCategories);
  app.post("/product-categories", privateRoute("Create a product category", true), handleCreateCategory);
  app.patch(
    "/product-categories/:id",
    privateRoute("Update a product category", true),
    handleUpdateCategory,
  );

  app.get("/brands", privateRoute("List product brands"), handleListBrands);
  app.post("/brands", privateRoute("Create a product brand", true), handleCreateBrand);
  app.patch("/brands/:id", privateRoute("Update a product brand", true), handleUpdateBrand);
}
