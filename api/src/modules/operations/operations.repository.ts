import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/** Contains only the database method required by Production Operations. */
export type OperationsDatabase = Pick<NodePgDatabase, "execute">;

/** Returns true when PostgreSQL answers the lightweight readiness query. */
export async function checkDatabaseReady(
  database: OperationsDatabase,
): Promise<boolean> {
  try {
    await database.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
