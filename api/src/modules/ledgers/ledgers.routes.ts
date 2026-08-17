import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  openApiAccessSecurity,
  openApiPrivateErrors,
  openApiSuccessResponse,
} from "../../shared/http/openapi.js";
import { createDataResponse } from "../../shared/http/response.js";
import {
  customerStatementParamsSchema,
  ledgerStatementQuerySchema,
  outstandingListQuerySchema,
  supplierStatementParamsSchema,
} from "./ledgers.schema.js";
import {
  getCustomerOutstanding,
  getCustomerStatement,
  getSupplierPayables,
  getSupplierStatement,
} from "./ledgers.service.js";

/** Builds the shared authentication and OpenAPI options for private read routes. */
function privateReadRoute(app: FastifyInstance, summary: string) {
  return {
    preHandler: app.authenticate,
    schema: {
      tags: ["ledgers"],
      summary,
      security: openApiAccessSecurity,
      response: {
        200: openApiSuccessResponse,
        ...openApiPrivateErrors,
      },
    },
  };
}

/** Registers the ledger routes. */
export async function registerLedgerRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/ledgers/customers/:customerId",
    privateReadRoute(app, "Load a customer ledger statement"),
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = customerStatementParamsSchema.parse(request.params);
      const query = ledgerStatementQuerySchema.parse(request.query);
      const statement = await getCustomerStatement(app.db, params.customerId, query);

      return reply.send(createDataResponse(statement));
    },
  );

  app.get(
    "/ledgers/suppliers/:supplierId",
    privateReadRoute(app, "Load a supplier ledger statement"),
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = supplierStatementParamsSchema.parse(request.params);
      const query = ledgerStatementQuerySchema.parse(request.query);
      const statement = await getSupplierStatement(app.db, params.supplierId, query);

      return reply.send(createDataResponse(statement));
    },
  );

  app.get(
    "/ledgers/customer-outstanding",
    privateReadRoute(app, "List outstanding customer balances"),
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = outstandingListQuerySchema.parse(request.query);
      const result = await getCustomerOutstanding(app.db, query);

      return reply.send(createDataResponse(result));
    },
  );

  app.get(
    "/ledgers/supplier-payables",
    privateReadRoute(app, "List supplier payable balances"),
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = outstandingListQuerySchema.parse(request.query);
      const result = await getSupplierPayables(app.db, query);

      return reply.send(createDataResponse(result));
    },
  );
}
