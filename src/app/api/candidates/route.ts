import { isUniqueViolation } from "@/lib/db";
import {
  fail,
  forbidden,
  json,
  readJson,
  readString,
  serverError,
  unauthorized,
} from "@/lib/http";
import {
  insertCandidate,
  listCandidateRecords,
  listCandidates,
  listPanels,
} from "@/lib/queries";
import { getSession, isController } from "@/lib/session";
import { generateToken } from "@/lib/tokens";

const MAX_NAME = 120;
const MAX_PHONE = 32;

/** Roster for the Candidates page and for booking on a candidate's behalf. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    if (!isController(session)) return forbidden();

    const [candidates, records, panels] = await Promise.all([
      listCandidates(),
      listCandidateRecords(),
      listPanels(),
    ]);

    return json({ candidates, records, panels });
  } catch (error) {
    return serverError(error);
  }
}

/**
 * Create a candidate and issue them a token.
 *
 * No panel is chosen here. A candidate can be allocated to a different panel
 * for every booking, so the panel is picked when the slot is booked.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    if (!isController(session)) return forbidden();

    const body = await readJson(request);

    const name = readString(body, "name");
    if (!name) return fail("Candidate name is required.", 400);
    if (name.length > MAX_NAME) {
      return fail(`Name must be ${MAX_NAME} characters or fewer.`, 400);
    }

    const phone = readString(body, "phone");
    if (phone.length > MAX_PHONE) {
      return fail(`Phone number must be ${MAX_PHONE} characters or fewer.`, 400);
    }
    if (phone && !/^[0-9+()\-\s]{6,}$/.test(phone)) {
      return fail("Enter a valid phone number.", 400);
    }

    // A four-character token has a small keyspace, so a collision is possible
    // rather than merely theoretical. Retry on the unique violation.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const token = generateToken();
      try {
        const id = await insertCandidate({
          token,
          name,
          phone: phone || null,
        });
        return json({ id, token, name, phone: phone || null }, 201);
      } catch (error) {
        if (isUniqueViolation(error)) continue;
        throw error;
      }
    }

    return fail(
      "Could not allocate a free token. Disable some unused tokens and try again.",
      503,
    );
  } catch (error) {
    return serverError(error);
  }
}
