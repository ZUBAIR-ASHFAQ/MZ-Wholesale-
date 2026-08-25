import type { FastifyInstance } from "fastify";

import { registerEmployeeRoutes } from "./employees.routes.js";

/** Registers Employee Management routes for Module 16. */
export async function employeesModule(app: FastifyInstance): Promise<void> {
  await registerEmployeeRoutes(app);
}
