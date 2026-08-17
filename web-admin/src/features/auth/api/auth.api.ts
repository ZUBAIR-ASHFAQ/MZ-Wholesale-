import { requestApi } from "../../../lib/api-client.ts";
import type { ApiSuccess } from "../../../lib/api-types.ts";

/** Contains credentials accepted by the public login endpoint. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Contains password fields accepted by the password-change endpoint. */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/** Contains the safe administrator fields returned by authentication routes. */
export interface AdminProfile {
  id: string;
  name: string;
  email: string;
}

/** Contains the successful login, refresh and current-admin response data. */
export interface AdminSessionData {
  admin: AdminProfile;
}

/** Contains the successful logout response data. */
export interface LogoutData {
  loggedOut: true;
}

/** Contains the successful password-change response data. */
export interface ChangePasswordData {
  admin: AdminProfile;
  sessionsRevoked: true;
}

/** Sends administrator credentials to the Fastify login route. */
export async function loginAdmin(
  input: LoginRequest,
): Promise<ApiSuccess<AdminSessionData>> {
  return requestApi<ApiSuccess<AdminSessionData>>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Loads the safe profile for the current access session. */
export async function loadCurrentAdmin(): Promise<
  ApiSuccess<AdminSessionData>
> {
  return requestApi<ApiSuccess<AdminSessionData>>("/auth/me");
}

/** Revokes the current session and lets the API clear its cookies. */
export async function logoutAdmin(): Promise<ApiSuccess<LogoutData>> {
  return requestApi<ApiSuccess<LogoutData>>("/auth/logout", {
    method: "POST",
  });
}

/** Changes the administrator password and revokes every active session. */
export async function changeAdminPassword(
  input: ChangePasswordRequest,
): Promise<ApiSuccess<ChangePasswordData>> {
  return requestApi<ApiSuccess<ChangePasswordData>>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Contains one safe active administrator session returned by the API. */
export interface AdminSessionView {
  id: string;
  expiresAt: string;
  lastUsedAt: string;
  createdAt: string;
  currentSession: boolean;
}

/** Contains the active-session list returned by the API. */
export interface AdminSessionsData {
  sessions: AdminSessionView[];
}

/** Contains the successful single-session revoke response. */
export interface RevokeSessionData {
  revoked: true;
  sessionId: string;
  currentSessionRevoked: boolean;
}

/** Contains the successful logout-all response. */
export interface LogoutAllData {
  loggedOut: true;
  revokedSessionCount: number;
}

/** Loads active sessions for the authenticated administrator. */
export async function loadAdminSessions(): Promise<ApiSuccess<AdminSessionsData>> {
  return requestApi<ApiSuccess<AdminSessionsData>>("/auth/sessions");
}

/** Revokes one active administrator session by ID. */
export async function revokeAdminSession(
  sessionId: string,
): Promise<ApiSuccess<RevokeSessionData>> {
  return requestApi<ApiSuccess<RevokeSessionData>>(
    `/auth/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" },
  );
}

/** Revokes every active administrator session. */
export async function logoutAllAdminSessions(): Promise<ApiSuccess<LogoutAllData>> {
  return requestApi<ApiSuccess<LogoutAllData>>("/auth/logout-all", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

