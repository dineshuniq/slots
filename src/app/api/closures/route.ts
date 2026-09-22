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
import { findPanel } from "@/lib/queries";
import { getSession, isController } from "@/lib/session";
import { isDateInWindow, isValidDateKey, slotStartLabel } from "@/lib/time";
import {
  closePanelForDay,
  listClosures,
  reopenPanelForDay,
} from "@/lib/waiting";

const MAX_REASON = 200;

/** Which panels are shut on a date. */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const date = new URL(request.url).searchParams.get("date") ?? "";
    if (!isValidDateKey(date)) return fail("Invalid or missing date.", 400);

    return json({ date, closedPanelIds: await listClosures(date) });
  } catch (error) {
    return serverError(error);
  }
}

/**
 * Close a panel for a whole day, bookings and all.
 *
 * Sessions already on it are re-seated onto other panels where possible,
 * oldest booking first; whatever will not fit goes to the waiting list.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    if (!isController(session)) return forbidden();

    const body = await readJson(request);

    const date = readString(body, "date");
    if (!isValidDateKey(date)) return fail("Invalid or missing date.", 400);
    if (!isDateInWindow(date)) {
      return fail("That date is outside the eight-day window.", 400);
    }

    const panelId = readString(body, "panelId");
    if (!panelId) return fail("Select a panel.", 400);

    const panel = await findPanel(panelId);
    if (!panel) return fail("Unknown panel.", 404);

    const reason = readString(body, "reason").slice(0, MAX_REASON) || null;

    const outcome = await closePanelForDay(
      panel.id,
      date,
      session.controllerId,
      reason,
    );

    const movedText =
      outcome.moved.length > 0
        ? ` ${outcome.moved.length} session${outcome.moved.length === 1 ? "" : "s"} moved to another panel.`
        : "";

    const waitingNames = outcome.waitlisted
      .map((entry) => `${entry.candidateName} at ${slotStartLabel(entry.slotIndex)}`)
      .join(", ");
    const waitingText =
      outcome.waitlisted.length > 0
        ? ` ${outcome.waitlisted.length} session${outcome.waitlisted.length === 1 ? "" : "s"} went to the waiting list (${waitingNames}).`
        : "";

    await recordAudit({
      session,
      action: AUDIT_ACTIONS.panelClosed,
      summary:
        `${session.name} closed ${panel.id} for ${date}` +
        (reason ? ` (${reason})` : "") +
        `.${movedText}${waitingText}`,
      subjectLabel: `${panel.id} on ${date}`,
      details: { reason, ...outcome },
    });

    return json(outcome, 201);
  } catch (error) {
    return serverError(error);
  }
}

/** Put a panel back in service. Bookings are not restored automatically. */
export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    if (!isController(session)) return forbidden();

    const body = await readJson(request);

    const date = readString(body, "date");
    if (!isValidDateKey(date)) return fail("Invalid or missing date.", 400);

    const panelId = readString(body, "panelId");
    if (!panelId) return fail("Select a panel.", 400);

    const reopened = await reopenPanelForDay(panelId, date);
    if (!reopened) return fail("That panel is not closed on that date.", 404);

    await recordAudit({
      session,
      action: AUDIT_ACTIONS.panelReopened,
      summary:
        `${session.name} reopened ${panelId} for ${date}. ` +
        `Sessions moved earlier were not restored.`,
      subjectLabel: `${panelId} on ${date}`,
      details: { panelId, date },
    });

    return json({ panelId, date, reopened: true });
  } catch (error) {
    return serverError(error);
  }
}
