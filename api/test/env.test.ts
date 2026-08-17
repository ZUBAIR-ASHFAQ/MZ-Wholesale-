import assert from "node:assert/strict";
import test from "node:test";

import { readApiEnvironment } from "../src/env.js";

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: "postgresql://user:password@localhost:5432/erp",
    AUTH_SIGNING_SECRET: "a-secure-signing-secret-with-32-characters",
    WEB_ADMIN_URL: "http://localhost:5173",
    API_HOST: "0.0.0.0",
    API_PORT: "3000",
    NODE_ENV: "test",
  };
}

test("environment applies safe database pool defaults", () => {
  const environment = readApiEnvironment(validEnvironment());

  assert.equal(environment.databasePoolMax, 10);
  assert.equal(environment.databaseConnectionTimeoutMilliseconds, 5_000);
  assert.equal(environment.databaseIdleTimeoutMilliseconds, 30_000);
});

test("environment accepts bounded database pool settings", () => {
  const values = validEnvironment();
  values.DATABASE_POOL_MAX = "20";
  values.DATABASE_CONNECTION_TIMEOUT_MS = "7000";
  values.DATABASE_IDLE_TIMEOUT_MS = "45000";

  const environment = readApiEnvironment(values);

  assert.equal(environment.databasePoolMax, 20);
  assert.equal(environment.databaseConnectionTimeoutMilliseconds, 7_000);
  assert.equal(environment.databaseIdleTimeoutMilliseconds, 45_000);
});

test("environment rejects a missing database URL", () => {
  const values = validEnvironment();
  delete values.DATABASE_URL;

  assert.throws(() => readApiEnvironment(values));
});

test("environment rejects a weak authentication secret", () => {
  const values = validEnvironment();
  values.AUTH_SIGNING_SECRET = "too-short";

  assert.throws(() => readApiEnvironment(values));
});

test("environment rejects invalid port and pool limits", () => {
  const values = validEnvironment();
  values.API_PORT = "70000";
  values.DATABASE_POOL_MAX = "0";

  assert.throws(() => readApiEnvironment(values));
});

test("production requires an HTTPS web-admin URL", () => {
  const values = validEnvironment();
  values.NODE_ENV = "production";
  values.WEB_ADMIN_URL = "http://erp.example.com";

  assert.throws(() => readApiEnvironment(values));

  values.WEB_ADMIN_URL = "https://erp.example.com";
  assert.equal(readApiEnvironment(values).isProduction, true);
});
