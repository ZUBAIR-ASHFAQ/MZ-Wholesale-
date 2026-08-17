import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

/** Reads one project file used by this deployment audit. */
async function readProjectFile(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

test("production environment validation requires HTTPS admin origin", async () => {
  const source = await readProjectFile("api/src/env.ts");

  assert.match(source, /NODE_ENV === "production"/);
  assert.match(source, /WEB_ADMIN_URL\.startsWith\("https:\/\/"\)/);
});

test("production cookies are Secure, HttpOnly where required, and SameSite=Lax", async () => {
  const source = await readProjectFile("api/src/modules/auth/auth.routes.ts");

  assert.match(source, /httpOnly:\s*true/);
  assert.match(source, /sameSite:\s*"lax"/);
  assert.match(source, /secure:\s*secureCookies/);
});

test("production CORS uses one configured admin origin with credentials", async () => {
  const source = await readProjectFile("api/src/plugins/cors.plugin.ts");

  assert.match(source, /origin:\s*webAdminUrl/);
  assert.match(source, /credentials:\s*true/);
});

test("public API health route checks PostgreSQL and can return 503", async () => {
  const source = await readProjectFile("api/src/app.ts");

  assert.match(source, /"\/health"/);
  assert.match(source, /select 1/);
  assert.match(source, /\.status\(503\)/);
});

test("production Compose uses compiled containers and localhost-bound public services", async () => {
  const compose = await readProjectFile("docker-compose.production.yml");

  assert.match(compose, /build:\s*\n\s*context:\s*\.\/api/);
  assert.match(compose, /NODE_ENV:\s*production/);
  assert.match(compose, /127\.0\.0\.1:3000:3000/);
  assert.match(compose, /127\.0\.0\.1:8080:80/);
  assert.match(compose, /condition:\s*service_healthy/);
});

test("production Dockerfiles do not run Vite or tsx watch servers", async () => {
  const apiDockerfile = await readProjectFile("api/Dockerfile");
  const webDockerfile = await readProjectFile("web-admin/Dockerfile");

  assert.match(apiDockerfile, /pnpm build/);
  assert.match(apiDockerfile, /CMD \["pnpm", "start"\]/);
  assert.doesNotMatch(apiDockerfile, /tsx watch/);

  assert.match(webDockerfile, /pnpm build/);
  assert.match(webDockerfile, /nginx/);
  assert.doesNotMatch(webDockerfile, /pnpm dev/);
});

test("Git ignore protects production environment and generated dependency/build files", async () => {
  const gitignore = await readProjectFile(".gitignore");

  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /node_modules/);
  assert.match(gitignore, /dist/);
});

test("production migrations and initialization have compiled commands", async () => {
  const packageJson = JSON.parse(
    await readProjectFile("api/package.json"),
  ) as { scripts?: Record<string, string> };

  assert.equal(
    packageJson.scripts?.["db:migrate:production"],
    "node dist/commands/migrate.js",
  );
  assert.equal(
    packageJson.scripts?.["initialize:system:production"],
    "node dist/commands/initialize-system.js",
  );
});

test("encrypted off-server backup and restore verification remain documented", async () => {
  const backup = await readProjectFile("deployment/backup-postgres.sh");
  const verify = await readProjectFile("deployment/verify-backup-restore.sh");

  assert.match(backup, /openssl/);
  assert.match(backup, /scp/);
  assert.match(verify, /pg_restore/);
  assert.match(verify, /ALLOW_DATABASE_RESTORE/);
});


test("production acceptance runner uses a disposable clean database and full checks", async () => {
  const source = await readProjectFile("deployment/run-production-acceptance.sh");

  assert.match(source, /docker compose .* down --remove-orphans/);
  assert.match(source, /docker compose .* up -d --wait/);
  assert.match(source, /pnpm db:check/);
  assert.match(source, /pnpm typecheck/);
  assert.match(source, /pnpm test:unit/);
  assert.match(source, /pnpm test:integration/);
  assert.match(source, /pnpm test/);
  assert.match(source, /pnpm build/);
});
