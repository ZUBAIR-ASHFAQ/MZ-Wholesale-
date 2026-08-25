import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as runScrypt,
  timingSafeEqual,
} from "node:crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type {
  AdminSessionVerifier,
  AuthenticatedAdmin,
} from "../../plugins/auth.plugin.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  recordAuditLog,
  type AuditRequestContext,
} from "../system/system.service.js";
import {
  createAdminSession,
  createAdminUser,
  findActiveAdminSessionById,
  findAdminByEmail,
  findAdminById,
  findExistingAdmin,
  listActiveAdminSessions,
  lockAdminById,
  lockAdminSessionByRefreshTokenHash,
  revokeAdminSession,
  revokeActiveAdminSessionById,
  revokeAllActiveAdminSessions,
  revokeAllAdminSessions,
  rotateAdminSession,
  updateAdminLastLogin,
  updateAdminPasswordHash,
  type ActiveAdminSessionRecord,
  type AdminSessionRecord,
  type AdminUserRecord,
  type AuthDatabase,
} from "./auth.repository.js";
import {
  bootstrapAdminSchema,
  changePasswordRequestSchema,
  loginRequestSchema,
  type BootstrapAdminInput,
  type ChangePasswordInput,
  type LoginInput,
} from "./auth.schema.js";

/** Access tokens expire quickly and are always checked against a database session. */
export const ACCESS_TOKEN_LIFETIME_MILLISECONDS = 15 * 60 * 1000;

/** Refresh sessions expire after thirty days unless revoked earlier. */
export const REFRESH_SESSION_LIFETIME_MILLISECONDS =
  30 * 24 * 60 * 60 * 1000;

/** Signing secrets must contain at least 32 UTF-8 bytes. */
export const MINIMUM_SIGNING_SECRET_BYTES = 32;

const PASSWORD_HASH_VERSION = "scrypt-v1";
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEY_BYTES = 64;
const PASSWORD_SCRYPT_COST = 16_384;
const PASSWORD_SCRYPT_BLOCK_SIZE = 8;
const PASSWORD_SCRYPT_PARALLELIZATION = 1;
const PASSWORD_SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const RANDOM_TOKEN_BYTES = 32;
const CSRF_TOKEN_VERSION = "csrf-v1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RANDOM_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DUMMY_LOGIN_PASSWORD_HASH =
  "scrypt-v1$16384$8$1$000102030405060708090a0b0c0d0e0f$211b1e9c1738e2017ecd1bc3db9821f0cf09e409e3efae7b9d5242d329eed07c81c0e8e922178268dc9da67ae673c2896f4f7bd5216df1caf4c867867b31d6cf";

/** Contains the parsed pieces of one supported password hash. */
interface PasswordHashParts {
  salt: Buffer;
  derivedKey: Buffer;
}

/** Contains the safe administrator profile returned to the browser. */
export interface AdminProfile {
  id: string;
  name: string;
  email: string;
}

/** Contains database-session and cookie material created after login or refresh. */
export interface LoginSessionResult {
  admin: AdminProfile;
  sessionId: string;
  refreshToken: string;
  csrfToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

/** Contains request metadata used when Auth writes a best-effort audit record. */
export type AuthAuditContext = Omit<AuditRequestContext, "adminUserId">;

/** Checks the password length used for newly created password hashes. */
function validateNewPasswordLength(password: string): void {
  if (password.length < 15 || password.length > 128) {
    throw new Error("Password must contain between 15 and 128 characters.");
  }
}

/** Derives a slow password key using Node's built-in scrypt implementation. */
function derivePasswordKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise(
    /** Starts Node's callback-based scrypt operation for this Promise. */
    function startScrypt(resolve, reject) {
      /** Completes the Promise after Node finishes the scrypt operation. */
      function finishScrypt(error: Error | null, derivedKey: Buffer): void {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      }

      runScrypt(
        password,
        salt,
        PASSWORD_KEY_BYTES,
        {
          cost: PASSWORD_SCRYPT_COST,
          blockSize: PASSWORD_SCRYPT_BLOCK_SIZE,
          parallelization: PASSWORD_SCRYPT_PARALLELIZATION,
          maxmem: PASSWORD_SCRYPT_MAX_MEMORY,
        },
        finishScrypt,
      );
    },
  );
}

/** Converts a supported saved password hash into its salt and derived key. */
function parsePasswordHash(storedHash: string): PasswordHashParts | null {
  const parts = storedHash.split("$");

  if (parts.length !== 6 || parts[0] !== PASSWORD_HASH_VERSION) {
    return null;
  }

  if (
    Number(parts[1]) !== PASSWORD_SCRYPT_COST ||
    Number(parts[2]) !== PASSWORD_SCRYPT_BLOCK_SIZE ||
    Number(parts[3]) !== PASSWORD_SCRYPT_PARALLELIZATION
  ) {
    return null;
  }

  const saltText = parts[4];
  const keyText = parts[5];

  if (!/^[0-9a-f]{32}$/.test(saltText) || !/^[0-9a-f]{128}$/.test(keyText)) {
    return null;
  }

  return {
    salt: Buffer.from(saltText, "hex"),
    derivedKey: Buffer.from(keyText, "hex"),
  };
}

/** Compares equal-length secret values without exiting on the first difference. */
function secureValuesMatch(left: Buffer, right: Buffer): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

/** Creates a slow salted scrypt hash for a new administrator password. */
export async function hashPassword(password: string): Promise<string> {
  validateNewPasswordLength(password);

  const salt = randomBytes(PASSWORD_SALT_BYTES);
  const derivedKey = await derivePasswordKey(password, salt);

  return [
    PASSWORD_HASH_VERSION,
    PASSWORD_SCRYPT_COST,
    PASSWORD_SCRYPT_BLOCK_SIZE,
    PASSWORD_SCRYPT_PARALLELIZATION,
    salt.toString("hex"),
    derivedKey.toString("hex"),
  ].join("$");
}

/** Verifies a password against one supported saved scrypt hash. */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  if (password.length === 0 || password.length > 128) {
    return false;
  }

  const hashParts = parsePasswordHash(storedHash);

  if (!hashParts) {
    return false;
  }

  const candidateKey = await derivePasswordKey(password, hashParts.salt);
  return secureValuesMatch(candidateKey, hashParts.derivedKey);
}

/** Creates a cryptographically random refresh token for an authentication cookie. */
export function createRefreshToken(): string {
  return randomBytes(RANDOM_TOKEN_BYTES).toString("base64url");
}

/** Checks the exact format produced by the refresh-token generator. */
export function isRefreshTokenFormatValid(refreshToken: string): boolean {
  return RANDOM_TOKEN_PATTERN.test(refreshToken);
}

/** Creates the lowercase SHA-256 hash stored instead of a refresh token. */
export function hashRefreshToken(refreshToken: string): string {
  if (!isRefreshTokenFormatValid(refreshToken)) {
    throw new Error("Refresh token format is invalid.");
  }

  return createHash("sha256").update(refreshToken).digest("hex");
}

/** Rejects a signing secret that is too short for HMAC authentication. */
function validateSigningSecret(signingSecret: string): void {
  if (Buffer.byteLength(signingSecret, "utf8") < MINIMUM_SIGNING_SECRET_BYTES) {
    throw new Error("Signing secret must contain at least 32 bytes.");
  }
}

/** Returns an HMAC signature for one CSRF token payload. */
function signTokenPayload(payload: string, signingSecret: string): string {
  return createHmac("sha256", signingSecret)
    .update(payload)
    .digest("base64url");
}

/** Checks one supplied token signature using a timing-safe comparison. */
function tokenSignatureMatches(
  suppliedSignature: string,
  expectedSignature: string,
): boolean {
  if (!SIGNATURE_PATTERN.test(suppliedSignature)) {
    return false;
  }

  return secureValuesMatch(
    Buffer.from(suppliedSignature),
    Buffer.from(expectedSignature),
  );
}

/** Checks that a date contains a usable timestamp. */
function validateDate(value: Date, fieldName: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new Error(`${fieldName} must be a valid date.`);
  }
}

/** Creates a random signed CSRF token bound to one database session UUID. */
export function createCsrfToken(
  sessionId: string,
  signingSecret: string,
): string {
  if (!UUID_PATTERN.test(sessionId)) {
    throw new Error("Session ID must be a UUID.");
  }

  validateSigningSecret(signingSecret);

  const randomValue = randomBytes(RANDOM_TOKEN_BYTES).toString("base64url");
  const payload = `${CSRF_TOKEN_VERSION}.${sessionId}.${randomValue}`;
  const signature = signTokenPayload(payload, signingSecret);

  return `${CSRF_TOKEN_VERSION}.${randomValue}.${signature}`;
}

/** Checks a signed CSRF token against the current database session UUID. */
export function isCsrfTokenValid(
  csrfToken: string,
  sessionId: string,
  signingSecret: string,
): boolean {
  validateSigningSecret(signingSecret);

  if (!UUID_PATTERN.test(sessionId)) {
    return false;
  }

  const parts = csrfToken.split(".");

  if (
    parts.length !== 3 ||
    parts[0] !== CSRF_TOKEN_VERSION ||
    !RANDOM_TOKEN_PATTERN.test(parts[1])
  ) {
    return false;
  }

  const payload = `${CSRF_TOKEN_VERSION}.${sessionId}.${parts[1]}`;
  const expectedSignature = signTokenPayload(payload, signingSecret);

  return tokenSignatureMatches(parts[2], expectedSignature);
}

/** Creates one typed Auth failure for the shared Fastify error handler. */
function createAuthServiceError(
  code: string,
  message: string,
  statusCode: number,
): AppError {
  return new AppError(code, message, statusCode);
}

/** Requires the CSRF cookie and header to contain the same safe token. */
export function requireMatchingCsrfToken(
  cookieToken: string | undefined,
  headerToken: unknown,
): string {
  if (!cookieToken || typeof headerToken !== "string") {
    throw createAuthServiceError(
      "INVALID_CSRF_TOKEN",
      "A valid CSRF token is required.",
      403,
    );
  }

  const cookieBuffer = Buffer.from(cookieToken);
  const headerBuffer = Buffer.from(headerToken);

  if (!secureValuesMatch(cookieBuffer, headerBuffer)) {
    throw createAuthServiceError(
      "INVALID_CSRF_TOKEN",
      "A valid CSRF token is required.",
      403,
    );
  }

  return cookieToken;
}

/** Requires a valid signed CSRF token bound to one database session. */
function requireValidSessionCsrf(
  csrfToken: string,
  sessionId: string,
  signingSecret: string,
): void {
  if (!isCsrfTokenValid(csrfToken, sessionId, signingSecret)) {
    throw createAuthServiceError(
      "INVALID_CSRF_TOKEN",
      "A valid CSRF token is required.",
      403,
    );
  }
}

/** Verifies login credentials without revealing whether an email exists. */
async function readLoginAdmin(
  database: AuthDatabase,
  input: LoginInput,
): Promise<AdminUserRecord> {
  const admin = await findAdminByEmail(database, input.email);
  const savedHash = admin?.passwordHash ?? DUMMY_LOGIN_PASSWORD_HASH;
  const passwordIsCorrect = await verifyPassword(input.password, savedHash);

  if (!admin || !passwordIsCorrect) {
    throw createAuthServiceError(
      "INVALID_CREDENTIALS",
      "Email or password is incorrect.",
      401,
    );
  }

  if (!admin.isActive) {
    throw createAuthServiceError(
      "ACCOUNT_INACTIVE",
      "The administrator account is inactive.",
      403,
    );
  }

  return admin;
}

/** Creates the safe administrator profile used by Auth responses. */
function createAdminProfile(admin: AdminUserRecord): AdminProfile {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
  };
}

/** Creates the singleton administrator inside the bootstrap transaction. */
async function createInitialAdmin(
  database: AuthDatabase,
  input: BootstrapAdminInput,
  passwordHash: string,
): Promise<AdminProfile> {
  const existingAdmin = await findExistingAdmin(database);

  if (existingAdmin) {
    throw createAuthServiceError(
      "ADMIN_ALREADY_EXISTS",
      "The initial administrator already exists.",
      409,
    );
  }

  const createdAdmin = await createAdminUser(database, {
    name: input.name,
    email: input.email,
    passwordHash,
  });

  if (!createdAdmin) {
    throw createAuthServiceError(
      "ADMIN_BOOTSTRAP_FAILED",
      "The initial administrator was not created.",
      500,
    );
  }

  return createAdminProfile(createdAdmin);
}

/** Creates the first administrator through a deployment-only transaction. */
export async function bootstrapInitialAdmin(
  database: NodePgDatabase,
  values: unknown,
): Promise<AdminProfile> {
  const input = bootstrapAdminSchema.parse(values);
  const passwordHash = await hashPassword(input.password);

  return database.transaction((transaction) =>
    createInitialAdmin(transaction, input, passwordHash),
  );
}

/** Builds database-session and cookie material after the session is saved. */
function createLoginSessionResult(
  admin: AdminUserRecord,
  session: AdminSessionRecord,
  refreshToken: string,
  loggedInAt: Date,
  signingSecret: string,
): LoginSessionResult {
  return {
    admin: createAdminProfile(admin),
    sessionId: session.id,
    refreshToken,
    csrfToken: createCsrfToken(session.id, signingSecret),
    accessTokenExpiresAt: new Date(
      loggedInAt.getTime() + ACCESS_TOKEN_LIFETIME_MILLISECONDS,
    ),
    refreshTokenExpiresAt: session.expiresAt,
  };
}

/** Records one successful administrator login or stops the transaction. */
async function recordSuccessfulLogin(
  database: AuthDatabase,
  adminUserId: string,
  loggedInAt: Date,
): Promise<void> {
  const updatedAdmin = await updateAdminLastLogin(
    database,
    adminUserId,
    loggedInAt,
  );

  if (!updatedAdmin) {
    throw createAuthServiceError(
      "ADMIN_LOGIN_UPDATE_FAILED",
      "The administrator login time was not updated.",
      500,
    );
  }
}

/** Creates one database session and records the successful login atomically. */
async function saveLoginSession(
  database: AuthDatabase,
  admin: AdminUserRecord,
  refreshToken: string,
  loggedInAt: Date,
): Promise<AdminSessionRecord> {
  const refreshTokenExpiresAt = new Date(
    loggedInAt.getTime() + REFRESH_SESSION_LIFETIME_MILLISECONDS,
  );
  const session = await createAdminSession(database, {
    adminUserId: admin.id,
    refreshTokenHash: hashRefreshToken(refreshToken),
    expiresAt: refreshTokenExpiresAt,
  });

  if (!session) {
    throw createAuthServiceError(
      "LOGIN_SESSION_CREATE_FAILED",
      "The login session was not created.",
      500,
    );
  }

  await recordSuccessfulLogin(database, admin.id, loggedInAt);

  return session;
}

/** Validates credentials and creates a complete login session transactionally. */
export async function loginAdmin(
  database: NodePgDatabase,
  requestBody: unknown,
  signingSecret: string,
  loggedInAt = new Date(),
  auditContext?: AuthAuditContext,
): Promise<LoginSessionResult> {
  const attemptedEmail =
    requestBody &&
    typeof requestBody === "object" &&
    "email" in requestBody &&
    typeof requestBody.email === "string"
      ? requestBody.email
      : null;

  try {
    const input = loginRequestSchema.parse(requestBody);
    validateDate(loggedInAt, "Login time");
    validateSigningSecret(signingSecret);

    const admin = await readLoginAdmin(database, input);
    const refreshToken = createRefreshToken();
    const result = await database.transaction(async (transaction) => {
      const session = await saveLoginSession(
        transaction,
        admin,
        refreshToken,
        loggedInAt,
      );

      return createLoginSessionResult(
        admin,
        session,
        refreshToken,
        loggedInAt,
        signingSecret,
      );
    });

    if (auditContext) {
      await recordAuditLog(
        database,
        { ...auditContext, adminUserId: result.admin.id },
        "LOGIN_SUCCEEDED",
        "ADMIN_AUTH",
        null,
        { adminId: result.admin.id },
      );
    }

    return result;
  } catch (error) {
    if (auditContext) {
      await recordAuditLog(
        database,
        { ...auditContext, adminUserId: null },
        "LOGIN_FAILED",
        "ADMIN_AUTH",
        null,
        { email: attemptedEmail },
      );
    }

    throw error;
  }
}

/** Reads the active administrator that owns one database session. */
async function readActiveSessionAdmin(
  database: AuthDatabase,
  session: AdminSessionRecord,
): Promise<AdminUserRecord | null> {
  const admin = await findAdminById(database, session.adminUserId);

  if (!admin || !admin.isActive || admin.id !== session.adminUserId) {
    return null;
  }

  return admin;
}

/** Verifies one JWT session UUID against its active session and administrator rows. */
export async function verifyAccessSession(
  database: AuthDatabase,
  sessionId: string,
  checkedAt = new Date(),
): Promise<AuthenticatedAdmin | null> {
  validateDate(checkedAt, "Access-session check time");

  if (!UUID_PATTERN.test(sessionId)) {
    return null;
  }

  const session = await findActiveAdminSessionById(
    database,
    sessionId,
    checkedAt,
  );

  if (!session) {
    return null;
  }

  const admin = await readActiveSessionAdmin(database, session);

  if (!admin) {
    return null;
  }

  return {
    adminUserId: admin.id,
    sessionId: session.id,
  };
}

/** Builds the database-session verifier used after Fastify verifies the JWT. */
export function createAdminSessionVerifier(
  database: AuthDatabase,
): AdminSessionVerifier {
  return {
    verifySession: (sessionId) => verifyAccessSession(database, sessionId),
  };
}

/** Checks that a refresh session is unrevoked and unexpired. */
function isRefreshSessionUsable(
  session: AdminSessionRecord,
  checkedAt: Date,
): boolean {
  return (
    session.revokedAt === null &&
    session.expiresAt.getTime() > checkedAt.getTime()
  );
}

/** Reads the active administrator that owns a refresh session. */
async function readRefreshSessionAdmin(
  database: AuthDatabase,
  session: AdminSessionRecord,
): Promise<AdminUserRecord> {
  const admin = await findAdminById(database, session.adminUserId);

  if (!admin) {
    throw createAuthServiceError(
      "UNAUTHENTICATED",
      "A valid refresh session is required.",
      401,
    );
  }

  if (!admin.isActive) {
    throw createAuthServiceError(
      "ACCOUNT_INACTIVE",
      "The administrator account is inactive.",
      403,
    );
  }

  return admin;
}

/** Replaces one refresh hash and builds newly signed cookie material. */
async function rotateRefreshSession(
  database: AuthDatabase,
  admin: AdminUserRecord,
  session: AdminSessionRecord,
  currentRefreshTokenHash: string,
  refreshedAt: Date,
  signingSecret: string,
): Promise<LoginSessionResult> {
  const newRefreshToken = createRefreshToken();
  const rotatedSession = await rotateAdminSession(
    database,
    session.id,
    currentRefreshTokenHash,
    hashRefreshToken(newRefreshToken),
    refreshedAt,
  );

  if (!rotatedSession) {
    throw createAuthServiceError(
      "UNAUTHENTICATED",
      "A valid refresh session is required.",
      401,
    );
  }

  return createLoginSessionResult(
    admin,
    rotatedSession,
    newRefreshToken,
    refreshedAt,
    signingSecret,
  );
}

/** Locks, validates and rotates one refresh session inside a transaction. */
async function refreshSessionInTransaction(
  database: AuthDatabase,
  currentRefreshTokenHash: string,
  csrfToken: string,
  refreshedAt: Date,
  signingSecret: string,
): Promise<LoginSessionResult> {
  const session = await lockAdminSessionByRefreshTokenHash(
    database,
    currentRefreshTokenHash,
  );

  if (!session || !isRefreshSessionUsable(session, refreshedAt)) {
    throw createAuthServiceError(
      "UNAUTHENTICATED",
      "A valid refresh session is required.",
      401,
    );
  }

  requireValidSessionCsrf(csrfToken, session.id, signingSecret);
  const admin = await readRefreshSessionAdmin(database, session);

  return rotateRefreshSession(
    database,
    admin,
    session,
    currentRefreshTokenHash,
    refreshedAt,
    signingSecret,
  );
}

/** Rotates a valid refresh token and renews access and CSRF tokens atomically. */
export async function refreshAdminSession(
  database: NodePgDatabase,
  refreshToken: string,
  csrfToken: string,
  signingSecret: string,
  refreshedAt = new Date(),
): Promise<LoginSessionResult> {
  validateDate(refreshedAt, "Refresh time");
  validateSigningSecret(signingSecret);

  if (!isRefreshTokenFormatValid(refreshToken)) {
    throw createAuthServiceError(
      "UNAUTHENTICATED",
      "A valid refresh session is required.",
      401,
    );
  }

  const currentRefreshTokenHash = hashRefreshToken(refreshToken);

  return database.transaction((transaction) =>
    refreshSessionInTransaction(
      transaction,
      currentRefreshTokenHash,
      csrfToken,
      refreshedAt,
      signingSecret,
    ),
  );
}

/** Locks and reads the valid refresh session that may identify a logout. */
async function readLogoutRefreshSession(
  database: AuthDatabase,
  refreshTokenHash: string | null,
  loggedOutAt: Date,
): Promise<AdminSessionRecord | null> {
  if (!refreshTokenHash) {
    return null;
  }

  const session = await lockAdminSessionByRefreshTokenHash(
    database,
    refreshTokenHash,
  );

  if (!session || !isRefreshSessionUsable(session, loggedOutAt)) {
    return null;
  }

  return session;
}

/** Resolves the session UUID identified by logout authentication material. */
async function readLogoutSessionId(
  database: AuthDatabase,
  accessSessionId: string | null,
  refreshTokenHash: string | null,
  loggedOutAt: Date,
): Promise<string | null> {
  if (accessSessionId) {
    return accessSessionId;
  }

  const refreshSession = await readLogoutRefreshSession(
    database,
    refreshTokenHash,
    loggedOutAt,
  );

  return refreshSession?.id ?? null;
}

/** Contains the authenticated identity returned after logout revokes one session. */
export type LogoutSessionResult = {
  adminUserId: string;
  sessionId: string;
};

/** Revokes one resolved logout session and returns its authenticated identity. */
async function revokeResolvedSession(
  database: AuthDatabase,
  sessionId: string,
  loggedOutAt: Date,
): Promise<LogoutSessionResult> {
  const revokedSession = await revokeAdminSession(
    database,
    sessionId,
    loggedOutAt,
  );

  if (!revokedSession) {
    throw createAuthServiceError(
      "UNAUTHENTICATED",
      "A valid admin session is required for logout.",
      401,
    );
  }

  return {
    adminUserId: revokedSession.adminUserId,
    sessionId: revokedSession.id,
  };
}

/** Resolves and revokes the current session inside a logout transaction. */
async function revokeLogoutSession(
  database: AuthDatabase,
  accessSessionId: string | null,
  refreshTokenHash: string | null,
  csrfToken: string,
  signingSecret: string,
  loggedOutAt: Date,
): Promise<LogoutSessionResult> {
  const sessionId = await readLogoutSessionId(
    database,
    accessSessionId,
    refreshTokenHash,
    loggedOutAt,
  );

  if (!sessionId) {
    throw createAuthServiceError(
      "UNAUTHENTICATED",
      "A valid admin session is required for logout.",
      401,
    );
  }

  requireValidSessionCsrf(csrfToken, sessionId, signingSecret);
  return revokeResolvedSession(database, sessionId, loggedOutAt);
}

/** Revokes the session identified by a valid access or refresh token. */
export async function logoutAdmin(
  database: NodePgDatabase,
  accessSessionId: string | null,
  refreshToken: string | null | undefined,
  csrfToken: string,
  signingSecret: string,
  loggedOutAt = new Date(),
  auditContext?: AuthAuditContext,
): Promise<LogoutSessionResult> {
  validateDate(loggedOutAt, "Logout time");
  validateSigningSecret(signingSecret);

  const safeAccessSessionId =
    accessSessionId && UUID_PATTERN.test(accessSessionId)
      ? accessSessionId
      : null;
  const refreshTokenHash =
    refreshToken && isRefreshTokenFormatValid(refreshToken)
      ? hashRefreshToken(refreshToken)
      : null;

  if (!safeAccessSessionId && !refreshTokenHash) {
    throw createAuthServiceError(
      "UNAUTHENTICATED",
      "A valid admin session is required for logout.",
      401,
    );
  }

  const result = await database.transaction((transaction) =>
    revokeLogoutSession(
      transaction,
      safeAccessSessionId,
      refreshTokenHash,
      csrfToken,
      signingSecret,
      loggedOutAt,
    ),
  );

  if (auditContext) {
    await recordAuditLog(
      database,
      { ...auditContext, adminUserId: result.adminUserId },
      "LOGOUT",
      "ADMIN_AUTH",
      null,
      { loggedOut: true, sessionId: result.sessionId },
    );
  }

  return result;
}

/** Requires the administrator account used for password change to be active. */
function requireActivePasswordAdmin(
  admin: AdminUserRecord | null,
): AdminUserRecord {
  if (!admin) {
    throw createAuthServiceError(
      "UNAUTHENTICATED",
      "An active admin session is required.",
      401,
    );
  }

  if (!admin.isActive) {
    throw createAuthServiceError(
      "ACCOUNT_INACTIVE",
      "The administrator account is inactive.",
      403,
    );
  }

  return admin;
}

/** Verifies the current password before its saved hash may be replaced. */
async function requireCorrectCurrentPassword(
  admin: AdminUserRecord,
  currentPassword: string,
): Promise<void> {
  const passwordIsCorrect = await verifyPassword(
    currentPassword,
    admin.passwordHash,
  );

  if (!passwordIsCorrect) {
    throw createAuthServiceError(
      "CURRENT_PASSWORD_INCORRECT",
      "Current password is incorrect.",
      400,
    );
  }
}

/** Locks and verifies the administrator requesting a password change. */
async function readPasswordChangeAdmin(
  database: AuthDatabase,
  adminUserId: string,
  input: ChangePasswordInput,
): Promise<AdminUserRecord> {
  const savedAdmin = await lockAdminById(database, adminUserId);
  const admin = requireActivePasswordAdmin(savedAdmin);
  await requireCorrectCurrentPassword(admin, input.currentPassword);

  return admin;
}

/** Saves the replacement password hash and revokes every active session. */
async function saveChangedPassword(
  database: AuthDatabase,
  admin: AdminUserRecord,
  newPassword: string,
  changedAt: Date,
): Promise<AdminProfile> {
  const newPasswordHash = await hashPassword(newPassword);
  const updatedAdmin = await updateAdminPasswordHash(
    database,
    admin.id,
    newPasswordHash,
    changedAt,
  );

  if (!updatedAdmin) {
    throw createAuthServiceError(
      "PASSWORD_CHANGE_FAILED",
      "The administrator password was not changed.",
      500,
    );
  }

  await revokeAllAdminSessions(database, admin.id, changedAt);
  return createAdminProfile(updatedAdmin);
}

/** Verifies and saves one password change inside the active transaction. */
async function changePasswordInTransaction(
  database: AuthDatabase,
  adminUserId: string,
  input: ChangePasswordInput,
  changedAt: Date,
): Promise<AdminProfile> {
  const admin = await readPasswordChangeAdmin(
    database,
    adminUserId,
    input,
  );

  return saveChangedPassword(
    database,
    admin,
    input.newPassword,
    changedAt,
  );
}

/** Changes the administrator password and revokes all sessions atomically. */
export async function changeAdminPassword(
  database: NodePgDatabase,
  adminUserId: string,
  requestBody: unknown,
  changedAt = new Date(),
  auditContext?: AuthAuditContext,
): Promise<AdminProfile> {
  const input = changePasswordRequestSchema.parse(requestBody);
  validateDate(changedAt, "Password change time");

  const admin = await database.transaction((transaction) =>
    changePasswordInTransaction(
      transaction,
      adminUserId,
      input,
      changedAt,
    ),
  );

  if (auditContext) {
    await recordAuditLog(
      database,
      { ...auditContext, adminUserId },
      "PASSWORD_CHANGED",
      "ADMIN_AUTH",
      null,
      { adminId: admin.id },
    );
  }

  return admin;
}

/** Reads the safe profile for the currently authenticated administrator. */
export async function getCurrentAdminProfile(
  database: AuthDatabase,
  adminUserId: string,
): Promise<AdminProfile> {
  const admin = await findAdminById(database, adminUserId);

  if (!admin || !admin.isActive) {
    throw createAuthServiceError(
      "UNAUTHENTICATED",
      "An active admin session is required.",
      401,
    );
  }

  return createAdminProfile(admin);
}


/** Contains one safe active-session row returned to the administrator. */
export interface AdminSessionView {
  id: string;
  expiresAt: Date;
  lastUsedAt: Date;
  createdAt: Date;
  currentSession: boolean;
}

/** Converts one safe repository session row into the browser response shape. */
function createAdminSessionView(
  session: ActiveAdminSessionRecord,
  currentSessionId: string,
): AdminSessionView {
  return {
    id: session.id,
    expiresAt: session.expiresAt,
    lastUsedAt: session.lastUsedAt,
    createdAt: session.createdAt,
    currentSession: session.id === currentSessionId,
  };
}

/** Lists the administrator's current active sessions without exposing token hashes. */
export async function listAdminSessions(
  database: AuthDatabase,
  adminUserId: string,
  currentSessionId: string,
  checkedAt = new Date(),
): Promise<AdminSessionView[]> {
  validateDate(checkedAt, "Session list time");

  if (!UUID_PATTERN.test(adminUserId) || !UUID_PATTERN.test(currentSessionId)) {
    throw createAuthServiceError(
      "UNAUTHENTICATED",
      "An active admin session is required.",
      401,
    );
  }

  const admin = await findAdminById(database, adminUserId);
  if (!admin || !admin.isActive) {
    throw createAuthServiceError(
      "UNAUTHENTICATED",
      "An active admin session is required.",
      401,
    );
  }

  const sessions = await listActiveAdminSessions(
    database,
    adminUserId,
    checkedAt,
  );

  return sessions.map((session) =>
    createAdminSessionView(session, currentSessionId),
  );
}

/** Revokes one active session owned by the authenticated administrator. */
export async function revokeAdminSessionById(
  database: AuthDatabase,
  adminUserId: string,
  currentSessionId: string,
  sessionId: string,
  revokedAt = new Date(),
  auditContext?: AuthAuditContext,
): Promise<{ sessionId: string; currentSessionRevoked: boolean }> {
  validateDate(revokedAt, "Session revoke time");

  if (
    !UUID_PATTERN.test(adminUserId) ||
    !UUID_PATTERN.test(currentSessionId)
  ) {
    throw createAuthServiceError(
      "UNAUTHENTICATED",
      "An active admin session is required.",
      401,
    );
  }

  if (!UUID_PATTERN.test(sessionId)) {
    throw createAuthServiceError(
      "SESSION_NOT_FOUND",
      "The active session was not found.",
      404,
    );
  }

  const revokedSession = await revokeActiveAdminSessionById(
    database,
    adminUserId,
    sessionId,
    revokedAt,
  );

  if (!revokedSession) {
    throw createAuthServiceError(
      "SESSION_NOT_FOUND",
      "The active session was not found.",
      404,
    );
  }

  if (auditContext) {
    await recordAuditLog(
      database,
      { ...auditContext, adminUserId },
      "SESSION_REVOKED",
      "ADMIN_AUTH",
      null,
      { sessionId: revokedSession.id },
    );
  }

  return {
    sessionId: revokedSession.id,
    currentSessionRevoked: revokedSession.id === currentSessionId,
  };
}

/** Revokes every active session owned by the authenticated administrator. */
export async function logoutAllAdminSessions(
  database: AuthDatabase,
  adminUserId: string,
  revokedAt = new Date(),
  auditContext?: AuthAuditContext,
): Promise<{ revokedSessionCount: number }> {
  validateDate(revokedAt, "Logout-all time");

  if (!UUID_PATTERN.test(adminUserId)) {
    throw createAuthServiceError(
      "UNAUTHENTICATED",
      "An active admin session is required.",
      401,
    );
  }

  const revokedSessions = await revokeAllActiveAdminSessions(
    database,
    adminUserId,
    revokedAt,
  );

  if (auditContext) {
    await recordAuditLog(
      database,
      { ...auditContext, adminUserId },
      "LOGOUT_ALL",
      "ADMIN_AUTH",
      null,
      { revokedSessionCount: revokedSessions.length },
    );
  }

  return { revokedSessionCount: revokedSessions.length };
}
