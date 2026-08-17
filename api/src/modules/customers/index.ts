import type { FastifyInstance } from "fastify";

import { registerCustomerRoutes } from "./customers.routes.js";
import { ensureWalkInCustomerExists } from "./customers.service.js";

/** Ensures required customer setup data exists and registers customer routes. */
export async function customersModule(app: FastifyInstance): Promise<void> {
  await ensureWalkInCustomerExists(app.db);
  await registerCustomerRoutes(app);
}
