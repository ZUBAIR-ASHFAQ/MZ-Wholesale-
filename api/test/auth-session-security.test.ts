import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readProjectFile(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("active session listing returns only unrevoked unexpired sessions for the authenticated admin", async () => {
  const repository = await readProjectFile("../src/modules/auth/auth.repository.ts");
  const service = await readProjectFile("../src/modules/auth/auth.service.ts");

  assert.match(
    repository,
    /listActiveAdminSessions[\s\S]*eq\(adminSessions\.adminUserId, adminUserId\)[\s\S]*isNull\(adminSessions\.revokedAt\)[\s\S]*gt\(adminSessions\.expiresAt, checkedAt\)/,
  );
  assert.match(
    repository,
    /listActiveAdminSessions[\s\S]*\.select\(\{[\s\S]*id: adminSessions\.id[\s\S]*expiresAt: adminSessions\.expiresAt[\s\S]*lastUsedAt: adminSessions\.lastUsedAt[\s\S]*createdAt: adminSessions\.createdAt[\s\S]*\}\)/,
  );
  assert.doesNotMatch(
    repository.match(/export async function listActiveAdminSessions[\s\S]*?\n\}/)?.[0] ?? "",
    /refreshTokenHash/,
  );
  assert.match(service, /listAdminSessions[\s\S]*createAdminSessionView\(session, currentSessionId\)/);
});

test("single-session revoke cannot revoke another administrator session", async () => {
  const repository = await readProjectFile("../src/modules/auth/auth.repository.ts");
  const service = await readProjectFile("../src/modules/auth/auth.service.ts");

  assert.match(
    repository,
    /revokeActiveAdminSessionById[\s\S]*eq\(adminSessions\.id, sessionId\)[\s\S]*eq\(adminSessions\.adminUserId, adminUserId\)[\s\S]*isNull\(adminSessions\.revokedAt\)[\s\S]*gt\(adminSessions\.expiresAt, revokedAt\)/,
  );
  assert.match(
    service,
    /revokeAdminSessionById[\s\S]*revokeActiveAdminSessionById\([\s\S]*adminUserId,[\s\S]*sessionId,[\s\S]*revokedAt/,
  );
  assert.match(service, /if \(!revokedSession\)[\s\S]*"SESSION_NOT_FOUND"/);
});

test("revoking the current session is detected so browser cookies can be cleared", async () => {
  const service = await readProjectFile("../src/modules/auth/auth.service.ts");
  const routes = await readProjectFile("../src/modules/auth/auth.routes.ts");

  assert.match(service, /currentSessionRevoked: revokedSession\.id === currentSessionId/);
  assert.match(
    routes,
    /handleRevokeSession[\s\S]*if \(result\.currentSessionRevoked\)[\s\S]*clearSessionCookies\(reply, secureCookies\)/,
  );
});

test("revoked sessions cannot verify access or rotate a refresh token", async () => {
  const repository = await readProjectFile("../src/modules/auth/auth.repository.ts");
  const service = await readProjectFile("../src/modules/auth/auth.service.ts");

  assert.match(
    repository,
    /findActiveAdminSessionById[\s\S]*isNull\(adminSessions\.revokedAt\)[\s\S]*gt\(adminSessions\.expiresAt, checkedAt\)/,
  );
  assert.match(
    service,
    /verifyAccessSession[\s\S]*findActiveAdminSessionById\([\s\S]*sessionId,[\s\S]*checkedAt/,
  );
  assert.match(
    repository,
    /rotateAdminSession[\s\S]*eq\(adminSessions\.refreshTokenHash, currentRefreshTokenHash\)[\s\S]*isNull\(adminSessions\.revokedAt\)[\s\S]*gt\(adminSessions\.expiresAt, usedAt\)/,
  );
});

test("logout-all revokes every active unexpired session for the authenticated admin", async () => {
  const repository = await readProjectFile("../src/modules/auth/auth.repository.ts");
  const service = await readProjectFile("../src/modules/auth/auth.service.ts");

  assert.match(
    repository,
    /revokeAllActiveAdminSessions[\s\S]*eq\(adminSessions\.adminUserId, adminUserId\)[\s\S]*isNull\(adminSessions\.revokedAt\)[\s\S]*gt\(adminSessions\.expiresAt, revokedAt\)/,
  );
  assert.match(
    service,
    /logoutAllAdminSessions[\s\S]*revokeAllActiveAdminSessions\([\s\S]*adminUserId,[\s\S]*revokedAt/,
  );
  assert.match(service, /revokedSessionCount: revokedSessions\.length/);
});

test("logout-all clears the current browser cookies and remains CSRF-protected", async () => {
  const routes = await readProjectFile("../src/modules/auth/auth.routes.ts");

  assert.match(
    routes,
    /"\/auth\/logout-all"[\s\S]*preHandler: app\.authenticate[\s\S]*security: openApiMutationSecurity/,
  );
  assert.match(routes, /handleLogoutAll[\s\S]*clearSessionCookies\(reply, secureCookies\)/);
});

test("session security actions are audited without exposing refresh-token material", async () => {
  const service = await readProjectFile("../src/modules/auth/auth.service.ts");
  const repository = await readProjectFile("../src/modules/auth/auth.repository.ts");

  assert.match(service, /revokeAdminSessionById[\s\S]*"SESSION_REVOKED"/);
  assert.match(service, /logoutAllAdminSessions[\s\S]*"LOGOUT_ALL"/);
  assert.doesNotMatch(
    repository.match(/export async function listActiveAdminSessions[\s\S]*?\n\}/)?.[0] ?? "",
    /refreshTokenHash/,
  );
});
