import { z } from "zod";

/** Contains every environment value required to start the Fastify API. */
export interface ApiEnvironment {
  databaseUrl: string;
  databasePoolMax: number;
  databaseConnectionTimeoutMilliseconds: number;
  databaseIdleTimeoutMilliseconds: number;
  authSigningSecret: string;
  webAdminUrl: string;
  csrfCookieDomain?: string;
  apiHost: string;
  apiPort: number;
  trustProxyHops: number;
  isProduction: boolean;
  appVersion: string;
  appBuild: string;
  nodeEnvironment: "development" | "test" | "production";
}

const apiEnvironmentSchema = z
  .object({
    DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required."),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    DATABASE_CONNECTION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(60_000)
      .default(5_000),
    DATABASE_IDLE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(300_000)
      .default(30_000),
    AUTH_SIGNING_SECRET: z
      .string()
      .min(32, "AUTH_SIGNING_SECRET must contain at least 32 characters."),
    WEB_ADMIN_URL: z.url("WEB_ADMIN_URL must be a valid URL."),
    CSRF_COOKIE_DOMAIN: z.string().trim().min(1).optional(),
    API_HOST: z.string().trim().min(1).default("0.0.0.0"),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    API_TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    APP_VERSION: z.string().trim().min(1).default("1.0.0"),
    APP_BUILD: z.string().trim().min(1).default("local"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === "production" &&
      !environment.WEB_ADMIN_URL.startsWith("https://")
    ) {
      context.addIssue({
        code: "custom",
        path: ["WEB_ADMIN_URL"],
        message: "WEB_ADMIN_URL must use HTTPS in production.",
      });
    }

    if (environment.CSRF_COOKIE_DOMAIN) {
      const cookieDomain = environment.CSRF_COOKIE_DOMAIN.replace(
        /^\./,
        "",
      ).toLowerCase();
      const webAdminHostname = new URL(
        environment.WEB_ADMIN_URL,
      ).hostname.toLowerCase();

      if (
        !cookieDomain.includes(".") ||
        (webAdminHostname !== cookieDomain &&
          !webAdminHostname.endsWith(`.${cookieDomain}`))
      ) {
        context.addIssue({
          code: "custom",
          path: ["CSRF_COOKIE_DOMAIN"],
          message: "CSRF_COOKIE_DOMAIN must be a shared parent domain of WEB_ADMIN_URL.",
        });
      }
    }
  });

/** Reads and converts process environment values used by the API. */
export function readApiEnvironment(values: NodeJS.ProcessEnv): ApiEnvironment {
  const environment = apiEnvironmentSchema.parse(values);

  return {
    databaseUrl: environment.DATABASE_URL,
    databasePoolMax: environment.DATABASE_POOL_MAX,
    databaseConnectionTimeoutMilliseconds:
      environment.DATABASE_CONNECTION_TIMEOUT_MS,
    databaseIdleTimeoutMilliseconds: environment.DATABASE_IDLE_TIMEOUT_MS,
    authSigningSecret: environment.AUTH_SIGNING_SECRET,
    webAdminUrl: environment.WEB_ADMIN_URL,
    csrfCookieDomain: environment.CSRF_COOKIE_DOMAIN?.replace(
      /^\./,
      "",
    ).toLowerCase(),
    apiHost: environment.API_HOST,
    apiPort: environment.API_PORT,
    trustProxyHops: environment.API_TRUST_PROXY_HOPS,
    isProduction: environment.NODE_ENV === "production",
    appVersion: environment.APP_VERSION,
    appBuild: environment.APP_BUILD,
    nodeEnvironment: environment.NODE_ENV,
  };
}
