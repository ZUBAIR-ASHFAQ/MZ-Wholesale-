import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDatabaseClient } from "../database/client.js";
import { AppError, readAppError } from "../shared/errors/app-error.js";
import { isNonEmptyText } from "../shared/utils/string.js";

function readDatabaseUrl(environment: NodeJS.ProcessEnv): string {
  const databaseUrl = environment.DATABASE_URL;

  if (!isNonEmptyText(databaseUrl)) {
    throw new AppError(
      "CONFIGURATION_ERROR",
      "DATABASE_URL is required.",
      400,
    );
  }

  return databaseUrl;
}

function readMigrationFolder(): string {
  return fileURLToPath(new URL("../../drizzle", import.meta.url));
}

function readSafeErrorMessage(error: unknown): string {
  const appError = readAppError(error);

  if (appError?.code === "CONFIGURATION_ERROR") {
    return appError.message;
  }

  return "Database migration failed. Check the database connection and migration files.";
}

async function runMigrationCommand(): Promise<void> {
  const databaseUrl = readDatabaseUrl(process.env);
  const databaseClient = createDatabaseClient(databaseUrl);

  try {
    await migrate(databaseClient.database, {
      migrationsFolder: readMigrationFolder(),
    });
    process.stdout.write("Database migrations completed successfully.\n");
  } finally {
    await databaseClient.pool.end();
  }
}

function reportMigrationFailure(error: unknown): void {
  process.stderr.write(`${readSafeErrorMessage(error)}\n`);
  process.exitCode = 1;
}

runMigrationCommand().catch(reportMigrationFailure);
