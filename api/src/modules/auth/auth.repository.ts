import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  adminSessions,
  adminUsers,
} from "../../database/schema/index.js";

/** Contains the database methods used by the Auth repository. */
export type AuthDatabase = Pick<
  NodePgDatabase,
  "select" | "insert" | "update"
>;

/** Represents the one saved administrator account. */
export type AdminUserRecord = typeof adminUsers.$inferSelect;

/** Contains fields accepted when the deployment bootstrap creates the administrator. */
export type NewAdminUser = typeof adminUsers.$inferInsert;

/** Represents one saved administrator refresh session. */
export type AdminSessionRecord = typeof adminSessions.$inferSelect;

/** Contains values accepted when login creates a refresh session. */
export type NewAdminSession = typeof adminSessions.$inferInsert;

/** Contains only the safe session fields that may later be shown to the admin. */
export interface ActiveAdminSessionRecord {
  id: string;
  expiresAt: Date;
  lastUsedAt: Date;
  createdAt: Date;
}

/** Reads the administrator by normalized email for login. */
export async function findAdminByEmail(
  database: AuthDatabase,
  email: string,
): Promise<AdminUserRecord | null> {
  const rows = await database
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1);

  return rows[0] ?? null;
}

/** Reads the administrator by UUID for authenticated requests. */
export async function findAdminById(
  database: AuthDatabase,
  adminUserId: string,
): Promise<AdminUserRecord | null> {
  const rows = await database
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.id, adminUserId))
    .limit(1);

  return rows[0] ?? null;
}

/** Reads the singleton administrator before a bootstrap attempt. */
export async function findExistingAdmin(
  database: AuthDatabase,
): Promise<AdminUserRecord | null> {
  const rows = await database
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.singletonKey, 1))
    .limit(1);

  return rows[0] ?? null;
}

/** Locks the administrator before a transaction changes its password. */
export async function lockAdminById(
  database: AuthDatabase,
  adminUserId: string,
): Promise<AdminUserRecord | null> {
  const rows = await database
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.id, adminUserId))
    .for("update")
    .limit(1);

  return rows[0] ?? null;
}

/** Creates the singleton administrator for the later bootstrap command. */
export async function createAdminUser(
  database: AuthDatabase,
  input: NewAdminUser,
): Promise<AdminUserRecord | null> {
  const rows = await database.insert(adminUsers).values(input).returning();
  return rows[0] ?? null;
}

/** Saves the latest successful login time for the administrator. */
export async function updateAdminLastLogin(
  database: AuthDatabase,
  adminUserId: string,
  loggedInAt: Date,
): Promise<AdminUserRecord | null> {
  const rows = await database
    .update(adminUsers)
    .set({ lastLoginAt: loggedInAt, updatedAt: loggedInAt })
    .where(eq(adminUsers.id, adminUserId))
    .returning();

  return rows[0] ?? null;
}

/** Replaces the administrator password hash after password verification. */
export async function updateAdminPasswordHash(
  database: AuthDatabase,
  adminUserId: string,
  passwordHash: string,
  changedAt: Date,
): Promise<AdminUserRecord | null> {
  const rows = await database
    .update(adminUsers)
    .set({ passwordHash, updatedAt: changedAt })
    .where(eq(adminUsers.id, adminUserId))
    .returning();

  return rows[0] ?? null;
}

/** Reads an unrevoked, unexpired session used by an access token. */
export async function findActiveAdminSessionById(
  database: AuthDatabase,
  sessionId: string,
  checkedAt: Date,
): Promise<AdminSessionRecord | null> {
  const rows = await database
    .select()
    .from(adminSessions)
    .where(
      and(
        eq(adminSessions.id, sessionId),
        isNull(adminSessions.revokedAt),
        gt(adminSessions.expiresAt, checkedAt),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/** Lists the administrator's active sessions without reading refresh-token hashes. */
export async function listActiveAdminSessions(
  database: AuthDatabase,
  adminUserId: string,
  checkedAt: Date,
): Promise<ActiveAdminSessionRecord[]> {
  return database
    .select({
      id: adminSessions.id,
      expiresAt: adminSessions.expiresAt,
      lastUsedAt: adminSessions.lastUsedAt,
      createdAt: adminSessions.createdAt,
    })
    .from(adminSessions)
    .where(
      and(
        eq(adminSessions.adminUserId, adminUserId),
        isNull(adminSessions.revokedAt),
        gt(adminSessions.expiresAt, checkedAt),
      ),
    )
    .orderBy(desc(adminSessions.lastUsedAt), desc(adminSessions.createdAt));
}

/** Revokes one active session only when it belongs to the requested administrator. */
export async function revokeActiveAdminSessionById(
  database: AuthDatabase,
  adminUserId: string,
  sessionId: string,
  revokedAt: Date,
): Promise<AdminSessionRecord | null> {
  const rows = await database
    .update(adminSessions)
    .set({ revokedAt, updatedAt: revokedAt })
    .where(
      and(
        eq(adminSessions.id, sessionId),
        eq(adminSessions.adminUserId, adminUserId),
        isNull(adminSessions.revokedAt),
        gt(adminSessions.expiresAt, revokedAt),
      ),
    )
    .returning();

  return rows[0] ?? null;
}

/** Revokes every unexpired active session for the requested administrator. */
export async function revokeAllActiveAdminSessions(
  database: AuthDatabase,
  adminUserId: string,
  revokedAt: Date,
): Promise<AdminSessionRecord[]> {
  return database
    .update(adminSessions)
    .set({ revokedAt, updatedAt: revokedAt })
    .where(
      and(
        eq(adminSessions.adminUserId, adminUserId),
        isNull(adminSessions.revokedAt),
        gt(adminSessions.expiresAt, revokedAt),
      ),
    )
    .returning();
}

/** Locks a refresh session so the same token cannot rotate concurrently. */
export async function lockAdminSessionByRefreshTokenHash(
  database: AuthDatabase,
  refreshTokenHash: string,
): Promise<AdminSessionRecord | null> {
  const rows = await database
    .select()
    .from(adminSessions)
    .where(eq(adminSessions.refreshTokenHash, refreshTokenHash))
    .for("update")
    .limit(1);

  return rows[0] ?? null;
}

/** Creates one refresh session after a successful login. */
export async function createAdminSession(
  database: AuthDatabase,
  input: NewAdminSession,
): Promise<AdminSessionRecord | null> {
  const rows = await database.insert(adminSessions).values(input).returning();
  return rows[0] ?? null;
}

/** Atomically replaces a valid refresh hash and records its use time. */
export async function rotateAdminSession(
  database: AuthDatabase,
  sessionId: string,
  currentRefreshTokenHash: string,
  newRefreshTokenHash: string,
  usedAt: Date,
): Promise<AdminSessionRecord | null> {
  const rows = await database
    .update(adminSessions)
    .set({
      refreshTokenHash: newRefreshTokenHash,
      lastUsedAt: usedAt,
      updatedAt: usedAt,
    })
    .where(
      and(
        eq(adminSessions.id, sessionId),
        eq(adminSessions.refreshTokenHash, currentRefreshTokenHash),
        isNull(adminSessions.revokedAt),
        gt(adminSessions.expiresAt, usedAt),
      ),
    )
    .returning();

  return rows[0] ?? null;
}

/** Revokes one current session without deleting its security history. */
export async function revokeAdminSession(
  database: AuthDatabase,
  sessionId: string,
  revokedAt: Date,
): Promise<AdminSessionRecord | null> {
  const rows = await database
    .update(adminSessions)
    .set({ revokedAt, updatedAt: revokedAt })
    .where(
      and(
        eq(adminSessions.id, sessionId),
        isNull(adminSessions.revokedAt),
      ),
    )
    .returning();

  return rows[0] ?? null;
}

/** Revokes every active session after an administrator password change. */
export async function revokeAllAdminSessions(
  database: AuthDatabase,
  adminUserId: string,
  revokedAt: Date,
): Promise<AdminSessionRecord[]> {
  return database
    .update(adminSessions)
    .set({ revokedAt, updatedAt: revokedAt })
    .where(
      and(
        eq(adminSessions.adminUserId, adminUserId),
        isNull(adminSessions.revokedAt),
      ),
    )
    .returning();
}
