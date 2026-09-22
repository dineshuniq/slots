type Props = {
  /** Lighter chevrons, for a card that is already a solid dark colour. */
  onDark?: boolean;
  /** Smaller label, for a grid chip rather than a full-width card. */
  compact?: boolean;
  /** false leaves only the chevrons, where a tag would crowd the card. */
  label?: boolean;
};

/**
 * Marks a session whose candidate has not sat their mock yet.
 *
 * Chevrons drift right to left across the whole card, with an optional label.
 * The chevrons are a masked background layer sitting behind the text, so the
 * card keeps its own shape and nothing has to make room for a banner. The host
 * element needs `relative isolate overflow-hidden`.
 *
 * It clears itself: `needsMock` comes from whether a mock is recorded for that
 * candidate on that date, so ticking one off on the Mock page removes this on
 * the next poll without anything here having to know.
 */
export default function NeedMock({
  onDark = false,
  compact = false,
  label = true,
}: Props) {
  return (
    <>
      <span
        // Without the label the chevrons carry the message on their own, so
        // they are what gets announced.
        {...(label
          ? { "aria-hidden": true }
          : { role: "status", "aria-label": "Needs mock" })}
        className={`need-mock-field pointer-events-none absolute inset-0 -z-10 ${
          onDark ? "need-mock-field-dark" : ""
        }`}
      />

      {label ? (
        <span
          role="status"
          aria-label="Needs mock"
          className={`inline-flex w-fit items-center rounded bg-amber-400 font-bold tracking-wider text-amber-950 uppercase ${
            compact ? "px-1.5 py-px text-[9px]" : "px-2 py-0.5 text-[10px]"
          }`}
        >
          Need mock
        </span>
      ) : null}
    </>
  );
}
