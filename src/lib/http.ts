import { NextResponse } from "next/server";

export function json<T>(body: T, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      // Booking state must never be served from a CDN or browser cache.
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export function fail(message: string, status: number): NextResponse {
  return json({ error: message }, status);
}

export const unauthorized = () => fail("Not signed in.", 401);
export const forbidden = () => fail("You do not have access to this action.", 403);

/** Turns a thrown error into a response without leaking internals to the client. */
export function serverError(error: unknown): NextResponse {
  console.error("[api]", error);
  const message =
    error instanceof Error && error.message.startsWith("DATABASE_URL")
      ? error.message
      : "Something went wrong. Please try again.";
  return fail(message, 500);
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}
