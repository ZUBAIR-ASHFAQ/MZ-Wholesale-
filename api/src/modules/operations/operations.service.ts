import {
  checkDatabaseReady,
  type OperationsDatabase,
} from "./operations.repository.js";
import type { OperationsVersionResponse } from "./operations.schema.js";

/** Contains the safe process-alive response returned by the liveness endpoint. */
export interface OperationsLivenessResult {
  status: "ok";
}

/** Contains the safe database readiness result used by the readiness endpoint. */
export interface OperationsReadinessResult {
  status: "ready" | "unavailable";
}

/** Returns process liveness without querying PostgreSQL or other dependencies. */
export function getOperationsLiveness(): OperationsLivenessResult {
  return { status: "ok" };
}

/** Checks PostgreSQL and returns only the safe readiness state. */
export async function getOperationsReadiness(
  database: OperationsDatabase,
): Promise<OperationsReadinessResult> {
  const isReady = await checkDatabaseReady(database);
  return { status: isReady ? "ready" : "unavailable" };
}

/** Returns only safe application build metadata used for production support. */
export function getOperationsVersion(options: {
  version: string;
  build: string;
  environment: "development" | "test" | "production";
}): OperationsVersionResponse {
  return {
    version: options.version,
    build: options.build,
    environment: options.environment,
  };
}
