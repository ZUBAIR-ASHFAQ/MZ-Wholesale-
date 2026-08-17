import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodType } from "zod";

import { AppError } from "../../shared/errors/app-error.js";
import {
  openApiAccessSecurity,
  openApiPrivateErrors,
  openApiSuccessResponse,
} from "../../shared/http/openapi.js";
import { createDataResponse } from "../../shared/http/response.js";
import {
  dashboardLowStockQuerySchema,
  dashboardOverviewQuerySchema,
} from "./dashboard.schema.js";
import {
  getDashboardLowStock,
  getDashboardOverview,
} from "./dashboard.service.js";

/** Parses one Dashboard query and returns a stable validation error when it is invalid. */
function parseDashboardQuery<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  const fields = result.error.issues.map((issue) => ({
    field: issue.path.length === 0 ? "request" : issue.path.map(String).join("."),
    message: issue.message,
  }));

  throw new AppError(
    "VALIDATION_ERROR",
    "The Dashboard request contains invalid values.",
    400,
    fields,
  );
}

/** Builds the shared authentication and OpenAPI options for one private Dashboard route. */
function privateDashboardRoute(app: FastifyInstance, summary: string) {
  return {
    preHandler: app.authenticate,
    schema: {
      tags: ["dashboard"],
      summary,
      security: openApiAccessSecurity,
      response: {
        200: openApiSuccessResponse,
        ...openApiPrivateErrors,
      },
    },
  };
}

/** Registers exactly the two approved authenticated, read-only Module 14 Dashboard routes. */
export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  /** Returns all summary cards, recent records, and low-stock data for the overview screen. */
  async function handleDashboardOverview(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = parseDashboardQuery(dashboardOverviewQuerySchema, request.query);
    const result = await getDashboardOverview(app.db, query);

    reply.send(createDataResponse(result));
  }

  /** Returns one paginated page of products whose sellable stock is at or below reorder level. */
  async function handleDashboardLowStock(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = parseDashboardQuery(dashboardLowStockQuerySchema, request.query);
    const result = await getDashboardLowStock(app.db, query);

    reply.send(createDataResponse(result));
  }

  app.get(
    "/dashboard/overview",
    privateDashboardRoute(app, "Dashboard overview"),
    handleDashboardOverview,
  );

  app.get(
    "/dashboard/low-stock",
    privateDashboardRoute(app, "Dashboard low-stock products"),
    handleDashboardLowStock,
  );
}
