import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { preHandlerHookHandler } from "fastify";

import type { AuthenticatedAdmin } from "../plugins/auth.plugin.js";

declare module "fastify" {
  interface FastifyInstance {
    db: NodePgDatabase;
    authenticate: preHandlerHookHandler;
  }

  interface FastifyRequest {
    admin: AuthenticatedAdmin | null;
  }
}

export {};
