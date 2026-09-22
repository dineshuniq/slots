/**
 * The working day is a fixed grid of half-hour blocks from 07:00 to 20:00.
 * A slot is addressed by its index: 0 => 07:00-07:30 ... 25 => 19:30-20:00.
 *
 * Everything here resolves "today" and "now" through one configured timezone
 * (NEXT_PUBLIC_SCHEDULE_TIMEZONE). A panel operation runs in one place, and
 * without this the server - UTC on Vercel - and the browser would disagree
 * about which column of the carousel is today.
 */

export const SLOT_MINUTES = 30;
export const DAY_START_MINUTES = 7 * 60; // 07:00
export const DAY_END_MINUTES = 20 * 60; // 20:00
export const SLOT_COUNT = (DAY_END_MINUTES - DAY_START_MINUTES) / SLOT_MINUTES; // 26

/** Date carousel: yesterday through six days out, eight days in total. */
export const WINDOW_DAYS_BACK = 1;
export const WINDOW_DAYS_FORWARD = 6;
export const WINDOW_LENGTH = WINDOW_DAYS_BACK + 1 + WINDOW_DAYS_FORWARD; // 8

/** IANA zone, or undefined to fall back to each runtime's local time. */
export const SCHEDULE_TIMEZONE: string | undefined =
  process.env.NEXT_PUBLIC_SCHEDULE_TIMEZONE || undefined;

export const ALL_SLOT_INDEXES: number[] = Array.from(
  { length: SLOT_COUNT },
  (_, i) => i,
);

export function isValidSlotIndex(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < SLOT_COUNT
  );
}

const pad = (value: number) => String(value).padStart(2, "0");

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function zonedParts(instant: Date): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SCHEDULE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(instant)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Some engines render midnight as "24" under hour12: false.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/** Today's calendar date in the schedule timezone, as YYYY-MM-DD. */
export function todayKey(instant: Date = new Date()): string {
  const { year, month, day } = zonedParts(instant);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Minutes since midnight in the schedule timezone. */
export function nowMinutes(instant: Date = new Date()): number {
  const { hour, minute } = zonedParts(instant);
  return hour * 60 + minute;
}

function minutesToLabel(totalMinutes: number): string {
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${pad(minutes)} ${suffix}`;
}

export function slotStartMinutes(index: number): number {
  return DAY_START_MINUTES + index * SLOT_MINUTES;
}

/** "7:00 AM" */
export function slotStartLabel(index: number): string {
  return minutesToLabel(slotStartMinutes(index));
}

/** "7:30 AM" */
export function slotEndLabel(index: number): string {
  return minutesToLabel(slotStartMinutes(index) + SLOT_MINUTES);
}

/** "7:00 AM - 7:30 AM" */
export function slotRangeLabel(index: number): string {
  return `${slotStartLabel(index)} \u2013 ${slotEndLabel(index)}`;
}

/**
 * Date keys are calendar labels, not instants, so they are parsed as plain
 * local dates purely to do day arithmetic and read weekday names.
 */
export function fromDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function shiftDateKey(key: string, days: number): string {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = fromDateKey(value);
  return !Number.isNaN(parsed.getTime()) && toDateKey(parsed) === value;
}

export type CarouselDay = {
  key: string;
  weekday: string;
  dayOfMonth: string;
  month: string;
  isToday: boolean;
  isPast: boolean;
};

/** The eight-day window rendered by the date carousel. */
export function buildDateWindow(instant: Date = new Date()): CarouselDay[] {
  const today = todayKey(instant);
  return Array.from({ length: WINDOW_LENGTH }, (_, offset) => {
    const key = shiftDateKey(today, offset - WINDOW_DAYS_BACK);
    const date = fromDateKey(key);
    return {
      key,
      weekday: date.toLocaleDateString(undefined, { weekday: "short" }),
      dayOfMonth: String(date.getDate()),
      month: date.toLocaleDateString(undefined, { month: "short" }),
      isToday: key === today,
      isPast: key < today,
    };
  });
}

/** Rejects dates outside the eight-day booking window. */
export function isDateInWindow(key: string, instant: Date = new Date()): boolean {
  const today = todayKey(instant);
  return (
    key >= shiftDateKey(today, -WINDOW_DAYS_BACK) &&
    key <= shiftDateKey(today, WINDOW_DAYS_FORWARD)
  );
}

export function longDateLabel(key: string): string {
  return fromDateKey(key).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** True once a slot's end time has passed, used to grey out dead blocks. */
export function isSlotInPast(
  dateKey: string,
  index: number,
  instant: Date = new Date(),
): boolean {
  const today = todayKey(instant);
  if (dateKey < today) return true;
  if (dateKey > today) return false;
  return slotStartMinutes(index) + SLOT_MINUTES <= nowMinutes(instant);
}
