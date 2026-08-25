#!/usr/bin/env bash
set -euo pipefail

# Verifies that an encrypted PostgreSQL backup can be restored into a separate test database.
main() {
  require_command pg_dump
  require_command pg_restore
  require_command psql
  require_command openssl
  require_env DATABASE_URL
  require_env RESTORE_DATABASE_URL
  require_env BACKUP_ENCRYPTION_PASSWORD

  if [[ "${ALLOW_DATABASE_RESTORE:-}" != "yes" ]]; then
    echo "Verification blocked. Set ALLOW_DATABASE_RESTORE=yes for the disposable restore database." >&2
    exit 1
  fi

  if [[ "$DATABASE_URL" == "$RESTORE_DATABASE_URL" ]]; then
    echo "DATABASE_URL and RESTORE_DATABASE_URL must point to different databases." >&2
    exit 1
  fi

  local work_dir
  work_dir="$(mktemp -d /tmp/wholesale-erp-backup-verify.XXXXXX)"
  local raw_dump="${work_dir}/source.dump"
  local encrypted_backup="${work_dir}/source.dump.enc"
  local decrypted_dump="${work_dir}/restore.dump"
  local source_counts="${work_dir}/source-counts.txt"
  local restored_counts="${work_dir}/restored-counts.txt"

  # Remove all temporary backup material, including decrypted data, on every exit path.
  trap 'rm -rf "$work_dir"' EXIT

  echo "1/7 Checking source and restore database connections..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc 'select 1' >/dev/null
  psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc 'select 1' >/dev/null

  echo "2/7 Capturing source table row counts..."
  capture_public_table_counts "$DATABASE_URL" "$source_counts"
  if [[ ! -s "$source_counts" ]]; then
    echo "Source database has no public tables to verify." >&2
    exit 1
  fi

  echo "3/7 Creating and encrypting verification backup..."
  pg_dump \
    --dbname="$DATABASE_URL" \
    --format=custom \
    --no-owner \
    --no-acl \
    --file="$raw_dump"

  openssl enc \
    -aes-256-cbc \
    -salt \
    -pbkdf2 \
    -iter 200000 \
    -in "$raw_dump" \
    -out "$encrypted_backup" \
    -pass env:BACKUP_ENCRYPTION_PASSWORD

  rm -f "$raw_dump"

  echo "4/7 Decrypting the encrypted backup..."
  openssl enc \
    -d \
    -aes-256-cbc \
    -pbkdf2 \
    -iter 200000 \
    -in "$encrypted_backup" \
    -out "$decrypted_dump" \
    -pass env:BACKUP_ENCRYPTION_PASSWORD

  echo "5/7 Restoring into the disposable restore database..."
  pg_restore \
    --dbname="$RESTORE_DATABASE_URL" \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    --exit-on-error \
    "$decrypted_dump"

  echo "6/7 Comparing restored table row counts with the source snapshot..."
  capture_public_table_counts "$RESTORE_DATABASE_URL" "$restored_counts"
  if ! diff -u "$source_counts" "$restored_counts"; then
    echo "Restore verification failed: table row counts do not match." >&2
    exit 1
  fi

  echo "7/7 Running restored database smoke checks..."
  psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc 'select 1' >/dev/null

  local source_table_count restored_table_count
  source_table_count="$(wc -l < "$source_counts" | tr -d ' ')"
  restored_table_count="$(wc -l < "$restored_counts" | tr -d ' ')"

  if [[ "$source_table_count" != "$restored_table_count" ]]; then
    echo "Restore verification failed: public table counts differ." >&2
    exit 1
  fi

  echo "Backup restore verification passed."
  echo "Verified public tables: $restored_table_count"
  echo "The encrypted backup was successfully decrypted and restored into the separate test database."
}

# Writes deterministic public-table row counts as table_name|row_count lines.
capture_public_table_counts() {
  local database_url="$1"
  local output_file="$2"

  local tables
  tables="$(psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
    "select quote_ident(tablename) from pg_tables where schemaname = 'public' order by tablename")"

  : > "$output_file"
  while IFS= read -r quoted_table; do
    [[ -z "$quoted_table" ]] && continue

    local plain_table row_count
    plain_table="$(psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
      "select tablename from pg_tables where schemaname = 'public' and quote_ident(tablename) = '$quoted_table'")"
    row_count="$(psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
      "select count(*) from public.${quoted_table}")"

    printf '%s|%s\n' "$plain_table" "$row_count" >> "$output_file"
  done <<< "$tables"
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
