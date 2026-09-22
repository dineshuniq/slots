type Props = {
  /** "bar" spans a card; "strip" is the thinner version for a grid chip. */
  size?: "bar" | "strip";
};

/** One pass of the message; the track renders it twice to loop seamlessly. */
const SEQUENCE = Array.from({ length: 6 });

/**
 * Marks a session whose candidate has not sat their mock yet.
 *
 * The text repeats across the whole width and slides right to left, so it
 * reads as unfinished business wherever the session appears. It disappears by
 * itself: `needsMock` comes from whether a mock is recorded for that candidate
 * on that date, so ticking one off on the Mock page clears this on the next
 * poll without anything here having to know.
 */
export default function NeedMock({ size = "bar" }: Props) {
  const height = size === "bar" ? "py-1.5 text-[11px]" : "py-0.5 text-[9px]";

  return (
    <div
      className={`overflow-hidden rounded bg-amber-400 font-bold tracking-wider text-amber-950 uppercase ${height}`}
      // The words are already in the DOM twice for the loop; announce once.
      role="status"
      aria-label="Needs mock"
    >
      <div className="need-mock-track" aria-hidden>
        {/* Rendered twice: the animation shifts by half the track width. */}
        {[0, 1].map((pass) => (
          <div key={pass} className="flex shrink-0">
            {SEQUENCE.map((_, index) => (
              <span
                key={index}
                className="flex shrink-0 items-center gap-1 px-2 whitespace-nowrap"
              >
                NEED-MOCK
                <span className="opacity-70">&#8249;&#8249;&#8249;</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
