import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { sql } from "drizzle-orm";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type FastifyServerOptions,
} from "fastify";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  createAdminSessionVerifier,
  isCsrfTokenValid,
  registerAuthRoutes,
} from "./modules/auth/index.js";
import { businessSettingsModule } from "./modules/business-settings/index.js";
import { customersModule } from "./modules/customers/index.js";
import { dashboardModule } from "./modules/dashboard/index.js";
import { expensesModule } from "./modules/expenses/index.js";
import { inventoryModule } from "./modules/inventory/index.js";
import { ledgersModule } from "./modules/ledgers/index.js";
import { paymentsModule } from "./modules/payments/index.js";
import { operationsModule } from "./modules/operations/index.js";
import { productsModule } from "./modules/products/index.js";
import { purchasesModule } from "./modules/purchases/index.js";
import { salesModule } from "./modules/sales/index.js";
import { returnsModule } from "./modules/returns/index.js";
import { reportsModule } from "./modules/reports/index.js";
import { suppliersModule } from "./modules/suppliers/index.js";
import { systemModule } from "./modules/system/index.js";
import {
  installAuthPlugin,
  type AdminSessionVerifier,
  type CsrfTokenVerifier,
} from "./plugins/auth.plugin.js";
import { registerCorsPlugin } from "./plugins/cors.plugin.js";
import { installDatabasePlugin } from "./plugins/database.plugin.js";
import { installErrorHandlerPlugin } from "./plugins/error-handler.plugin.js";
import { registerRateLimitPlugin } from "./plugins/rate-limit.plugin.js";
import { registerSecurityHeadersPlugin } from "./plugins/security-headers.plugin.js";
import { registerSwaggerPlugin } from "./plugins/swagger.plugin.js";
import {
  openApiErrorResponse,
  openApiSuccessResponse,
} from "./shared/http/openapi.js";
import {
  createDataResponse,
  createErrorResponse,
} from "./shared/http/response.js";

/** Contains the dependencies needed to create the Fastify application. */
export interface ApplicationOptions {
  database: NodePgDatabase;
  authSigningSecret: string;
  secureCookies: boolean;
  webAdminUrl?: string;
  sessionVerifier?: AdminSessionVerifier;
  csrfTokenVerifier?: CsrfTokenVerifier;
  loginLimit?: number;
  refreshLimit?: number;
  rateLimitWindowMilliseconds?: number;
  logger?: FastifyServerOptions["logger"];
  appVersion?: string;
  appBuild?: string;
  nodeEnvironment?: "development" | "test" | "production";
}

/** Builds the signed CSRF verifier used by all cookie-authenticated mutations. */
function createSignedCsrfVerifier(signingSecret: string): CsrfTokenVerifier {
  /** Checks that one CSRF token was signed for the active session UUID. */
  function isValidToken(csrfToken: string, sessionId: string): boolean {
    return isCsrfTokenValid(csrfToken, sessionId, signingSecret);
  }

  return { isValidToken };
}

/** Registers the public database readiness endpoint required by deployments. */
function registerHealthRoute(app: FastifyInstance): void {
  /** Returns healthy only after PostgreSQL answers a simple query. */
  async function checkHealth(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      await app.db.execute(sql`select 1`);
      reply.send(createDataResponse({ status: "ok" }));
    } catch (error) {
      const errorName = error instanceof Error ? error.name : "UnknownError";
      request.log.error({ errorName }, "Database health check failed.");
      reply
        .status(503)
        .send(
          createErrorResponse(
            "SERVICE_UNAVAILABLE",
            "The database is unavailable.",
          ),
        );
    }
  }

  app.get(
    "/health",
    {
      schema: {
        tags: ["health"],
        summary: "Check API and database readiness",
        response: {
          200: openApiSuccessResponse,
          503: openApiErrorResponse,
        },
      },
    },
    checkHealth,
  );
}

/** Creates the Fastify app and registers shared plugins before Module 1. */
export async function createApp(
  options: ApplicationOptions,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });

  await app.register(cookie);
  await app.register(jwt, {
    secret: options.authSigningSecret,
    sign: { algorithm: "HS256" },
    verify: { algorithms: ["HS256"] },
  });
  installDatabasePlugin(app, options.database);
  installErrorHandlerPlugin(app);
  await registerCorsPlugin(
    app,
    options.webAdminUrl ?? "http://localhost:5173",
  );
  await registerSecurityHeadersPlugin(app);
  await registerSwaggerPlugin(app);
  await registerRateLimitPlugin(app);
  const sessionVerifier =
    options.sessionVerifier ?? createAdminSessionVerifier(options.database);
  const csrfTokenVerifier =
    options.csrfTokenVerifier ??
    createSignedCsrfVerifier(options.authSigningSecret);

  installAuthPlugin(app, sessionVerifier, csrfTokenVerifier);
  registerHealthRoute(app);
  await registerAuthRoutes(
    app,
    options.authSigningSecret,
    options.secureCookies,
    options.loginLimit,
    options.refreshLimit,
    options.rateLimitWindowMilliseconds,
  );

  // Register the small production-operations module before business modules.
  await app.register(operationsModule, {
    version: options.appVersion ?? "1.0.0",
    build: options.appBuild ?? "local",
    environment: options.nodeEnvironment ?? "development",
  });

  // Register business modules in dependency order. Ledgers depend on Customers
  // and Suppliers. Payments depends on Ledgers and the account foundation.
  await app.register(businessSettingsModule);
  await app.register(productsModule);
  await app.register(customersModule);
  await app.register(suppliersModule);
  await app.register(inventoryModule);
  await app.register(ledgersModule);
  await app.register(paymentsModule);
  await app.register(purchasesModule);
  await app.register(salesModule);
  await app.register(returnsModule);
  await app.register(expensesModule);
  await app.register(reportsModule);
  await app.register(dashboardModule);
  await app.register(systemModule);

  return app;
}
