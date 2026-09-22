import { fail, json, serverError, unauthorized } from "@/lib/http";
import { findPanel, getDayView } from "@/lib/queries";
import { getSession } from "@/lib/session";
import { isValidDateKey } from "@/lib/time";
import type { DayView } from "@/lib/types";

/**
 * One panel's timetable for one date.
 *
 * Candidates are pinned to their assigned panel and see other people's
 * bookings as blocked-but-anonymous. Controllers may request any panel and
 * get the full detail.
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const params = new URL(request.url).searchParams;
    const date = params.get("date") ?? "";
    if (!isValidDateKey(date)) return fail("Invalid or missing date.", 400);

    const requestedPanel = params.get("panel") ?? "";
    const panelId =
      session.role === "candidate" ? session.panelId : requestedPanel;
    if (!panelId) return fail("Missing panel.", 400);

    const panel = await findPanel(panelId);
    if (!panel) return fail("Unknown panel.", 404);

    const viewerCandidateId =
      session.role === "candidate" ? session.candidateId : null;

    const payload: DayView = {
      date,
      panel,
      slots: await getDayView(date, panel.id, viewerCandidateId),
      fetchedAt: new Date().toISOString(),
    };

    return json(payload);
  } catch (error) {
    return serverError(error);
  }
}
