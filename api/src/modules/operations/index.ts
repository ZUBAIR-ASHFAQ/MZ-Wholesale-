import type { FastifyPluginAsync } from "fastify";

import { registerOperationsRoutes } from "./operations.routes.js";

/** Contains only safe build metadata exposed by Production Operations. */
export interface OperationsModuleOptions {
  version: string;
  build: string;
  environment: "development" | "test" | "production";
}

/** Registers the small Production Operations technical module. */
export const operationsModule: FastifyPluginAsync<OperationsModuleOptions> = async (
  app,
  options,
) => {
  await registerOperationsRoutes(app, options);
};
