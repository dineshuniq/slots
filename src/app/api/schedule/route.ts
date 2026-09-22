import { fail, forbidden, json, serverError, unauthorized } from "@/lib/http";
import { getScheduleView, listPanels } from "@/lib/queries";
import { listClosures, listWaiting } from "@/lib/waiting";
import { getSession, isController } from "@/lib/session";
import { isValidDateKey } from "@/lib/time";
import type { ScheduleView } from "@/lib/types";

/** Every panel's bookings for a date. Controller only. */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    if (!isController(session)) return forbidden();

    const date = new URL(request.url).searchParams.get("date") ?? "";
    if (!isValidDateKey(date)) return fail("Invalid or missing date.", 400);

    const [panels, bookings, closedPanelIds, waiting] = await Promise.all([
      listPanels(),
      getScheduleView(date),
      listClosures(date),
      listWaiting(date),
    ]);

    const payload: ScheduleView = {
      date,
      panels,
      bookings,
      fetchedAt: new Date().toISOString(),
    };

    return json({ ...payload, closedPanelIds, waiting });
  } catch (error) {
    return serverError(error);
  }
}
