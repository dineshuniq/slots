import postgres from "postgres";

/**
 * A single shared postgres.js client, created on first use.
 *
 * Connecting lazily matters: Next evaluates every route module at build time
 * to collect page data, and a client constructed at import time would make the
 * build fail on any machine without DATABASE_URL set.
 *
 * The instance is cached on globalThis so it survives dev hot reloads and warm
 * serverless starts. `max: 1` keeps one socket per function instance, which is
 * what pooled Postgres (Neon, Supabase pgbouncer) expects.
 */

declare global {
  var __panelSlotsSql: postgres.Sql | undefined;
}

/** Milliseconds a single query may run before Postgres cancels it. */
const STATEMENT_TIMEOUT_MS = 15_000;

function createClient(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and point it at your Postgres instance.",
    );
  }

  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
  const sslDisabled = /sslmode=disable/.test(url);

  return postgres(url, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 15,
    // pgbouncer in transaction mode cannot handle named prepared statements.
    prepare: false,
    connection: {
      // Fail fast instead of occupying a serverless function until the
      // platform kills it. Postgres defaults to 2 minutes, which is far longer
      // than any query here should take and longer than a request should wait.
      statement_timeout: STATEMENT_TIMEOUT_MS,
    },
    ssl: isLocal || sslDisabled ? false : "require",
  });
}

function getClient(): postgres.Sql {
  const existing = globalThis.__panelSlotsSql;
  if (existing) return existing;

  const client = createClient();
  globalThis.__panelSlotsSql = client;
  return client;
}

/**
 * Behaves exactly like a postgres.js instance - `sql\`...\``, `sql.begin`,
 * `sql.unsafe` - but defers connecting until the first call.
 */
export const sql: postgres.Sql = new Proxy(
  function noop() {} as unknown as postgres.Sql,
  {
    apply(_target, _thisArg, args: unknown[]) {
      return (getClient() as unknown as (...a: unknown[]) => unknown)(...args);
    },
    get(_target, property) {
      const client = getClient() as unknown as Record<string | symbol, unknown>;
      const value = client[property];
      return typeof value === "function"
        ? (value as (...a: unknown[]) => unknown).bind(client)
        : value;
    },
  },
);

/** Postgres unique-violation, raised by the one-booking-per-slot index. */
export const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  );
}
