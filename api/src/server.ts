import { createApp } from "./app.js";
import {
  createDatabaseClient,
  verifyDatabaseConnection,
} from "./database/client.js";
import { readApiEnvironment } from "./env.js";
import { createLoggerOptions } from "./shared/utils/logger-redaction.js";

const gracefulShutdownTimeoutMs = 10_000;

/** Starts the API and closes its resources during shutdown. */
async function startServer(): Promise<void> {
  const environment = readApiEnvironment(process.env);
  const databaseClient = createDatabaseClient(environment.databaseUrl, {
    maximumConnections: environment.databasePoolMax,
    connectionTimeoutMilliseconds:
      environment.databaseConnectionTimeoutMilliseconds,
    idleTimeoutMilliseconds: environment.databaseIdleTimeoutMilliseconds,
  });

  await verifyDatabaseConnection(databaseClient.pool);
  const app = await createApp({
    database: databaseClient.database,
    authSigningSecret: environment.authSigningSecret,
    secureCookies: environment.isProduction,
    webAdminUrl: environment.webAdminUrl,
    logger: createLoggerOptions(),
    appVersion: environment.appVersion,
    appBuild: environment.appBuild,
    nodeEnvironment: environment.nodeEnvironment,
  });

  let shutdownPromise: Promise<void> | null = null;

  async function closeResources(): Promise<void> {
    await app.close();
    await databaseClient.pool.end();
  }

  function shutdown(signal: NodeJS.Signals): Promise<void> {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      app.log.info({ signal }, "API shutdown started");

      const timeout = setTimeout(() => {
        app.log.error("API shutdown timed out");
        process.exit(1);
      }, gracefulShutdownTimeoutMs);
      timeout.unref();

      try {
        await closeResources();
        clearTimeout(timeout);
        app.log.info("API shutdown completed");
      } catch (error) {
        clearTimeout(timeout);
        app.log.error({ err: error }, "API shutdown failed");
        process.exitCode = 1;
      }
    })();

    return shutdownPromise;
  }

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  try {
    await app.listen({
      host: environment.apiHost,
      port: environment.apiPort,
    });
  } catch (error) {
    await closeResources();
    throw error;
  }
}

/** Reports startup failure without printing environment secrets. */
function reportStartupFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : "Unknown startup error.";
  process.stderr.write(`API startup failed: ${message}\n`);
  process.exitCode = 1;
}

startServer().catch(reportStartupFailure);
