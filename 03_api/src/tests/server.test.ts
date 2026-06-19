/**
 * End-to-end HTTP test: starts the real router on an OS-assigned port and
 * drives it with `fetch`, covering registration, login, ownership
 * enforcement, the admin role-gated route, and the generated OpenAPI doc.
 */
import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { initDatabase, SEED_ADMIN_PASSWORD, SEED_ADMIN_USERNAME, type ApiDatabase } from "../db.js";
import { createServer } from "../server.js";

let dir: string;
let database: ApiDatabase;
let baseUrl: string;
let stop: () => Promise<void>;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "bookmarks-api-"));
  database = initDatabase(path.join(dir, "bookmarks.pdb"));
  const app = createServer(database, {
    accessTokenSecret: "test-access-secret",
    refreshTokenSecret: "test-refresh-secret",
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  stop = async () => {
    await app.shutdown(1000);
  };
});

afterEach(async () => {
  await stop();
  database.db.close();
  rmSync(dir, { recursive: true, force: true });
});

async function register(username: string, password: string) {
  return fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { accessToken: string };
  return body.accessToken;
}

function authHeaders(token: string) {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

test("register then login issues a bearer token", async () => {
  const res = await register("alice", "alice-password");
  assert.equal(res.status, 201);
  const token = await login("alice", "alice-password");
  assert.ok(token.length > 0);
});

test("registering a taken username is rejected", async () => {
  await register("alice", "alice-password");
  const res = await register("alice", "another-password");
  assert.equal(res.status, 409);
});

test("/api/bookmarks requires authentication", async () => {
  const res = await fetch(`${baseUrl}/api/bookmarks`);
  assert.equal(res.status, 401);
});

test("a user can create, list, fetch, update, and delete their own bookmark", async () => {
  await register("alice", "alice-password");
  const token = await login("alice", "alice-password");

  const created = await fetch(`${baseUrl}/api/bookmarks`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ url: "https://example.com", title: "Example", tags: ["demo"] }),
  });
  assert.equal(created.status, 200);
  const bookmark = (await created.json()) as { _id: string };

  const listed = await fetch(`${baseUrl}/api/bookmarks`, { headers: authHeaders(token) });
  const list = (await listed.json()) as { items: unknown[]; total: number };
  assert.equal(list.total, 1);

  const fetched = await fetch(`${baseUrl}/api/bookmarks/${bookmark._id}`, { headers: authHeaders(token) });
  assert.equal(fetched.status, 200);

  const updated = await fetch(`${baseUrl}/api/bookmarks/${bookmark._id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ title: "Updated" }),
  });
  assert.equal(updated.status, 200);
  assert.equal(((await updated.json()) as { title: string }).title, "Updated");

  const deleted = await fetch(`${baseUrl}/api/bookmarks/${bookmark._id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  assert.equal(deleted.status, 201);
});

test("a user cannot read or modify another user's bookmark", async () => {
  await register("alice", "alice-password");
  await register("bob", "bob-password");
  const aliceToken = await login("alice", "alice-password");
  const bobToken = await login("bob", "bob-password");

  const created = await fetch(`${baseUrl}/api/bookmarks`, {
    method: "POST",
    headers: authHeaders(aliceToken),
    body: JSON.stringify({ url: "https://example.com" }),
  });
  const bookmark = (await created.json()) as { _id: string };

  const asBob = await fetch(`${baseUrl}/api/bookmarks/${bookmark._id}`, { headers: authHeaders(bobToken) });
  assert.equal(asBob.status, 404);
});

test("only an admin can reach /admin/users", async () => {
  await register("alice", "alice-password");
  const aliceToken = await login("alice", "alice-password");

  const asAlice = await fetch(`${baseUrl}/admin/users`, { headers: authHeaders(aliceToken) });
  assert.equal(asAlice.status, 403);

  const adminToken = await login(SEED_ADMIN_USERNAME, SEED_ADMIN_PASSWORD);
  const asAdmin = await fetch(`${baseUrl}/admin/users`, { headers: authHeaders(adminToken) });
  assert.equal(asAdmin.status, 200);
  const body = (await asAdmin.json()) as { items: Array<{ username: string; passwordHash?: string }> };
  assert.ok(body.items.some((u) => u.username === "alice"));
  assert.ok(body.items.every((u) => u.passwordHash === undefined));
});

test("/openapi.json describes the bookmarks routes", async () => {
  const res = await fetch(`${baseUrl}/openapi.json`);
  assert.equal(res.status, 200);
  const spec = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
  assert.equal(spec.openapi, "3.1.0");
  assert.ok(spec.paths["/api/bookmarks"]);
  assert.ok(spec.paths["/api/bookmarks/{id}"]);
});
