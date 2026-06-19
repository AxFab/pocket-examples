/**
 * Database bootstrap for the bookmarks API.
 *
 * Opens a single `.pdb` file holding two collections:
 * - `users`     — registered accounts. `StringIndex` on `username` so login
 *   and registration lookups don't scan every account.
 * - `bookmarks` — one document per saved link. `StringIndex` on `ownerId` so
 *   a user's bookmark listing never scans another user's documents.
 *
 * `createIndex` is idempotent for an unchanged field/type pair, so calling it
 * on every `initDatabase()` call (i.e. every process start) is safe and cheap.
 */
import { pocketDb, type Database, type Collection } from "@axfab/pocket-db";
import { hashPassword } from "./password.js";

export interface ApiDatabase {
  db: Database;
  users: Collection;
  bookmarks: Collection;
}

/** Demo admin account seeded on first startup. Credentials are intentionally public — see README. */
export const SEED_ADMIN_USERNAME = "admin";
export const SEED_ADMIN_PASSWORD = "admin123";

export function initDatabase(dbPath: string): ApiDatabase {
  const db = pocketDb(dbPath);
  const users = db.collection("users");
  const bookmarks = db.collection("bookmarks");

  users.createIndex("username", { type: "string" });
  bookmarks.createIndex("ownerId", { type: "string" });

  seedAdmin(users);

  return { db, users, bookmarks };
}

/**
 * Creates a demo admin account (`admin` / `admin123`) the first time the
 * database is opened, so the `requireRole("admin")` route in this example
 * has someone to authenticate as out of the box. Plain `/auth/register`
 * never produces an admin, by design.
 *
 * This seeding step is a convenience for a runnable example, not a
 * production pattern — a real app would provision admins out of band.
 */
function seedAdmin(users: Collection): void {
  if (users.findOne({ username: SEED_ADMIN_USERNAME })) return;

  users.insertOne({
    username: SEED_ADMIN_USERNAME,
    passwordHash: hashPassword(SEED_ADMIN_PASSWORD),
    roles: ["admin"],
    permissions: ["read", "write", "admin"],
    createdAt: new Date().toISOString(),
  });
}
