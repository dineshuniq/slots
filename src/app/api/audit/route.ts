import {
  AUDIT_ACTION_LABELS,
  AUDIT_PAGE_LIMIT,
  listAudit,
} from "@/lib/audit";
import { forbidden, json, serverError, unauthorized } from "@/lib/http";
import { getSession, isController } from "@/lib/session";

/** The audit trail, newest first. Controller only. */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    if (!isController(session)) return forbidden();

    const params = new URL(request.url).searchParams;

    const entries = await listAudit({
      from: params.get("from"),
      to: params.get("to"),
      action: params.get("action"),
      actorRole: params.get("actorRole"),
      search: params.get("q"),
      limit: AUDIT_PAGE_LIMIT,
    });

    return json({
      entries,
      actions: AUDIT_ACTION_LABELS,
      limit: AUDIT_PAGE_LIMIT,
      truncated: entries.length === AUDIT_PAGE_LIMIT,
    });
  } catch (error) {
    return serverError(error);
  }
}
