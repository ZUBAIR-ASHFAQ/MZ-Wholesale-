import { ZodError } from "zod";

import { createDatabaseClient } from "../database/client.js";
import {
  bootstrapAdminSchema,
  bootstrapInitialAdmin,
} from "../modules/auth/index.js";
import { AppError, readAppError } from "../shared/errors/app-error.js";
import { isNonEmptyText } from "../shared/utils/string.js";

/** Contains the database location and validated values used by the command. */
interface BootstrapConfiguration {
  databaseUrl: string;
  admin: {
    name: string;
    email: string;
    password: string;
  };
}

/** Reads one required environment variable without printing its value. */
function readRequiredEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  variableName: string,
): string {
  const value = environment[variableName];

  if (!isNonEmptyText(value)) {
    throw new AppError(
      "CONFIGURATION_ERROR",
      `${variableName} is required.`,
      400,
    );
  }

  return value;
}

/** Reads and validates every deployment value before opening the database. */
function readBootstrapConfiguration(
  environment: NodeJS.ProcessEnv,
): BootstrapConfiguration {
  const databaseUrl = readRequiredEnvironmentValue(environment, "DATABASE_URL");
  const admin = bootstrapAdminSchema.parse({
    name: readRequiredEnvironmentValue(environment, "ERP_ADMIN_NAME"),
    email: readRequiredEnvironmentValue(environment, "ERP_ADMIN_EMAIL"),
    password: readRequiredEnvironmentValue(environment, "ERP_ADMIN_PASSWORD"),
  });

  return { databaseUrl, admin };
}

/** Returns a safe command error that never contains secrets or database details. */
function readSafeErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    return firstIssue?.message ?? "Bootstrap values are invalid.";
  }

  const appError = readAppError(error);

  if (appError) {
    if (appError.code === "CONFIGURATION_ERROR") {
      return appError.message;
    }

    if (appError.code === "ADMIN_ALREADY_EXISTS") {
      return "The initial administrator already exists.";
    }
  }

  return "Bootstrap failed. Check the database connection and deployment values.";
}

/** Connects to PostgreSQL and creates the one initial administrator. */
async function runBootstrapCommand(): Promise<void> {
  const configuration = readBootstrapConfiguration(process.env);
  const databaseClient = createDatabaseClient(configuration.databaseUrl);

  try {
    const admin = await bootstrapInitialAdmin(
      databaseClient.database,
      configuration.admin,
    );
    process.stdout.write(`Initial administrator created for ${admin.email}.\n`);
  } finally {
    await databaseClient.pool.end();
  }
}

/** Reports a safe failure and gives the deployment command a failing exit code. */
function reportBootstrapFailure(error: unknown): void {
  process.stderr.write(`${readSafeErrorMessage(error)}\n`);
  process.exitCode = 1;
}

runBootstrapCommand().catch(reportBootstrapFailure);
