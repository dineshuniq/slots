import { sql } from "@/lib/db";
import { ALL_SLOT_INDEXES } from "@/lib/time";
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

export async function listCandidates(): Promise<CandidateSummary[]> {
  const rows = await sql<{ id: string; name: string; panel_id: string }[]>`
    select id, name, panel_id
      from candidates
     where active
     order by name
  `;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    panelId: row.panel_id,
  }));
}

export async function findCandidateByToken(
  token: string,
): Promise<(CandidateSummary & { panelLabel: string }) | null> {
  const rows = await sql<
    { id: string; name: string; panel_id: string; panel_label: string }[]
  >`
    select c.id, c.name, c.panel_id, p.label as panel_label
      from candidates c
      join panels p on p.id = c.panel_id
     where c.token = ${token}
       and c.active
     limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    panelId: row.panel_id,
    panelLabel: row.panel_label,
  };
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
           b.slot_index
      from bookings b
      join candidates c on c.id = b.candidate_id
     where b.status = 'booked'
       and b.slot_date = ${date}::date
       ${panelId ? sql`and b.panel_id = ${panelId}` : sql``}
     order by b.slot_index
  `;
}

/** One panel's day, as the candidate timetable renders it. */
export async function getDayView(
  date: string,
  panelId: string,
  viewerCandidateId: string | null,
): Promise<Slot[]> {
  const rows = await bookingsFor(date, panelId);
  const bySlot = new Map<number, Booking>();

  for (const row of rows) {
    const booking = toBooking(row, viewerCandidateId);
    bySlot.set(
      booking.slotIndex,
      viewerCandidateId === null ? booking : redactForCandidate(booking),
    );
  }

  return ALL_SLOT_INDEXES.map<Slot>((index) => {
    const booking = bySlot.get(index) ?? null;
    return {
      index,
      status: booking ? "booked" : "available",
      booking,
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
  panelId: string;
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
      panel_id: string;
      active: boolean;
      booking_count: number;
    }[]
  >`
    select c.id,
           c.token,
           c.name,
           c.phone,
           c.panel_id,
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
    panelId: row.panel_id,
    active: row.active,
    bookingCount: Number(row.booking_count),
  }));
}

export async function insertCandidate(input: {
  token: string;
  name: string;
  phone: string | null;
  panelId: string;
}): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    insert into candidates (token, name, phone, panel_id)
    values (${input.token}, ${input.name}, ${input.phone}, ${input.panelId})
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
