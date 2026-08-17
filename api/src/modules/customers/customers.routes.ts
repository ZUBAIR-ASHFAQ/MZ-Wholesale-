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
  createCustomerSchema,
  customerIdParamsSchema,
  customerOpenInvoicesParamsSchema,
  customerOpenInvoicesQuerySchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from "./customers.schema.js";
import {
  createCustomer,
  getCustomerOpenInvoices,
  getCustomerProfile,
  listCustomers,
  updateCustomer,
} from "./customers.service.js";

/** Registers the five Customer Management routes approved for version 1. */
export async function registerCustomerRoutes(
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

  /** Returns customers using the approved search, status and pagination filters. */
  async function handleListCustomers(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = listCustomersQuerySchema.parse(request.query);
    const result = await listCustomers(app.db, query);

    reply.send(createDataResponse(result));
  }

  /** Creates one regular customer using validated request fields. */
  async function handleCreateCustomer(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createCustomerSchema.parse(request.body);
    const customer = await createCustomer(app.db, input);
    await auditMutation(request, "CUSTOMER_CREATED", "CUSTOMER", customer);

    reply.status(201).send(createDataResponse(customer));
  }

  /** Returns one customer with the balance and invoice profile shape. */
  async function handleGetCustomer(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = customerIdParamsSchema.parse(request.params);
    const profile = await getCustomerProfile(app.db, params.id);

    reply.send(createDataResponse(profile));
  }

  /** Updates approved fields for one regular customer. */
  async function handleUpdateCustomer(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = customerIdParamsSchema.parse(request.params);
    const input = updateCustomerSchema.parse(request.body);
    const customer = await updateCustomer(app.db, params.id, input);
    await auditMutation(request, "CUSTOMER_UPDATED", "CUSTOMER", customer);

    reply.send(createDataResponse(customer));
  }

  /** Returns invoices that can later receive a payment allocation. */
  async function handleGetOpenInvoices(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = customerOpenInvoicesParamsSchema.parse(request.params);
    const query = customerOpenInvoicesQuerySchema.parse(request.query);
    const result = await getCustomerOpenInvoices(
      app.db,
      params.customerId,
      query,
    );

    reply.send(createDataResponse(result));
  }

  /** Builds one documented Customer route without changing Zod validation. */
  function privateRoute(summary: string, mutation = false) {
    return {
      preHandler: app.authenticate,
      schema: {
        tags: ["customers"],
        summary,
        security: mutation ? openApiMutationSecurity : openApiAccessSecurity,
        response: { 200: openApiSuccessResponse, 201: openApiSuccessResponse, ...openApiPrivateErrors },
      },
    };
  }

  app.get("/customers", privateRoute("List and search customers"), handleListCustomers);
  app.post("/customers", privateRoute("Create a customer", true), handleCreateCustomer);
  app.get("/customers/:id", privateRoute("Load a customer profile"), handleGetCustomer);
  app.patch("/customers/:id", privateRoute("Update a customer", true), handleUpdateCustomer);
  app.get(
    "/customers/:customerId/open-invoices",
    privateRoute("List customer invoices available for allocation"),
    handleGetOpenInvoices,
  );
}
