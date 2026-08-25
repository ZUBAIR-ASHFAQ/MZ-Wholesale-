import type { FastifyInstance } from "fastify";

import { registerInventoryRoutes } from "./inventory.routes.js";

/** Registers all Inventory Management routes for Module 6. */
export async function inventoryModule(app: FastifyInstance): Promise<void> {
  await registerInventoryRoutes(app);
}
