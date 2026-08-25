import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { FastifyInstance } from "fastify";

/** Adds the shared Drizzle database client to the Fastify application. */
export function installDatabasePlugin(
  app: FastifyInstance,
  database: NodePgDatabase,
): void {
  app.decorate("db", database);
}
