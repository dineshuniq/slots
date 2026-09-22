import { sql } from "@/lib/db";
import type { SessionType } from "@/lib/types";

/**
 * Waiting list and panel closures.
 *
 * Queue order is `created_at` and nothing else. Position is derived on read
 * rather than stored, so removing someone from the middle cannot leave the
 * numbering wrong.
 */

export type WaitingEntry = {
  id: string;
  candidateId: string;
  candidateName: string;
  slotDate: string;
  slotIndex: number;
  slotCount: number;
  companyName: string;
  sessionType: SessionType;
  reason: "slot_full" | "panel_closed";
  createdAt: string;
  /** 1 is next in line for that time. */
  position: number;
  isOwn: boolean;
};

type WaitingRow = {
  id: string;
  candidate_id: string;
  candidate_name: string;
  slot_date: string;
  slot_index: number;
  slot_count: number;
  company_name: string;
  session_type: SessionType;
  reason: "slot_full" | "panel_closed";
  created_at: string;
  position: number;
};

function toEntry(row: WaitingRow, viewerCandidateId: string | null): WaitingEntry {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    candidateName: row.candidate_name,
    slotDate: row.slot_date,
    slotIndex: Number(row.slot_index),
    slotCount: Number(row.slot_count),
    companyName: row.company_name,
    sessionType: row.session_type,
    reason: row.reason,
    createdAt: new Date(row.created_at).toISOString(),
    position: Number(row.position),
    isOwn: viewerCandidateId !== null && row.candidate_id === viewerCandidateId,
  };
}

/** Everyone waiting on a date, with their place in each time's queue. */
export async function listWaiting(
  date: string,
  viewerCandidateId: string | null = null,
): Promise<WaitingEntry[]> {
  const rows = await sql<WaitingRow[]>`
    select w.id,
           w.candidate_id,
           c.name as candidate_name,
           to_char(w.slot_date, 'YYYY-MM-DD') as slot_date,
           w.slot_index,
           w.slot_count,
           w.company_name,
           w.session_type,
           w.reason,
           w.created_at,
           row_number() over (
             partition by w.slot_index order by w.created_at, w.id
           ) as position
      from waiting_list w
      join candidates c on c.id = w.candidate_id
     where w.status = 'waiting'
       and w.slot_date = ${date}::date
     order by w.slot_index, w.created_at, w.id
  `;

  return rows.map((row) => toEntry(row, viewerCandidateId));
}

/** Panels shut for a date. */
export async function listClosures(date: string): Promise<string[]> {
  const rows = await sql<{ panel_id: string }[]>`
    select panel_id from panel_closures where closed_on = ${date}::date
  `;
  return rows.map((row) => row.panel_id);
}

export type JoinInput = {
  candidateId: string;
  date: string;
  slotIndex: number;
  slotCount: number;
  companyName: string;
  sessionType: SessionType;
  reason?: "slot_full" | "panel_closed";
};

export async function joinWaitingList(input: JoinInput): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    insert into waiting_list
      (candidate_id, slot_date, slot_index, slot_count, company_name,
       session_type, reason)
    values
      (${input.candidateId}, ${input.date}::date, ${input.slotIndex},
       ${input.slotCount}, ${input.companyName}, ${input.sessionType},
       ${input.reason ?? "slot_full"})
    returning id
  `;
  return rows[0].id;
}

export async function leaveWaitingList(
  id: string,
  candidateId: string | null,
): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    update waiting_list
       set status = 'cancelled', resolved_at = now()
     where id = ${id}
       and status = 'waiting'
       ${candidateId ? sql`and candidate_id = ${candidateId}` : sql``}
     returning id
  `;
  return rows.length > 0;
}

export type ClosureOutcome = {
  panelId: string;
  date: string;
  moved: { candidateName: string; toPanelId: string; slotIndex: number }[];
  waitlisted: { candidateName: string; slotIndex: number }[];
};

type DayBooking = {
  id: string;
  panel_id: string;
  candidate_id: string;
  candidate_name: string;
  slot_index: number;
  slot_count: number;
  company_name: string;
  session_type: SessionType;
};

type Span = { start: number; end: number };

const overlaps = (spans: Span[], start: number, end: number) =>
  spans.some((span) => start < span.end && span.start < end);

/**
 * Takes a panel out of service for a day and reseats the day around it.
 *
 * The whole day is reassigned in booking order, not just the sessions that sat
 * on the closed panel. That is what "FIFO" requires: if every panel is busy at
 * some time, the person who booked FIRST keeps a seat - moving onto whichever
 * panel is still open - and it is the LAST booking for that time that loses its
 * place and falls to the waiting list. Reseating only the closed panel's own
 * sessions would instead punish whoever happened to be sitting on it, which is
 * the opposite of first-come-first-served.
 *
 * Each session prefers the panel it is already on, so a closure churns the
 * schedule as little as the rule allows.
 *
 * One transaction: a half-closed panel with some sessions rehomed and others
 * stranded would be worse than not closing at all. The panel-overlap constraint
 * is deferred inside it, because reseating passes through intermediate states
 * where two sessions momentarily share a panel.
 */
export async function closePanelForDay(
  panelId: string,
  date: string,
  closedBy: string,
  reason: string | null,
): Promise<ClosureOutcome> {
  const outcome: ClosureOutcome = { panelId, date, moved: [], waitlisted: [] };

  await sql.begin(async (tx) => {
    await tx`set constraints bookings_no_panel_overlap deferred`;

    await tx`
      insert into panel_closures (panel_id, closed_on, reason, closed_by)
      values (${panelId}, ${date}::date, ${reason}, ${closedBy})
      on conflict (panel_id, closed_on) do nothing
    `;

    const openPanels = await tx<{ id: string }[]>`
      select p.id
        from panels p
       where p.active
         and not exists (
               select 1 from panel_closures pc
                where pc.panel_id = p.id and pc.closed_on = ${date}::date
             )
       order by p.sort_order, p.id
    `;
    const openIds = openPanels.map((panel) => panel.id);

    // Booking order is the queue order.
    const day = await tx<DayBooking[]>`
      select b.id,
             b.panel_id,
             b.candidate_id,
             c.name as candidate_name,
             b.slot_index,
             b.slot_count,
             b.company_name,
             b.session_type
        from bookings b
        join candidates c on c.id = b.candidate_id
       where b.slot_date = ${date}::date
         and b.status = 'booked'
       order by b.created_at, b.id
    `;

    const taken = new Map<string, Span[]>(openIds.map((id) => [id, []]));

    for (const booking of day) {
      const from = Number(booking.slot_index);
      const to = from + Number(booking.slot_count);

      // Prefer staying put; otherwise the lowest open panel that is free.
      const order = openIds.includes(booking.panel_id)
        ? [booking.panel_id, ...openIds.filter((id) => id !== booking.panel_id)]
        : openIds;

      const seat = order.find((id) => !overlaps(taken.get(id) ?? [], from, to));

      if (seat) {
        taken.get(seat)?.push({ start: from, end: to });

        if (seat !== booking.panel_id) {
          await tx`
            update bookings
               set panel_id = ${seat}, updated_at = now()
             where id = ${booking.id}
          `;
          await tx`
            insert into booking_moves
              (booking_id, moved_by, from_panel_id, from_slot_date,
               from_slot_index, to_panel_id, to_slot_date, to_slot_index)
            values
              (${booking.id}, ${closedBy}, ${booking.panel_id}, ${date}::date,
               ${from}, ${seat}, ${date}::date, ${from})
          `;
          outcome.moved.push({
            candidateName: booking.candidate_name,
            toPanelId: seat,
            slotIndex: from,
          });
        }
        continue;
      }

      // Nothing open at this time: release the seat and queue them.
      await tx`
        update bookings
           set status = 'cancelled', cancelled_at = now(), updated_at = now()
         where id = ${booking.id}
      `;
      await tx`
        insert into waiting_list
          (candidate_id, slot_date, slot_index, slot_count, company_name,
           session_type, reason)
        values
          (${booking.candidate_id}, ${date}::date, ${from},
           ${booking.slot_count}, ${booking.company_name},
           ${booking.session_type}, 'panel_closed')
        on conflict do nothing
      `;
      outcome.waitlisted.push({
        candidateName: booking.candidate_name,
        slotIndex: from,
      });
    }
  });

  return outcome;
}

/** Puts a panel back in service. Bookings are not restored automatically. */
export async function reopenPanelForDay(
  panelId: string,
  date: string,
): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    delete from panel_closures
     where panel_id = ${panelId} and closed_on = ${date}::date
     returning id
  `;
  return rows.length > 0;
}

export type WaitingRecord = {
  id: string;
  candidateId: string;
  slotDate: string;
  slotIndex: number;
  slotCount: number;
  companyName: string;
  sessionType: SessionType;
};

export async function findWaitingEntry(
  id: string,
): Promise<WaitingRecord | null> {
  const rows = await sql<
    {
      id: string;
      candidate_id: string;
      slot_date: string;
      slot_index: number;
      slot_count: number;
      company_name: string;
      session_type: SessionType;
    }[]
  >`
    select id,
           candidate_id,
           to_char(slot_date, 'YYYY-MM-DD') as slot_date,
           slot_index,
           slot_count,
           company_name,
           session_type
      from waiting_list
     where id = ${id} and status = 'waiting'
     limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    candidateId: row.candidate_id,
    slotDate: row.slot_date,
    slotIndex: Number(row.slot_index),
    slotCount: Number(row.slot_count),
    companyName: row.company_name,
    sessionType: row.session_type,
  };
}

export async function markWaitingPlaced(
  id: string,
  bookingId: string,
): Promise<void> {
  await sql`
    update waiting_list
       set status = 'placed', resolved_at = now(), placed_booking_id = ${bookingId}
     where id = ${id}
  `;
}
