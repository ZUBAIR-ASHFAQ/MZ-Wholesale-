import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";

/** Adds the shared Drizzle database client to the Fastify application. */
export function installDatabasePlugin(
  app: FastifyInstance,
  database: NodePgDatabase,
  pool: Pool,
): void {
  app.decorate("db", database);
  app.decorate("databasePool", pool);
}
