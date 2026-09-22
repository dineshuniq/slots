import { isUniqueViolation, sql } from "@/lib/db";
import { fail, json, readJson, readString, serverError, unauthorized } from "@/lib/http";
import { findPanel } from "@/lib/queries";
import { getSession } from "@/lib/session";
import { isDateInWindow, isSlotInPast, isValidDateKey, isValidSlotIndex } from "@/lib/time";
import { isSessionType } from "@/lib/types";

const MAX_COMPANY_NAME = 120;

/**
 * Book a half-hour block.
 *
 * Candidates book on their own panel, for themselves. Controllers book on
 * behalf of a named candidate and may place them on any panel.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const body = await readJson(request);

    const date = readString(body, "date");
    if (!isValidDateKey(date)) return fail("Invalid or missing date.", 400);
    if (!isDateInWindow(date)) {
      return fail("That date is outside the eight-day booking window.", 400);
    }

    const slotIndex = body.slotIndex;
    if (!isValidSlotIndex(slotIndex)) return fail("Invalid time slot.", 400);

    const companyName = readString(body, "companyName");
    if (!companyName) return fail("Company Name is required.", 400);
    if (companyName.length > MAX_COMPANY_NAME) {
      return fail(`Company Name must be ${MAX_COMPANY_NAME} characters or fewer.`, 400);
    }

    const sessionType = body.sessionType;
    if (!isSessionType(sessionType)) {
      return fail("Session Type must be Interview or Assessment.", 400);
    }

    let candidateId: string;
    let panelId: string;

    if (session.role === "candidate") {
      if (isSlotInPast(date, slotIndex)) {
        return fail("That time has already passed.", 400);
      }
      candidateId = session.candidateId;
      panelId = session.panelId;
    } else {
      candidateId = readString(body, "candidateId");
      if (!candidateId) return fail("Select a candidate.", 400);

      const rows = await sql<{ panel_id: string }[]>`
        select panel_id from candidates where id = ${candidateId} and active limit 1
      `;
      if (!rows[0]) return fail("Unknown candidate.", 404);

      panelId = readString(body, "panelId") || rows[0].panel_id;
    }

    const panel = await findPanel(panelId);
    if (!panel) return fail("Unknown panel.", 404);

    const inserted = await sql<{ id: string }[]>`
      insert into bookings
        (panel_id, candidate_id, slot_date, slot_index, company_name, session_type, booked_by)
      values
        (${panel.id}, ${candidateId}, ${date}::date, ${slotIndex},
         ${companyName}, ${sessionType}, ${session.role})
      returning id
    `;

    return json({ id: inserted[0].id }, 201);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail("That slot was just taken. Pick another one.", 409);
    }
    return serverError(error);
  }
}
