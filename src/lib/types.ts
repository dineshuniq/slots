export type SessionType = "Interview" | "Assessment";

export const SESSION_TYPES: SessionType[] = ["Interview", "Assessment"];

export function isSessionType(value: unknown): value is SessionType {
  return value === "Interview" || value === "Assessment";
}

export type Role = "candidate" | "controller";

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
  isOwn: boolean;
};

export type SlotStatus = "available" | "booked";

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
  slots: Slot[];
  fetchedAt: string;
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
