/**
 * Marks the compiled CLI entry point executable so it can be run directly
 * (`./dist/cli.js`) or via the `bin` field after `npm link`.
 *
 * `tsc` does not preserve the executable bit on its output, so this runs
 * as a post-build step (see "build" in package.json).
 */
import { chmodSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
chmodSync(path.join(root, "dist", "cli.js"), 0o755);
