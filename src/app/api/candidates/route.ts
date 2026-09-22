import { forbidden, json, serverError, unauthorized } from "@/lib/http";
import { listCandidates, listPanels } from "@/lib/queries";
import { getSession, isController } from "@/lib/session";

/** Roster used by the controller when booking on a candidate's behalf. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    if (!isController(session)) return forbidden();

    const [candidates, panels] = await Promise.all([
      listCandidates(),
      listPanels(),
    ]);

    return json({ candidates, panels });
  } catch (error) {
    return serverError(error);
  }
}
