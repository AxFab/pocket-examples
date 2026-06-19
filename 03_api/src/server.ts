/**
 * HTTP wiring: composes a single `expediate` router from
 * - global middleware (`logger`, `cors`, `json`),
 * - the JWT auth routes (`/auth/login`, `/auth/refresh`, `/auth/logout`)
 *   plus a hand-rolled `/auth/register`,
 * - `auth.authenticate`, mounted once, ahead of every route that should see
 *   `req.user`/`ctx.user`,
 * - the bookmarks CRUD API (`apiBuilder`, mounted at `/api`),
 * - the admin route (`admin-routes.ts`),
 * - and the generated OpenAPI document.
 *
 * Returns the `Router` unstarted — `index.ts` calls `.listen()`.
 */
import { apiBuilder, cors, createRouter, json, logger, type Router } from "expediate";
import type { ApiDatabase } from "./db.js";
import { createAuth } from "./auth.js";
import { createBookmarksApi } from "./bookmarks-api.js";
import { registerAdminRoutes } from "./admin-routes.js";
import { RegistrationError, registerUser } from "./users-service.js";

export interface ServerOptions {
  accessTokenSecret: string;
  refreshTokenSecret: string;
}

export function createServer(database: ApiDatabase, opts: ServerOptions): Router {
  const { users, bookmarks } = database;
  const auth = createAuth(users, opts);
  const app = createRouter();

  app.use(logger({ track: false }));
  app.use(cors());
  app.use(json());

  app.post("/auth/register", (req, res) => {
    try {
      const body = (req.body ?? {}) as { username?: string; password?: string };
      const user = registerUser(users, {
        username: body.username ?? "",
        password: body.password ?? "",
      });
      res.status(201).json({ id: user._id, username: user.username });
    } catch (err) {
      if (err instanceof RegistrationError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      throw err;
    }
  });
  app.post("/auth/login", auth.login);
  app.post("/auth/refresh", auth.refresh);
  app.post("/auth/logout", auth.logout);

  // Populates req.user/ctx.user for every route registered after this line.
  // Never rejects by itself — see auth.requireUser()/requireRole() for that.
  app.use(auth.authenticate);

  const bookmarksApi = apiBuilder(createBookmarksApi(bookmarks));
  app.use("/api", bookmarksApi);

  registerAdminRoutes(app, users, auth);

  const specOptions = {
    title: "Bookmarks API",
    version: "1.0.0",
    basePath: "/api",
    description:
      "Example multi-user bookmarks API backed by pocket-db, showcasing expediate's apiBuilder and JWT plugin.",
  };
  app.get("/openapi.json", bookmarksApi.specHandler(specOptions));
  app.get("/openapi.yaml", bookmarksApi.specHandler(specOptions, "yaml"));

  app.onError((err, _req, res) => {
    const status = typeof (err as { status?: unknown })?.status === "number"
      ? (err as { status: number }).status
      : 500;
    const data = (err as { data?: unknown })?.data;
    const message = (err as { message?: unknown })?.message ?? "Internal Server Error";
    res.status(status).json(data ?? { error: message });
  });
  app.setNotFound((_req, res) => res.status(404).json({ error: "Not Found" }));

  return app;
}
