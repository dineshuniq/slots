type Props = {
  showOwn?: boolean;
};

const SWATCH = "inline-block h-3 w-3 rounded-sm border";

export default function SlotLegend({ showOwn = false }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
      <span className="flex items-center gap-1.5">
        <span className={`${SWATCH} border-emerald-300 bg-emerald-100`} />
        Available
      </span>
      <span className="flex items-center gap-1.5">
        <span className={`${SWATCH} border-rose-300 bg-rose-100`} />
        Blocked
      </span>
      {showOwn ? (
        <span className="flex items-center gap-1.5">
          <span className={`${SWATCH} border-rose-500 bg-rose-500`} />
          Your booking
        </span>
      ) : null}
      <span className="flex items-center gap-1.5">
        <span className={`${SWATCH} border-slate-300 bg-slate-100`} />
        Past
      </span>
    </div>
  );
}
