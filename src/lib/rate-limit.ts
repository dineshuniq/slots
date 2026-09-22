/**
 * Small in-memory throttle for the sign-in endpoints.
 *
 * Serverless instances are not shared, so this is a speed bump rather than a
 * guarantee - it exists to make token guessing tedious. Move it to the
 * database or a KV store if the deployment needs a hard limit.
 */

type Bucket = { count: number; resetAt: number };

declare global {
  var __panelSlotsRateLimit: Map<string, Bucket> | undefined;
}

const buckets: Map<string, Bucket> =
  globalThis.__panelSlotsRateLimit ?? new Map<string, Bucket>();
globalThis.__panelSlotsRateLimit = buckets;

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

export function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  bucket.count += 1;
  return bucket.count > MAX_ATTEMPTS;
}

export function clearAttempts(key: string): void {
  buckets.delete(key);
}

export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0].trim() || "unknown";
  return `${scope}:${ip}`;
}
