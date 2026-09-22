import { sql } from "@/lib/db";
import type { SessionType } from "@/lib/types";

/**
 * The mock register: who is due in on a date, and whether their mock has been
 * run.
 *
 * A candidate sits one mock per day, and once it is done they are cleared for
 * every interview they hold that date. So the tick belongs to the pair
 * (candidate, date), never to a booking: three sessions on Tuesday are one
 * line with one button, while the same candidate booked again on Thursday is a
 * separate line that has to be ticked off on its own.
 */

export type MockSession = {
  bookingId: string;
  panelId: string;
  slotIndex: number;
  slotCount: number;
  companyName: string;
  sessionType: SessionType;
};

export type MockEntry = {
  candidateId: string;
  candidateName: string;
  token: string;
  date: string;
  /** Earliest block the candidate is due; this is what orders the register. */
  firstSlotIndex: number;
  sessions: MockSession[];
  completed: boolean;
  completedAt: string | null;
  /** Controller who ticked it off, when that controller still exists. */
  completedBy: string | null;
};

type MockRow = {
  booking_id: string;
  panel_id: string;
  slot_index: number;
  slot_count: number;
  company_name: string;
  session_type: SessionType;
  candidate_id: string;
  candidate_name: string;
  token: string;
  completed_at: string | null;
  completed_by: string | null;
};

/**
 * Everyone with a session on this date, in timeline order - earliest start
 * first, and alphabetical between candidates due at the same time.
 *
 * Rows come back one per booking and are folded into one entry per candidate
 * here. The fold relies on the SQL order: a Map keeps insertion order, so the
 * first row a candidate appears in is their earliest session, and the entries
 * come out already sorted.
 */
export async function listMockDay(date: string): Promise<MockEntry[]> {
  const rows = await sql<MockRow[]>`
    select b.id           as booking_id,
           b.panel_id,
           b.slot_index,
           b.slot_count,
           b.company_name,
           b.session_type,
           c.id           as candidate_id,
           c.name         as candidate_name,
           c.token,
           m.completed_at,
           ctl.name       as completed_by
      from bookings b
      join candidates c on c.id = b.candidate_id
      left join mock_completions m
             on m.candidate_id = b.candidate_id
            and m.mock_date    = b.slot_date
      left join controllers ctl on ctl.id = m.completed_by
     where b.status    = 'booked'
       and b.slot_date = ${date}::date
     order by b.slot_index, c.name, b.id
  `;

  const byCandidate = new Map<string, MockEntry>();

  for (const row of rows) {
    const session: MockSession = {
      bookingId: row.booking_id,
      panelId: row.panel_id,
      slotIndex: Number(row.slot_index),
      slotCount: Number(row.slot_count),
      companyName: row.company_name,
      sessionType: row.session_type,
    };

    const existing = byCandidate.get(row.candidate_id);
    if (existing) {
      existing.sessions.push(session);
      continue;
    }

    byCandidate.set(row.candidate_id, {
      candidateId: row.candidate_id,
      candidateName: row.candidate_name,
      token: row.token,
      date,
      firstSlotIndex: session.slotIndex,
      sessions: [session],
      completed: row.completed_at !== null,
      completedAt: row.completed_at
        ? new Date(row.completed_at).toISOString()
        : null,
      completedBy: row.completed_by,
    });
  }

  return [...byCandidate.values()];
}

/**
 * The candidate, but only if they actually have a session on that date.
 *
 * Ticking off someone who is not due in would leave a row that no screen can
 * ever show or undo, so the API checks here first and takes the name for the
 * audit sentence from the same query.
 */
export async function findMockCandidate(
  date: string,
  candidateId: string,
): Promise<{ id: string; name: string; token: string } | null> {
  const rows = await sql<{ id: string; name: string; token: string }[]>`
    select c.id, c.name, c.token
      from candidates c
     where c.id = ${candidateId}
       and exists (
             select 1
               from bookings b
              where b.candidate_id = c.id
                and b.slot_date    = ${date}::date
                and b.status       = 'booked'
           )
     limit 1
  `;
  return rows[0] ?? null;
}

/**
 * Marks the day's mock as done. Idempotent: two controllers pressing the
 * button at once is a race one of them has to lose, and losing it should mean
 * "already done" rather than a 500. `created` says which of the two happened.
 */
export async function completeMock(
  date: string,
  candidateId: string,
  controllerId: string,
): Promise<{ created: boolean }> {
  const rows = await sql<{ id: string }[]>`
    insert into mock_completions (candidate_id, mock_date, completed_by)
    values (${candidateId}, ${date}::date, ${controllerId})
    on conflict on constraint mock_completions_once do nothing
    returning id
  `;
  return { created: rows.length > 0 };
}

/** Puts the day's mock back on the list. */
export async function reopenMock(
  date: string,
  candidateId: string,
): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    delete from mock_completions
     where candidate_id = ${candidateId}
       and mock_date    = ${date}::date
     returning id
  `;
  return rows.length > 0;
}
