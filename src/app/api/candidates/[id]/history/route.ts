import { fail, forbidden, json, serverError, unauthorized } from "@/lib/http";
import { getCandidateHistory } from "@/lib/queries";
import { getSession, isController } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Everything on file for one candidate. Controller only. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    if (!isController(session)) return forbidden();

    const { id } = await params;
    if (!UUID.test(id)) return fail("Unknown candidate.", 404);

    const history = await getCandidateHistory(id);
    if (!history) return fail("Unknown candidate.", 404);

    return json(history);
  } catch (error) {
    return serverError(error);
  }
}
