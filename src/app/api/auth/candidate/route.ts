import { fail, json, readJson, readString, serverError } from "@/lib/http";
import { findCandidateByToken } from "@/lib/queries";
import { normaliseToken } from "@/lib/tokens";
import { clearAttempts, clientKey, tooManyAttempts } from "@/lib/rate-limit";
import { createSession } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const key = clientKey(request, "candidate");
    if (tooManyAttempts(key)) {
      return fail("Too many attempts. Wait a minute and try again.", 429);
    }

    const body = await readJson(request);
    const token = normaliseToken(readString(body, "token"));
    if (!token) return fail("Enter your access token.", 400);

    const candidate = await findCandidateByToken(token);
    if (!candidate) return fail("That token was not recognised.", 401);

    clearAttempts(key);
    await createSession({
      role: "candidate",
      candidateId: candidate.id,
      name: candidate.name,
    });

    return json({ role: "candidate", redirectTo: "/book" });
  } catch (error) {
    return serverError(error);
  }
}
