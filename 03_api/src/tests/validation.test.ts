import { test } from "node:test";
import assert from "node:assert/strict";
import { validateBookmarkInput, validateBookmarkPatch } from "../validation.js";

test("validateBookmarkInput accepts a valid url and defaults title to the url", () => {
  const input = validateBookmarkInput({ url: "https://example.com/post" });
  assert.equal(input.url, "https://example.com/post");
  assert.equal(input.title, "https://example.com/post");
  assert.deepEqual(input.tags, []);
  assert.equal(input.note, "");
});

test("validateBookmarkInput keeps an explicit title, tags, and note", () => {
  const input = validateBookmarkInput({
    url: "https://example.com",
    title: "Example",
    tags: ["news", "tech"],
    note: "read later",
  });
  assert.equal(input.title, "Example");
  assert.deepEqual(input.tags, ["news", "tech"]);
  assert.equal(input.note, "read later");
});

test("validateBookmarkInput rejects a missing or invalid url", () => {
  assert.throws(
    () => validateBookmarkInput({}),
    (err) => (err as { message?: string }).message === "url is required",
  );
  assert.throws(() => validateBookmarkInput({ url: "not a url" }));
});

test("validateBookmarkInput rejects non-string tags", () => {
  assert.throws(() => validateBookmarkInput({ url: "https://example.com", tags: ["ok", 5] }));
});

test("validateBookmarkPatch requires at least one field", () => {
  assert.throws(() => validateBookmarkPatch({}));
});

test("validateBookmarkPatch accepts a partial update", () => {
  const patch = validateBookmarkPatch({ title: "New title" });
  assert.deepEqual(patch, { title: "New title" });
});

test("validateBookmarkPatch rejects an empty title", () => {
  assert.throws(() => validateBookmarkPatch({ title: "" }));
});
