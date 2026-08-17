import { timingSafeEqual } from "node:crypto";

import type { FastifyInstance, FastifyRequest } from "fastify";

import { AppError } from "../shared/errors/app-error.js";

/** Name of the HttpOnly cookie that carries the access JWT. */
export const ACCESS_SESSION_COOKIE_NAME = "erp_access_session";

/** Name of the HttpOnly cookie that carries the rotating refresh token. */
export const REFRESH_SESSION_COOKIE_NAME = "erp_refresh_session";

/** Name of the readable cookie that carries the CSRF token. */
export const CSRF_COOKIE_NAME = "erp_csrf_token";

/** Name of the request header that must repeat the CSRF cookie value. */
export const CSRF_HEADER_NAME = "x-csrf-token";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Contains the safe admin identity added to an authenticated request. */
export interface AuthenticatedAdmin {
  adminUserId: string;
  sessionId: string;
}

/** Contains the only application claim stored in an access JWT. */
interface AccessJwtPayload {
  sessionId: string;
}

/** Defines the database-session check supplied by Module 2. */
export interface AdminSessionVerifier {
  verifySession(sessionId: string): Promise<AuthenticatedAdmin | null>;
}

/** Defines the signed CSRF check supplied by the Auth module. */
export interface CsrfTokenVerifier {
  isValidToken(csrfToken: string, sessionId: string): boolean;
}

/** Reads the access JWT from the parsed request cookies. */
function readAccessToken(request: FastifyRequest): string | null {
  const accessToken = request.cookies[ACCESS_SESSION_COOKIE_NAME];

  if (!accessToken || accessToken.trim().length === 0) {
    return null;
  }

  return accessToken;
}

/** Verifies an access JWT and returns its database-session UUID. */
export function readVerifiedAccessSessionId(
  app: FastifyInstance,
  accessToken: string | null | undefined,
): string | null {
  if (!accessToken) {
    return null;
  }

  try {
    const payload = app.jwt.verify<AccessJwtPayload>(accessToken);

    if (!UUID_PATTERN.test(payload.sessionId)) {
      return null;
    }

    return payload.sessionId;
  } catch {
    return null;
  }
}

/** Reads the CSRF token from the request header. */
function readCsrfHeader(request: FastifyRequest): string | null {
  const headerValue = request.headers[CSRF_HEADER_NAME];

  if (typeof headerValue !== "string" || headerValue.length === 0) {
    return null;
  }

  return headerValue;
}

/** Checks whether an HTTP method is safe and therefore does not need CSRF. */
function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

/** Compares two tokens without returning early when their bytes differ. */
function tokensMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

/** Checks that a mutation repeats the CSRF cookie in the required header. */
function hasValidCsrfToken(
  request: FastifyRequest,
  sessionId: string,
  csrfTokenVerifier: CsrfTokenVerifier,
): boolean {
  const cookieToken = request.cookies[CSRF_COOKIE_NAME];
  const headerToken = readCsrfHeader(request);

  if (!cookieToken || !headerToken) {
    return false;
  }

  return (
    tokensMatch(cookieToken, headerToken) &&
    csrfTokenVerifier.isValidToken(cookieToken, sessionId)
  );
}

/** Adds the reusable authenticated-admin pre-handler to the Fastify app. */
export function installAuthPlugin(
  app: FastifyInstance,
  sessionVerifier: AdminSessionVerifier,
  csrfTokenVerifier: CsrfTokenVerifier,
): void {
  /** Verifies the JWT, active DB session and CSRF token for private requests. */
  async function authenticate(request: FastifyRequest): Promise<void> {
    const accessToken = readAccessToken(request);
    const sessionId = readVerifiedAccessSessionId(app, accessToken);

    if (!sessionId) {
      throw new AppError(
        "UNAUTHENTICATED",
        "An active admin session is required.",
        401,
      );
    }

    let admin: AuthenticatedAdmin | null;

    try {
      admin = await sessionVerifier.verifySession(sessionId);
    } catch (error) {
      const errorName = error instanceof Error ? error.name : "UnknownError";
      request.log.error(
        { errorName, requestId: request.id },
        "Admin session verification failed.",
      );
      throw new AppError(
        "INTERNAL_SERVER_ERROR",
        "The admin session could not be verified.",
        500,
      );
    }

    if (!admin || !admin.adminUserId || admin.sessionId !== sessionId) {
      throw new AppError(
        "UNAUTHENTICATED",
        "An active admin session is required.",
        401,
      );
    }

    if (
      !isSafeMethod(request.method) &&
      !hasValidCsrfToken(request, admin.sessionId, csrfTokenVerifier)
    ) {
      throw new AppError(
        "INVALID_CSRF_TOKEN",
        "A valid CSRF token is required.",
        403,
      );
    }

    request.admin = admin;
  }

  app.decorateRequest("admin", null);
  app.decorate("authenticate", authenticate);
}
