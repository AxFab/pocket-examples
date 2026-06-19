import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initDatabase, type ApiDatabase } from "../db.js";
import { findUserByUsername, registerUser, RegistrationError } from "../users-service.js";
import { verifyPassword } from "../password.js";

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

test("registerUser hashes the password and assigns default roles/permissions", () => {
  const user = registerUser(database.users, { username: "alice", password: "alice-password" });
  assert.equal(user.username, "alice");
  assert.deepEqual(user.roles, ["user"]);
  assert.deepEqual(user.permissions, ["read", "write"]);
  assert.equal(verifyPassword("alice-password", user.passwordHash), true);
});

test("registerUser rejects an invalid username", () => {
  assert.throws(
    () => registerUser(database.users, { username: "a", password: "password123" }),
    RegistrationError,
  );
});

test("registerUser rejects a short password", () => {
  assert.throws(
    () => registerUser(database.users, { username: "bob", password: "short" }),
    RegistrationError,
  );
});

test("registerUser rejects a username that is already taken", () => {
  registerUser(database.users, { username: "carol", password: "password123" });
  assert.throws(
    () => registerUser(database.users, { username: "carol", password: "password456" }),
    RegistrationError,
  );
});

test("findUserByUsername returns null when no account exists", () => {
  assert.equal(findUserByUsername(database.users, "nobody"), null);
});

test("the demo admin account is seeded on first open", () => {
  const admin = findUserByUsername(database.users, "admin");
  assert.ok(admin);
  assert.deepEqual(admin?.roles, ["admin"]);
});
