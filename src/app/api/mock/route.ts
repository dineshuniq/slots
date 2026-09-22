import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
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
  completeMock,
  findMockCandidate,
  listMockDay,
  reopenMock,
} from "@/lib/mock";
import { getSession, isController } from "@/lib/session";
import { isDateInWindow, isValidDateKey } from "@/lib/time";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The mock register for one date, in timeline order. Controller only. */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    if (!isController(session)) return forbidden();

    const date = new URL(request.url).searchParams.get("date") ?? "";
    if (!isValidDateKey(date)) return fail("Invalid or missing date.", 400);

    const entries = await listMockDay(date);

    return json({
      date,
      entries,
      completed: entries.filter((entry) => entry.completed).length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return serverError(error);
  }
}

/** Reads and validates the { date, candidateId } body both writers take. */
async function readTarget(request: Request) {
  const body = await readJson(request);

  const date = readString(body, "date");
  if (!isValidDateKey(date)) {
    return { error: fail("Invalid or missing date.", 400) } as const;
  }

  const candidateId = readString(body, "candidateId");
  if (!UUID.test(candidateId)) {
    return { error: fail("Select a candidate.", 400) } as const;
  }

  return { date, candidateId } as const;
}

/**
 * Tick a candidate's mock off for a date.
 *
 * One mock clears them for the whole day, so this is recorded against the day
 * rather than against whichever session they happened to sit - see lib/mock.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    if (!isController(session)) return forbidden();

    const target = await readTarget(request);
    if ("error" in target) return target.error;
    const { date, candidateId } = target;

    if (!isDateInWindow(date)) {
      return fail("That date is outside the eight-day window.", 400);
    }

    const candidate = await findMockCandidate(date, candidateId);
    if (!candidate) {
      return fail("That candidate has no session booked on that date.", 404);
    }

    const { created } = await completeMock(
      date,
      candidateId,
      session.controllerId,
    );

    // Two controllers can press the button at once. The second one gets the
    // same answer as the first rather than an error, but only the press that
    // actually changed something is worth a line in the log.
    if (created) {
      await recordAudit({
        session,
        action: AUDIT_ACTIONS.mockCompleted,
        summary:
          `${session.name} marked the mock for ${candidate.name} ` +
          `(${candidate.token}) as completed on ${date}.`,
        subjectLabel: `${candidate.name} (${candidate.token}) on ${date}`,
        details: { candidateId, date },
      });
    }

    return json(
      { date, candidateId, completed: true, created },
      created ? 201 : 200,
    );
  } catch (error) {
    return serverError(error);
  }
}

/** Put a mock back on the list, for a tick applied to the wrong person. */
export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    if (!isController(session)) return forbidden();

    const target = await readTarget(request);
    if ("error" in target) return target.error;
    const { date, candidateId } = target;

    const candidate = await findMockCandidate(date, candidateId);
    const removed = await reopenMock(date, candidateId);
    if (!removed) return fail("That mock is not marked as completed.", 404);

    await recordAudit({
      session,
      action: AUDIT_ACTIONS.mockReopened,
      summary:
        `${session.name} reopened the mock for ` +
        `${candidate ? `${candidate.name} (${candidate.token})` : "a candidate"} ` +
        `on ${date}.`,
      subjectLabel: candidate
        ? `${candidate.name} (${candidate.token}) on ${date}`
        : null,
      details: { candidateId, date },
    });

    return json({ date, candidateId, completed: false });
  } catch (error) {
    return serverError(error);
  }
}
