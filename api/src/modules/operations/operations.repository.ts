import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/** Contains only the database method required by Production Operations. */
export type OperationsDatabase = Pick<NodePgDatabase, "execute">;

/** Returns the migration folder bundled with both source and production builds. */
function readMigrationFolder(): string {
  return fileURLToPath(new URL("../../../drizzle", import.meta.url));
}

const expectedMigrationHashes = readMigrationFiles({
  migrationsFolder: readMigrationFolder(),
}).map((migration) => migration.hash);

/** Returns true when PostgreSQL is reachable and every reviewed migration is applied. */
export async function checkDatabaseReady(
  database: OperationsDatabase,
): Promise<boolean> {
  try {
    if (expectedMigrationHashes.length === 0) {
      return false;
    }

    const result = await database.execute<{ hash: string }>(
      sql`select hash from drizzle.__drizzle_migrations`,
    );
    const appliedMigrationHashes = new Set(result.rows.map((row) => row.hash));

    return expectedMigrationHashes.every((hash) =>
      appliedMigrationHashes.has(hash),
    );
  } catch {
    return false;
  }
}
