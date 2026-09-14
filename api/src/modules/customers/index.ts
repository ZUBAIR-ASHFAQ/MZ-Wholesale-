import type { FastifyInstance } from "fastify";

import { registerCustomerRoutes } from "./customers.routes.js";

/** Registers Customer Management routes. */
export async function customersModule(app: FastifyInstance): Promise<void> {
  await registerCustomerRoutes(app);
}
