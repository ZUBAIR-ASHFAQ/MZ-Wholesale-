import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import Fastify from "fastify";
import jwt from "@fastify/jwt";

import {
  ACCESS_TOKEN_LIFETIME_MILLISECONDS,
  createCsrfToken,
  createRefreshToken,
  hashPassword,
  hashRefreshToken,
  isCsrfTokenValid,
  isRefreshTokenFormatValid,
  requireMatchingCsrfToken,
  verifyPassword,
} from "../src/modules/auth/auth.service.js";
import { readVerifiedAccessSessionId } from "../src/plugins/auth.plugin.js";

const sessionId = "11111111-1111-4111-8111-111111111111";
const signingSecret = "0123456789abcdef0123456789abcdef";

async function readAuthRoutes(): Promise<string> {
  return readFile(
    new URL("../src/modules/auth/auth.routes.ts", import.meta.url),
    "utf8",
  );
}


async function readAuthPlugin(): Promise<string> {
  return readFile(
    new URL("../src/plugins/auth.plugin.ts", import.meta.url),
    "utf8",
  );
}

async function readAuthRepository(): Promise<string> {
  return readFile(
    new URL("../src/modules/auth/auth.repository.ts", import.meta.url),
    "utf8",
  );
}

async function readAuthService(): Promise<string> {
  return readFile(
    new URL("../src/modules/auth/auth.service.ts", import.meta.url),
    "utf8",
  );
}

test("password hashing verifies the correct password only", async () => {
  const password = "Strong password 123!";
  const passwordHash = await hashPassword(password);

  assert.notEqual(passwordHash, password);
  assert.equal(await verifyPassword(password, passwordHash), true);
  assert.equal(await verifyPassword("Wrong password 123!", passwordHash), false);
});

test("refresh tokens use the expected format and stable hash", () => {
  const refreshToken = createRefreshToken();

  assert.equal(isRefreshTokenFormatValid(refreshToken), true);
  assert.equal(hashRefreshToken(refreshToken), hashRefreshToken(refreshToken));
  assert.equal(hashRefreshToken(refreshToken).length, 64);
  assert.equal(isRefreshTokenFormatValid("invalid-token"), false);
});

test("access cookie uses a valid JWT session claim", async () => {
  const app = Fastify();
  await app.register(jwt, { secret: signingSecret });

  const accessToken = app.jwt.sign(
    { sessionId },
    { expiresIn: Math.floor(ACCESS_TOKEN_LIFETIME_MILLISECONDS / 1000) },
  );

  assert.equal(readVerifiedAccessSessionId(app, accessToken), sessionId);
  await app.close();
});

test("access JWT rejects a changed signature", async () => {
  const app = Fastify();
  await app.register(jwt, { secret: signingSecret });

  const accessToken = app.jwt.sign(
    { sessionId },
    { expiresIn: Math.floor(ACCESS_TOKEN_LIFETIME_MILLISECONDS / 1000) },
  );
  const changedToken = `${accessToken.slice(0, -1)}x`;

  assert.equal(readVerifiedAccessSessionId(app, changedToken), null);
  await app.close();
});

test("access JWT rejects an expired token", async () => {
  const app = Fastify();
  await app.register(jwt, { secret: signingSecret });

  const expiredToken = app.jwt.sign({
    sessionId,
    exp: Math.floor(Date.now() / 1000) - 1,
  });

  assert.equal(readVerifiedAccessSessionId(app, expiredToken), null);
  await app.close();
});

test("CSRF token is bound to its session", () => {
  const csrfToken = createCsrfToken(sessionId, signingSecret);
  const otherSessionId = "22222222-2222-4222-8222-222222222222";

  assert.equal(isCsrfTokenValid(csrfToken, sessionId, signingSecret), true);
  assert.equal(isCsrfTokenValid(csrfToken, otherSessionId, signingSecret), false);
});

test("CSRF cookie and header must match", () => {
  const csrfToken = createCsrfToken(sessionId, signingSecret);

  assert.equal(requireMatchingCsrfToken(csrfToken, csrfToken), csrfToken);
  assert.throws(
    () => requireMatchingCsrfToken(csrfToken, "different"),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "INVALID_CSRF_TOKEN",
  );
});

test("Auth exposes the original routes plus production session-security routes", async () => {
  const source = await readAuthRoutes();
  const routes = [...source.matchAll(/app\.(get|post|delete)\(\s*"([^"]+)"/g)].map(
    (match) => `${match[1].toUpperCase()} ${match[2]}`,
  );

  assert.deepEqual(routes, [
    "POST /auth/login",
    "POST /auth/refresh",
    "POST /auth/logout",
    "GET /auth/me",
    "GET /auth/sessions",
    "DELETE /auth/sessions/:id",
    "POST /auth/logout-all",
    "POST /auth/change-password",
  ]);
  assert.doesNotMatch(source, /app\.(?:patch|put)\(/);
});

test("login and refresh keep route-level rate limits", async () => {
  const source = await readAuthRoutes();

  assert.match(source, /"\/auth\/login"[\s\S]*config:\s*\{ rateLimit: loginRateLimit \}/);
  assert.match(source, /"\/auth\/refresh"[\s\S]*config:\s*\{ rateLimit: refreshRateLimit \}/);
});



test("logout audit stays inside the Auth service instead of the route", async () => {
  const routes = await readAuthRoutes();
  const service = await readAuthService();

  assert.doesNotMatch(routes, /recordAuditLog|auditAuth/);
  assert.match(service, /export async function logoutAdmin\(/);
  assert.match(service, /"LOGOUT"/);
});
test("private and mutation Auth routes use authentication and CSRF security", async () => {
  const source = await readAuthRoutes();

  assert.match(source, /"\/auth\/me"[\s\S]*preHandler:\s*app\.authenticate/);
  assert.match(source, /"\/auth\/change-password"[\s\S]*preHandler:\s*app\.authenticate/);
  assert.match(source, /"\/auth\/sessions"[\s\S]*preHandler:\s*app\.authenticate/);
  assert.match(source, /"\/auth\/sessions\/:id"[\s\S]*preHandler:\s*app\.authenticate/);
  assert.match(source, /"\/auth\/logout-all"[\s\S]*preHandler:\s*app\.authenticate/);
  assert.match(source, /requireMatchingCsrfToken/);
  assert.match(source, /openApiMutationSecurity/);
});

test("production session routes call Auth service logic and clear current cookies safely", async () => {
  const source = await readAuthRoutes();

  assert.match(source, /handleListSessions[\s\S]*listAdminSessions\(/);
  assert.match(source, /handleRevokeSession[\s\S]*revokeAdminSessionById\(/);
  assert.match(source, /if \(result\.currentSessionRevoked\)[\s\S]*clearSessionCookies/);
  assert.match(source, /handleLogoutAll[\s\S]*logoutAllAdminSessions\(/);
  assert.match(source, /handleLogoutAll[\s\S]*clearSessionCookies/);
});

test("access JWT rejects a refresh token and malformed session claim", async () => {
  const app = Fastify();
  await app.register(jwt, { secret: signingSecret });

  const refreshToken = createRefreshToken();
  const malformedClaimToken = app.jwt.sign({ sessionId: "not-a-uuid" });

  assert.equal(readVerifiedAccessSessionId(app, refreshToken), null);
  assert.equal(readVerifiedAccessSessionId(app, malformedClaimToken), null);
  await app.close();
});

test("access JWT cannot be used as a refresh token", async () => {
  const app = Fastify();
  await app.register(jwt, { secret: signingSecret });

  const accessToken = app.jwt.sign({ sessionId });

  assert.equal(isRefreshTokenFormatValid(accessToken), false);
  await app.close();
});

test("missing CSRF cookie or header is rejected", () => {
  const csrfToken = createCsrfToken(sessionId, signingSecret);

  assert.throws(
    () => requireMatchingCsrfToken(undefined, csrfToken),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "INVALID_CSRF_TOKEN",
  );
  assert.throws(
    () => requireMatchingCsrfToken(csrfToken, undefined),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "INVALID_CSRF_TOKEN",
  );
});

test("CSRF token signed for another session is rejected", () => {
  const otherSessionId = "22222222-2222-4222-8222-222222222222";
  const csrfToken = createCsrfToken(otherSessionId, signingSecret);

  assert.equal(isCsrfTokenValid(csrfToken, sessionId, signingSecret), false);
});

test("authenticated requests verify JWT before active database session and CSRF", async () => {
  const source = await readAuthPlugin();

  const jwtIndex = source.indexOf("readVerifiedAccessSessionId(app, accessToken)");
  const sessionIndex = source.indexOf("sessionVerifier.verifySession(sessionId)");
  const csrfIndex = source.indexOf("hasValidCsrfToken(request, admin.sessionId");

  assert.ok(jwtIndex >= 0);
  assert.ok(sessionIndex > jwtIndex);
  assert.ok(csrfIndex > sessionIndex);
  assert.match(source, /if \(!admin \|\| !admin\.adminUserId \|\| admin\.sessionId !== sessionId\)/);
});

test("database session verification rejects revoked and expired sessions", async () => {
  const source = await readAuthRepository();

  assert.match(source, /findActiveAdminSessionById[\s\S]*isNull\(adminSessions\.revokedAt\)/);
  assert.match(source, /findActiveAdminSessionById[\s\S]*gt\(adminSessions\.expiresAt, checkedAt\)/);
});

test("database session verification rejects an inactive administrator", async () => {
  const source = await readAuthService();

  assert.match(
    source,
    /readActiveSessionAdmin[\s\S]*!admin\.isActive[\s\S]*return null/,
  );
  assert.match(
    source,
    /verifyAccessSession[\s\S]*readActiveSessionAdmin\(database, session\)/,
  );
});

test("refresh rotation requires the current unrevoked unexpired refresh hash", async () => {
  const source = await readAuthRepository();

  assert.match(source, /rotateAdminSession[\s\S]*eq\(adminSessions\.refreshTokenHash, currentRefreshTokenHash\)/);
  assert.match(source, /rotateAdminSession[\s\S]*isNull\(adminSessions\.revokedAt\)/);
  assert.match(source, /rotateAdminSession[\s\S]*gt\(adminSessions\.expiresAt, usedAt\)/);
});

test("password change revokes all sessions and requires re-login", async () => {
  const serviceSource = await readAuthService();
  const routeSource = await readAuthRoutes();

  assert.match(serviceSource, /changeAdminPassword[\s\S]*revokeAllAdminSessions/);
  assert.match(routeSource, /handleChangePassword[\s\S]*clearSessionCookies\(reply, secureCookies, csrfCookieDomain\)/);
});

test("session cookies keep required security attributes", async () => {
  const source = await readAuthRoutes();

  assert.match(source, /ACCESS_SESSION_COOKIE_NAME[\s\S]*httpOnly:\s*true[\s\S]*sameSite:\s*"lax"[\s\S]*secure:\s*secureCookies/);
  assert.match(source, /REFRESH_SESSION_COOKIE_NAME[\s\S]*httpOnly:\s*true[\s\S]*sameSite:\s*"lax"[\s\S]*secure:\s*secureCookies/);
  assert.match(source, /CSRF_COOKIE_NAME[\s\S]*httpOnly:\s*false[\s\S]*sameSite:\s*"lax"[\s\S]*secure:\s*secureCookies/);
});

test("only the readable CSRF cookie can use the shared frontend domain", async () => {
  const source = await readAuthRoutes();
  const setCookies = source.match(
    /function setSessionCookies[\s\S]*?\n\}/,
  )?.[0] ?? "";

  assert.match(setCookies, /CSRF_COOKIE_NAME[\s\S]*domain: csrfCookieDomain/);
  assert.doesNotMatch(
    setCookies.match(/ACCESS_SESSION_COOKIE_NAME[\s\S]*?\n  \}\);/)?.[0] ?? "",
    /domain:/,
  );
  assert.doesNotMatch(
    setCookies.match(/REFRESH_SESSION_COOKIE_NAME[\s\S]*?\n  \}\);/)?.[0] ?? "",
    /domain:/,
  );
});

test("CSRF cookie cleanup covers both legacy host-only and configured domain cookies", async () => {
  const source = await readAuthRoutes();
  const clearCookies = source.match(
    /function clearSessionCookies[\s\S]*?\n\}/,
  )?.[0] ?? "";

  assert.match(clearCookies, /clearCookie\(CSRF_COOKIE_NAME[\s\S]*if \(csrfCookieDomain\)[\s\S]*domain: csrfCookieDomain/);
});
