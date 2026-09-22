import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { conflictConstraint, sql } from "@/lib/db";
import { fail, forbidden, json, serverError, unauthorized } from "@/lib/http";
import { listFreePanels } from "@/lib/queries";
import { getSession } from "@/lib/session";
import { sessionRangeLabel } from "@/lib/time";
import {
  findWaitingEntry,
  leaveWaitingList,
  markWaitingPlaced,
} from "@/lib/waiting";

type Params = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Give a waiting entry a seat.
 *
 * Controller only, and only onto a panel that is genuinely free. The insert is
 * still guarded by the overlap constraints, so losing a race just fails rather
 * than double-booking.
 */
export async function POST(_request: Request, { params }: Params) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    if (session.role !== "controller") return forbidden();

    const { id } = await params;
    if (!UUID.test(id)) return fail("Unknown waiting entry.", 404);

    const entry = await findWaitingEntry(id);
    if (!entry) return fail("Unknown waiting entry.", 404);

    const free = await listFreePanels(
      entry.slotDate,
      entry.slotIndex,
      entry.slotCount,
    );
    if (free.length === 0) {
      return fail("No panel is free at that time yet.", 409);
    }

    const panel = free[0];

    try {
      const inserted = await sql<{ id: string }[]>`
        insert into bookings
          (panel_id, candidate_id, slot_date, slot_index, slot_count,
           company_name, session_type, booked_by)
        values
          (${panel.id}, ${entry.candidateId}, ${entry.slotDate}::date,
           ${entry.slotIndex}, ${entry.slotCount}, ${entry.companyName},
           ${entry.sessionType}, 'controller')
        returning id
      `;

      await markWaitingPlaced(id, inserted[0].id);

      const [who] = await sql<{ name: string }[]>`
        select name from candidates where id = ${entry.candidateId}
      `;

      await recordAudit({
        session,
        action: AUDIT_ACTIONS.waitingPlaced,
        summary:
          `${session.name} placed ${who?.name ?? "a candidate"} from the ` +
          `waiting list onto ${panel.id}, ${entry.slotDate} ` +
          `${sessionRangeLabel(entry.slotIndex, entry.slotCount)}.`,
        subjectLabel: who?.name ?? null,
        details: {
          waitingId: id,
          bookingId: inserted[0].id,
          panelId: panel.id,
        },
      });

      return json({ bookingId: inserted[0].id, panelId: panel.id }, 201);
    } catch (error) {
      if (conflictConstraint(error)) {
        return fail("That time was taken while placing them.", 409);
      }
      throw error;
    }
  } catch (error) {
    return serverError(error);
  }
}

/** Leave the queue. Candidates may only remove their own entry. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const { id } = await params;
    if (!UUID.test(id)) return fail("Unknown waiting entry.", 404);

    const entry = await findWaitingEntry(id);
    if (!entry) return fail("Unknown waiting entry.", 404);

    const removed = await leaveWaitingList(
      id,
      session.role === "candidate" ? session.candidateId : null,
    );
    if (!removed) return forbidden();

    const [who] = await sql<{ name: string }[]>`
      select name from candidates where id = ${entry.candidateId}
    `;

    await recordAudit({
      session,
      action: AUDIT_ACTIONS.waitingLeft,
      summary:
        `${session.name} removed ${who?.name ?? "a candidate"} from the ` +
        `waiting list for ${entry.slotDate} ` +
        `${sessionRangeLabel(entry.slotIndex, entry.slotCount)}.`,
      subjectLabel: who?.name ?? null,
      details: { waitingId: id },
    });

    return json({ id, removed: true });
  } catch (error) {
    return serverError(error);
  }
}
