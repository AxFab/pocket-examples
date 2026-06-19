/**
 * Bookmark reads/writes against the `bookmarks` collection.
 *
 * Every query is scoped by `ownerId` first — the indexed field — so a user's
 * listing never scans another user's documents. Tag filtering and free-text
 * search are applied in memory on the (already small, per-owner) result set:
 * pocket-db has no array-containment query operator and no text index, so
 * neither is expressible as a pocket-db query.
 */
import type { Collection } from "@axfab/pocket-db";
import type { BookmarkDoc } from "./types.js";
import type { BookmarkInput, BookmarkPatch } from "./validation.js";

export interface ListOptions {
  tag?: string;
  /** Case-insensitive substring match against `title`, `url`, or `note`. */
  q?: string;
  sort?: "newest" | "oldest" | "title";
  skip?: number;
  limit?: number;
}

export interface ListResult {
  items: BookmarkDoc[];
  /** Count after filtering, before `skip`/`limit` — for client-side pagination. */
  total: number;
}

export function listBookmarks(
  bookmarks: Collection,
  ownerId: string,
  opts: ListOptions = {},
): ListResult {
  let items = bookmarks.find({ ownerId }).toArray() as unknown as BookmarkDoc[];

  if (opts.tag) {
    const tag = opts.tag;
    items = items.filter((doc) => doc.tags.includes(tag));
  }
  if (opts.q) {
    const needle = opts.q.toLowerCase();
    items = items.filter(
      (doc) =>
        doc.title.toLowerCase().includes(needle) ||
        doc.url.toLowerCase().includes(needle) ||
        doc.note.toLowerCase().includes(needle),
    );
  }

  // `_id` is a tiebreaker: ObjectIds are monotonically increasing (timestamp +
  // counter), so it disambiguates documents created within the same
  // millisecond, when `createdAt` strings alone would compare equal.
  switch (opts.sort) {
    case "oldest":
      items.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a._id.localeCompare(b._id));
      break;
    case "title":
      items.sort((a, b) => a.title.localeCompare(b.title));
      break;
    default:
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b._id.localeCompare(a._id));
  }

  const total = items.length;
  const skip = opts.skip ?? 0;
  const limit = opts.limit ?? 50;
  return { items: items.slice(skip, skip + limit), total };
}

/** Reads a bookmark and enforces ownership. Throws `{ status: 404 }` otherwise. */
export function getOwnedBookmark(bookmarks: Collection, id: string, ownerId: string): BookmarkDoc {
  const doc = bookmarks.findOne({ _id: id }) as BookmarkDoc | null;
  if (!doc || doc.ownerId !== ownerId) {
    throw { status: 404, message: `bookmark ${id} not found` };
  }
  return doc;
}

export function createBookmark(
  bookmarks: Collection,
  ownerId: string,
  input: BookmarkInput,
): BookmarkDoc {
  const now = new Date().toISOString();
  const doc = { ownerId, ...input, createdAt: now, updatedAt: now };
  const { insertedId } = bookmarks.insertOne(doc);
  return { _id: insertedId, ...doc };
}

export function updateBookmark(
  bookmarks: Collection,
  id: string,
  ownerId: string,
  patch: BookmarkPatch,
): BookmarkDoc {
  getOwnedBookmark(bookmarks, id, ownerId); // existence + ownership check
  const set: Record<string, string | string[]> = { ...patch, updatedAt: new Date().toISOString() };
  bookmarks.updateOne(id, { $set: set });
  return bookmarks.findOne({ _id: id }) as unknown as BookmarkDoc;
}

export function deleteBookmark(bookmarks: Collection, id: string, ownerId: string): void {
  getOwnedBookmark(bookmarks, id, ownerId); // existence + ownership check
  bookmarks.deleteOne(id);
}
