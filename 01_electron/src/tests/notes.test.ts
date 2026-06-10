/**
 * Tests for the database-facing code paths described in the article.
 *
 * Exercises the exact functions the IPC handlers call, without Electron:
 * `initDatabase` is pointed at a temporary directory instead of
 * `app.getPath('userData')`.
 */
import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initDatabase, type NotesDatabase } from "../main/db.js";
import { createNote, deleteNote, listNotes, searchNotes } from "../main/notes-service.js";

let dir: string;
let database: NotesDatabase;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "my-notes-"));
  database = initDatabase(path.join(dir, "data"));
});

afterEach(() => {
  database.db.close();
  rmSync(dir, { recursive: true, force: true });
});

test("initDatabase creates the data directory on first launch", () => {
  // beforeEach already opened a db inside a directory that did not exist;
  // reaching this point means mkdirSync(recursive) did its job.
  assert.equal(database.db.existsCollection("notes"), true);
});

test("initDatabase is idempotent (index + migration safe across restarts)", () => {
  database.db.close();
  database = initDatabase(path.join(dir, "data"));

  assert.equal(database.notes.existsIndex("title"), true);
  const meta = database.db.collection("_meta");
  assert.equal(meta.findOne({ key: "version" })?.value, 2);
  // The migration marker must be unique — the article's replaceOne bug
  // would either crash or re-run the migration on every startup.
  assert.equal(meta.countDocuments({ key: "version" }), 1);
});

test("create + list returns notes newest first", () => {
  const first = createNote(database.notes, "First", "body a");
  const second = createNote(database.notes, "Second", "body b");
  assert.equal(first.acknowledged, true);
  assert.equal(second.acknowledged, true);

  const all = listNotes(database.notes);
  assert.equal(all.length, 2);
  // Same-millisecond inserts: assert both orders are creation-time sorted.
  const timestamps = all.map((note) => note.createdAt as number);
  assert.deepEqual([...timestamps].sort((a, b) => b - a), timestamps);
});

test("search matches title and body, case-insensitively", () => {
  createNote(database.notes, "Groceries", "Buy milk and eggs");
  createNote(database.notes, "Work", "Ship the MILK invoice");
  createNote(database.notes, "Other", "Nothing relevant");

  const results = searchNotes(database.notes, "milk");
  assert.equal(results.length, 2);
});

test("search is safe with regex metacharacters in user input", () => {
  createNote(database.notes, "Math (draft)", "a + b = c");

  // The article's snippet passes the raw term to $regex and throws here.
  const results = searchNotes(database.notes, "(draft)");
  assert.equal(results.length, 1);
  assert.equal(searchNotes(database.notes, "a + b").length, 1);
});

test("delete removes the note", () => {
  const { insertedId } = createNote(database.notes, "Trash me", "soon gone");
  const result = deleteNote(database.notes, insertedId);
  assert.equal(result.deletedCount, 1);
  assert.equal(listNotes(database.notes).length, 0);
});

test("compaction keeps live notes and survives reopen", () => {
  createNote(database.notes, "Keep", "kept");
  const { insertedId } = createNote(database.notes, "Drop", "dropped");
  deleteNote(database.notes, insertedId);

  database.db.compact();
  assert.equal(listNotes(database.notes).length, 1);

  database.db.close();
  database = initDatabase(path.join(dir, "data"));
  assert.equal(listNotes(database.notes)[0]?.title, "Keep");
});

test("migration adds archived flag to pre-existing notes", () => {
  // Simulate a v1 database: notes without `archived`, no version marker.
  database.notes.insertOne({ title: "Old", body: "from v1", createdAt: 1 });
  database.db.collection("_meta").deleteMany({ key: "version" });
  database.db.close();

  database = initDatabase(path.join(dir, "data"));
  const old = database.notes.findOne({ title: "Old" });
  assert.equal(old?.archived, false);
});
