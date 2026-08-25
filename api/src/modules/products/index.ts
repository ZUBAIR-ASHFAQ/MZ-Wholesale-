import type { FastifyInstance } from "fastify";

import { registerProductRoutes } from "./products.routes.js";

/** Registers the Product Management routes. */
export async function productsModule(app: FastifyInstance): Promise<void> {
  await registerProductRoutes(app);
}
