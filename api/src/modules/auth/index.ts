export { registerAuthRoutes } from "./auth.routes.js";

export {
  adminSessionIdParamsSchema,
  adminSessionsQuerySchema,
  bootstrapAdminSchema,
  changePasswordRequestSchema,
  currentAdminQuerySchema,
  loginRequestSchema,
  logoutAllRequestBodySchema,
  logoutRequestBodySchema,
  refreshRequestBodySchema,
} from "./auth.schema.js";

export type {
  BootstrapAdminInput,
  ChangePasswordInput,
  LoginInput,
} from "./auth.schema.js";

export {
  ACCESS_TOKEN_LIFETIME_MILLISECONDS,
  bootstrapInitialAdmin,
  changeAdminPassword,
  createAdminSessionVerifier,
  createCsrfToken,
  createRefreshToken,
  getCurrentAdminProfile,
  hashPassword,
  hashRefreshToken,
  isCsrfTokenValid,
  isRefreshTokenFormatValid,
  loginAdmin,
  listAdminSessions,
  logoutAdmin,
  logoutAllAdminSessions,
  MINIMUM_SIGNING_SECRET_BYTES,
  REFRESH_SESSION_LIFETIME_MILLISECONDS,
  refreshAdminSession,
  revokeAdminSessionById,
  verifyAccessSession,
  verifyPassword,
} from "./auth.service.js";

export type {
  AdminProfile,
  AdminSessionView,
  AuthAuditContext,
  LoginSessionResult,
  LogoutSessionResult,
} from "./auth.service.js";
