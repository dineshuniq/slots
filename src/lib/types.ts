export type SessionType = "Interview" | "Assessment";

export const SESSION_TYPES: SessionType[] = ["Interview", "Assessment"];

export function isSessionType(value: unknown): value is SessionType {
  return value === "Interview" || value === "Assessment";
}

export type Role = "candidate" | "controller";

/** Where a candidate came from: one of ours, or a walk-in. */
export type CandidateSource = "Direct" | "Uniq";

export const CANDIDATE_SOURCES: CandidateSource[] = ["Uniq", "Direct"];

export function isCandidateSource(value: unknown): value is CandidateSource {
  return value === "Direct" || value === "Uniq";
}

export type Panel = {
  id: string;
  label: string;
};

export type CandidateSummary = {
  id: string;
  name: string;
};

/** A booking as returned to the client. */
export type Booking = {
  id: string;
  panelId: string;
  candidateId: string;
  candidateName: string;
  companyName: string;
  sessionType: SessionType;
  slotDate: string;
  slotIndex: number;
  /** Length in half-hour blocks: 1 = 30 min ... 4 = 2 hours. */
  slotCount: number;
  /** Who to call about this session. Either may be blank. */
  recruiterPhone: string | null;
  recruiterEmail: string | null;
  /** No mock recorded for this candidate on this date yet. */
  needsMock: boolean;
  isOwn: boolean;
};

export type SlotStatus = "available" | "booked" | "unavailable";

/**
 * One half-hour block across every panel. A block is still "available" while
 * any panel is free at that time, because a candidate is allocated a panel
 * when the slot is booked rather than being pinned to one.
 */
export type Slot = {
  index: number;
  status: SlotStatus;
  freePanelIds: string[];
  bookings: Booking[];
};

/** Payload of GET /api/day - the whole day, every panel, for one date. */
export type DayView = {
  date: string;
  panels: Panel[];
  /** Panels shut for this date; excluded from every slot free list. */
  closedPanelIds: string[];
  slots: Slot[];
  /** Queue for this date. Candidates receive only their own entries. */
  waiting: WaitingSummary[];
  fetchedAt: string;
};

/** A place in the queue, as the booking screen shows it. */
export type WaitingSummary = {
  id: string;
  candidateId: string;
  candidateName: string;
  slotIndex: number;
  slotCount: number;
  companyName: string;
  sessionType: SessionType;
  recruiterPhone: string | null;
  recruiterEmail: string | null;
  reason: "slot_full" | "panel_closed";
  position: number;
  isOwn: boolean;
};

/** Payload of GET /api/schedule - every panel for one date. */
export type ScheduleView = {
  date: string;
  panels: Panel[];
  bookings: Booking[];
  fetchedAt: string;
};

export type Viewer =
  | { role: "candidate"; candidate: CandidateSummary }
  | { role: "controller"; name: string };
