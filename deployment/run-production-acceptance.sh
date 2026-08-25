#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_COMPOSE_FILE="$ROOT_DIR/docker-compose.test.yml"
DEFAULT_TEST_DATABASE_URL="postgresql://wholesale_erp_test:wholesale_erp_test_password@localhost:5433/wholesale_erp_test"

# Stops the temporary PostgreSQL test service before the script exits.
cleanup_test_database() {
  docker compose -f "$TEST_COMPOSE_FILE" down --remove-orphans >/dev/null 2>&1 || true
}

# Fails early when a command required by the acceptance run is missing.
require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is missing: $command_name" >&2
    exit 1
  fi
}

# Starts a clean temporary PostgreSQL database used only by integration tests.
start_test_database() {
  docker compose -f "$TEST_COMPOSE_FILE" down --remove-orphans >/dev/null 2>&1 || true
  docker compose -f "$TEST_COMPOSE_FILE" up -d --wait
}

# Runs API checks and all clean-database integration tests.
run_api_acceptance() {
  (
    cd "$ROOT_DIR/api"
    pnpm db:check
    pnpm typecheck
    pnpm test:unit
    pnpm test:integration
  )
}

# Runs the React admin checks without changing the application architecture.
run_web_acceptance() {
  (
    cd "$ROOT_DIR/web-admin"
    pnpm test
    pnpm build
  )
}

# Runs the automated part of the final production acceptance process.
run_acceptance() {
  require_command docker
  require_command pnpm

  export TEST_DATABASE_URL="${TEST_DATABASE_URL:-$DEFAULT_TEST_DATABASE_URL}"
  trap cleanup_test_database EXIT INT TERM

  echo "Starting clean PostgreSQL acceptance database..."
  start_test_database

  echo "Running API migration, type, unit and integration checks..."
  run_api_acceptance

  echo "Running web-admin tests and production build..."
  run_web_acceptance

  echo "Automated production acceptance checks passed."
  echo "Still perform the documented live HTTPS, database-outage, graceful-restart and backup/restore checks before client deployment."
}

run_acceptance
