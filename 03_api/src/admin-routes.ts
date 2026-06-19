/**
 * Admin-only routes mounted directly on the app router (not via
 * `apiBuilder`), to show `JwtPlugin.requireRole` used the way the package
 * expects: spread directly into a route registration as
 * `[authenticate, roleCheck]`.
 */
import type { JwtPlugin, Router, RouterRequest, RouterResponse } from "expediate";
import type { Collection } from "@axfab/pocket-db";
import { toPublicUser, type UserDoc } from "./types.js";

export function registerAdminRoutes(app: Router, users: Collection, auth: JwtPlugin): void {
  app.get("/admin/users", ...auth.requireRole("admin"), (_req: RouterRequest, res: RouterResponse) => {
    const docs = users.find().toArray() as unknown as UserDoc[];
    res.json({ items: docs.map(toPublicUser) });
  });
}
