import { fail, json, serverError, unauthorized } from "@/lib/http";
import { getDayView, listPanels } from "@/lib/queries";
import { getSession } from "@/lib/session";
import { isValidDateKey } from "@/lib/time";
import type { DayView } from "@/lib/types";

/**
 * The booking timetable for one date, across every panel.
 *
 * A block is offered while any panel is still free at that time - the panel is
 * allocated when the booking is made, so nobody is tied to one. Candidates see
 * other people's bookings as blocked-but-anonymous; controllers get the full
 * detail.
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const params = new URL(request.url).searchParams;
    const date = params.get("date") ?? "";
    if (!isValidDateKey(date)) return fail("Invalid or missing date.", 400);

    const panels = await listPanels();
    if (panels.length === 0) return fail("No panels are configured.", 404);

    const viewerCandidateId =
      session.role === "candidate" ? session.candidateId : null;

    const payload: DayView = {
      date,
      panels,
      slots: await getDayView(date, panels, viewerCandidateId),
      fetchedAt: new Date().toISOString(),
    };

    return json(payload);
  } catch (error) {
    return serverError(error);
  }
}
