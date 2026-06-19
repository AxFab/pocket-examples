/**
 * Password hashing for this example.
 *
 * `expediate`'s own `hashPassword` helper lives inside its JWT module and is
 * not part of the package's public `"."` export (it isn't re-exported from
 * `expediate`'s index, and the package's `exports` map blocks deep imports
 * like `expediate/dist/jwt-auth.js`), so this example brings its own:
 * `crypto.scryptSync` with a random per-password salt, stored as a
 * `salt:hash` hex pair.
 *
 * This is adequate for a runnable demo but is **not** a production-grade
 * choice on its own — use a vetted bcrypt/argon2 library with tuned cost
 * parameters in a real application.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SALT_BYTES = 16;
const KEY_LENGTH = 64;

/** Hashes `password` and returns a `salt:hash` hex string safe to persist. */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(password, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

/** Verifies `password` against a `salt:hash` string previously produced by `hashPassword`. */
export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
