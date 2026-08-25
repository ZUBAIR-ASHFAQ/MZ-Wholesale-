import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { executeIdempotentMutation } from "../../shared/http/idempotency.js";
import {
  openApiAccessSecurity,
  openApiMutationSecurity,
  openApiPrivateErrors,
  openApiSuccessResponse,
} from "../../shared/http/openapi.js";
import { createDataResponse } from "../../shared/http/response.js";
import { recordAuditLog } from "../system/system.service.js";
import {
  createPurchaseReturnSchema,
  createSalesReturnSchema,
  listPurchaseReturnsQuerySchema,
  listSalesReturnsQuerySchema,
  purchaseReturnIdParamsSchema,
  salesReturnIdParamsSchema,
} from "./returns.schema.js";
import {
  createConfirmedPurchaseReturnInTransaction,
  createConfirmedSalesReturnInTransaction,
  getPurchaseReturn,
  getSalesReturn,
  listPurchaseReturns,
  listSalesReturns,
} from "./returns.service.js";

/** Registers the Sales Return routes required by Module 11. */
export async function registerSalesReturnRoutes(
  app: FastifyInstance,
): Promise<void> {
  /** Records one important successful return mutation for later audit review. */
  async function auditMutation(request: FastifyRequest, action: string, entity: string, afterData: unknown): Promise<void> {
    await recordAuditLog(app.db, {
      adminUserId: request.admin?.adminUserId ?? null,
      requestId: request.id,
      ipAddress: request.ip ?? null,
      device: request.headers["user-agent"] ?? null,
    }, action, entity, null, afterData);
  }

  /** Returns Sales Returns using customer, date, and pagination filters. */
  async function handleListSalesReturns(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = listSalesReturnsQuerySchema.parse(request.query);
    const result = await listSalesReturns(app.db, query);
    reply.send(createDataResponse(result));
  }

  /** Creates one confirmed Sales Return through the shared idempotency transaction. */
  async function handleCreateSalesReturn(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createSalesReturnSchema.parse(request.body);
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
        body: createDataResponse(
          await createConfirmedSalesReturnInTransaction(transaction, input),
        ),
      }),
    );

    if (!response.replayed) {
      await auditMutation(request, "SALES_RETURN_CREATED", "SALES_RETURN", { input });
    }
    reply.status(response.statusCode).send(response.body);
  }

  /** Returns one confirmed Sales Return with items and settlement details. */
  async function handleGetSalesReturn(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = salesReturnIdParamsSchema.parse(request.params);
    const result = await getSalesReturn(app.db, params.id);
    reply.send(createDataResponse(result));
  }

  /** Builds one authenticated read-only Returns route definition. */
  function privateReadRoute(summary: string) {
    return {
      preHandler: app.authenticate,
      schema: {
        tags: ["returns"],
        summary,
        security: openApiAccessSecurity,
        response: { 200: openApiSuccessResponse, ...openApiPrivateErrors },
      },
    };
  }

  /** Builds one authenticated Returns mutation route definition. */
  function privateMutationRoute(summary: string) {
    return {
      preHandler: app.authenticate,
      schema: {
        tags: ["returns"],
        summary,
        security: openApiMutationSecurity,
        response: {
          201: openApiSuccessResponse,
          ...openApiPrivateErrors,
        },
      },
    };
  }

  app.get(
    "/sales-returns",
    privateReadRoute("List Sales Returns"),
    handleListSalesReturns,
  );
  app.post(
    "/sales-returns",
    privateMutationRoute("Create a confirmed Sales Return"),
    handleCreateSalesReturn,
  );
  app.get(
    "/sales-returns/:id",
    privateReadRoute("Load Sales Return detail"),
    handleGetSalesReturn,
  );
}

/** Registers the Purchase Return routes required by Module 11. */
export async function registerPurchaseReturnRoutes(
  app: FastifyInstance,
): Promise<void> {
  /** Records one important successful return mutation for later audit review. */
  async function auditMutation(request: FastifyRequest, action: string, entity: string, afterData: unknown): Promise<void> {
    await recordAuditLog(app.db, {
      adminUserId: request.admin?.adminUserId ?? null,
      requestId: request.id,
      ipAddress: request.ip ?? null,
      device: request.headers["user-agent"] ?? null,
    }, action, entity, null, afterData);
  }

  /** Returns Purchase Returns using supplier, date, and pagination filters. */
  async function handleListPurchaseReturns(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = listPurchaseReturnsQuerySchema.parse(request.query);
    const result = await listPurchaseReturns(app.db, query);
    reply.send(createDataResponse(result));
  }

  /** Creates one confirmed Purchase Return through the shared idempotency transaction. */
  async function handleCreatePurchaseReturn(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createPurchaseReturnSchema.parse(request.body);
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
        body: createDataResponse(
          await createConfirmedPurchaseReturnInTransaction(transaction, input),
        ),
      }),
    );

    if (!response.replayed) {
      await auditMutation(request, "PURCHASE_RETURN_CREATED", "PURCHASE_RETURN", { input });
    }
    reply.status(response.statusCode).send(response.body);
  }

  /** Returns one confirmed Purchase Return with items and supplier balance details. */
  async function handleGetPurchaseReturn(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = purchaseReturnIdParamsSchema.parse(request.params);
    const result = await getPurchaseReturn(app.db, params.id);
    reply.send(createDataResponse(result));
  }

  /** Builds one authenticated read-only Returns route definition. */
  function privateReadRoute(summary: string) {
    return {
      preHandler: app.authenticate,
      schema: {
        tags: ["returns"],
        summary,
        security: openApiAccessSecurity,
        response: { 200: openApiSuccessResponse, ...openApiPrivateErrors },
      },
    };
  }

  /** Builds one authenticated Returns mutation route definition. */
  function privateMutationRoute(summary: string) {
    return {
      preHandler: app.authenticate,
      schema: {
        tags: ["returns"],
        summary,
        security: openApiMutationSecurity,
        response: {
          201: openApiSuccessResponse,
          ...openApiPrivateErrors,
        },
      },
    };
  }

  app.get(
    "/purchase-returns",
    privateReadRoute("List Purchase Returns"),
    handleListPurchaseReturns,
  );
  app.post(
    "/purchase-returns",
    privateMutationRoute("Create a confirmed Purchase Return"),
    handleCreatePurchaseReturn,
  );
  app.get(
    "/purchase-returns/:id",
    privateReadRoute("Load Purchase Return detail"),
    handleGetPurchaseReturn,
  );
}
