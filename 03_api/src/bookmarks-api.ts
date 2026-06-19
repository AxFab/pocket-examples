/**
 * `apiBuilder` service definition mounted at `/api` (see `server.ts`).
 *
 * The service has no per-request or per-key state, so `scope`/`data`/`setup`
 * are all omitted — it builds once as a singleton. Each handler:
 * 1. Reads the caller off `ctx.user` via `requireUser()` — `apiBuilder` has
 *    no built-in auth guard, so this is the chokepoint for "must be logged
 *    in" on every route below (see `auth.ts`).
 * 2. Checks the relevant permission by hand (`read`/`write`).
 * 3. Delegates the actual pocket-db read/write to `bookmarks-service.ts`,
 *    which already enforces per-owner scoping/ownership.
 *
 * `describe()` attaches OpenAPI metadata consumed by `ApiRouter.specHandler`
 * in `server.ts`.
 */
import { describe, type ApiContext, type ServiceDefinition } from "expediate";
import type { Collection } from "@axfab/pocket-db";
import { requirePermissions, requireUser } from "./auth.js";
import {
  createBookmark,
  deleteBookmark,
  getOwnedBookmark,
  listBookmarks,
  updateBookmark,
  type ListOptions,
} from "./bookmarks-service.js";
import { validateBookmarkInput, validateBookmarkPatch } from "./validation.js";

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseListOptions(ctx: ApiContext): ListOptions {
  const url = ctx.query.url;
  const sort = firstString(url.sort);
  const skip = firstString(url.skip);
  const limit = firstString(url.limit);
  return {
    tag: firstString(url.tag),
    q: firstString(url.q),
    sort: sort === "oldest" || sort === "title" ? sort : "newest",
    skip: skip !== undefined ? Number(skip) : undefined,
    limit: limit !== undefined ? Number(limit) : undefined,
  };
}

const bookmarkSchema = {
  type: "object",
  properties: {
    _id: { type: "string" },
    ownerId: { type: "string" },
    url: { type: "string" },
    title: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    note: { type: "string" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
} as const;

export function createBookmarksApi(bookmarks: Collection): ServiceDefinition {
  return {
    openapi: {
      tag: "bookmarks",
      tagDescription: "Per-user saved links",
      schemas: { Bookmark: bookmarkSchema },
    },
    GET: {
      "/bookmarks": describe(
        function (ctx: ApiContext) {
          const user = requireUser(ctx);
          requirePermissions(user, "read");
          return listBookmarks(bookmarks, user.sub, parseListOptions(ctx));
        },
        {
          summary: "List the caller's bookmarks",
          tags: ["bookmarks"],
          parameters: [
            { name: "tag", in: "query", schema: { type: "string" } },
            {
              name: "q",
              in: "query",
              description: "Substring search across title/url/note",
              schema: { type: "string" },
            },
            { name: "sort", in: "query", schema: { type: "string", enum: ["newest", "oldest", "title"] } },
            { name: "skip", in: "query", schema: { type: "integer" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
          ],
          responses: {
            "200": {
              description: "Matching bookmarks",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      items: { type: "array", items: { $ref: "#/components/schemas/Bookmark" } },
                      total: { type: "integer" },
                    },
                  },
                },
              },
            },
            "401": { description: "Missing or invalid bearer token" },
          },
        },
      ),
      "/bookmarks/:id": describe(
        function (ctx: ApiContext) {
          const user = requireUser(ctx);
          requirePermissions(user, "read");
          return getOwnedBookmark(bookmarks, ctx.query.route.id, user.sub);
        },
        {
          summary: "Get a single bookmark by id",
          tags: ["bookmarks"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "The bookmark",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Bookmark" } } },
            },
            "404": { description: "Not found, or not owned by the caller" },
          },
        },
      ),
    },
    POST: {
      "/bookmarks": describe(
        function (ctx: ApiContext, body?: unknown) {
          const user = requireUser(ctx);
          requirePermissions(user, "write");
          return createBookmark(bookmarks, user.sub, validateBookmarkInput(body));
        },
        {
          summary: "Save a new bookmark",
          tags: ["bookmarks"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url"],
                  properties: {
                    url: { type: "string" },
                    title: { type: "string" },
                    tags: { type: "array", items: { type: "string" } },
                    note: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "The created bookmark",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Bookmark" } } },
            },
            "400": { description: "Invalid input" },
          },
        },
      ),
    },
    PUT: {
      "/bookmarks/:id": describe(
        function (ctx: ApiContext, body?: unknown) {
          const user = requireUser(ctx);
          requirePermissions(user, "write");
          return updateBookmark(bookmarks, ctx.query.route.id, user.sub, validateBookmarkPatch(body));
        },
        {
          summary: "Update a bookmark's editable fields",
          tags: ["bookmarks"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "The updated bookmark",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Bookmark" } } },
            },
            "400": { description: "Invalid input" },
            "404": { description: "Not found, or not owned by the caller" },
          },
        },
      ),
    },
    DELETE: {
      "/bookmarks/:id": describe(
        function (ctx: ApiContext) {
          const user = requireUser(ctx);
          requirePermissions(user, "write");
          deleteBookmark(bookmarks, ctx.query.route.id, user.sub);
          return undefined; // falsy -> apiBuilder responds 201 No Content
        },
        {
          summary: "Delete a bookmark",
          tags: ["bookmarks"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "201": { description: "Deleted" },
            "404": { description: "Not found, or not owned by the caller" },
          },
        },
      ),
    },
  };
}
