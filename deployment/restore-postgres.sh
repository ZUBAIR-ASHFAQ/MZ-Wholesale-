#!/usr/bin/env bash
set -euo pipefail

# Restores one encrypted ERP backup into an explicitly configured target database.
main() {
  require_command pg_restore
  require_command openssl
  require_env RESTORE_DATABASE_URL
  require_env BACKUP_ENCRYPTION_PASSWORD

  if [[ "${ALLOW_DATABASE_RESTORE:-}" != "yes" ]]; then
    echo "Restore blocked. Set ALLOW_DATABASE_RESTORE=yes only for the database you intend to replace." >&2
    exit 1
  fi

  if [[ $# -ne 1 ]]; then
    echo "Usage: $0 /path/to/wholesale-erp-YYYYMMDDTHHMMSSZ.dump.enc" >&2
    exit 1
  fi

  local encrypted_backup="$1"
  if [[ ! -f "$encrypted_backup" ]]; then
    echo "Backup file not found: $encrypted_backup" >&2
    exit 1
  fi

  local raw_dump
  raw_dump="$(mktemp /tmp/wholesale-erp-restore.XXXXXX.dump)"
  trap 'rm -f "$raw_dump"' EXIT

  echo "Decrypting backup..."
  openssl enc \
    -d \
    -aes-256-cbc \
    -pbkdf2 \
    -iter 200000 \
    -in "$encrypted_backup" \
    -out "$raw_dump" \
    -pass env:BACKUP_ENCRYPTION_PASSWORD

  echo "Restoring PostgreSQL database..."
  pg_restore \
    --dbname="$RESTORE_DATABASE_URL" \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    --exit-on-error \
    "$raw_dump"

  echo "Restore completed successfully."
}

# Stops with a clear message when a required executable is unavailable.
require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

# Stops when a required environment variable is missing or empty.
require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Required environment variable is missing: $name" >&2
    exit 1
  fi
}

main "$@"
