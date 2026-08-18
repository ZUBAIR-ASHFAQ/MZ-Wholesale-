import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";

const localAdminHostnames = new Set(["localhost", "127.0.0.1"]);

/** Checks whether the configured admin URL is a local development origin. */
function isLocalAdminUrl(webAdminUrl: string): boolean {
  return localAdminHostnames.has(new URL(webAdminUrl).hostname);
}

/** Checks whether one browser origin is a local development origin. */
function isLocalBrowserOrigin(origin: string): boolean {
  try {
    return localAdminHostnames.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/** Allows credentialed browser requests from the configured admin origin. */
export async function registerCorsPlugin(
  app: FastifyInstance,
  webAdminUrl: string,
): Promise<void> {
  const allowLocalDevelopmentOrigins = isLocalAdminUrl(webAdminUrl);

  await app.register(cors, {
    ...(allowLocalDevelopmentOrigins
      ? {
          origin: (origin, callback) => {
            callback(
              null,
              origin === undefined || isLocalBrowserOrigin(origin),
            );
          },
        }
      : { origin: webAdminUrl }),
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"],
  });
}
