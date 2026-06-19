# 03_api — bookmarks

A multi-user bookmarks API: JWT-authenticated CRUD over personal links, backed
by [`@axfab/pocket-db`](https://github.com/AxFab/pocket-db) for storage and
[`expediate`](https://github.com/AxFab/expediate)'s `apiBuilder` for HTTP/OpenAPI
wiring. One process, one `.pdb` file, no external auth or database service.

## What it showcases

**pocket-db**
- **Indexed multi-tenancy** — `ownerId` (StringIndex on `bookmarks`) and `username`
  (StringIndex on `users`) turn "list my bookmarks" / "find this account" into
  indexed lookups instead of full scans.
- **Update operators** — `bookmarks-service.ts` uses `$set` for patches.
- **Residual / in-memory filtering** — tag filtering and free-text search
  (`?tag=`, `?q=`) run in JS after the indexed `ownerId` query, since pocket-db
  has no array-containment or text-search operator by design.
- **`sort()`/`skip()`/`limit()`** — `?sort=newest|oldest|title` plus pagination
  on the bookmarks list cursor.
- **`createIndex`/`findOne`/`insertOne`/`updateOne`/`deleteOne`** — the full
  one-collection CRUD surface, exercised through `users-service.ts` and
  `bookmarks-service.ts`.

**expediate**
- **`apiBuilder`** — `bookmarks-api.ts` defines the `/bookmarks` CRUD routes as
  a declarative `ServiceDefinition` (`GET`/`POST`/`PUT`/`DELETE` route maps),
  mounted at `/api`.
- **JWT plugin (`createJwtPlugin`)** — `auth.ts` wires `fetchUser`/`isPasswordValid`/`payload`
  to the `users` collection, with a `refreshTokenStore` for `/auth/refresh`.
- **Two auth integration styles, side by side** — `apiBuilder` has no built-in
  guard mechanism, so bookmark routes call `requireUser()`/`requirePermissions()`
  by hand (see `auth.ts`); the plain-router `/admin/users` route instead uses
  the documented `...auth.requireRole('admin')` spread directly on `app.get(...)`.
- **`describe()` + `specHandler()`** — every bookmarks route is annotated with
  OpenAPI metadata, served at `/openapi.json` and `/openapi.yaml`.

## Run it

```bash
npm install
npm run build
npm start
```

The server listens on `http://localhost:3000` by default. A demo admin account
(`admin` / `admin123`) is seeded on first open — see `src/db.ts`.

```bash
# register + log in
curl -s -X POST localhost:3000/auth/register -H 'content-type: application/json' \
  -d '{"username":"alice","password":"alice-password"}'
TOKEN=$(curl -s -X POST localhost:3000/auth/login -H 'content-type: application/json' \
  -d '{"username":"alice","password":"alice-password"}' | node -p 'JSON.parse(require("fs").readFileSync(0)).accessToken')

# create and list bookmarks
curl -s -X POST localhost:3000/api/bookmarks -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"url":"https://example.com","tags":["demo"]}'
curl -s localhost:3000/api/bookmarks -H "authorization: Bearer $TOKEN"
```

Environment variables (all optional, see `src/index.ts`): `BOOKMARKS_DB` (default
`./bookmarks.pdb`), `PORT` (default `3000`), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`.

## Endpoints

```
POST   /auth/register          { username, password } -> 201
POST   /auth/login             { username, password } -> { accessToken, refreshToken? }
POST   /auth/refresh           { refreshToken } -> { accessToken }
POST   /auth/logout

GET    /api/bookmarks          ?tag=&q=&sort=newest|oldest|title&skip=&limit=
GET    /api/bookmarks/:id
POST   /api/bookmarks          { url, title?, tags?, note? }
PUT    /api/bookmarks/:id      { url?, title?, tags?, note? } (at least one field)
DELETE /api/bookmarks/:id

GET    /admin/users            requires the "admin" role

GET    /openapi.json
GET    /openapi.yaml
```

All `/api/*` and `/admin/*` routes require `Authorization: Bearer <accessToken>`.
Bookmarks are scoped to their owner: reading or modifying another user's
bookmark returns `404` (not `403`), so the API never reveals whether a given id
belongs to someone else.

## Layout

```
src/db.ts                database + index bootstrap, demo admin seed
src/types.ts              document shapes (UserDoc, PublicUser, BookmarkDoc)
src/password.ts            scrypt password hashing (see note below)
src/validation.ts          request body validation for bookmark input/patch
src/users-service.ts       registration + user lookup (unit-tested)
src/bookmarks-service.ts   all pocket-db reads/writes for bookmarks (unit-tested)
src/auth.ts                JWT plugin wiring + requireUser()/requirePermissions()
src/bookmarks-api.ts       apiBuilder ServiceDefinition for /api/bookmarks
src/admin-routes.ts        plain-router /admin/users route (requireRole pattern)
src/server.ts              composes the full expediate Router
src/index.ts               process entry point (listen + graceful shutdown)
src/tests/                 node:test suites, including an HTTP-level integration test
```

## Test

```bash
npm test
```

`src/tests/server.test.ts` starts the real router on an OS-assigned port and
drives it with `fetch`, covering registration, ownership enforcement, the
admin role gate, and the generated OpenAPI document. The other test files
exercise each module directly (no HTTP).

## A note on password hashing

`expediate` does export a `hashPassword` helper internally, but it isn't part
of the package's public entry point, so it isn't importable from application
code. `src/password.ts` implements the same idea with Node's built-in
`crypto.scryptSync` (random per-password salt, `salt:hash` hex encoding). It's
adequate for this demo but not a substitute for a vetted, cost-tunable KDF like
bcrypt or argon2 in a real deployment.

## Developing against local pocket-db sources

This example installs `@axfab/pocket-db` from npm. If this folder lives inside
the main repository, point `package.json` at `"@axfab/pocket-db": "file:../.."`
instead and re-run `npm install`.
