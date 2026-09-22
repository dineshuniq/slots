import {
  CANDIDATE_LEGEND,
  CONTROLLER_LEGEND,
  TONES,
  type Tone,
} from "@/lib/tone";

type Props = {
  /** Candidates get the "Your session" swatch; controllers do not have one. */
  showOwn?: boolean;
};

export default function SlotLegend({ showOwn = false }: Props) {
  const tones: Tone[] = showOwn ? CANDIDATE_LEGEND : CONTROLLER_LEGEND;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600">
      {tones.map((tone) => (
        <span key={tone} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={`inline-block h-3 w-3 shrink-0 rounded-sm border ${TONES[tone].swatch}`}
          />
          {TONES[tone].label}
        </span>
      ))}
    </div>
  );
}
