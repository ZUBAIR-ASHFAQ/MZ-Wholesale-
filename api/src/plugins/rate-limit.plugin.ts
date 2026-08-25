import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";

import { createErrorResponse } from "../shared/http/response.js";

/** Builds the shared API error envelope returned after a rate limit is exceeded. */
function buildRateLimitErrorResponse() {
  return createErrorResponse(
    "RATE_LIMITED",
    "Too many authentication attempts. Please try again later.",
  );
}

/** Registers route-level IP rate limiting without limiting every API route. */
export async function registerRateLimitPlugin(
  app: FastifyInstance,
): Promise<void> {
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: buildRateLimitErrorResponse,
  });
}
