import helmet from "@fastify/helmet";
import type { FastifyInstance } from "fastify";

/** Registers standard browser security headers for every API response. */
export async function registerSecurityHeadersPlugin(
  app: FastifyInstance,
): Promise<void> {
  await app.register(helmet);
}
