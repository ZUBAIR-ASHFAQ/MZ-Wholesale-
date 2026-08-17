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
  createSupplierSchema,
  listSuppliersQuerySchema,
  supplierIdParamsSchema,
  supplierOpenPurchasesParamsSchema,
  supplierOpenPurchasesQuerySchema,
  updateSupplierSchema,
} from "./suppliers.schema.js";
import {
  createSupplier,
  getSupplierOpenPurchases,
  getSupplierProfile,
  listSuppliers,
  updateSupplier,
} from "./suppliers.service.js";

/** Registers the five Supplier Management routes approved for version 1. */
export async function registerSupplierRoutes(
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

  /** Returns suppliers using the approved search, status and pagination filters. */
  async function handleListSuppliers(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = listSuppliersQuerySchema.parse(request.query);
    const result = await listSuppliers(app.db, query);

    reply.send(createDataResponse(result));
  }

  /** Creates one supplier using validated request fields. */
  async function handleCreateSupplier(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createSupplierSchema.parse(request.body);
    const supplier = await createSupplier(app.db, input);
    await auditMutation(request, "SUPPLIER_CREATED", "SUPPLIER", supplier);

    reply.status(201).send(createDataResponse(supplier));
  }

  /** Returns one supplier with its deferred payable and purchase profile. */
  async function handleGetSupplier(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = supplierIdParamsSchema.parse(request.params);
    const profile = await getSupplierProfile(app.db, params.id);

    reply.send(createDataResponse(profile));
  }

  /** Updates approved fields for one existing supplier. */
  async function handleUpdateSupplier(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = supplierIdParamsSchema.parse(request.params);
    const input = updateSupplierSchema.parse(request.body);
    const supplier = await updateSupplier(app.db, params.id, input);
    await auditMutation(request, "SUPPLIER_UPDATED", "SUPPLIER", supplier);

    reply.send(createDataResponse(supplier));
  }

  /** Returns purchases that can later receive supplier-payment allocations. */
  async function handleGetOpenPurchases(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = supplierOpenPurchasesParamsSchema.parse(request.params);
    const query = supplierOpenPurchasesQuerySchema.parse(request.query);
    const result = await getSupplierOpenPurchases(
      app.db,
      params.supplierId,
      query,
    );

    reply.send(createDataResponse(result));
  }

  /** Builds one documented Supplier route without changing Zod validation. */
  function privateRoute(summary: string, mutation = false) {
    return {
      preHandler: app.authenticate,
      schema: {
        tags: ["suppliers"],
        summary,
        security: mutation ? openApiMutationSecurity : openApiAccessSecurity,
        response: { 200: openApiSuccessResponse, 201: openApiSuccessResponse, ...openApiPrivateErrors },
      },
    };
  }

  app.get("/suppliers", privateRoute("List and search suppliers"), handleListSuppliers);
  app.post("/suppliers", privateRoute("Create a supplier", true), handleCreateSupplier);
  app.get("/suppliers/:id", privateRoute("Load a supplier profile"), handleGetSupplier);
  app.patch("/suppliers/:id", privateRoute("Update a supplier", true), handleUpdateSupplier);
  app.get(
    "/suppliers/:supplierId/open-purchases",
    privateRoute("List supplier purchases available for allocation"),
    handleGetOpenPurchases,
  );
}
