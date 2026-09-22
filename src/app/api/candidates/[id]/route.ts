import {
  fail,
  forbidden,
  json,
  readJson,
  serverError,
  unauthorized,
} from "@/lib/http";
import { describeCandidates, setCandidateActive } from "@/lib/queries";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { getSession, isController } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Enable or disable a candidate's token.
 *
 * Disabling blocks sign-in immediately but leaves existing bookings on the
 * schedule - controllers cancel those separately if they want the slots back.
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    if (!isController(session)) return forbidden();

    const { id } = await params;
    if (!UUID.test(id)) return fail("Unknown candidate.", 404);

    const body = await readJson(request);
    if (typeof body.active !== "boolean") {
      return fail("active must be true or false.", 400);
    }

    const [who] = await describeCandidates([id]);

    const updated = await setCandidateActive(id, body.active);
    if (!updated) return fail("Unknown candidate.", 404);

    await recordAudit({
      session,
      action: body.active
        ? AUDIT_ACTIONS.candidateEnabled
        : AUDIT_ACTIONS.candidateDisabled,
      summary:
        `${session.name} ${body.active ? "enabled" : "disabled"} 1 token` +
        (who ? `: ${who}.` : "."),
      subjectLabel: who ?? null,
      details: { candidateId: id, active: body.active },
    });

    return json({ id, active: body.active });
  } catch (error) {
    return serverError(error);
  }
}
