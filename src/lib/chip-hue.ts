/**
 * Colour for a session chip on the Schedule grid.
 *
 * A booking on the controller's grid is a success, not a warning, so it is not
 * red. Each company gets one hue from a cool, calm family and keeps it all day:
 * the same company is the same colour in every panel, so a controller can pick
 * out every Wipro session at a glance.
 *
 * The family avoids every colour that already carries a meaning elsewhere -
 * emerald (available), sky (moving, waiting), amber (approval, need-mock),
 * rose (taken, on the candidate side), slate (past, closed).
 *
 * Class names are written out in full so Tailwind's scanner finds them.
 */

export type ChipHue = {
  /** Body and border. */
  card: string;
  /** The rail down the left edge. */
  rail: string;
  name: string;
  company: string;
  /** Session type, inline after the name. */
  session: string;
  /** Gradient that fades the need-mock chevrons out under the text. */
  fade: string;
};

const HUES: ChipHue[] = [
  {
    card: "bg-indigo-100 border-indigo-200",
    rail: "bg-indigo-500",
    name: "text-indigo-900",
    company: "text-indigo-700",
    session: "text-indigo-600",
    fade: "from-indigo-100 from-40% via-indigo-100/80 via-60% to-transparent to-90%",
  },
  {
    card: "bg-teal-100 border-teal-200",
    rail: "bg-teal-500",
    name: "text-teal-900",
    company: "text-teal-700",
    session: "text-teal-600",
    fade: "from-teal-100 from-40% via-teal-100/80 via-60% to-transparent to-90%",
  },
  {
    card: "bg-violet-100 border-violet-200",
    rail: "bg-violet-500",
    name: "text-violet-900",
    company: "text-violet-700",
    session: "text-violet-600",
    fade: "from-violet-100 from-40% via-violet-100/80 via-60% to-transparent to-90%",
  },
  {
    card: "bg-blue-100 border-blue-200",
    rail: "bg-blue-500",
    name: "text-blue-900",
    company: "text-blue-700",
    session: "text-blue-600",
    fade: "from-blue-100 from-40% via-blue-100/80 via-60% to-transparent to-90%",
  },
  {
    card: "bg-fuchsia-100 border-fuchsia-200",
    rail: "bg-fuchsia-500",
    name: "text-fuchsia-900",
    company: "text-fuchsia-700",
    session: "text-fuchsia-600",
    fade: "from-fuchsia-100 from-40% via-fuchsia-100/80 via-60% to-transparent to-90%",
  },
  {
    card: "bg-cyan-100 border-cyan-200",
    rail: "bg-cyan-600",
    name: "text-cyan-900",
    company: "text-cyan-800",
    session: "text-cyan-700",
    fade: "from-cyan-100 from-40% via-cyan-100/80 via-60% to-transparent to-90%",
  },
];

/**
 * The hue for a company. Case and surrounding spaces are ignored, so "Wipro"
 * and "wipro " land on the same colour.
 */
export function chipHue(company: string): ChipHue {
  let hash = 0;
  for (const char of company.trim().toLowerCase()) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return HUES[hash % HUES.length];
}
