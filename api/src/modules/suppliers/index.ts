import type { FastifyInstance } from "fastify";

import { registerSupplierRoutes } from "./suppliers.routes.js";

/** Registers all Supplier Management routes for Module 5. */
export async function suppliersModule(app: FastifyInstance): Promise<void> {
  await registerSupplierRoutes(app);
}
