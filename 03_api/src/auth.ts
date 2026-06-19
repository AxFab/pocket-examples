/**
 * JWT authentication wiring for the bookmarks API.
 *
 * Builds an `expediate` JWT plugin backed by the `users` collection: it
 * looks up accounts with `fetchUser`/`isPasswordValid` instead of the
 * package's built-in demo `userDatabase`, and stores access-token claims
 * (`sub`, `roles`, `permissions`) via `payload()`.
 *
 * `apiBuilder` has no built-in auth/guard mechanism (see README) — the
 * `authenticate` middleware below is mounted ahead of every route that reads
 * `ctx.user`, and `requireRole`/`requirePermission` are applied directly on
 * plain router routes (see `admin-routes.ts`). Resource-level checks (e.g.
 * "is this bookmark mine?") are done by hand inside service methods — see
 * `requireUser()`/`requirePermissions()` below and `bookmarks-api.ts`.
 */
import {
  createJwtPlugin,
  createMapTokenStore,
  type ApiContext,
  type JwtPlugin,
  type TokenPayload,
  type UserRecord,
} from "expediate";
import type { Collection } from "@axfab/pocket-db";
import { verifyPassword } from "./password.js";
import { findUserByUsername } from "./users-service.js";
import type { UserDoc } from "./types.js";

function toUserRecord(doc: UserDoc): UserRecord {
  return {
    id: doc._id,
    username: doc.username,
    passwordHash: doc.passwordHash,
    roles: doc.roles,
    permissions: doc.permissions,
  };
}

export interface AuthOptions {
  accessTokenSecret: string;
  refreshTokenSecret: string;
}

export function createAuth(users: Collection, opts: AuthOptions): JwtPlugin {
  return createJwtPlugin({
    accessTokenSecret: opts.accessTokenSecret,
    refreshTokenSecret: opts.refreshTokenSecret,
    // Enables refresh-token issuance/rotation via POST /auth/refresh.
    refreshTokenStore: createMapTokenStore(),
    fetchUser: (sub) => {
      const doc = findUserByUsername(users, sub);
      return doc ? toUserRecord(doc) : undefined;
    },
    isPasswordValid: (user, password) => verifyPassword(password, user.passwordHash ?? ""),
    payload: (user) => ({
      sub: user.username,
      roles: user.roles ?? [],
      permissions: user.permissions ?? [],
    }),
  });
}

/**
 * Reads the authenticated caller's token payload out of an `ApiContext`, or
 * throws a 401 when no `authenticate` middleware ran upstream (or the bearer
 * token was missing/invalid). `apiBuilder` has no built-in guard for this —
 * every protected service method calls this helper itself.
 */
export function requireUser(ctx: ApiContext): TokenPayload {
  if (!ctx.user) {
    throw { status: 401, message: "Authentication required" };
  }
  return ctx.user as TokenPayload;
}

/** Throws `{ status: 403 }` unless `user` carries every permission in `required`. */
export function requirePermissions(user: TokenPayload, ...required: string[]): void {
  const granted = user.permissions ?? [];
  const missing = required.filter((permission) => !granted.includes(permission));
  if (missing.length > 0) {
    throw { status: 403, message: `Missing permission(s): ${missing.join(", ")}` };
  }
}
