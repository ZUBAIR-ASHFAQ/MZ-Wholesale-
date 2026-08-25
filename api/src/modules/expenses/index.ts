import type { FastifyPluginAsync } from "fastify";

import { registerExpenseRoutes } from "./expenses.routes.js";

/** Registers the approved Expense Management routes for Module 12. */
export const expensesModule: FastifyPluginAsync = async (app) => {
  await registerExpenseRoutes(app);
};
