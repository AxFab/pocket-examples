/**
 * Process entry point: opens the database, builds the server, and starts
 * listening. Run via `npm start` (after `npm run build`) or `node dist/index.js`.
 */
import { initDatabase } from "./db.js";
import { createServer } from "./server.js";

const dbPath = process.env.BOOKMARKS_DB ?? "./bookmarks.pdb";
const port = Number(process.env.PORT ?? 3000);

const database = initDatabase(dbPath);
const app = createServer(database, {
  accessTokenSecret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret-change-me",
  refreshTokenSecret: process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret-change-me",
});

app.listen(port, () => {
  console.log(`Bookmarks API listening on http://localhost:${port}`);
  console.log(`OpenAPI doc:        http://localhost:${port}/openapi.json`);
});

async function shutdown(): Promise<void> {
  await app.shutdown(2000);
  database.db.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
