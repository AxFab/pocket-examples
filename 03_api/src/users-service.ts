/**
 * User account reads/writes against the `users` collection.
 *
 * Kept HTTP-agnostic and unit-tested directly (see
 * `tests/users-service.test.ts`); `auth.ts` and the `/auth/register` route
 * call into this module rather than touching the `Collection` themselves.
 */
import type { Collection } from "@axfab/pocket-db";
import { hashPassword } from "./password.js";
import type { UserDoc } from "./types.js";

/** Looks up a user by username — hits the `username` `StringIndex`. */
export function findUserByUsername(users: Collection, username: string): UserDoc | null {
  return (users.findOne({ username }) as UserDoc | null) ?? null;
}

export interface RegisterInput {
  username: string;
  password: string;
}

/** Thrown when registration is attempted with invalid input or a taken username. */
export class RegistrationError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "RegistrationError";
    this.status = status;
  }
}

const USERNAME_PATTERN = /^[a-z0-9_-]{3,32}$/i;

/**
 * Registers a new user with `roles: ["user"]` / `permissions: ["read", "write"]`.
 * Plain registration can never produce an admin — see `db.ts`'s seeded admin.
 */
export function registerUser(users: Collection, input: RegisterInput): UserDoc {
  const username = input.username?.trim() ?? "";
  if (!USERNAME_PATTERN.test(username)) {
    throw new RegistrationError(
      400,
      "username must be 3-32 characters: letters, digits, '_' or '-'",
    );
  }
  if (!input.password || input.password.length < 8) {
    throw new RegistrationError(400, "password must be at least 8 characters");
  }
  if (findUserByUsername(users, username)) {
    throw new RegistrationError(409, `username "${username}" is already taken`);
  }

  const doc = {
    username,
    passwordHash: hashPassword(input.password),
    roles: ["user"],
    permissions: ["read", "write"],
    createdAt: new Date().toISOString(),
  };
  const { insertedId } = users.insertOne(doc);
  return { _id: insertedId, ...doc };
}
