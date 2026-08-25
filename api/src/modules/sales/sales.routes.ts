import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

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
  cancelSaleSchema,
  confirmSaleSchema,
  createSaleSchema,
  listSalesQuerySchema,
  saleIdParamsSchema,
  updateSaleDraftSchema,
} from "./sales.schema.js";
import {
  cancelSaleDraft,
  confirmSaleInTransaction,
  createSale,
  createSaleInTransaction,
  getSale,
  listSales,
  updateSaleDraft,
} from "./sales.service.js";

/** Registers the Counter Sales routes required by Module 10. */
export async function registerSalesRoutes(app: FastifyInstance): Promise<void> {
  /** Records one important successful mutation without changing the business response if audit storage is unavailable. */
  async function auditMutation(request: FastifyRequest, action: string, entity: string, afterData: unknown): Promise<void> {
    await recordAuditLog(app.db, {
      adminUserId: request.admin?.adminUserId ?? null,
      requestId: request.id,
      ipAddress: request.ip ?? null,
      device: request.headers["user-agent"] ?? null,
    }, action, entity, null, afterData);
  }

  /** Returns sales using customer, status, date, and pagination filters. */
  async function handleListSales(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = listSalesQuerySchema.parse(request.query);
    const result = await listSales(app.db, query);
    reply.send(createDataResponse(result));
  }

  /** Creates a DRAFT/HELD sale or confirms it immediately when requested. */
  async function handleCreateSale(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createSaleSchema.parse(request.body);

    if (input.status === "CONFIRMED") {
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
            await createSaleInTransaction(transaction, input),
          ),
        }),
      );

      if (!response.replayed) {
        await auditMutation(request, "SALE_CONFIRMED", "SALE", { input });
      }
      reply.status(response.statusCode).send(response.body);
      return;
    }

    const result = await createSale(app.db, input);
    await auditMutation(request, "SALE_DRAFT_CREATED", "SALE", result);
    reply.status(201).send(createDataResponse(result));
  }

  /** Returns one sale header and its item snapshots. */
  async function handleGetSale(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = saleIdParamsSchema.parse(request.params);
    const result = await getSale(app.db, params.id);
    reply.send(createDataResponse(result));
  }

  /** Updates one DRAFT or HELD sale and recalculates its totals. */
  async function handleUpdateSaleDraft(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = saleIdParamsSchema.parse(request.params);
    const input = updateSaleDraftSchema.parse(request.body);
    const result = await updateSaleDraft(app.db, params.id, input);
    await auditMutation(request, "SALE_DRAFT_UPDATED", "SALE", result);
    reply.send(createDataResponse(result));
  }

  /** Confirms one saved DRAFT/HELD sale inside the idempotency transaction. */
  async function handleConfirmSale(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = saleIdParamsSchema.parse(request.params);
    const input = confirmSaleSchema.parse(request.body ?? {});
    const response = await executeIdempotentMutation(
      app.db,
      {
        key: request.headers["idempotency-key"],
        method: request.method,
        path: request.routeOptions.url,
        body: { saleId: params.id, ...input },
      },
      async (transaction) => ({
        statusCode: 200,
        body: createDataResponse(
          await confirmSaleInTransaction(transaction, params.id, input),
        ),
      }),
    );

    if (!response.replayed) {
      await auditMutation(request, "SALE_CONFIRMED", "SALE", { id: params.id });
    }
    reply.status(response.statusCode).send(response.body);
  }

  /** Cancels one DRAFT sale without creating stock or financial effects. */
  async function handleCancelSale(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = saleIdParamsSchema.parse(request.params);
    const input = cancelSaleSchema.parse(request.body ?? {});
    const result = await cancelSaleDraft(app.db, params.id, input);
    await auditMutation(request, "SALE_DRAFT_CANCELLED", "SALE", result);
    reply.send(createDataResponse(result));
  }

  /** Builds one authenticated read-only Sales route definition. */
  function privateReadRoute(summary: string) {
    return {
      preHandler: app.authenticate,
      schema: {
        tags: ["sales"],
        summary,
        security: openApiAccessSecurity,
        response: { 200: openApiSuccessResponse, ...openApiPrivateErrors },
      },
    };
  }

  /** Builds one authenticated Sales mutation route definition. */
  function privateMutationRoute(summary: string) {
    return {
      preHandler: app.authenticate,
      schema: {
        tags: ["sales"],
        summary,
        security: openApiMutationSecurity,
        response: {
          200: openApiSuccessResponse,
          201: openApiSuccessResponse,
          ...openApiPrivateErrors,
        },
      },
    };
  }

  app.get("/sales", privateReadRoute("List sales"), handleListSales);
  app.post(
    "/sales",
    privateMutationRoute("Create a draft, held, or confirmed sale"),
    handleCreateSale,
  );
  app.get("/sales/:id", privateReadRoute("Load sale detail"), handleGetSale);
  app.patch(
    "/sales/:id/draft",
    privateMutationRoute("Update a draft or held sale"),
    handleUpdateSaleDraft,
  );
  app.post(
    "/sales/:id/confirm",
    privateMutationRoute("Confirm a draft or held sale"),
    handleConfirmSale,
  );
  app.post(
    "/sales/:id/cancel",
    privateMutationRoute("Cancel a draft sale"),
    handleCancelSale,
  );
}
