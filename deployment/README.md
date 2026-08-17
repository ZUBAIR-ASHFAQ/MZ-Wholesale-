# PostgreSQL backup and restore

The ERP backup process is a deployment responsibility. There is intentionally no public API route that can restore the database.

## Requirements

Install these commands on the production VPS:

- `pg_dump` and `pg_restore` from the PostgreSQL client tools
- `openssl`
- `scp`

The PostgreSQL client major version should be the same as, or newer than, the PostgreSQL server major version.

## Backup environment

Configure these values only on the server. Do not commit real secrets:

```bash
export DATABASE_URL='postgresql://user:password@database-host:5432/wholesale_erp'
export BACKUP_ENCRYPTION_PASSWORD='use-a-long-random-secret'
export BACKUP_REMOTE_TARGET='backup-user@backup-host:/srv/backups/wholesale-erp'
export BACKUP_DIR='/var/backups/wholesale-erp'
export BACKUP_RETENTION_DAYS='14'
```

`BACKUP_REMOTE_TARGET` must point to storage on another server or backup host. Configure SSH-key authentication for the production VPS so the scheduled backup can use `scp` without an interactive password prompt.

## Create a backup manually

```bash
chmod +x deployment/backup-postgres.sh
./deployment/backup-postgres.sh
```

The script:

1. creates a PostgreSQL custom-format dump;
2. encrypts it with AES-256-CBC and PBKDF2;
3. deletes the temporary unencrypted dump;
4. copies the encrypted file to the configured off-server destination;
5. removes old local encrypted copies according to `BACKUP_RETENTION_DAYS`.

If encryption or the off-server copy fails, the command exits with an error.

## Daily schedule with cron

Run the backup once every day at a quiet time. Example: 2:30 AM server time.

Create a root-owned environment file, for example `/etc/wholesale-erp-backup.env`, readable only by root:

```bash
chmod 600 /etc/wholesale-erp-backup.env
```

Then add a cron entry:

```cron
30 2 * * * . /etc/wholesale-erp-backup.env && /opt/wholesale-erp/deployment/backup-postgres.sh >> /var/log/wholesale-erp-backup.log 2>&1
```

Use the real deployed repository path instead of `/opt/wholesale-erp` when different.

## Restore procedure

Do not restore directly into production as the first test. Restore into a dedicated test database first and complete the restore-verification procedure.

Download or copy one encrypted backup from the off-server backup host, then configure:

```bash
export RESTORE_DATABASE_URL='postgresql://user:password@localhost:5432/wholesale_erp_restore_test'
export BACKUP_ENCRYPTION_PASSWORD='the-same-secret-used-for-the-backup'
export ALLOW_DATABASE_RESTORE='yes'
```

Run:

```bash
chmod +x deployment/restore-postgres.sh
./deployment/restore-postgres.sh /path/to/wholesale-erp-YYYYMMDDTHHMMSSZ.dump.enc
```

The restore script decrypts only to a temporary file, restores with `pg_restore`, and deletes the temporary decrypted dump when it exits.


## Verify that backups can actually restore

Run this check regularly and after changing PostgreSQL versions, backup scripts, encryption settings, or deployment infrastructure. Use a disposable restore database; never point `RESTORE_DATABASE_URL` at the live production database.

Configure both databases and the encryption password:

```bash
export DATABASE_URL='postgresql://user:password@localhost:5432/wholesale_erp'
export RESTORE_DATABASE_URL='postgresql://user:password@localhost:5432/wholesale_erp_restore_test'
export BACKUP_ENCRYPTION_PASSWORD='the-same-secret-used-for-production-backups'
export ALLOW_DATABASE_RESTORE='yes'
```

Run:

```bash
chmod +x deployment/verify-backup-restore.sh
./deployment/verify-backup-restore.sh
```

The verification script performs the complete test path without sending a file off-server:

1. checks that both source and restore databases are reachable;
2. captures deterministic row counts for every public table in the source database;
3. creates a PostgreSQL custom-format dump;
4. encrypts it with the same AES-256-CBC/PBKDF2 settings used by the production backup script;
5. decrypts and restores it into the separate restore database;
6. compares every restored public-table row count with the source snapshot;
7. runs a final SQL connection smoke check.

The command exits non-zero when the restore fails or any table count differs. All temporary raw/decrypted dump files are removed on exit.

For a production disaster-recovery drill, also copy an actual encrypted backup back from `BACKUP_REMOTE_TARGET` and restore it with `restore-postgres.sh`. This proves the off-server copy itself is usable, not only the local backup mechanics.

## Production safety rules

- Keep the encryption password outside Git and outside the database server backup directory.
- Keep at least one backup copy off the application/database server.
- Protect the backup host and SSH key with least-privilege permissions.
- Monitor the backup command exit status or log so failed daily backups are noticed.
- Never add a public database restore API route.
- Perform regular restore tests; creating backup files without proving they can restore is not sufficient.
