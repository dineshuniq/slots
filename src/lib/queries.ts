import { sql } from "@/lib/db";
import { ALL_SLOT_INDEXES, coveredSlots } from "@/lib/time";
import type {
  Booking,
  CandidateSummary,
  Panel,
  SessionType,
  Slot,
} from "@/lib/types";

type PanelRow = { id: string; label: string };

type BookingRow = {
  id: string;
  panel_id: string;
  candidate_id: string;
  candidate_name: string;
  company_name: string;
  session_type: SessionType;
  slot_date: string;
  slot_index: number;
  slot_count: number;
};

function toBooking(row: BookingRow, viewerCandidateId: string | null): Booking {
  return {
    id: row.id,
    panelId: row.panel_id,
    candidateId: row.candidate_id,
    candidateName: row.candidate_name,
    companyName: row.company_name,
    sessionType: row.session_type,
    slotDate: row.slot_date,
    slotIndex: Number(row.slot_index),
    slotCount: Number(row.slot_count),
    isOwn: viewerCandidateId !== null && row.candidate_id === viewerCandidateId,
  };
}

/**
 * Candidates see that a block is taken, but not who took it or why - only
 * their own bookings come back with details attached.
 */
function redactForCandidate(booking: Booking): Booking {
  if (booking.isOwn) return booking;
  return {
    ...booking,
    candidateId: "",
    candidateName: "",
    companyName: "",
    sessionType: booking.sessionType,
  };
}

export async function listPanels(): Promise<Panel[]> {
  const rows = await sql<PanelRow[]>`
    select id, label
      from panels
     where active
     order by sort_order, id
  `;
  return rows.map((row) => ({ id: row.id, label: row.label }));
}

export async function findPanel(panelId: string): Promise<Panel | null> {
  const rows = await sql<PanelRow[]>`
    select id, label from panels where id = ${panelId} and active limit 1
  `;
  return rows[0] ? { id: rows[0].id, label: rows[0].label } : null;
}

/**
 * Panels with nothing booked at this exact time, in display order.
 *
 * Availability is a consolidated figure across panels - a candidate only picks
 * a time, and one of these panels is allocated to them.
 */
/**
 * Panels with nothing overlapping [slotIndex, slotIndex + slotCount), in
 * allocation order - lowest sort_order first.
 *
 * The overlap test has to be a range comparison: a 2-hour session starting at
 * 09:00 blocks 10:00 even though its slot_index is different.
 */
export async function listFreePanels(
  date: string,
  slotIndex: number,
  slotCount: number,
): Promise<Panel[]> {
  const rows = await sql<PanelRow[]>`
    select p.id, p.label
      from panels p
     where p.active
       and not exists (
             select 1
               from bookings b
              where b.panel_id  = p.id
                and b.slot_date = ${date}::date
                and b.status    = 'booked'
                and int4range(b.slot_index, b.slot_index + b.slot_count)
                 && int4range(${slotIndex}::int, ${slotIndex}::int + ${slotCount}::int)
           )
     order by p.sort_order, p.id
  `;
  return rows.map((row) => ({ id: row.id, label: row.label }));
}


export async function listCandidates(): Promise<CandidateSummary[]> {
  const rows = await sql<{ id: string; name: string }[]>`
    select id, name
      from candidates
     where active
     order by name
  `;
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

export async function findCandidateByToken(
  token: string,
): Promise<CandidateSummary | null> {
  const rows = await sql<{ id: string; name: string }[]>`
    select id, name
      from candidates
     where token = ${token}
       and active
     limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, name: row.name };
}

async function bookingsFor(
  date: string,
  panelId: string | null,
): Promise<BookingRow[]> {
  return sql<BookingRow[]>`
    select b.id,
           b.panel_id,
           b.candidate_id,
           c.name as candidate_name,
           b.company_name,
           b.session_type,
           to_char(b.slot_date, 'YYYY-MM-DD') as slot_date,
           b.slot_index,
           b.slot_count
      from bookings b
      join candidates c on c.id = b.candidate_id
     where b.status = 'booked'
       and b.slot_date = ${date}::date
       ${panelId ? sql`and b.panel_id = ${panelId}` : sql``}
     order by b.slot_index
  `;
}

/**
 * The booking day as the timetable renders it: every panel folded into one
 * column of half-hour blocks, with the panels still free at each time.
 */
export async function getDayView(
  date: string,
  panels: Panel[],
  viewerCandidateId: string | null,
): Promise<Slot[]> {
  const rows = await bookingsFor(date, null);
  const bySlot = new Map<number, Booking[]>();

  for (const row of rows) {
    const booking = toBooking(row, viewerCandidateId);
    const visible =
      viewerCandidateId === null ? booking : redactForCandidate(booking);

    // A 2-hour session blocks all four of its half-hour blocks, so it is
    // listed against each one. Callers that want it once can filter on
    // booking.slotIndex === slot.index.
    for (const index of coveredSlots(booking.slotIndex, booking.slotCount)) {
      const list = bySlot.get(index) ?? [];
      list.push(visible);
      bySlot.set(index, list);
    }
  }

  return ALL_SLOT_INDEXES.map<Slot>((index) => {
    const bookings = bySlot.get(index) ?? [];
    const taken = new Set(bookings.map((booking) => booking.panelId));
    const freePanelIds = panels
      .filter((panel) => !taken.has(panel.id))
      .map((panel) => panel.id);

    return {
      index,
      status: freePanelIds.length > 0 ? "available" : "booked",
      freePanelIds,
      bookings,
    };
  });
}

/** Every panel's bookings for a date, for the controller grid. */
export async function getScheduleView(date: string): Promise<Booking[]> {
  const rows = await bookingsFor(date, null);
  return rows.map((row) => toBooking(row, null));
}

// --- controllers ------------------------------------------------------------

export type ControllerRecord = {
  id: string;
  username: string;
  name: string;
  passwordHash: string;
};

export async function findControllerByUsername(
  username: string,
): Promise<ControllerRecord | null> {
  const rows = await sql<
    { id: string; username: string; name: string; password_hash: string }[]
  >`
    select id, username, name, password_hash
      from controllers
     where username = ${username}
       and active
     limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    passwordHash: row.password_hash,
  };
}

export async function findControllerById(
  id: string,
): Promise<ControllerRecord | null> {
  const rows = await sql<
    { id: string; username: string; name: string; password_hash: string }[]
  >`
    select id, username, name, password_hash
      from controllers
     where id = ${id}
       and active
     limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    passwordHash: row.password_hash,
  };
}

export async function updateControllerPassword(
  id: string,
  passwordHash: string,
): Promise<void> {
  await sql`
    update controllers
       set password_hash = ${passwordHash},
           updated_at    = now()
     where id = ${id}
  `;
}

// --- candidate administration ----------------------------------------------

export type CandidateRecord = {
  id: string;
  token: string;
  name: string;
  phone: string | null;
  active: boolean;
  bookingCount: number;
};

/** Full roster for the controller's Candidates page, disabled ones included. */
export async function listCandidateRecords(): Promise<CandidateRecord[]> {
  const rows = await sql<
    {
      id: string;
      token: string;
      name: string;
      phone: string | null;
      active: boolean;
      booking_count: number;
    }[]
  >`
    select c.id,
           c.token,
           c.name,
           c.phone,
           c.active,
           count(b.id) filter (where b.status = 'booked')::int as booking_count
      from candidates c
      left join bookings b on b.candidate_id = c.id
     group by c.id
     order by c.active desc, c.name
  `;

  return rows.map((row) => ({
    id: row.id,
    token: row.token,
    name: row.name,
    phone: row.phone,
    active: row.active,
    bookingCount: Number(row.booking_count),
  }));
}

export async function insertCandidate(input: {
  token: string;
  name: string;
  phone: string | null;
}): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    insert into candidates (token, name, phone)
    values (${input.token}, ${input.name}, ${input.phone})
    returning id
  `;
  return rows[0].id;
}

export async function setCandidateActive(
  id: string,
  active: boolean,
): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    update candidates set active = ${active} where id = ${id} returning id
  `;
  return rows.length > 0;
}
