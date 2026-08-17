import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

interface MigrationJournalEntry {
  idx: number;
  tag: string;
}

interface MigrationJournal {
  entries: MigrationJournalEntry[];
}

/** Returns the Drizzle migration folder used by this project. */
function getMigrationFolder(): string {
  return fileURLToPath(new URL("../../drizzle", import.meta.url));
}

/** Loads the migration journal that controls the ordered SQL migration history. */
async function readMigrationJournal(migrationFolder: string): Promise<MigrationJournal> {
  const journalPath = `${migrationFolder}/meta/_journal.json`;
  const journalText = await readFile(journalPath, "utf8");
  const journal = JSON.parse(journalText) as MigrationJournal;

  if (!Array.isArray(journal.entries)) {
    throw new Error("Migration journal does not contain an entries array.");
  }

  return journal;
}

/** Returns all numbered SQL migration files in filename order. */
async function listSqlMigrations(migrationFolder: string): Promise<string[]> {
  const fileNames = await readdir(migrationFolder);

  return fileNames
    .filter((fileName) => /^\d{4}_.+\.sql$/.test(fileName))
    .sort((left, right) => left.localeCompare(right));
}

/** Verifies that every journal entry has exactly one matching SQL migration file. */
function validateJournalEntries(
  entries: MigrationJournalEntry[],
  sqlFiles: string[],
): void {
  if (entries.length !== sqlFiles.length) {
    throw new Error(
      `Migration history mismatch: journal has ${entries.length} entries but ${sqlFiles.length} SQL files exist.`,
    );
  }

  const seenTags = new Set<string>();

  entries.forEach((entry, expectedIndex) => {
    if (entry.idx !== expectedIndex) {
      throw new Error(
        `Migration journal index mismatch at position ${expectedIndex}: found idx ${entry.idx}.`,
      );
    }

    if (seenTags.has(entry.tag)) {
      throw new Error(`Duplicate migration journal tag: ${entry.tag}.`);
    }

    seenTags.add(entry.tag);

    const expectedFile = `${entry.tag}.sql`;
    if (sqlFiles[expectedIndex] !== expectedFile) {
      throw new Error(
        `Migration order mismatch at index ${expectedIndex}: expected ${expectedFile}, found ${sqlFiles[expectedIndex] ?? "no SQL file"}.`,
      );
    }
  });
}

/** Verifies that migration SQL files are not empty placeholders. */
async function validateSqlFiles(
  migrationFolder: string,
  sqlFiles: string[],
): Promise<void> {
  for (const fileName of sqlFiles) {
    const sql = await readFile(`${migrationFolder}/${fileName}`, "utf8");

    if (sql.trim().length === 0) {
      throw new Error(`Migration file is empty: ${fileName}.`);
    }
  }
}

/** Runs the migration-history checks used before tests and production deployment. */
async function validateMigrationHistory(): Promise<void> {
  const migrationFolder = getMigrationFolder();
  const journal = await readMigrationJournal(migrationFolder);
  const sqlFiles = await listSqlMigrations(migrationFolder);

  validateJournalEntries(journal.entries, sqlFiles);
  await validateSqlFiles(migrationFolder, sqlFiles);

  process.stdout.write(
    `Migration history is valid: ${sqlFiles.length} ordered SQL migrations.\n`,
  );
}

validateMigrationHistory().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Migration validation failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
