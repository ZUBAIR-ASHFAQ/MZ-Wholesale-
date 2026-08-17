import type { FastifyServerOptions } from "fastify";

/** Returns the small Pino configuration used by the production API. */
export function createLoggerOptions(): Exclude<
  FastifyServerOptions["logger"],
  boolean | undefined
> {
  return {
    level: process.env.LOG_LEVEL?.trim() || "info",
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "request.headers.authorization",
        "request.headers.cookie",
        "headers.authorization",
        "headers.cookie",
        "body.password",
        "body.currentPassword",
        "body.newPassword",
        "body.confirmPassword",
        "password",
        "currentPassword",
        "newPassword",
        "confirmPassword",
        "accessToken",
        "refreshToken",
      ],
      censor: "[REDACTED]",
    },
  };
}
