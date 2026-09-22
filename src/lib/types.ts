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
  panelId: string;
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

export type Slot = {
  index: number;
  status: SlotStatus;
  booking: Booking | null;
};

/** Payload of GET /api/day - one panel's timetable for one date. */
export type DayView = {
  date: string;
  panel: Panel;
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
  | { role: "candidate"; candidate: CandidateSummary; panel: Panel }
  | { role: "controller"; name: string };
