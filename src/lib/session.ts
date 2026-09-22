import { cookies } from "next/headers";

import { signPayload, verifyPayload } from "@/lib/sign";

export const SESSION_COOKIE = "panel_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export type CandidateSession = {
  role: "candidate";
  candidateId: string;
  name: string;
  panelId: string;
  exp: number;
};

export type ControllerSession = {
  role: "controller";
  name: string;
  exp: number;
};

export type Session = CandidateSession | ControllerSession;

type NewSession =
  | Omit<CandidateSession, "exp">
  | Omit<ControllerSession, "exp">;

export async function createSession(session: NewSession): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = await signPayload({ ...session, exp });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await verifyPayload<Session>(token);
  if (!session || typeof session.exp !== "number") return null;
  if (session.exp * 1000 <= Date.now()) return null;
  if (session.role !== "candidate" && session.role !== "controller") return null;

  return session;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export function isController(session: Session | null): session is ControllerSession {
  return session?.role === "controller";
}

export function isCandidate(session: Session | null): session is CandidateSession {
  return session?.role === "candidate";
}
