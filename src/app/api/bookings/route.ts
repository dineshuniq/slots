import {
  CANDIDATE_OVERLAP_CONSTRAINT,
  conflictConstraint,
  isDeadlock,
  sql,
} from "@/lib/db";
import { fail, json, readJson, readString, serverError, unauthorized } from "@/lib/http";
import { findPanel, listFreePanels } from "@/lib/queries";
import { getSession } from "@/lib/session";
import {
  fitsInDay,
  isDateInWindow,
  isSlotInPast,
  isValidDateKey,
  isValidSlotCount,
  isValidSlotIndex,
} from "@/lib/time";
import { isSessionType, type Panel } from "@/lib/types";

const MAX_COMPANY_NAME = 120;

/**
 * Book a session: a start block plus a length of 1 to 4 half-hour blocks.
 *
 * The panel is allocated here, not on the candidate record - the same
 * candidate can sit with a different panel for every booking. A candidate only
 * picks a time and a length and gets whichever panel is free for the whole of
 * it; a controller books on behalf of a named candidate and says which panel.
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

    // Absent means the original half-hour session, so older clients keep working.
    const slotCount = body.slotCount === undefined ? 1 : body.slotCount;
    if (!isValidSlotCount(slotCount)) {
      return fail("Invalid session length.", 400);
    }
    if (!fitsInDay(slotIndex, slotCount)) {
      return fail("A session that long does not fit before 8:00 PM.", 400);
    }

    // Narrowed copies: control-flow narrowing from the guards above does not
    // reach into the helper declared further down.
    const start: number = slotIndex;
    const length: number = slotCount;

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

    if (session.role === "candidate") {
      if (isSlotInPast(date, slotIndex)) {
        return fail("That time has already passed.", 400);
      }
      candidateId = session.candidateId;
    } else {
      candidateId = readString(body, "candidateId");
      if (!candidateId) return fail("Select a candidate.", 400);

      const rows = await sql<{ id: string }[]>`
        select id from candidates where id = ${candidateId} and active limit 1
      `;
      if (!rows[0]) return fail("Unknown candidate.", 404);
    }

    // Panels are allocated per booking, so a candidate can hold several a day -
    // but never two that overlap in time. This is a fast path with a clear
    // message; the exclusion constraint is the actual guard.
    const clash = await sql<{ id: string }[]>`
      select id
        from bookings
       where candidate_id = ${candidateId}
         and slot_date    = ${date}::date
         and status       = 'booked'
         and int4range(slot_index, slot_index + slot_count)
          && int4range(${slotIndex}::int, ${slotIndex}::int + ${slotCount}::int)
       limit 1
    `;
    if (clash[0]) {
      return fail("That candidate is already booked at this time.", 409);
    }

    // Controllers name the panel. Candidates do not see panels at all, so any
    // panel free for the whole session will do.
    const requested = readString(body, "panelId");

    async function panelsToTry(): Promise<Panel[] | null> {
      const free = await listFreePanels(date, start, length);

      if (session === null || session.role !== "controller") return free;

      const panel = await findPanel(requested);
      if (!panel) return null;
      return free.some((option) => option.id === panel.id) ? [panel] : [];
    }

    if (session.role === "controller" && !requested) {
      return fail("Select a panel.", 400);
    }
    if (session.role === "controller" && !(await findPanel(requested))) {
      return fail("Unknown panel.", 404);
    }

    // Two requests for the same time can each wait on the other's uncommitted
    // row while the exclusion constraint is checked, and Postgres aborts one to
    // break the cycle. That is transient, so the whole allocation is retried
    // with fresh availability rather than failing the booking.
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const wanted = await panelsToTry();
      if (wanted === null) return fail("Unknown panel.", 404);

      if (wanted.length === 0) {
        return session.role === "controller"
          ? fail("That panel is busy for part of that session.", 409)
          : fail("That slot was just taken. Pick another one.", 409);
      }

      let deadlocked = false;

      for (const panel of wanted) {
        try {
          const inserted = await sql<{ id: string }[]>`
            insert into bookings
              (panel_id, candidate_id, slot_date, slot_index, slot_count,
               company_name, session_type, booked_by)
            values
              (${panel.id}, ${candidateId}, ${date}::date, ${slotIndex}, ${slotCount},
               ${companyName}, ${sessionType}, ${session.role})
            returning id
          `;
          return json({ id: inserted[0].id, panelId: panel.id, slotCount }, 201);
        } catch (error) {
          if (isDeadlock(error)) {
            deadlocked = true;
            break;
          }

          const constraint = conflictConstraint(error);

          // The clash check above can be beaten by a concurrent request from
          // the same candidate, so the constraint is the real guard. Walking to
          // the next panel would just book them twice.
          if (constraint === CANDIDATE_OVERLAP_CONSTRAINT) {
            return fail("That candidate is already booked at this time.", 409);
          }

          // This panel was taken between the read and the insert; try the next.
          if (constraint) continue;
          throw error;
        }
      }

      if (!deadlocked) break;

      // Brief, jittered backoff so retries do not collide again in lockstep.
      await new Promise((resolve) =>
        setTimeout(resolve, attempt * 25 + Math.random() * 25),
      );
    }

    return fail("That slot was just taken. Pick another one.", 409);
  } catch (error) {
    return serverError(error);
  }
}
