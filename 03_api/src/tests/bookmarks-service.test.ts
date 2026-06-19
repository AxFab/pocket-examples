import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initDatabase, type ApiDatabase } from "../db.js";
import {
  createBookmark,
  deleteBookmark,
  getOwnedBookmark,
  listBookmarks,
  updateBookmark,
} from "../bookmarks-service.js";
import { validateBookmarkInput } from "../validation.js";

let dir: string;
let database: ApiDatabase;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "bookmarks-api-"));
  database = initDatabase(path.join(dir, "bookmarks.pdb"));
});

afterEach(() => {
  database.db.close();
  rmSync(dir, { recursive: true, force: true });
});

function input(url: string, extra: Partial<{ title: string; tags: string[]; note: string }> = {}) {
  return validateBookmarkInput({ url, ...extra });
}

test("createBookmark stores ownerId and timestamps", () => {
  const bookmark = createBookmark(database.bookmarks, "alice", input("https://example.com"));
  assert.equal(bookmark.ownerId, "alice");
  assert.equal(typeof bookmark.createdAt, "string");
  assert.equal(bookmark.createdAt, bookmark.updatedAt);
});

test("listBookmarks only returns the caller's own bookmarks", () => {
  createBookmark(database.bookmarks, "alice", input("https://alice.example.com"));
  createBookmark(database.bookmarks, "bob", input("https://bob.example.com"));

  const { items, total } = listBookmarks(database.bookmarks, "alice");
  assert.equal(total, 1);
  assert.equal(items[0]?.url, "https://alice.example.com");
});

test("listBookmarks filters by tag and free-text search", () => {
  createBookmark(database.bookmarks, "alice", input("https://a.example.com", { title: "Cooking tips", tags: ["food"] }));
  createBookmark(database.bookmarks, "alice", input("https://b.example.com", { title: "Tech news", tags: ["tech"] }));

  assert.equal(listBookmarks(database.bookmarks, "alice", { tag: "food" }).total, 1);
  assert.equal(listBookmarks(database.bookmarks, "alice", { q: "tech" }).total, 1);
  assert.equal(listBookmarks(database.bookmarks, "alice", { q: "nonexistent" }).total, 0);
});

test("listBookmarks sorts newest first by default and supports oldest/title", () => {
  const first = createBookmark(database.bookmarks, "alice", input("https://1.example.com", { title: "B" }));
  const second = createBookmark(database.bookmarks, "alice", input("https://2.example.com", { title: "A" }));

  const newest = listBookmarks(database.bookmarks, "alice");
  assert.equal(newest.items[0]?._id, second._id);

  const oldest = listBookmarks(database.bookmarks, "alice", { sort: "oldest" });
  assert.equal(oldest.items[0]?._id, first._id);

  const byTitle = listBookmarks(database.bookmarks, "alice", { sort: "title" });
  assert.equal(byTitle.items[0]?.title, "A");
});

test("listBookmarks paginates with skip/limit", () => {
  for (let i = 0; i < 5; i++) {
    createBookmark(database.bookmarks, "alice", input(`https://${i}.example.com`));
  }
  const page = listBookmarks(database.bookmarks, "alice", { skip: 2, limit: 2 });
  assert.equal(page.items.length, 2);
  assert.equal(page.total, 5);
});

test("getOwnedBookmark throws for a foreign owner or a missing id", () => {
  const bookmark = createBookmark(database.bookmarks, "alice", input("https://example.com"));

  try {
    getOwnedBookmark(database.bookmarks, bookmark._id, "bob");
    assert.fail("expected getOwnedBookmark to throw for a non-owner");
  } catch (err) {
    assert.equal((err as { status?: number }).status, 404);
  }

  assert.throws(() => getOwnedBookmark(database.bookmarks, "0".repeat(24), "alice"));
});

test("updateBookmark applies a patch and refreshes updatedAt", () => {
  const bookmark = createBookmark(database.bookmarks, "alice", input("https://example.com", { title: "Old" }));
  const updated = updateBookmark(database.bookmarks, bookmark._id, "alice", { title: "New" });
  assert.equal(updated.title, "New");
  assert.equal(updated.createdAt, bookmark.createdAt);
  assert.equal(typeof updated.updatedAt, "string");
});

test("updateBookmark rejects updates from a non-owner", () => {
  const bookmark = createBookmark(database.bookmarks, "alice", input("https://example.com"));
  assert.throws(() => updateBookmark(database.bookmarks, bookmark._id, "bob", { title: "Hijack" }));
});

test("deleteBookmark removes the document and rejects deleting another owner's bookmark", () => {
  const bookmark = createBookmark(database.bookmarks, "alice", input("https://example.com"));
  assert.throws(() => deleteBookmark(database.bookmarks, bookmark._id, "bob"));

  deleteBookmark(database.bookmarks, bookmark._id, "alice");
  assert.equal(listBookmarks(database.bookmarks, "alice").total, 0);
});
