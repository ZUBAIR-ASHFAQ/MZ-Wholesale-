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
  cancelPurchaseSchema,
  confirmPurchaseSchema,
  createPurchaseSchema,
  listPurchasesQuerySchema,
  purchaseIdParamsSchema,
  updatePurchaseDraftSchema,
} from "./purchases.schema.js";
import {
  cancelPurchase,
  confirmPurchaseInTransaction,
  createPurchase,
  createPurchaseInTransaction,
  getPurchase,
  listPurchases,
  updatePurchaseDraft,
} from "./purchases.service.js";

/** Registers the Purchase Management routes currently enabled for Module 9. */
export async function registerPurchaseRoutes(
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

  /** Returns purchases using supplier, status, date, and pagination filters. */
  async function handleListPurchases(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = listPurchasesQuerySchema.parse(request.query);
    const result = await listPurchases(app.db, query);
    reply.send(createDataResponse(result));
  }

  /** Creates a purchase draft or immediately confirms it when requested. */
  async function handleCreatePurchase(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createPurchaseSchema.parse(request.body);

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
            await createPurchaseInTransaction(transaction, input),
          ),
        }),
      );

      if (!response.replayed) {
        await auditMutation(request, "PURCHASE_CONFIRMED", "PURCHASE", { input });
      }
      reply.status(response.statusCode).send(response.body);
      return;
    }

    const result = await createPurchase(app.db, input);
    await auditMutation(request, "PURCHASE_DRAFT_CREATED", "PURCHASE", result);
    reply.status(201).send(createDataResponse(result));
  }

  /** Returns one purchase header with its item snapshots and related payments. */
  async function handleGetPurchase(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = purchaseIdParamsSchema.parse(request.params);
    const result = await getPurchase(app.db, params.id);
    reply.send(createDataResponse(result));
  }

  /** Updates the editable fields and item snapshots of one purchase draft. */
  async function handleUpdatePurchaseDraft(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = purchaseIdParamsSchema.parse(request.params);
    const input = updatePurchaseDraftSchema.parse(request.body);
    const result = await updatePurchaseDraft(app.db, params.id, input);
    await auditMutation(request, "PURCHASE_DRAFT_UPDATED", "PURCHASE", result);
    reply.send(createDataResponse(result));
  }

  /** Confirms one saved draft and creates its stock and supplier-ledger effects. */
  async function handleConfirmPurchase(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = purchaseIdParamsSchema.parse(request.params);
    const input = confirmPurchaseSchema.parse(request.body ?? {});
    const response = await executeIdempotentMutation(
      app.db,
      {
        key: request.headers["idempotency-key"],
        method: request.method,
        path: request.routeOptions.url,
        // Include the resource ID because routeOptions.url contains the :id template.
        body: { purchaseId: params.id, ...input },
      },
      async (transaction) => ({
        statusCode: 200,
        body: createDataResponse(
          await confirmPurchaseInTransaction(transaction, params.id, input),
        ),
      }),
    );

    if (!response.replayed) {
      await auditMutation(request, "PURCHASE_CONFIRMED", "PURCHASE", { id: params.id });
    }
    reply.status(response.statusCode).send(response.body);
  }

  /** Cancels one purchase draft without creating financial or stock effects. */
  async function handleCancelPurchase(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = purchaseIdParamsSchema.parse(request.params);
    const input = cancelPurchaseSchema.parse(request.body ?? {});
    const result = await cancelPurchase(app.db, params.id, input);
    await auditMutation(request, "PURCHASE_DRAFT_CANCELLED", "PURCHASE", result);
    reply.send(createDataResponse(result));
  }

  /** Builds one authenticated read-only Purchase route definition. */
  function privateReadRoute(summary: string) {
    return {
      preHandler: app.authenticate,
      schema: {
        tags: ["purchases"],
        summary,
        security: openApiAccessSecurity,
        response: { 200: openApiSuccessResponse, ...openApiPrivateErrors },
      },
    };
  }

  /** Builds one authenticated Purchase mutation route definition. */
  function privateMutationRoute(summary: string) {
    return {
      preHandler: app.authenticate,
      schema: {
        tags: ["purchases"],
        summary,
        security: openApiMutationSecurity,
        response: { 200: openApiSuccessResponse, 201: openApiSuccessResponse, ...openApiPrivateErrors },
      },
    };
  }

  app.get(
    "/purchases",
    privateReadRoute("List purchases"),
    handleListPurchases,
  );
  app.post(
    "/purchases",
    privateMutationRoute("Create a purchase draft or confirmed purchase"),
    handleCreatePurchase,
  );
  app.get(
    "/purchases/:id",
    privateReadRoute("Load purchase detail"),
    handleGetPurchase,
  );
  app.patch(
    "/purchases/:id/draft",
    privateMutationRoute("Update a purchase draft"),
    handleUpdatePurchaseDraft,
  );
  app.post(
    "/purchases/:id/confirm",
    privateMutationRoute("Confirm a purchase draft"),
    handleConfirmPurchase,
  );
  app.post(
    "/purchases/:id/cancel",
    privateMutationRoute("Cancel a purchase draft"),
    handleCancelPurchase,
  );
}
