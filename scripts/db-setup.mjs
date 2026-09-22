/**
 * Applies db/schema.sql. Safe to run repeatedly.
 *   npm run db:setup
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL is not set. Create .env.local from .env.example.");
  process.exit(1);
}

const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
const sql = postgres(url, {
  max: 1,
  ssl: isLocal || /sslmode=disable/.test(url) ? false : "require",
});

try {
  const schema = await readFile(join(here, "..", "db", "schema.sql"), "utf8");
  await sql.unsafe(schema).simple();
  console.log("Schema applied.");
} catch (error) {
  console.error("Failed to apply schema:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
