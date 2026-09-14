import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { preHandlerHookHandler } from "fastify";
import type { Pool } from "pg";

import type { AuthenticatedAdmin } from "../plugins/auth.plugin.js";

declare module "fastify" {
  interface FastifyInstance {
    db: NodePgDatabase;
    databasePool: Pool;
    authenticate: preHandlerHookHandler;
  }

  interface FastifyRequest {
    admin: AuthenticatedAdmin | null;
    db: NodePgDatabase;
  }
}

export {};
