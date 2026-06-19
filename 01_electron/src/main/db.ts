/**
 * Database bootstrap for the main process.
 *
 * The article opens the database at module load time using
 * `app.getPath('userData')` directly. Two corrections were needed:
 *
 * 1. The `userData` directory is created lazily by Electron and may not
 *    exist yet on a first launch. `open()` does NOT create parent
 *    directories (the `.lock` file creation fails with ENOENT), so we
 *    `mkdirSync` it first.
 * 2. Opening at module scope makes the code untestable outside Electron.
 *    The open logic lives in `initDatabase()` so tests can point it at a
 *    temporary directory; the Electron entry point calls it with
 *    `app.getPath('userData')`.
 */
import { pocketDb, type Database, type Collection } from "@axfab/pocket-db";
import { mkdirSync } from "node:fs";
import path from "node:path";

export interface NotesDatabase {
  db: Database;
  notes: Collection;
}

/**
 * Opens (or creates) the notes database inside `dataDir`.
 *
 * Also performs startup duties described in the article:
 * - creates the search index on `title` (idempotent, safe to call repeatedly)
 * - runs the one-time schema migration
 */
export function initDatabase(dataDir: string): NotesDatabase {
  // userData may not exist on first launch — open() does not mkdir for us.
  mkdirSync(dataDir, { recursive: true });

  const db = pocketDb(path.join(dataDir, "notes.pdb"));
  const notes = db.collection("notes");

  // Index for search — the query planner picks it up automatically.
  notes.createIndex("title", { type: "string" });

  runMigrations(db, notes);

  return { db, notes };
}

/**
 * One-time migration on startup (corrected version of the article snippet).
 *
 * The article's version had two bugs:
 * - On a fresh database `findOne` returns `null` and
 *   `replaceOne(null, …)` throws (`Cannot read properties of null`).
 * - `replaceOne(version, newDoc)` uses the single-argument overload:
 *   when the first argument is a document, the *second argument is
 *   ignored* and the document is replaced by itself — the version is
 *   never bumped and the migration re-runs on every startup.
 *
 * The correct pattern is `replaceOne(version._id, newDoc)` for an
 * existing marker and `insertOne` for a missing one.
 */
export function runMigrations(db: Database, notes: Collection): void {
  const schema = db.collection("_meta");
  const version = schema.findOne({ key: "version" });
  const currentVersion = typeof version?.value === "number" ? version.value : 0;

  if (currentVersion < 2) {
    // v2: every note gains an `archived` flag.
    notes.updateMany({}, { $set: { archived: false } });

    if (version) {
      schema.replaceOne(version._id as string, { key: "version", value: 2 });
    } else {
      schema.insertOne({ key: "version", value: 2 });
    }
  }
}
