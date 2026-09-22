"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import BookingDialog, { type BookingTarget } from "@/components/booking-dialog";
import DateCarousel from "@/components/date-carousel";
import SlotLegend from "@/components/slot-legend";
import {
  ALL_SLOT_INDEXES,
  coveredSlots,
  DURATION_CHOICES,
  durationLabel,
  fitsInDay,
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
  Panel,
  ScheduleView,
} from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { usePolledResource } from "@/lib/use-poll";

type Props = {
  panels: Panel[];
  candidates: CandidateSummary[];
  days: CarouselDay[];
  today: string;
};

const cellKey = (panelId: string, slotIndex: number) => `${panelId}:${slotIndex}`;

/**
 * Controller Schedule view: panels across, half-hour slots down.
 *
 * A session can be reassigned either by dragging its chip onto another cell or
 * by clicking the chip and then clicking the destination - the click path is
 * what makes this usable on a touchscreen.
 */
export default function ScheduleBoard({
  panels: initialPanels,
  candidates,
  days,
  today,
}: Props) {
  const [dateKey, setDateKey] = useState(today);
  const [slotCount, setSlotCount] = useState(1);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [target, setTarget] = useState<BookingTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Null until hydration, so the server and first client render agree.
  const now = useNow();

  const { data, error, loading, refresh } = usePolledResource<ScheduleView>(
    `/api/schedule?date=${dateKey}`,
  );

  const panels = data?.panels ?? initialPanels;
  const bookings = useMemo(() => data?.bookings ?? [], [data]);

  /** The cell a session starts in - the only one that renders a chip. */
  const startAt = useMemo(() => {
    const map = new Map<string, Booking>();
    for (const booking of bookings) {
      map.set(cellKey(booking.panelId, booking.slotIndex), booking);
    }
    return map;
  }, [bookings]);

  /** Every cell a session covers, so the rest are not drawn as free. */
  const occupied = useMemo(() => {
    const set = new Set<string>();
    for (const booking of bookings) {
      for (const index of coveredSlots(booking.slotIndex, booking.slotCount)) {
        set.add(cellKey(booking.panelId, index));
      }
    }
    return set;
  }, [bookings]);

  /** A panel is free for a new session only if every block it needs is clear. */
  const freeForRange = useCallback(
    (panelId: string, start: number, count: number) =>
      fitsInDay(start, count) &&
      coveredSlots(start, count).every(
        (index) => !occupied.has(cellKey(panelId, index)),
      ),
    [occupied],
  );

  const movingBooking = movingId
    ? (bookings.find((booking) => booking.id === movingId) ?? null)
    : null;

  // Escape cancels an in-progress move.
  useEffect(() => {
    if (!movingId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMovingId(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [movingId]);

  const slotIsPast = useCallback(
    (index: number) => (now ? isSlotInPast(dateKey, index, now) : false),
    [dateKey, now],
  );

  const move = useCallback(
    async (bookingId: string, toPanelId: string, toSlotIndex: number) => {
      setNotice(null);
      setBusy(true);
      try {
        const response = await fetch(`/api/bookings/${bookingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            panelId: toPanelId,
            slotIndex: toSlotIndex,
            date: dateKey,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          setNotice(result.error ?? "Could not move that session.");
          return;
        }
        setMovingId(null);
        void refresh();
      } catch {
        setNotice("Could not reach the server. Please try again.");
      } finally {
        setBusy(false);
        setDropTarget(null);
      }
    },
    [dateKey, refresh],
  );

  async function cancelBooking(booking: Booking) {
    const confirmed = window.confirm(
      `Cancel ${booking.candidateName}'s ${booking.sessionType.toLowerCase()} at ${slotStartLabel(booking.slotIndex)} on ${booking.panelId}?`,
    );
    if (!confirmed) return;

    setNotice(null);
    const response = await fetch(`/api/bookings/${booking.id}`, {
      method: "DELETE",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(result.error ?? "Could not cancel that session.");
      return;
    }
    if (movingId === booking.id) setMovingId(null);
    void refresh();
  }

  function handleEmptyCellClick(panelId: string, slotIndex: number) {
    if (movingId) {
      void move(movingId, panelId, slotIndex);
      return;
    }

    if (!freeForRange(panelId, slotIndex, slotCount)) {
      setNotice(
        `A ${durationLabel(slotCount)} session does not fit here - something else is in the way.`,
      );
      return;
    }

    // The clicked cell leads, but the dialog may still place the session on
    // another panel that is free for the whole of it.
    const others = panels
      .filter(
        (panel) =>
          panel.id !== panelId && freeForRange(panel.id, slotIndex, slotCount),
      )
      .map((panel) => panel.id);

    setTarget({ dateKey, slotIndex, slotCount, panelIds: [panelId, ...others] });
  }

  const countsByPanel = useMemo(() => {
    const counts = new Map<string, number>();
    for (const booking of bookings) {
      counts.set(booking.panelId, (counts.get(booking.panelId) ?? 0) + 1);
    }
    return counts;
  }, [bookings]);

  const gridTemplateColumns = `5.5rem repeat(${panels.length}, minmax(11rem, 1fr))`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Schedule
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {longDateLabel(dateKey)} &middot; {bookings.length} session
            {bookings.length === 1 ? "" : "s"} across {panels.length} panel
            {panels.length === 1 ? "" : "s"}
          </p>
        </div>
        <SlotLegend />
      </header>

      <section className="mt-5">
        <DateCarousel days={days} selected={dateKey} onSelect={setDateKey} />
      </section>

      <section className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-slate-700">
          New session length
        </span>
        <div className="flex flex-wrap gap-2">
          {DURATION_CHOICES.map((choice) => (
            <label
              key={choice.slots}
              className={
                slotCount === choice.slots
                  ? "cursor-pointer rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition"
                  : "cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400"
              }
            >
              <input
                type="radio"
                name="controllerSlotCount"
                value={choice.slots}
                checked={slotCount === choice.slots}
                onChange={() => setSlotCount(choice.slots)}
                className="sr-only"
              />
              {choice.label}
            </label>
          ))}
        </div>
        <span className="text-xs text-slate-500">
          Applies to sessions you add from an empty cell. Moving a session keeps
          its length.
        </span>
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

      {movingBooking ? (
        <div className="sticky top-16 z-40 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm text-sky-900 shadow-sm">
          <span>
            Moving <strong>{movingBooking.candidateName}</strong> (
            {movingBooking.companyName}). Click an empty slot to place it.
          </span>
          <button
            type="button"
            onClick={() => setMovingId(null)}
            className="ml-auto rounded-lg border border-sky-300 px-2.5 py-1 text-xs font-medium transition hover:bg-sky-100"
          >
            Cancel move
          </button>
        </div>
      ) : null}

      <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="thin-scroll max-h-[72vh] overflow-auto">
          <div className="grid min-w-max" style={{ gridTemplateColumns }}>
            <div
              style={{ gridColumn: 1, gridRow: 1 }}
              className="sticky top-0 left-0 z-30 border-r border-b border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold tracking-wider text-slate-500 uppercase"
            >
              Time
            </div>
            {panels.map((panel, column) => (
              <div
                key={panel.id}
                style={{ gridColumn: column + 2, gridRow: 1 }}
                className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-3 py-3 text-center"
              >
                <p className="text-sm font-bold tracking-tight text-slate-900">
                  {panel.label}
                </p>
                <p className="text-xs text-slate-500">
                  {countsByPanel.get(panel.id) ?? 0} booked
                </p>
              </div>
            ))}

            {ALL_SLOT_INDEXES.map((slotIndex) => (
              <div
                key={`time-${slotIndex}`}
                style={{ gridColumn: 1, gridRow: slotIndex + 2 }}
                className={`sticky left-0 z-10 border-r border-b border-slate-100 px-3 py-2 text-right ${slotIsPast(slotIndex) ? "bg-slate-50 text-slate-400" : "bg-white text-slate-600"}`}
              >
                <p className="text-xs font-semibold tabular-nums">
                  {slotStartLabel(slotIndex)}
                </p>
                <p className="text-[10px] tabular-nums opacity-70">
                  {slotEndLabel(slotIndex)}
                </p>
              </div>
            ))}

            {ALL_SLOT_INDEXES.flatMap((slotIndex) =>
              panels.map((panel, column) => {
                const key = cellKey(panel.id, slotIndex);
                const booking = startAt.get(key);
                const past = slotIsPast(slotIndex);

                // Covered by a session that started higher up: the chip above
                // spans over this cell, so nothing is drawn here at all.
                if (!booking && occupied.has(key)) return null;

                const placement = {
                  gridColumn: column + 2,
                  gridRow: booking
                    ? `${slotIndex + 2} / span ${booking.slotCount}`
                    : slotIndex + 2,
                };

                if (booking) {
                  const isMoving = movingId === booking.id;
                  return (
                    <div
                      key={key}
                      style={placement}
                      className={`border-b border-slate-100 p-1.5 ${past ? "bg-slate-50" : ""}`}
                    >
                      <div
                        draggable={!busy}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", booking.id);
                          event.dataTransfer.effectAllowed = "move";
                          setMovingId(booking.id);
                        }}
                        onDragEnd={() => setDropTarget(null)}
                        onClick={() => setMovingId(isMoving ? null : booking.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setMovingId(isMoving ? null : booking.id);
                          }
                        }}
                        title={`${booking.candidateName} / ${booking.companyName} / ${booking.sessionType} / ${sessionRangeLabel(booking.slotIndex, booking.slotCount)}`}
                        className={`group flex h-full cursor-grab flex-col rounded-lg border px-2.5 py-2 transition active:cursor-grabbing ${isMoving ? "border-sky-500 bg-sky-50 ring-2 ring-sky-300" : "border-rose-200 bg-rose-50 hover:border-rose-400"}`}
                      >
                        <div className="flex items-start gap-1.5">
                          <span
                            aria-hidden
                            className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-slate-900">
                              {booking.candidateName}
                            </p>
                            <p className="truncate text-[11px] text-slate-600">
                              {booking.companyName}
                            </p>
                            <p className="mt-0.5 inline-block rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                              {booking.sessionType}
                            </p>
                            {booking.slotCount > 1 ? (
                              <p className="mt-1 text-[10px] font-medium tabular-nums text-slate-500">
                                {durationLabel(booking.slotCount)} &middot;{" "}
                                {sessionRangeLabel(
                                  booking.slotIndex,
                                  booking.slotCount,
                                )}
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            aria-label={`Cancel booking for ${booking.candidateName}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              void cancelBooking(booking);
                            }}
                            className="shrink-0 rounded px-1 text-sm leading-none text-slate-400 opacity-0 transition group-hover:opacity-100 hover:text-rose-700 focus:opacity-100"
                          >
                            &times;
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                const isDropTarget = dropTarget === key;
                return (
                  <div
                    key={key}
                    style={placement}
                    onDragOver={(event) => {
                      if (!movingId) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDropTarget(key);
                    }}
                    onDragLeave={() =>
                      setDropTarget((current) => (current === key ? null : current))
                    }
                    onDrop={(event) => {
                      event.preventDefault();
                      const bookingId =
                        event.dataTransfer.getData("text/plain") || movingId;
                      if (bookingId) void move(bookingId, panel.id, slotIndex);
                    }}
                    className={`border-b border-slate-100 p-1.5 ${past ? "bg-slate-50" : ""}`}
                  >
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleEmptyCellClick(panel.id, slotIndex)}
                      className={`h-full min-h-[3.25rem] w-full rounded-lg border border-dashed text-[11px] transition ${isDropTarget ? "border-sky-500 bg-sky-100 text-sky-800" : movingId ? "border-sky-300 bg-sky-50/40 text-sky-700 hover:border-sky-500 hover:bg-sky-100" : "border-slate-200 text-transparent hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700"}`}
                    >
                      {movingId ? "Place here" : "Add"}
                    </button>
                  </div>
                );
              }),
            )}
          </div>
        </div>
      </section>

      <p className="mt-3 text-xs text-slate-500">
        {loading && !data
          ? "Loading schedule..."
          : "Drag a session onto another panel or time, or click it and then click its destination. Updates every few seconds."}
      </p>

      {target ? (
        <BookingDialog
          key={`${target.dateKey}:${target.slotIndex}:${target.slotCount}`}
          target={target}
          role="controller"
          panels={panels}
          candidates={candidates}
          onClose={() => setTarget(null)}
          onBooked={refresh}
        />
      ) : null}
    </div>
  );
}
