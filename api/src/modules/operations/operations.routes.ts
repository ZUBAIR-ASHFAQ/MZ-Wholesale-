import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  openApiErrorResponse,
  openApiSuccessResponse,
} from "../../shared/http/openapi.js";
import {
  createDataResponse,
  createErrorResponse,
} from "../../shared/http/response.js";
import type { OperationsModuleOptions } from "./index.js";
import {
  getOperationsLiveness,
  getOperationsReadiness,
  getOperationsVersion,
} from "./operations.service.js";

/** Registers the public Production Operations endpoints implemented so far. */
export async function registerOperationsRoutes(
  app: FastifyInstance,
  options: OperationsModuleOptions,
): Promise<void> {
  /** Returns safe application version/build metadata for support. */
  async function handleVersion(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    reply.send(createDataResponse(getOperationsVersion(options)));
  }

  /** Confirms only that the Fastify/Node process is alive. */
  async function handleLiveness(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    reply.send(createDataResponse(getOperationsLiveness()));
  }

  /** Confirms that PostgreSQL is available before the API receives traffic. */
  async function handleReadiness(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await getOperationsReadiness(app.db);

    if (result.status === "unavailable") {
      request.log.error("Database readiness check failed.");
      reply
        .status(503)
        .send(
          createErrorResponse(
            "SERVICE_UNAVAILABLE",
            "The database is unavailable.",
          ),
        );
      return;
    }

    reply.send(createDataResponse(result));
  }

  app.get(
    "/health/live",
    {
      schema: {
        tags: ["health"],
        summary: "Check API process liveness",
        response: {
          200: openApiSuccessResponse,
        },
      },
    },
    handleLiveness,
  );

  app.get(
    "/operations/version",
    {
      schema: {
        tags: ["health"],
        summary: "Show safe application build information",
        response: {
          200: openApiSuccessResponse,
        },
      },
    },
    handleVersion,
  );

  app.get(
    "/health/ready",
    {
      schema: {
        tags: ["health"],
        summary: "Check API database readiness",
        response: {
          200: openApiSuccessResponse,
          503: openApiErrorResponse,
        },
      },
    },
    handleReadiness,
  );
}
