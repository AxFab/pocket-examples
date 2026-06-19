/**
 * Manual request-body validation for bookmark writes.
 *
 * `apiBuilder` has no built-in schema/validation mechanism (see README) —
 * every service method validates its own body and throws `{ status: 400,
 * message }`, which `apiBuilder` translates into an HTTP 400 response.
 */

export interface BookmarkInput {
  url: string;
  title: string;
  tags: string[];
  note: string;
}

export interface BookmarkPatch {
  url?: string;
  title?: string;
  tags?: string[];
  note?: string;
}

function assertValidUrl(url: unknown): string {
  if (typeof url !== "string" || url.trim().length === 0) {
    throw { status: 400, message: "url is required" };
  }
  try {
    void new URL(url);
  } catch {
    throw { status: 400, message: `url is not a valid absolute URL: ${url}` };
  }
  return url;
}

function assertValidTags(tags: unknown): string[] {
  if (tags === undefined) return [];
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === "string")) {
    throw { status: 400, message: "tags must be an array of strings" };
  }
  return tags;
}

/** Validates a bookmark creation body. `title` defaults to `url` when absent. */
export function validateBookmarkInput(body: unknown): BookmarkInput {
  const input = (body ?? {}) as Record<string, unknown>;
  const url = assertValidUrl(input.url);
  const title =
    typeof input.title === "string" && input.title.trim().length > 0 ? input.title : url;
  const tags = assertValidTags(input.tags);
  const note = typeof input.note === "string" ? input.note : "";
  return { url, title, tags, note };
}

/** Validates a partial bookmark update body. Requires at least one field. */
export function validateBookmarkPatch(body: unknown): BookmarkPatch {
  const input = (body ?? {}) as Record<string, unknown>;
  const patch: BookmarkPatch = {};

  if (input.url !== undefined) patch.url = assertValidUrl(input.url);
  if (input.tags !== undefined) patch.tags = assertValidTags(input.tags);
  if (input.title !== undefined) {
    if (typeof input.title !== "string" || input.title.trim().length === 0) {
      throw { status: 400, message: "title must be a non-empty string" };
    }
    patch.title = input.title;
  }
  if (input.note !== undefined) {
    if (typeof input.note !== "string") {
      throw { status: 400, message: "note must be a string" };
    }
    patch.note = input.note;
  }

  if (Object.keys(patch).length === 0) {
    throw { status: 400, message: "at least one field must be provided" };
  }
  return patch;
}
