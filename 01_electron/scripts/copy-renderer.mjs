/**
 * Copies static renderer assets (index.html) into dist/, since tsc only
 * emits compiled .js files.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const target = path.join(root, "dist", "renderer");

mkdirSync(target, { recursive: true });
copyFileSync(
  path.join(root, "src", "renderer", "index.html"),
  path.join(target, "index.html")
);
