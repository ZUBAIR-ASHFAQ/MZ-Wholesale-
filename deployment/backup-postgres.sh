#!/usr/bin/env bash
set -euo pipefail

# Creates an encrypted PostgreSQL backup and copies it to an off-server location.
main() {
  require_command pg_dump
  require_command openssl
  require_command scp
  require_env DATABASE_URL
  require_env BACKUP_ENCRYPTION_PASSWORD
  require_env BACKUP_REMOTE_TARGET

  local backup_dir="${BACKUP_DIR:-/var/backups/wholesale-erp}"
  local retention_days="${BACKUP_RETENTION_DAYS:-14}"
  local timestamp
  timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"

  mkdir -p "$backup_dir"
  chmod 700 "$backup_dir"

  local raw_dump
  raw_dump="$(mktemp "${backup_dir}/wholesale-erp-${timestamp}.XXXXXX.dump")"
  local encrypted_backup="${backup_dir}/wholesale-erp-${timestamp}.dump.enc"

  # Always remove the unencrypted temporary database dump.
  trap 'rm -f "$raw_dump"' EXIT

  echo "Creating PostgreSQL backup..."
  pg_dump \
    --dbname="$DATABASE_URL" \
    --format=custom \
    --no-owner \
    --no-acl \
    --file="$raw_dump"

  echo "Encrypting backup..."
  openssl enc \
    -aes-256-cbc \
    -salt \
    -pbkdf2 \
    -iter 200000 \
    -in "$raw_dump" \
    -out "$encrypted_backup" \
    -pass env:BACKUP_ENCRYPTION_PASSWORD

  chmod 600 "$encrypted_backup"
  rm -f "$raw_dump"
  trap - EXIT

  echo "Copying encrypted backup off-server..."
  scp -q "$encrypted_backup" "$BACKUP_REMOTE_TARGET/"

  # Local copies are short-lived convenience copies. Off-server retention is managed on the backup host.
  if [[ "$retention_days" =~ ^[0-9]+$ ]]; then
    find "$backup_dir" -type f -name 'wholesale-erp-*.dump.enc' -mtime "+$retention_days" -delete
  else
    echo "BACKUP_RETENTION_DAYS must be a non-negative whole number." >&2
    exit 1
  fi

  echo "Backup completed: $encrypted_backup"
  echo "Off-server copy: $BACKUP_REMOTE_TARGET/$(basename "$encrypted_backup")"
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
