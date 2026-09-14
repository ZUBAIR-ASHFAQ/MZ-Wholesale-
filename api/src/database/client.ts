import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";


/** Database role used by authenticated tenant-scoped business requests. */
export const TENANT_DATABASE_ROLE = "wholesale_erp_tenant";

/** Contains one dedicated tenant-scoped Drizzle connection and its cleanup. */
export interface TenantDatabaseLease {
  database: NodePgDatabase;
  release(): Promise<void>;
}

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

/** Acquires one dedicated connection whose database policies are scoped to one admin. */
export async function acquireTenantDatabase(
  pool: Pool,
  adminUserId: string,
): Promise<TenantDatabaseLease> {
  const client = await pool.connect();
  let released = false;

  try {
    await client.query(`set role ${TENANT_DATABASE_ROLE}`);
    await client.query(
      "select set_config('app.admin_user_id', $1, false)",
      [adminUserId],
    );
  } catch (error) {
    client.release(true);
    throw error;
  }

  return {
    database: drizzle(client),
    async release(): Promise<void> {
      if (released) {
        return;
      }

      released = true;

      try {
        await client.query(
          "select set_config('app.admin_user_id', '', false)",
        );
        await client.query("reset role");
        client.release();
      } catch {
        client.release(true);
      }
    },
  };
}
