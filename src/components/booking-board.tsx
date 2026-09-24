"use client";

import { useCallback, useMemo, useState } from "react";

import BookingDialog, { type BookingTarget } from "@/components/booking-dialog";
import NeedMock from "@/components/need-mock";
import DateCarousel from "@/components/date-carousel";
import SlotLegend from "@/components/slot-legend";
import {
  APPROVAL_LABEL,
  canStartAt,
  coveredSlots,
  durationLabel,
  EXTRA_HOURS_NOTE,
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
  WaitingSummary,
} from "@/lib/types";
import { BUTTON, TONES, type Tone } from "@/lib/tone";
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

  async function leaveQueue(waitingId: string) {
    setNotice(null);
    const response = await fetch(`/api/waiting-list/${waitingId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setNotice(result.error ?? "Could not leave the waiting list.");
      return;
    }
    void refresh();
  }

  async function release(booking: Booking) {
    // A controller is cancelling someone else's session, so say whose.
    if (!booking.isOwn) {
      const confirmed = window.confirm(
        `Release ${booking.candidateName}'s session on ${booking.panelId}, ` +
          `${sessionRangeLabel(booking.slotIndex, booking.slotCount)}?`,
      );
      if (!confirmed) return;
    }

    setNotice(null);
    const response = await fetch(`/api/bookings/${booking.id}`, {
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

  const waitingBySlot = useMemo(() => {
    const map = new Map<number, WaitingSummary[]>();
    for (const entry of data?.waiting ?? []) {
      const list = map.get(entry.slotIndex) ?? [];
      list.push(entry);
      map.set(entry.slotIndex, list);
    }
    return map;
  }, [data]);

  /**
   * Panels free for a whole session of this length starting here. A 2-hour
   * session needs the SAME panel free across all four blocks, so this is an
   * intersection, not a union - which is why the dialog re-asks this whenever
   * the length is changed there.
   */
  const panelsFreeFrom = useCallback(
    (index: number, count: number): string[] => {
      const window = coveredSlots(index, count);
      if (window.some((i) => i >= slots.length)) return [];

      return window.reduce<string[]>(
        (free, i, position) =>
          position === 0
            ? slots[i].freePanelIds
            : free.filter((panelId) => slots[i].freePanelIds.includes(panelId)),
        [],
      );
    },
    [slots],
  );

  /**
   * A candidate's own session is drawn once, as a single bar across the time
   * it occupies, instead of one card per half-hour block. Split across cards
   * it read as several separate bookings.
   */
  const ownSessions = useMemo(() => {
    const map = new Map<number, Booking>();
    if (role !== "candidate") return map;

    for (const slot of slots) {
      for (const booking of slot.bookings) {
        if (booking.isOwn) map.set(booking.slotIndex, booking);
      }
    }
    return map;
  }, [slots, role]);

  /** Blocks the bar covers, which therefore render nothing of their own. */
  const swallowed = useMemo(() => {
    const set = new Set<number>();
    for (const booking of ownSessions.values()) {
      for (const index of coveredSlots(booking.slotIndex, booking.slotCount)) {
        if (index !== booking.slotIndex) set.add(index);
      }
    }
    return set;
  }, [ownSessions]);

  // The board lists start times, not whole sessions: a block is open when a
  // panel is free for it and it has not gone by. Length is chosen in the
  // dialog, which re-checks availability for whatever is picked there.
  const openCount = slots.filter(
    (slot) =>
      canStartAt(dateKey, slot.index, 1, now ?? undefined) &&
      panelsFreeFrom(slot.index, 1).length > 0,
  ).length;

  return (
    <div className="mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-6">
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

      <section className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {longDateLabel(dateKey)}
          </h2>
          <p className="text-sm text-slate-600">
            {loading && !data
              ? "Loading timetable..."
              : `${openCount} start time${openCount === 1 ? "" : "s"} open`}
          </p>
          <p className="text-xs text-slate-500">
            Pick a start time - session length is chosen when you book.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
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

          // Covered by the bar above it.
          if (swallowed.has(slot.index)) return null;

          const ownSession = ownSessions.get(slot.index);
          if (ownSession) {
            const ownNeedsMock = ownSession.needsMock && !past;

            return (
              <div
                key={slot.index}
                className={`relative isolate mb-3 break-inside-avoid overflow-hidden rounded-xl shadow-sm ${
                  past ? "bg-slate-400 text-white" : "bg-indigo-600 text-white"
                }`}
              >
                {ownNeedsMock ? (
                  <div className="relative z-10 px-4 pt-3">
                    <NeedMock onDark />
                  </div>
                ) : null}

                <div className="relative z-10 flex items-center gap-4 px-4 py-3">
                <span className="shrink-0 text-2xl leading-none font-bold tracking-tight">
                  {panelLabel(ownSession.panelId)}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold tabular-nums">
                    {sessionRangeLabel(
                      ownSession.slotIndex,
                      ownSession.slotCount,
                    )}
                    <span className="ml-2 rounded bg-white/20 px-1.5 py-0.5 text-[11px] font-medium">
                      {durationLabel(ownSession.slotCount)}
                    </span>
                  </p>
                  <p className="truncate text-sm text-white/90">
                    {ownSession.companyName} &middot; {ownSession.sessionType}
                  </p>
                </div>

                {past ? (
                  <span className="shrink-0 text-xs font-medium text-white/80">
                    Done
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => release(ownSession)}
                    className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/40 transition hover:bg-white/25"
                  >
                    Release
                  </button>
                )}
                </div>
              </div>
            );
          }

          const timeLabel = `${slotStartLabel(slot.index)} - ${slotEndLabel(slot.index)}`;
          // Extra hours are chargeable, so this has to be obvious before
          // anyone picks the slot, not a surprise at confirmation.
          const needsApproval = hasExtraHours(slot.index, 1);
          const freePanels = panelsFreeFrom(slot.index, 1);
          const freeCount = freePanels.length;
          const startable = canStartAt(dateKey, slot.index, 1, now ?? undefined);

          // Every panel shut for this time, as opposed to merely taken.
          const unavailable = slot.status === "unavailable";

          // A candidate cannot be in two sessions at once, so a block one of
          // their own sessions already covers is not open to them however many
          // panels are free. Offering Book here would just earn a 409.
          const ownClash =
            role === "candidate" &&
            slot.bookings.some((booking) => booking.isOwn);

          const canBook = startable && !ownClash && freeCount > 0;

          const queue = waitingBySlot.get(slot.index) ?? [];
          const canJoinQueue =
            startable && !unavailable && !ownClash && freeCount === 0;

          // Controllers see every session at this time; candidates only ever
          // see their own - the rest are just panels that are no longer free.
          // A long session is listed against every block it covers, so it is
          // only described on the block it starts in.
          const visibleBookings: Booking[] =
            role === "controller"
              ? slot.bookings
              : slot.bookings.filter((booking) => booking.isOwn);

          // A session longer than one block is listed against every block it
          // covers. Describing it in full on each one reads as several separate
          // half-hour bookings, which is the confusion this split avoids.
          const detailed = visibleBookings.filter(
            (booking) => booking.slotIndex === slot.index,
          );
          const continuing = visibleBookings.filter(
            (booking) => booking.slotIndex < slot.index,
          );

          const mine = visibleBookings.some((booking) => booking.isOwn);

          const ownQueue = queue.some((entry) => entry.isOwn);

          const tone: Tone = past
            ? "past"
            : mine || ownClash
              ? "own"
              : unavailable
                ? "closed"
                : ownQueue
                  ? "waiting"
                  : canBook
                    ? "available"
                    : "booked";

          const style = TONES[tone];

          // A candidate is not concerned with which panel, only whether the
          // time is open at all. "No room" and "not enough day left" are
          // different problems, so they do not share a message.
          const summary = past
            ? "Past"
            : ownClash
              ? "You already have a session at this time"
              : unavailable
                ? "Panel unavailable at this time"
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
              className={`mb-3 break-inside-avoid rounded-xl border px-4 py-3 shadow-sm ${style.card}`}
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
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-semibold tabular-nums ${past ? "text-slate-400" : "text-slate-900"}`}
                  >
                    {timeLabel}
                  </p>
                  <p className={`truncate text-xs font-medium ${style.text}`}>
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
                        slotCount: 1,
                        panelIds: freePanels,
                        mode: "book",
                      })
                    }
                    className={`shrink-0 ${BUTTON.book}`}
                  >
                    Book
                  </button>
                ) : canJoinQueue ? (
                  <button
                    type="button"
                    onClick={() =>
                      setTarget({
                        dateKey,
                        slotIndex: slot.index,
                        slotCount: 1,
                        panelIds: [],
                        mode: "waitlist",
                      })
                    }
                    className={`shrink-0 ${BUTTON.waitlist}`}
                  >
                    Join waiting list
                  </button>
                ) : null}
              </div>

              {queue.length > 0 ? (
                <ul className="mt-2 space-y-1 border-t border-slate-900/5 pt-2">
                  {queue.map((entry) => (
                    <li
                      key={entry.id}
                      className={`flex items-center gap-2 text-xs ${TONES.waiting.text}`}
                    >
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 font-semibold ${TONES.waiting.chip}`}
                      >
                        Waiting #{entry.position}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {entry.isOwn && role === "candidate"
                          ? `You - ${entry.companyName} / ${entry.sessionType}`
                          : `${entry.candidateName} - ${entry.companyName}`}
                        {entry.reason === "panel_closed"
                          ? " (panel closed)"
                          : ""}
                      </span>
                      {entry.isOwn || role === "controller" ? (
                        <button
                          type="button"
                          onClick={() => leaveQueue(entry.id)}
                          className="shrink-0 rounded-lg border border-sky-300 px-2 py-0.5 font-medium transition hover:bg-sky-100"
                        >
                          Leave
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              {detailed.length > 0 ? (
                <ul className="mt-2 space-y-2 border-t border-slate-900/5 pt-2">
                  {detailed.map((booking) => (
                    <li
                      key={booking.id}
                      // The chevrons need a box of their own to run across.
                      className={`text-xs ${
                        booking.needsMock && !past
                          ? "relative isolate overflow-hidden rounded-lg px-1.5 py-1"
                          : ""
                      }`}
                    >
                      {booking.needsMock && !past ? (
                        <div className="relative z-10 mb-1.5">
                          <NeedMock compact />
                        </div>
                      ) : null}

                      <div className="relative z-10 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded bg-white/70 px-1.5 py-0.5 font-medium ${past ? "text-slate-400" : "text-slate-700"}`}
                        >
                          {panelLabel(booking.panelId)}
                        </span>

                        {booking.slotCount > 1 ? (
                          <span
                            className={`rounded px-1.5 py-0.5 font-semibold ${
                              past
                                ? TONES.past.chip
                                : TONES[booking.isOwn ? "own" : "booked"].chip
                            }`}
                          >
                            {durationLabel(booking.slotCount)}
                          </span>
                        ) : null}

                        <span
                          className={`font-semibold tabular-nums ${
                            past
                              ? TONES.past.text
                              : TONES[booking.isOwn ? "own" : "booked"].text
                          }`}
                        >
                          {sessionRangeLabel(booking.slotIndex, booking.slotCount)}
                        </span>

                        {(booking.isOwn || role === "controller") && !past ? (
                          <button
                            type="button"
                            onClick={() => release(booking)}
                            className={`ml-auto ${BUTTON.release}`}
                          >
                            Release
                          </button>
                        ) : null}
                      </div>

                      <p
                        className={`mt-0.5 truncate ${
                          past
                            ? TONES.past.text
                            : TONES[booking.isOwn ? "own" : "booked"].text
                        }`}
                      >
                        {booking.isOwn && role === "candidate"
                          ? "You"
                          : booking.candidateName}{" "}
                        &middot; {booking.companyName} &middot;{" "}
                        {booking.sessionType}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}

              {continuing.length > 0 ? (
                <ul className="mt-2 space-y-1 border-t border-slate-900/5 pt-2">
                  {continuing.map((booking) => (
                    <li
                      key={booking.id}
                      className={`flex items-center gap-1.5 text-xs ${past ? TONES.past.text : "text-slate-600"}`}
                    >
                      <span aria-hidden className="shrink-0">
                        &#8627;
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        Still running:{" "}
                        <span className="font-medium">
                          {booking.isOwn && role === "candidate"
                            ? "your session"
                            : `${booking.candidateName}'s session`}
                        </span>{" "}
                        <span className="tabular-nums">
                          {sessionRangeLabel(booking.slotIndex, booking.slotCount)}
                        </span>{" "}
                        ({durationLabel(booking.slotCount)})
                      </span>
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
          panelsFreeFor={(count: number) =>
            panelsFreeFrom(target.slotIndex, count)
          }
        />
      ) : null}
    </div>
  );
}
