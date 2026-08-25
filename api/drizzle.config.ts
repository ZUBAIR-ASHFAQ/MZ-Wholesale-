import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit reads this configuration when it generates or checks migrations.
 * Database credentials are absent because migrations are generated from local schema files.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/database/schema/index.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
});
