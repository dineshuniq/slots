import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { isUniqueViolation, sql } from "@/lib/db";
import { fail, json, readJson, readString, serverError, unauthorized } from "@/lib/http";
import { listFreePanels } from "@/lib/queries";
import { getSession } from "@/lib/session";
import {
  fitsInDay,
  isDateInWindow,
  isSlotInPast,
  isValidDateKey,
  isValidSlotCount,
  isValidSlotIndex,
  sessionRangeLabel,
} from "@/lib/time";
import { isSessionType } from "@/lib/types";
import { recruiterContactError } from "@/lib/contact";
import { joinWaitingList, listWaiting } from "@/lib/waiting";

const MAX_COMPANY_NAME = 120;

/** The queue for a date. Candidates see only their own entries. */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const date = new URL(request.url).searchParams.get("date") ?? "";
    if (!isValidDateKey(date)) return fail("Invalid or missing date.", 400);

    const viewerCandidateId =
      session.role === "candidate" ? session.candidateId : null;
    const entries = await listWaiting(date, viewerCandidateId);

    return json({
      date,
      entries:
        viewerCandidateId === null
          ? entries
          : entries.filter((entry) => entry.isOwn),
    });
  } catch (error) {
    return serverError(error);
  }
}

/**
 * Join the queue for a time that is already full.
 *
 * Refused when a panel is actually free, so nobody waits for a seat they could
 * simply take.
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

    const slotCount = body.slotCount === undefined ? 1 : body.slotCount;
    if (!isValidSlotCount(slotCount)) return fail("Invalid session length.", 400);
    if (!fitsInDay(slotIndex, slotCount)) {
      return fail("A session that long does not fit before 8:00 PM.", 400);
    }

    const companyName = readString(body, "companyName");
    if (!companyName) return fail("Company Name is required.", 400);
    if (companyName.length > MAX_COMPANY_NAME) {
      return fail(`Company Name must be ${MAX_COMPANY_NAME} characters or fewer.`, 400);
    }

    const recruiterPhone = readString(body, "recruiterPhone");
    const recruiterEmail = readString(body, "recruiterEmail");
    const contactError = recruiterContactError(recruiterPhone, recruiterEmail);
    if (contactError) return fail(contactError, 400);

    const sessionType = body.sessionType;
    if (!isSessionType(sessionType)) {
      return fail("Session Type must be Interview or Assessment.", 400);
    }

    let candidateId: string;
    let candidateName: string;

    if (session.role === "candidate") {
      if (isSlotInPast(date, slotIndex)) {
        return fail("That time has already passed.", 400);
      }
      candidateId = session.candidateId;
      candidateName = session.name;
    } else {
      candidateId = readString(body, "candidateId");
      if (!candidateId) return fail("Select a candidate.", 400);
      const rows = await sql<{ name: string }[]>`
        select name from candidates where id = ${candidateId} and active limit 1
      `;
      if (!rows[0]) return fail("Unknown candidate.", 404);
      candidateName = rows[0].name;
    }

    const free = await listFreePanels(date, slotIndex, slotCount);
    if (free.length > 0) {
      return fail(
        "A panel is free at that time - book it instead of waiting.",
        409,
      );
    }

    const clash = await sql<{ id: string }[]>`
      select id from bookings
       where candidate_id = ${candidateId}
         and slot_date = ${date}::date
         and status = 'booked'
         and int4range(slot_index, slot_index + slot_count)
          && int4range(${slotIndex}::int, ${slotIndex}::int + ${slotCount}::int)
       limit 1
    `;
    if (clash[0]) {
      return fail("That candidate already has a session at this time.", 409);
    }

    let id: string;
    try {
      id = await joinWaitingList({
        candidateId,
        date,
        slotIndex,
        slotCount,
        companyName,
        sessionType,
        recruiterPhone: recruiterPhone || null,
        recruiterEmail: recruiterEmail || null,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return fail("Already on the waiting list for that time.", 409);
      }
      throw error;
    }

    await recordAudit({
      session,
      action: AUDIT_ACTIONS.waitingJoined,
      summary:
        `${session.name} added ${candidateName} to the waiting list for ` +
        `${sessionRangeLabel(slotIndex, slotCount)} on ${date} ` +
        `(${sessionType} for ${companyName}).`,
      subjectLabel: candidateName,
      details: { waitingId: id, candidateId, date, slotIndex, slotCount },
    });

    return json({ id }, 201);
  } catch (error) {
    return serverError(error);
  }
}
