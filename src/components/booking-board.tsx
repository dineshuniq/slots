"use client";

import { useCallback, useMemo, useState } from "react";

import BookingDialog, { type BookingTarget } from "@/components/booking-dialog";
import DateCarousel from "@/components/date-carousel";
import SlotLegend from "@/components/slot-legend";
import {
  APPROVAL_LABEL,
  canStartAt,
  coveredSlots,
  DURATION_CHOICES,
  durationLabel,
  EXTRA_HOURS_NOTE,
  fitsInDay,
  hasExtraHours,
  isSlotInPast,
  longDateLabel,
  sessionRangeLabel,
  slotEndLabel,
  slotStartLabel,
  type CarouselDay,
} from "@/lib/time";
import type {
  Booking,
  CandidateSummary,
  DayView,
  Panel,
  Slot,
} from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { usePolledResource } from "@/lib/use-poll";

type Props = {
  role: "candidate" | "controller";
  panels: Panel[];
  candidates: CandidateSummary[];
  days: CarouselDay[];
  today: string;
};

/**
 * The booking timetable: eight-day carousel, then the 07:00-20:00 day in
 * half-hour blocks.
 *
 * No panel is picked here. Nobody is tied to a panel, so a block stays open
 * while any panel is free at that time - candidates get one allocated on
 * booking, and only controllers choose which.
 */
export default function BookingBoard({
  role,
  panels: initialPanels,
  candidates,
  days,
  today,
}: Props) {
  const [dateKey, setDateKey] = useState(today);
  const [slotCount, setSlotCount] = useState(1);
  const [target, setTarget] = useState<BookingTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Past-slot shading depends on the wall clock, which the server does not
  // share with the browser. Null until hydration, so both render the same.
  const now = useNow();

  const { data, error, loading, refresh } = usePolledResource<DayView>(
    `/api/day?date=${dateKey}`,
  );

  const panels = data?.panels ?? initialPanels;

  const panelLabel = useCallback(
    (panelId: string) =>
      panels.find((panel) => panel.id === panelId)?.label ?? panelId,
    [panels],
  );

  const slotIsPast = useCallback(
    (index: number) => (now ? isSlotInPast(dateKey, index, now) : false),
    [dateKey, now],
  );

  async function release(bookingId: string) {
    setNotice(null);
    const response = await fetch(`/api/bookings/${bookingId}`, {
      method: "DELETE",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(result.error ?? "Could not release that slot.");
      return;
    }
    void refresh();
  }

  const slots: Slot[] = useMemo(() => data?.slots ?? [], [data]);

  /**
   * Panels free for a whole session starting here. A 2-hour session needs the
   * SAME panel free across all four blocks, so this is an intersection, not a
   * union - which is why availability depends on the chosen length.
   */
  const panelsFreeFrom = useCallback(
    (index: number): string[] => {
      const window = coveredSlots(index, slotCount);
      if (window.some((i) => i >= slots.length)) return [];

      return window.reduce<string[]>(
        (free, i, position) =>
          position === 0
            ? slots[i].freePanelIds
            : free.filter((panelId) => slots[i].freePanelIds.includes(panelId)),
        [],
      );
    },
    [slots, slotCount],
  );

  // Start times that can actually take a session of the chosen length, so the
  // count never claims a morning that has gone, or a gap too short to use.
  const openCount = slots.filter(
    (slot) =>
      canStartAt(dateKey, slot.index, slotCount, now ?? undefined) &&
      panelsFreeFrom(slot.index).length > 0,
  ).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Book a slot
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {role === "candidate"
            ? "Pick a time. A free panel is allocated to you automatically."
            : "Availability is counted across every panel."}
        </p>
      </header>

      <section className="mt-5">
        <DateCarousel days={days} selected={dateKey} onSelect={setDateKey} />
      </section>

      <section className="mt-5">
        <fieldset>
          <legend className="text-sm font-medium text-slate-700">
            Session length
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {DURATION_CHOICES.map((choice) => (
              <label
                key={choice.slots}
                className={
                  slotCount === choice.slots
                    ? "cursor-pointer rounded-lg border border-slate-900 bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition"
                    : "cursor-pointer rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
                }
              >
                <input
                  type="radio"
                  name="slotCount"
                  value={choice.slots}
                  checked={slotCount === choice.slots}
                  onChange={() => setSlotCount(choice.slots)}
                  className="sr-only"
                />
                {choice.label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Longer sessions need the same panel free for the whole time, so
            fewer start times will be open.
          </p>
        </fieldset>
      </section>

      <section className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {longDateLabel(dateKey)}
          </h2>
          <p className="text-sm text-slate-600">
            {loading && !data
              ? "Loading timetable..."
              : `${openCount} start time${openCount === 1 ? "" : "s"} open for ${durationLabel(slotCount)}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <SlotLegend showOwn={role === "candidate"} />
          <p className="text-xs text-slate-500">
            <span className="mr-1 inline-block rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-amber-950 uppercase">
              {APPROVAL_LABEL}
            </span>
            applies {EXTRA_HOURS_NOTE}
          </p>
        </div>
      </section>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {notice}
        </p>
      ) : null}

      <section className="mt-4 columns-1 gap-3 lg:columns-2">
        {slots.map((slot) => {
          const past = slotIsPast(slot.index);
          const timeLabel = `${slotStartLabel(slot.index)} - ${slotEndLabel(slot.index)}`;
          // Extra hours are chargeable, so this has to be obvious before
          // anyone picks the slot, not a surprise at confirmation.
          const needsApproval = hasExtraHours(slot.index, slotCount);
          const freePanels = panelsFreeFrom(slot.index);
          const freeCount = freePanels.length;
          const canBook =
            canStartAt(dateKey, slot.index, slotCount, now ?? undefined) &&
            freeCount > 0;

          // Controllers see every session at this time; candidates only ever
          // see their own - the rest are just panels that are no longer free.
          // A long session is listed against every block it covers, so it is
          // only described on the block it starts in.
          const detailed: Booking[] = (
            role === "controller"
              ? slot.bookings
              : slot.bookings.filter((booking) => booking.isOwn)
          ).filter((booking) => booking.slotIndex === slot.index);

          const mine = detailed.some((booking) => booking.isOwn);

          const tone = past
            ? "border-slate-200 bg-slate-50"
            : mine
              ? "border-rose-500 bg-rose-50"
              : canBook
                ? "border-emerald-300 bg-emerald-50"
                : "border-rose-200 bg-rose-50";

          const dot = past
            ? "bg-slate-300"
            : canBook
              ? "bg-emerald-500"
              : "bg-rose-500";

          // A candidate is not concerned with which panel, only whether the
          // time is open at all. "No room" and "not enough day left" are
          // different problems, so they do not share a message.
          const summary = past
            ? "Past"
            : !fitsInDay(slot.index, slotCount)
              ? `Too late for ${durationLabel(slotCount)}`
              : freeCount === 0
                ? role === "candidate"
                  ? "Fully booked"
                  : "All panels booked"
                : role === "candidate"
                  ? "Available"
                  : `${freeCount} of ${panels.length} panel${panels.length === 1 ? "" : "s"} free`;

          return (
            <div
              key={slot.index}
              className={`mb-3 break-inside-avoid rounded-xl border px-4 py-3 ${tone}`}
            >
              {needsApproval ? (
                <p
                  className={`-mx-4 -mt-3 mb-3 rounded-t-xl px-4 py-2 text-center text-xs font-bold tracking-wider uppercase ${
                    past
                      ? "bg-slate-200 text-slate-500"
                      : "bg-amber-400 text-amber-950"
                  }`}
                >
                  {APPROVAL_LABEL}
                </p>
              ) : null}

              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-semibold tabular-nums ${past ? "text-slate-400" : "text-slate-900"}`}
                  >
                    {timeLabel}
                  </p>
                  <p
                    className={`truncate text-xs ${
                      past
                        ? "text-slate-400"
                        : canBook
                          ? "text-emerald-700"
                          : "text-rose-700"
                    }`}
                  >
                    {summary}
                  </p>
                </div>

                {canBook ? (
                  <button
                    type="button"
                    onClick={() =>
                      setTarget({
                        dateKey,
                        slotIndex: slot.index,
                        slotCount,
                        panelIds: freePanels,
                      })
                    }
                    className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-emerald-700"
                  >
                    Book
                  </button>
                ) : null}
              </div>

              {detailed.length > 0 ? (
                <ul className="mt-2 space-y-1 border-t border-slate-900/5 pt-2">
                  {detailed.map((booking) => (
                    <li
                      key={booking.id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span
                        className={`shrink-0 rounded bg-white/70 px-1.5 py-0.5 font-medium ${past ? "text-slate-400" : "text-slate-700"}`}
                      >
                        {panelLabel(booking.panelId)}
                      </span>
                      <span
                        className={`min-w-0 flex-1 truncate ${past ? "text-slate-400" : "text-rose-700"}`}
                      >
                        {booking.candidateName} / {booking.companyName} /{" "}
                        {booking.sessionType}
                        {booking.slotCount > 1
                          ? ` / ${sessionRangeLabel(booking.slotIndex, booking.slotCount)}`
                          : ""}
                      </span>
                      {booking.isOwn && !past ? (
                        <button
                          type="button"
                          onClick={() => release(booking.id)}
                          className="shrink-0 rounded-lg border border-rose-300 px-2 py-0.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100"
                        >
                          Release
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </section>

      {target ? (
        <BookingDialog
          key={`${target.dateKey}:${target.slotIndex}:${target.slotCount}`}
          target={target}
          role={role}
          panels={panels}
          candidates={candidates}
          onClose={() => setTarget(null)}
          onBooked={refresh}
        />
      ) : null}
    </div>
  );
}
