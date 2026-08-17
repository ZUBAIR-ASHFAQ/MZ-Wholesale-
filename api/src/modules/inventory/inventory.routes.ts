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
import { executeIdempotentMutation } from "../../shared/http/idempotency.js";
import { createDataResponse } from "../../shared/http/response.js";
import { recordAuditLog } from "../system/system.service.js";
import {
  createAdjustmentSchema,
  createOpeningStockSchema,
  createStockCountSchema,
  listInventoryQuerySchema,
  listProductMovementsQuerySchema,
  listStockCountsQuerySchema,
  productMovementsParamsSchema,
  stockCountIdParamsSchema,
  updateStockCountSchema,
} from "./inventory.schema.js";
import {
  confirmStockCount,
  createAdjustment,
  createDraftStockCount,
  createOpeningStock,
  getProductMovements,
  getStockCount,
  listInventoryStock,
  listStockCounts,
  updateDraftStockCount,
} from "./inventory.service.js";

/** Registers the nine Inventory Management routes approved for version 1. */
export async function registerInventoryRoutes(
  app: FastifyInstance,
): Promise<void> {
  /** Records one important successful mutation without changing the business response if audit storage is unavailable. */
  async function auditMutation(request: FastifyRequest, action: string, entity: string, afterData: unknown): Promise<void> {
    await recordAuditLog(app.db, {
      adminUserId: request.admin?.adminUserId ?? null,
      requestId: request.id,
      ipAddress: request.ip ?? null,
      device: request.headers["user-agent"] ?? null,
    }, action, entity, null, afterData);
  }

  /** Returns current stock using search, low-stock and pagination filters. */
  async function handleListInventoryStock(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = listInventoryQuerySchema.parse(request.query);
    const result = await listInventoryStock(app.db, query);
    reply.send(createDataResponse(result));
  }

  /** Returns one product's immutable stock-movement history. */
  async function handleListProductMovements(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = productMovementsParamsSchema.parse(request.params);
    const query = listProductMovementsQuerySchema.parse(request.query);
    const result = await getProductMovements(app.db, params.productId, query);
    reply.send(createDataResponse(result));
  }

  /** Creates setup opening stock and matching immutable movements. */
  async function handleCreateOpeningStock(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createOpeningStockSchema.parse(request.body);
    const response = await executeIdempotentMutation(
      app.db,
      {
        key: request.headers["idempotency-key"],
        method: request.method,
        path: request.routeOptions.url,
        body: input,
      },
      async (transaction) => ({
        statusCode: 201,
        body: createDataResponse(await createOpeningStock(transaction, input)),
      }),
    );
    if (!response.replayed) {
      await auditMutation(request, "OPENING_STOCK_RECORDED", "INVENTORY", { input });
    }
    reply.status(response.statusCode).send(response.body);
  }

  /** Creates one manual stock adjustment and matching movement. */
  async function handleCreateAdjustment(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createAdjustmentSchema.parse(request.body);
    const response = await executeIdempotentMutation(
      app.db,
      {
        key: request.headers["idempotency-key"],
        method: request.method,
        path: request.routeOptions.url,
        body: input,
      },
      async (transaction) => ({
        statusCode: 201,
        body: createDataResponse(await createAdjustment(transaction, input)),
      }),
    );
    if (!response.replayed) {
      await auditMutation(request, "INVENTORY_ADJUSTMENT_CREATED", "INVENTORY", { input });
    }
    reply.status(response.statusCode).send(response.body);
  }

  /** Returns stock-count headers using approved filters and pagination. */
  async function handleListStockCounts(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = listStockCountsQuerySchema.parse(request.query);
    const result = await listStockCounts(app.db, query);
    reply.send(createDataResponse(result));
  }

  /** Creates one draft physical stock count. */
  async function handleCreateStockCount(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createStockCountSchema.parse(request.body);
    const result = await createDraftStockCount(app.db, input);
    await auditMutation(request, "STOCK_COUNT_CREATED", "STOCK_COUNT", result);
    reply.status(201).send(createDataResponse(result));
  }

  /** Returns one stock-count header together with its items. */
  async function handleGetStockCount(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = stockCountIdParamsSchema.parse(request.params);
    const result = await getStockCount(app.db, params.id);
    reply.send(createDataResponse(result));
  }

  /** Updates one draft stock count and refreshes item snapshots. */
  async function handleUpdateStockCount(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = stockCountIdParamsSchema.parse(request.params);
    const input = updateStockCountSchema.parse(request.body);
    const result = await updateDraftStockCount(app.db, params.id, input);
    await auditMutation(request, "STOCK_COUNT_UPDATED", "STOCK_COUNT", result);
    reply.send(createDataResponse(result));
  }

  /** Confirms one draft count and creates all required stock movements. */
  async function handleConfirmStockCount(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = stockCountIdParamsSchema.parse(request.params);
    const response = await executeIdempotentMutation(
      app.db,
      {
        key: request.headers["idempotency-key"],
        method: request.method,
        path: request.routeOptions.url,
        body: params,
      },
      async (transaction) => ({
        statusCode: 200,
        body: createDataResponse(await confirmStockCount(transaction, params.id)),
      }),
    );
    if (!response.replayed) {
      await auditMutation(request, "STOCK_COUNT_CONFIRMED", "STOCK_COUNT", { id: params.id });
    }
    reply.status(response.statusCode).send(response.body);
  }

  /** Builds one documented private route without duplicating Zod validation. */
  function privateRoute(summary: string, mutation = false) {
    return {
      preHandler: app.authenticate,
      schema: {
        tags: ["inventory"],
        summary,
        security: mutation ? openApiMutationSecurity : openApiAccessSecurity,
        response: {
          200: openApiSuccessResponse,
          201: openApiSuccessResponse,
          ...openApiPrivateErrors,
        },
      },
    };
  }

  app.get(
    "/inventory/stock",
    privateRoute("List current inventory stock"),
    handleListInventoryStock,
  );
  app.get(
    "/inventory/products/:productId/movements",
    privateRoute("List one product's stock movements"),
    handleListProductMovements,
  );
  app.post(
    "/inventory/opening-stock",
    privateRoute("Create opening stock", true),
    handleCreateOpeningStock,
  );
  app.post(
    "/inventory/adjustments",
    privateRoute("Create a manual stock adjustment", true),
    handleCreateAdjustment,
  );
  app.get(
    "/inventory/counts",
    privateRoute("List physical stock counts"),
    handleListStockCounts,
  );
  app.post(
    "/inventory/counts",
    privateRoute("Create a draft stock count", true),
    handleCreateStockCount,
  );
  app.get(
    "/inventory/counts/:id",
    privateRoute("Load one stock count"),
    handleGetStockCount,
  );
  app.patch(
    "/inventory/counts/:id",
    privateRoute("Update a draft stock count", true),
    handleUpdateStockCount,
  );
  app.post(
    "/inventory/counts/:id/confirm",
    privateRoute("Confirm a stock count", true),
    handleConfirmStockCount,
  );
}
