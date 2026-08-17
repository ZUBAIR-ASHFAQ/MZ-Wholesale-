import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";

/** Allows credentialed browser requests only from the configured admin URL. */
export async function registerCorsPlugin(
  app: FastifyInstance,
  webAdminUrl: string,
): Promise<void> {
  await app.register(cors, {
    origin: webAdminUrl,
    credentials: true,
  });
}
