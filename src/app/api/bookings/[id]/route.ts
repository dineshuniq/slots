import { isConflictViolation, sql } from "@/lib/db";
import { fail, forbidden, json, readJson, readString, serverError, unauthorized } from "@/lib/http";
import { findPanel } from "@/lib/queries";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { getSession } from "@/lib/session";
import {
  fitsInDay,
  longDateLabel,
  sessionRangeLabel,
  isDateInWindow,
  isSlotInPast,
  isValidDateKey,
  isValidSlotIndex,
} from "@/lib/time";

type Params = { params: Promise<{ id: string }> };

type BookingRow = {
  id: string;
  panel_id: string;
  candidate_id: string;
  slot_date: string;
  slot_index: number;
  slot_count: number;
  candidate_name: string;
};

async function loadBooking(id: string): Promise<BookingRow | null> {
  const rows = await sql<BookingRow[]>`
    select b.id,
           b.panel_id,
           b.candidate_id,
           to_char(b.slot_date, 'YYYY-MM-DD') as slot_date,
           b.slot_index,
           b.slot_count,
           c.name as candidate_name
      from bookings b
      join candidates c on c.id = b.candidate_id
     where b.id = ${id}
       and b.status = 'booked'
     limit 1
  `;
  return rows[0] ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Move a booking to another panel column and/or time slot.
 * Controller only - this is the reassignment action on the Schedule view.
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    if (session.role !== "controller") return forbidden();

    const { id } = await params;
    if (!UUID.test(id)) return fail("Unknown booking.", 404);

    const booking = await loadBooking(id);
    if (!booking) return fail("Unknown booking.", 404);

    const body = await readJson(request);

    const date = readString(body, "date") || booking.slot_date;
    if (!isValidDateKey(date)) return fail("Invalid date.", 400);
    if (!isDateInWindow(date)) {
      return fail("That date is outside the eight-day booking window.", 400);
    }

    const slotIndex =
      body.slotIndex === undefined ? booking.slot_index : body.slotIndex;
    if (!isValidSlotIndex(slotIndex)) return fail("Invalid time slot.", 400);

    if (isSlotInPast(booking.slot_date, booking.slot_index)) {
      return fail("That session has already taken place.", 400);
    }
    if (isSlotInPast(date, slotIndex)) {
      return fail("That time has already passed.", 400);
    }

    // Length is fixed on a move; only where it sits changes.
    if (!fitsInDay(slotIndex, booking.slot_count)) {
      return fail("A session that long does not fit before 8:00 PM.", 400);
    }

    const panelId = readString(body, "panelId") || booking.panel_id;
    const panel = await findPanel(panelId);
    if (!panel) return fail("Unknown panel.", 404);

    const unchanged =
      panel.id === booking.panel_id &&
      date === booking.slot_date &&
      slotIndex === booking.slot_index;
    if (unchanged) return json({ id: booking.id, moved: false });

    await sql.begin(async (tx) => {
      await tx`
        update bookings
           set panel_id   = ${panel.id},
               slot_date  = ${date}::date,
               slot_index = ${slotIndex},
               updated_at = now()
         where id = ${booking.id}
           and status = 'booked'
      `;
      await tx`
        insert into booking_moves
          (booking_id, moved_by, from_panel_id, from_slot_date, from_slot_index,
           to_panel_id, to_slot_date, to_slot_index)
        values
          (${booking.id}, ${session.controllerId}, ${booking.panel_id},
           ${booking.slot_date}::date, ${booking.slot_index},
           ${panel.id}, ${date}::date, ${slotIndex})
      `;
    });

    await recordAudit({
      session,
      action: AUDIT_ACTIONS.bookingMoved,
      summary:
        `${session.name} moved ${booking.candidate_name} from ` +
        `${booking.panel_id} ${longDateLabel(booking.slot_date)} ` +
        `${sessionRangeLabel(booking.slot_index, booking.slot_count)} to ` +
        `${panel.id} ${longDateLabel(date)} ` +
        `${sessionRangeLabel(slotIndex, booking.slot_count)}.`,
      subjectLabel: `${booking.candidate_name} on ${panel.id}`,
      details: {
        bookingId: booking.id,
        from: {
          panelId: booking.panel_id,
          date: booking.slot_date,
          slotIndex: booking.slot_index,
        },
        to: { panelId: panel.id, date, slotIndex },
      },
    });

    return json({ id: booking.id, moved: true });
  } catch (error) {
    if (isConflictViolation(error)) {
      return fail("That destination overlaps a session already there.", 409);
    }
    return serverError(error);
  }
}

/** Release a slot. Controllers may cancel anything; candidates only their own. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const { id } = await params;
    if (!UUID.test(id)) return fail("Unknown booking.", 404);

    const booking = await loadBooking(id);
    if (!booking) return fail("Unknown booking.", 404);

    if (isSlotInPast(booking.slot_date, booking.slot_index)) {
      return fail("That session has already taken place.", 400);
    }

    if (
      session.role === "candidate" &&
      booking.candidate_id !== session.candidateId
    ) {
      return forbidden();
    }

    await sql`
      update bookings
         set status       = 'cancelled',
             cancelled_at = now(),
             updated_at   = now()
       where id = ${booking.id}
         and status = 'booked'
    `;

    await recordAudit({
      session,
      action: AUDIT_ACTIONS.bookingCancelled,
      summary:
        `${session.name} cancelled ${booking.candidate_name}'s session on ` +
        `${booking.panel_id}, ${longDateLabel(booking.slot_date)} ` +
        `${sessionRangeLabel(booking.slot_index, booking.slot_count)}.`,
      subjectLabel: `${booking.candidate_name} on ${booking.panel_id}`,
      details: {
        bookingId: booking.id,
        panelId: booking.panel_id,
        date: booking.slot_date,
        slotIndex: booking.slot_index,
        slotCount: booking.slot_count,
      },
    });

    return json({ id: booking.id, cancelled: true });
  } catch (error) {
    return serverError(error);
  }
}
