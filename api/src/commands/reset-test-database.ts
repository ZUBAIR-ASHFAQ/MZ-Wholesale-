import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { createDatabaseClient } from "../database/client.js";
import { AppError, readAppError } from "../shared/errors/app-error.js";
import { isNonEmptyText } from "../shared/utils/string.js";

function readTestDatabaseUrl(environment: NodeJS.ProcessEnv): string {
  const databaseUrl = environment.TEST_DATABASE_URL;

  if (!isNonEmptyText(databaseUrl)) {
    throw new AppError(
      "CONFIGURATION_ERROR",
      "TEST_DATABASE_URL is required for integration tests.",
      400,
    );
  }

  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");

  if (!databaseName.toLowerCase().includes("test")) {
    throw new AppError(
      "UNSAFE_TEST_DATABASE",
      "The integration-test database name must contain the word 'test'.",
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

  if (appError) {
    return appError.message;
  }

  return "Test database reset failed. Check TEST_DATABASE_URL and PostgreSQL availability.";
}

async function resetPublicSchema(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });

  try {
    await pool.query("drop schema if exists public cascade");
    await pool.query("create schema public");
  } finally {
    await pool.end();
  }
}

async function runResetCommand(): Promise<void> {
  const databaseUrl = readTestDatabaseUrl(process.env);

  await resetPublicSchema(databaseUrl);

  const databaseClient = createDatabaseClient(databaseUrl, {
    maximumConnections: 2,
    connectionTimeoutMilliseconds: 5_000,
    idleTimeoutMilliseconds: 5_000,
  });

  try {
    await migrate(databaseClient.database, {
      migrationsFolder: readMigrationFolder(),
    });
    process.stdout.write("Test database reset and migrations completed successfully.\n");
  } finally {
    await databaseClient.pool.end();
  }
}

function reportResetFailure(error: unknown): void {
  process.stderr.write(`${readSafeErrorMessage(error)}\n`);
  process.exitCode = 1;
}

runResetCommand().catch(reportResetFailure);
