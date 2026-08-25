import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/** Contains PostgreSQL pool limits controlled by validated environment values. */
export interface DatabasePoolOptions {
  maximumConnections: number;
  connectionTimeoutMilliseconds: number;
  idleTimeoutMilliseconds: number;
}

/** Contains the Drizzle database and PostgreSQL pool used by the API. */
export interface DatabaseClient {
  database: NodePgDatabase;
  pool: Pool;
}

/** Creates the shared PostgreSQL pool and Drizzle database client. */
export function createDatabaseClient(
  databaseUrl: string,
  options: DatabasePoolOptions = {
    maximumConnections: 10,
    connectionTimeoutMilliseconds: 5_000,
    idleTimeoutMilliseconds: 30_000,
  },
): DatabaseClient {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: options.maximumConnections,
    connectionTimeoutMillis: options.connectionTimeoutMilliseconds,
    idleTimeoutMillis: options.idleTimeoutMilliseconds,
  });
  const database = drizzle(pool);

  return { database, pool };
}

/** Fails startup early when PostgreSQL cannot accept a simple query. */
export async function verifyDatabaseConnection(pool: Pool): Promise<void> {
  await pool.query("select 1");
}
