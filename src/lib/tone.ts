/**
 * The colour language of the app, in one place.
 *
 * Every colour carries one meaning and no other. The rule that matters most is
 * that YOUR OWN session is not the same colour as someone else's: both were
 * rose before, so a candidate could not tell at a glance which sessions were
 * theirs. Own is indigo, taken-by-someone-else is rose.
 *
 * Components import these rather than writing Tailwind classes inline, so a
 * state cannot drift to a different colour on a different screen.
 */

export type Tone =
  | "available"
  | "own"
  | "booked"
  | "waiting"
  | "approval"
  | "closed"
  | "past";

type ToneStyle = {
  /** Card border + background. */
  card: string;
  /** The small status dot. */
  dot: string;
  /** Supporting text inside the card. */
  text: string;
  /** Solid chip, for badges that must carry the colour on their own. */
  chip: string;
  /** Legend swatch. */
  swatch: string;
  label: string;
};

export const TONES: Record<Tone, ToneStyle> = {
  available: {
    card: "border-emerald-300 bg-emerald-50",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    chip: "bg-emerald-600 text-white",
    swatch: "border-emerald-400 bg-emerald-100",
    label: "Available",
  },
  own: {
    card: "border-indigo-400 bg-indigo-50",
    dot: "bg-indigo-500",
    text: "text-indigo-700",
    chip: "bg-indigo-600 text-white",
    swatch: "border-indigo-400 bg-indigo-200",
    label: "Your session",
  },
  booked: {
    card: "border-rose-200 bg-rose-50",
    dot: "bg-rose-500",
    text: "text-rose-700",
    chip: "bg-rose-600 text-white",
    swatch: "border-rose-300 bg-rose-100",
    label: "Taken",
  },
  waiting: {
    card: "border-sky-300 bg-sky-50",
    dot: "bg-sky-500",
    text: "text-sky-800",
    chip: "bg-sky-600 text-white",
    swatch: "border-sky-400 bg-sky-100",
    label: "Waiting list",
  },
  approval: {
    card: "border-amber-300 bg-amber-50",
    dot: "bg-amber-500",
    text: "text-amber-900",
    chip: "bg-amber-400 text-amber-950",
    swatch: "border-amber-400 bg-amber-300",
    label: "Needs approval",
  },
  closed: {
    card: "border-slate-400 bg-slate-200",
    dot: "bg-slate-500",
    text: "text-slate-700",
    chip: "bg-slate-600 text-white",
    swatch: "border-slate-400 bg-slate-300",
    label: "Panel closed",
  },
  past: {
    card: "border-slate-200 bg-slate-50",
    dot: "bg-slate-300",
    text: "text-slate-400",
    chip: "bg-slate-200 text-slate-500",
    swatch: "border-slate-300 bg-slate-100",
    label: "Past",
  },
};

/** Which states a screen explains, in reading order. */
export const CANDIDATE_LEGEND: Tone[] = [
  "available",
  "own",
  "booked",
  "waiting",
  "approval",
  "closed",
  "past",
];

export const CONTROLLER_LEGEND: Tone[] = [
  "available",
  "booked",
  "waiting",
  "approval",
  "closed",
  "past",
];

/** Shared button shapes, so an action looks the same wherever it appears. */
export const BUTTON = {
  primary:
    "rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60",
  book: "rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60",
  waitlist:
    "rounded-lg border border-sky-500 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 disabled:opacity-60",
  release:
    "rounded-lg border border-rose-400 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60",
  quiet:
    "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60",
  danger:
    "rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60",
};
