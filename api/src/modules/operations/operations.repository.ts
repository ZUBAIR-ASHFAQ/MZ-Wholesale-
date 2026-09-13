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
    const missingMigrationCount = expectedMigrationHashes.filter(
      (hash) => !appliedMigrationHashes.has(hash),
    ).length;

    if (missingMigrationCount > 0) {
      console.error(
        `Database readiness migration mismatch: expected=${expectedMigrationHashes.length} applied=${result.rows.length} missing=${missingMigrationCount}`,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "Database readiness query failed:",
      error instanceof Error ? error.message : "Unknown database readiness error.",
    );
    return false;
  }
}
