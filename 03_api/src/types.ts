/**
 * Domain document shapes stored in pocket-db.
 *
 * pocket-db's `Collection`/`Cursor` methods are typed against
 * `Record<string, unknown>` (see the published `@axfab/pocket-db` types) —
 * there is no generic `Collection<T>`. These interfaces describe the shape
 * we *expect* documents to have once read back, used purely on the
 * application side via `as` casts after `find`/`findOne`.
 */

export interface UserDoc {
  _id: string;
  username: string;
  /** `salt:hash` hex pair — see `password.ts`. Never sent to clients. */
  passwordHash: string;
  roles: string[];
  permissions: string[];
  createdAt: string;
}

/** `UserDoc` with sensitive fields stripped, safe to return from an API response. */
export interface PublicUser {
  id: string;
  username: string;
  roles: string[];
  permissions: string[];
  createdAt: string;
}

export function toPublicUser(doc: UserDoc): PublicUser {
  return {
    id: doc._id,
    username: doc.username,
    roles: doc.roles,
    permissions: doc.permissions,
    createdAt: doc.createdAt,
  };
}

export interface BookmarkDoc {
  _id: string;
  /** Username of the owning user — indexed (`StringIndex`) for per-user listing. */
  ownerId: string;
  url: string;
  title: string;
  tags: string[];
  note: string;
  createdAt: string;
  updatedAt: string;
}
