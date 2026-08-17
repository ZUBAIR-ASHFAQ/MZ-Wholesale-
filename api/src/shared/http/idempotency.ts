import { createHash } from "node:crypto";

import { and, eq, lt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { idempotencyRequests } from "../../database/schema/system.schema.js";
import { AppError } from "../errors/app-error.js";

const IDEMPOTENCY_TTL_MILLISECONDS = 24 * 60 * 60 * 1000;

export interface IdempotentResponse {
  statusCode: number;
  body: unknown;
}

export interface IdempotentExecutionResult extends IdempotentResponse {
  replayed: boolean;
}

interface IdempotentRequestInput {
  key: string | string[] | undefined;
  method: string;
  path: string;
  body: unknown;
}

/** Sorts object keys recursively so equivalent JSON bodies produce the same hash. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }

  return value;
}

/** Creates the stable SHA-256 hash saved with one idempotency key. */
function createRequestHash(body: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(body)))
    .digest("hex");
}

/** Validates and normalizes the required Idempotency-Key header. */
function normalizeIdempotencyKey(
  key: string | string[] | undefined,
): string {
  const headerValue = Array.isArray(key) ? key[0] : key;
  const normalized = headerValue?.trim();

  if (!normalized) {
    throw new AppError(
      "IDEMPOTENCY_KEY_REQUIRED",
      "Idempotency-Key header is required for this operation.",
      400,
    );
  }

  if (normalized.length > 200) {
    throw new AppError(
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency-Key cannot be longer than 200 characters.",
      400,
    );
  }

  return normalized;
}

/** Executes one mutation once and replays its saved response for matching retries. */
export async function executeIdempotentMutation(
  database: NodePgDatabase,
  input: IdempotentRequestInput,
  operation: (transaction: NodePgDatabase) => Promise<IdempotentResponse>,
): Promise<IdempotentExecutionResult> {
  const key = normalizeIdempotencyKey(input.key);
  const requestHash = createRequestHash(input.body);

  return database.transaction(async (transaction) => {
    // Keep the reservation, business writes, and saved response atomic.
    const tx = transaction as unknown as NodePgDatabase;
    const now = new Date();

    await tx
      .delete(idempotencyRequests)
      .where(
        and(
          eq(idempotencyRequests.key, key),
          lt(idempotencyRequests.expiresAt, now),
        ),
      );

    const [created] = await tx
      .insert(idempotencyRequests)
      .values({
        key,
        method: input.method,
        path: input.path,
        requestHash,
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MILLISECONDS),
      })
      .onConflictDoNothing({ target: idempotencyRequests.key })
      .returning({ id: idempotencyRequests.id });

    if (!created) {
      const [existing] = await tx
        .select()
        .from(idempotencyRequests)
        .where(eq(idempotencyRequests.key, key))
        .limit(1);

      if (!existing) {
        throw new AppError(
          "IDEMPOTENCY_REQUEST_CONFLICT",
          "The request could not be reserved. Please retry.",
          409,
        );
      }

      if (
        existing.method !== input.method ||
        existing.path !== input.path ||
        existing.requestHash !== requestHash
      ) {
        throw new AppError(
          "IDEMPOTENCY_KEY_REUSED",
          "This Idempotency-Key was already used for a different request.",
          409,
        );
      }

      if (
        existing.status === "COMPLETED" &&
        existing.responseStatus !== null &&
        existing.responseBody !== null
      ) {
        return {
          statusCode: existing.responseStatus,
          body: existing.responseBody,
          replayed: true,
        };
      }

      throw new AppError(
        "IDEMPOTENCY_REQUEST_IN_PROGRESS",
        "A request with this Idempotency-Key is already being processed.",
        409,
      );
    }

    const response = await operation(tx);

    await tx
      .update(idempotencyRequests)
      .set({
        status: "COMPLETED",
        responseStatus: response.statusCode,
        responseBody: response.body,
        updatedAt: new Date(),
      })
      .where(eq(idempotencyRequests.id, created.id));

    return { ...response, replayed: false };
  });
}
