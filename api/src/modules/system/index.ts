import multipart from "@fastify/multipart";
import type { FastifyPluginAsync } from "fastify";

import { registerSystemRoutes } from "./system.routes.js";

/** Registers the Module 15 System routes implemented in the current passes. */
export const systemModule: FastifyPluginAsync = async (app) => {
  await app.register(multipart, {
    limits: {
      files: 1,
      fields: 0,
      parts: 1,
      fileSize: 5 * 1024 * 1024,
    },
  });

  await registerSystemRoutes(app);
};
