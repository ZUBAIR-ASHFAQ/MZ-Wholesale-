import { ZodError } from "zod";

import { createDatabaseClient } from "../database/client.js";
import { findExistingAdmin } from "../modules/auth/auth.repository.js";
import {
  bootstrapAdminSchema,
  bootstrapInitialAdmin,
} from "../modules/auth/index.js";
import {
  FIXED_CURRENCY,
  FIXED_TIMEZONE,
  type BusinessSettingsSetupInput,
} from "../modules/business-settings/business-settings.schema.js";
import {
  getBusinessSettingsView,
  saveBusinessSettings,
} from "../modules/business-settings/business-settings.service.js";
import { ensureWalkInCustomerExists } from "../modules/customers/customers.service.js";
import { AppError, readAppError } from "../shared/errors/app-error.js";
import { isNonEmptyText } from "../shared/utils/string.js";

interface InitializationResult {
  adminCreated: boolean;
  businessSettingsCreated: boolean;
  walkInCustomerReady: boolean;
}

function readRequiredValue(
  environment: NodeJS.ProcessEnv,
  variableName: string,
): string {
  const value = environment[variableName];

  if (!isNonEmptyText(value)) {
    throw new AppError(
      "CONFIGURATION_ERROR",
      `${variableName} is required for first-time initialization.`,
      400,
    );
  }

  return value.trim();
}

function readOptionalValue(
  environment: NodeJS.ProcessEnv,
  variableName: string,
): string | null {
  const value = environment[variableName];
  return isNonEmptyText(value) ? value.trim() : null;
}

function readBusinessSetup(
  environment: NodeJS.ProcessEnv,
): BusinessSettingsSetupInput {
  return {
    businessName: readRequiredValue(environment, "ERP_BUSINESS_NAME"),
    phone: readRequiredValue(environment, "ERP_BUSINESS_PHONE"),
    email: readOptionalValue(environment, "ERP_BUSINESS_EMAIL"),
    address: readRequiredValue(environment, "ERP_BUSINESS_ADDRESS"),
    logoUrl: readOptionalValue(environment, "ERP_BUSINESS_LOGO_URL"),
    currency: FIXED_CURRENCY,
    timezone: FIXED_TIMEZONE,
    sequences: [
      { documentType: "SALE", prefix: "SALE", nextNumber: 1 },
      { documentType: "PURCHASE", prefix: "PUR", nextNumber: 1 },
      {
        documentType: "CUSTOMER_RECEIPT",
        prefix: "CR",
        nextNumber: 1,
      },
      {
        documentType: "SUPPLIER_PAYMENT",
        prefix: "SP",
        nextNumber: 1,
      },
      { documentType: "SALES_RETURN", prefix: "SR", nextNumber: 1 },
      {
        documentType: "PURCHASE_RETURN",
        prefix: "PR",
        nextNumber: 1,
      },
      { documentType: "EXPENSE", prefix: "EXP", nextNumber: 1 },
    ],
  };
}

function readSafeErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "Initialization values are invalid.";
  }

  const appError = readAppError(error);

  if (appError?.code === "CONFIGURATION_ERROR") {
    return appError.message;
  }

  return "System initialization failed. Run migrations and check the deployment values.";
}

async function ensureAdmin(
  database: ReturnType<typeof createDatabaseClient>["database"],
): Promise<boolean> {
  const existingAdmin = await findExistingAdmin(database);

  if (existingAdmin) {
    return false;
  }

  const admin = bootstrapAdminSchema.parse({
    name: readRequiredValue(process.env, "ERP_ADMIN_NAME"),
    email: readRequiredValue(process.env, "ERP_ADMIN_EMAIL"),
    password: readRequiredValue(process.env, "ERP_ADMIN_PASSWORD"),
  });

  await bootstrapInitialAdmin(database, admin);
  return true;
}

async function ensureBusinessSettings(
  database: ReturnType<typeof createDatabaseClient>["database"],
): Promise<boolean> {
  const current = await getBusinessSettingsView(database);

  if (current.isConfigured) {
    return false;
  }

  await saveBusinessSettings(database, readBusinessSetup(process.env));
  return true;
}

async function initializeSystem(): Promise<InitializationResult> {
  const databaseUrl = readRequiredValue(process.env, "DATABASE_URL");
  const databaseClient = createDatabaseClient(databaseUrl);

  try {
    const adminCreated = await ensureAdmin(databaseClient.database);
    const businessSettingsCreated = await ensureBusinessSettings(
      databaseClient.database,
    );
    await ensureWalkInCustomerExists(databaseClient.database);

    return {
      adminCreated,
      businessSettingsCreated,
      walkInCustomerReady: true,
    };
  } finally {
    await databaseClient.pool.end();
  }
}

function printInitializationResult(result: InitializationResult): void {
  process.stdout.write(
    [
      `Administrator: ${result.adminCreated ? "created" : "already present"}`,
      `Business settings: ${result.businessSettingsCreated ? "created" : "already present"}`,
      `Walk-in Customer: ${result.walkInCustomerReady ? "ready" : "not ready"}`,
      "System initialization completed successfully.",
    ].join("\n") + "\n",
  );
}

function reportInitializationFailure(error: unknown): void {
  process.stderr.write(`${readSafeErrorMessage(error)}\n`);
  process.exitCode = 1;
}

initializeSystem().then(printInitializationResult).catch(reportInitializationFailure);
