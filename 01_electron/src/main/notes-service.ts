/**
 * Note operations exposed over IPC.
 *
 * Kept free of any `electron` import so the exact code the IPC handlers
 * run can be exercised by plain `node:test` tests.
 */
import type { Collection } from "@axfab/pocket-db";

/** Shape of a note document as stored in the `notes` collection. */
export interface Note {
  _id: string;
  title: string;
  body: string;
  createdAt: number;
  archived: boolean;
}

/**
 * Escapes regex metacharacters in user input.
 *
 * The article passes the raw search term to `$regex`; a term containing
 * `(`, `*`, `[`… throws "Invalid $regex pattern" at query compile time.
 */
function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Creates a note and returns the insert result (`{ acknowledged, insertedId }`). */
export function createNote(notes: Collection, title: string, body: string) {
  return notes.insertOne({ title, body, createdAt: Date.now(), archived: false });
}

/** Lists all notes, newest first. */
export function listNotes(notes: Collection) {
  return notes.find().sort({ createdAt: -1 }).toArray();
}

/**
 * Case-insensitive substring search on title and body.
 *
 * Note: `$or` queries are not index-assisted in V1 (the planner only
 * recurses into `and` nodes), so this is a full collection scan — fine
 * for a notes app, worth knowing for large collections.
 */
export function searchNotes(notes: Collection, term: string) {
  const pattern = escapeRegex(term);

  return notes
    .find({
      $or: [
        { title: { $regex: pattern, $options: "i" } },
        { body: { $regex: pattern, $options: "i" } }
      ]
    })
    .toArray();
}

/** Deletes a note by id. Returns `{ acknowledged, deletedCount }`. */
export function deleteNote(notes: Collection, id: string) {
  return notes.deleteOne(id);
}
