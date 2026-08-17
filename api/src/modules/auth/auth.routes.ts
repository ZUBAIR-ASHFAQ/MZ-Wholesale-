import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import {
  ACCESS_SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  REFRESH_SESSION_COOKIE_NAME,
  readVerifiedAccessSessionId,
} from "../../plugins/auth.plugin.js";
import {
  openApiAccessSecurity,
  openApiErrorResponse,
  openApiMutationSecurity,
  openApiPrivateErrors,
  openApiSuccessResponse,
} from "../../shared/http/openapi.js";
import { createDataResponse } from "../../shared/http/response.js";
import {
  adminSessionIdParamsSchema,
  adminSessionsQuerySchema,
  currentAdminQuerySchema,
  logoutAllRequestBodySchema,
  logoutRequestBodySchema,
  refreshRequestBodySchema,
} from "./auth.schema.js";
import {
  ACCESS_TOKEN_LIFETIME_MILLISECONDS,
  changeAdminPassword,
  getCurrentAdminProfile,
  listAdminSessions,
  loginAdmin,
  logoutAdmin,
  logoutAllAdminSessions,
  refreshAdminSession,
  revokeAdminSessionById,
  requireMatchingCsrfToken,
  type LoginSessionResult,
} from "./auth.service.js";

/** Creates the short-lived JWT stored in the access cookie. */
function createAccessJwt(
  app: FastifyInstance,
  sessionId: string,
): string {
  return app.jwt.sign(
    { sessionId },
    { expiresIn: Math.floor(ACCESS_TOKEN_LIFETIME_MILLISECONDS / 1000) },
  );
}

/** Sets access, refresh and CSRF cookies without returning their values. */
function setSessionCookies(
  app: FastifyInstance,
  reply: FastifyReply,
  session: LoginSessionResult,
  secureCookies: boolean,
): void {
  const accessToken = createAccessJwt(app, session.sessionId);

  reply.setCookie(ACCESS_SESSION_COOKIE_NAME, accessToken, {
    path: "/",
    expires: session.accessTokenExpiresAt,
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies,
  });
  reply.setCookie(REFRESH_SESSION_COOKIE_NAME, session.refreshToken, {
    path: "/",
    expires: session.refreshTokenExpiresAt,
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies,
  });
  reply.setCookie(CSRF_COOKIE_NAME, session.csrfToken, {
    path: "/",
    expires: session.refreshTokenExpiresAt,
    httpOnly: false,
    sameSite: "lax",
    secure: secureCookies,
  });
}

/** Clears all authentication cookies after session revocation. */
function clearSessionCookies(
  reply: FastifyReply,
  secureCookies: boolean,
): void {
  reply.clearCookie(ACCESS_SESSION_COOKIE_NAME, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies,
  });
  reply.clearCookie(REFRESH_SESSION_COOKIE_NAME, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies,
  });
  reply.clearCookie(CSRF_COOKIE_NAME, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    secure: secureCookies,
  });
}

/** Uses a positive integer rate-limit option or the safe default value. */
function readPositiveRateLimit(
  value: number | undefined,
  defaultValue: number,
): number {
  if (value === undefined || !Number.isInteger(value) || value <= 0) {
    return defaultValue;
  }

  return value;
}

/** Registers the Auth endpoints and their small HTTP handlers. */
export async function registerAuthRoutes(
  app: FastifyInstance,
  signingSecret: string,
  secureCookies: boolean,
  loginLimit?: number,
  refreshLimit?: number,
  rateLimitWindowMilliseconds?: number,
): Promise<void> {

  /** Reads request metadata passed to Auth service audit writes. */
  function createAuditContext(request: FastifyRequest) {
    return {
      requestId: request.id,
      ipAddress: request.ip ?? null,
      device: request.headers["user-agent"] ?? null,
    };
  }

  const loginRateLimit = {
    max: readPositiveRateLimit(loginLimit, 5),
    timeWindow: readPositiveRateLimit(
      rateLimitWindowMilliseconds,
      60_000,
    ),
  };
  const refreshRateLimit = {
    max: readPositiveRateLimit(refreshLimit, 20),
    timeWindow: readPositiveRateLimit(
      rateLimitWindowMilliseconds,
      60_000,
    ),
  };

  /** Receives credentials, calls login and returns safe session cookies. */
  async function handleLogin(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const session = await loginAdmin(
      app.db,
      request.body,
      signingSecret,
      new Date(),
      createAuditContext(request),
    );

    setSessionCookies(app, reply, session, secureCookies);
    reply.send(createDataResponse({ admin: session.admin }));
  }

  /** Receives refresh cookies, rotates the session and replaces its cookies. */
  async function handleRefresh(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const now = new Date();
    const csrfToken = requireMatchingCsrfToken(
      request.cookies[CSRF_COOKIE_NAME],
      request.headers[CSRF_HEADER_NAME],
    );

    refreshRequestBodySchema.parse(request.body);
    const session = await refreshAdminSession(
      app.db,
      request.cookies[REFRESH_SESSION_COOKIE_NAME] ?? "",
      csrfToken,
      signingSecret,
      now,
    );

    setSessionCookies(app, reply, session, secureCookies);
    reply.send(createDataResponse({ admin: session.admin }));
  }

  /** Receives current cookies, revokes one session and clears all cookies. */
  async function handleLogout(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const csrfToken = requireMatchingCsrfToken(
        request.cookies[CSRF_COOKIE_NAME],
        request.headers[CSRF_HEADER_NAME],
      );

      logoutRequestBodySchema.parse(request.body);
      const accessSessionId = readVerifiedAccessSessionId(
        app,
        request.cookies[ACCESS_SESSION_COOKIE_NAME],
      );

      await logoutAdmin(
        app.db,
        accessSessionId,
        request.cookies[REFRESH_SESSION_COOKIE_NAME],
        csrfToken,
        signingSecret,
        new Date(),
        createAuditContext(request),
      );
    } finally {
      clearSessionCookies(reply, secureCookies);
    }

    reply.send(createDataResponse({ loggedOut: true }));
  }

  /** Receives the authenticated identity and returns the safe admin profile. */
  async function handleCurrentAdmin(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    currentAdminQuerySchema.parse(request.query);
    const admin = await getCurrentAdminProfile(
      app.db,
      request.admin?.adminUserId ?? "",
    );

    reply.send(createDataResponse({ admin }));
  }

  /** Returns the authenticated administrator's active sessions. */
  async function handleListSessions(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    adminSessionsQuerySchema.parse(request.query);
    const sessions = await listAdminSessions(
      app.db,
      request.admin?.adminUserId ?? "",
      request.admin?.sessionId ?? "",
      new Date(),
    );

    reply.send(createDataResponse({ sessions }));
  }

  /** Revokes one selected active session and clears cookies when it is current. */
  async function handleRevokeSession(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = adminSessionIdParamsSchema.parse(request.params);
    const result = await revokeAdminSessionById(
      app.db,
      request.admin?.adminUserId ?? "",
      request.admin?.sessionId ?? "",
      params.id,
      new Date(),
      createAuditContext(request),
    );

    if (result.currentSessionRevoked) {
      clearSessionCookies(reply, secureCookies);
    }

    reply.send(createDataResponse({
      revoked: true,
      sessionId: result.sessionId,
      currentSessionRevoked: result.currentSessionRevoked,
    }));
  }

  /** Revokes every active admin session and clears the current browser cookies. */
  async function handleLogoutAll(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    logoutAllRequestBodySchema.parse(request.body);
    const result = await logoutAllAdminSessions(
      app.db,
      request.admin?.adminUserId ?? "",
      new Date(),
      createAuditContext(request),
    );

    clearSessionCookies(reply, secureCookies);
    reply.send(createDataResponse({
      loggedOut: true,
      revokedSessionCount: result.revokedSessionCount,
    }));
  }

  /** Receives password fields, changes the password and clears old cookies. */
  async function handleChangePassword(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const admin = await changeAdminPassword(
      app.db,
      request.admin?.adminUserId ?? "",
      request.body,
      new Date(),
      createAuditContext(request),
    );
    clearSessionCookies(reply, secureCookies);
    reply.send(createDataResponse({ admin, sessionsRevoked: true }));
  }

  app.post(
    "/auth/login",
    {
      config: { rateLimit: loginRateLimit },
      schema: {
        tags: ["auth"],
        summary: "Start the admin session",
        description: "Accepts email and password and sets access, refresh and CSRF cookies.",
        response: {
          200: openApiSuccessResponse,
          400: openApiErrorResponse,
          401: openApiErrorResponse,
          429: openApiErrorResponse,
          500: openApiErrorResponse,
        },
      },
    },
    handleLogin,
  );
  app.post(
    "/auth/refresh",
    {
      config: { rateLimit: refreshRateLimit },
      schema: {
        tags: ["auth"],
        summary: "Rotate the admin session",
        description: "Uses the refresh cookie and matching X-CSRF-Token header and replaces all session cookies.",
        security: [{ refreshCookie: [], csrfHeader: [] }],
        response: { 200: openApiSuccessResponse, ...openApiPrivateErrors },
      },
    },
    handleRefresh,
  );
  app.post(
    "/auth/logout",
    {
      schema: {
        tags: ["auth"],
        summary: "Revoke the current session",
        security: [{ accessCookie: [], csrfHeader: [] }, { refreshCookie: [], csrfHeader: [] }],
        response: { 200: openApiSuccessResponse, ...openApiPrivateErrors },
      },
    },
    handleLogout,
  );
  app.get(
    "/auth/me",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["auth"],
        summary: "Load the current admin",
        security: openApiAccessSecurity,
        response: { 200: openApiSuccessResponse, ...openApiPrivateErrors },
      },
    },
    handleCurrentAdmin,
  );
  app.get(
    "/auth/sessions",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["auth"],
        summary: "List active admin sessions",
        security: openApiAccessSecurity,
        response: { 200: openApiSuccessResponse, ...openApiPrivateErrors },
      },
    },
    handleListSessions,
  );
  app.delete(
    "/auth/sessions/:id",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["auth"],
        summary: "Revoke one active admin session",
        security: openApiMutationSecurity,
        response: { 200: openApiSuccessResponse, ...openApiPrivateErrors },
      },
    },
    handleRevokeSession,
  );
  app.post(
    "/auth/logout-all",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["auth"],
        summary: "Revoke all active admin sessions",
        security: openApiMutationSecurity,
        response: { 200: openApiSuccessResponse, ...openApiPrivateErrors },
      },
    },
    handleLogoutAll,
  );
  app.post(
    "/auth/change-password",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["auth"],
        summary: "Change the admin password",
        description: "Accepts currentPassword, newPassword and confirmPassword, then revokes all sessions.",
        security: openApiMutationSecurity,
        response: { 200: openApiSuccessResponse, ...openApiPrivateErrors },
      },
    },
    handleChangePassword,
  );
}
