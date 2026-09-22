"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import BookingDialog, { type BookingTarget } from "@/components/booking-dialog";
import CandidateHistory from "@/components/candidate-history";
import NeedMock from "@/components/need-mock";
import {
  ALL_SLOT_INDEXES,
  coveredSlots,
  fitsInDay,
  isSlotInPast,
  longDateLabel,
  sessionRangeLabel,
  slotEndLabel,
  shiftDateKey,
  slotStartLabel,
  type CarouselDay,
} from "@/lib/time";
import type {
  Booking,
  CandidateSummary,
  Panel,
  ScheduleView,
  WaitingSummary,
} from "@/lib/types";
import { BUTTON, TONES } from "@/lib/tone";
import { useNow } from "@/lib/use-now";
import { ZOOM_LEVELS, useZoom } from "@/lib/use-zoom";
import { usePolledResource } from "@/lib/use-poll";

type Props = {
  panels: Panel[];
  candidates: CandidateSummary[];
  days: CarouselDay[];
  today: string;
};

const cellKey = (panelId: string, slotIndex: number) => `${panelId}:${slotIndex}`;

const QUICK_DAYS = [
  { label: "Yesterday", offset: -1 },
  { label: "Today", offset: 0 },
  { label: "Tomorrow", offset: 1 },
];

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
  const [movingId, setMovingId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [target, setTarget] = useState<BookingTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Null until hydration, so the server and first client render agree.
  const now = useNow();
  const { level, zoomIn, zoomOut, zoom, canZoomIn, canZoomOut } = useZoom();

  const { data, error, loading, refresh } = usePolledResource<
    ScheduleView & { closedPanelIds: string[]; waiting: WaitingSummary[] }
  >(`/api/schedule?date=${dateKey}`);

  const closedPanelIds = useMemo(
    () => new Set(data?.closedPanelIds ?? []),
    [data],
  );
  const waiting = useMemo(() => data?.waiting ?? [], [data]);

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

  /**
   * Closing reseats the whole day in booking order, so the warning has to say
   * that plainly - the controller is not just hiding a column.
   */
  async function setClosed(panelId: string, closed: boolean) {
    if (closed) {
      // Never quote a count from data that has not arrived. Saying "nothing is
      // booked" while the feed is still loading is a lie the controller acts on.
      const onPanel = bookings.filter((b) => b.panelId === panelId).length;
      const detail = !data
        ? "Any sessions on it are reseated oldest booking first; whatever no longer fits goes to the waiting list."
        : onPanel > 0
          ? `${onPanel} session${onPanel === 1 ? "" : "s"} sit on it. Sessions are reseated oldest booking first; whatever no longer fits goes to the waiting list.`
          : "Nothing is booked on it.";

      const confirmed = window.confirm(
        `Close ${panelId} for ${longDateLabel(dateKey)}?\n\n${detail}`,
      );
      if (!confirmed) return;
    }

    setNotice(null);
    setBusy(true);
    try {
      const response = await fetch("/api/closures", {
        method: closed ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateKey, panelId }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setNotice(result.error ?? "Could not change that panel.");
        return;
      }

      if (closed) {
        const moved = result.moved?.length ?? 0;
        const queued = result.waitlisted?.length ?? 0;
        setNotice(
          `${panelId} closed. ${moved} session${moved === 1 ? "" : "s"} moved, ` +
            `${queued} went to the waiting list.`,
        );
      } else {
        setNotice(`${panelId} reopened. Sessions moved earlier were not restored.`);
      }
      void refresh();
    } catch {
      setNotice("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function placeFromQueue(entry: WaitingSummary) {
    setNotice(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/waiting-list/${entry.id}`, {
        method: "POST",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(result.error ?? "Could not place them.");
        return;
      }
      setNotice(`${entry.candidateName} placed on ${result.panelId}.`);
      void refresh();
    } catch {
      setNotice("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }


  /** Panels free for a whole session, the clicked one first if it qualifies. */
  const panelsFreeFor = useCallback(
    (slotIndex: number, count: number, preferred?: string) => {
      const free = panels
        .filter((panel) => freeForRange(panel.id, slotIndex, count))
        .map((panel) => panel.id);
      return preferred && free.includes(preferred)
        ? [preferred, ...free.filter((id) => id !== preferred)]
        : free;
    },
    [panels, freeForRange],
  );

  function handleEmptyCellClick(panelId: string, slotIndex: number) {
    if (movingId) {
      void move(movingId, panelId, slotIndex);
      return;
    }

    // The clicked cell leads; the dialog may still move it to another panel,
    // and recomputes the list whenever the length changes there.
    setTarget({
      dateKey,
      slotIndex,
      slotCount: 1,
      panelIds: panelsFreeFor(slotIndex, 1, panelId),
    });
  }

  const countsByPanel = useMemo(() => {
    const counts = new Map<string, number>();
    for (const booking of bookings) {
      counts.set(booking.panelId, (counts.get(booking.panelId) ?? 0) + 1);
    }
    return counts;
  }, [bookings]);

  const gridTemplateColumns = `${zoom.timeColumn} repeat(${panels.length}, minmax(${zoom.column}, 1fr))`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
          {QUICK_DAYS.map((day) => {
            const key = shiftDateKey(today, day.offset);
            const selected = key === dateKey;
            return (
              <button
                key={day.label}
                type="button"
                aria-pressed={selected}
                onClick={() => setDateKey(key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  selected
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {day.label}
              </button>
            );
          })}
        </div>

        {/* Candidates can book six days out, so the grid still has to reach
            them; a date field does that without another eight-tile strip. */}
        <input
          type="date"
          aria-label="Another date"
          value={dateKey}
          min={days[0]?.key}
          max={days[days.length - 1]?.key}
          onChange={(event) => {
            if (event.target.value) setDateKey(event.target.value);
          }}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-slate-900"
        />

        <p className="text-sm text-slate-600">
          {longDateLabel(dateKey)} &middot; {bookings.length} session
          {bookings.length === 1 ? "" : "s"}
        </p>

        <div className="ml-auto flex items-center gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
          <button
            type="button"
            onClick={zoomOut}
            disabled={!canZoomOut}
            aria-label="Zoom out"
            title="Fit more of the day on screen"
            className="rounded-lg px-2.5 py-1 text-base leading-none font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            &minus;
          </button>
          <span className="w-16 text-center text-xs font-medium text-slate-600">
            {ZOOM_LEVELS[level].name}
          </span>
          <button
            type="button"
            onClick={zoomIn}
            disabled={!canZoomIn}
            aria-label="Zoom in"
            title="Show more of each session"
            className="rounded-lg px-2.5 py-1 text-base leading-none font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            +
          </button>
        </div>
      </header>

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

      {historyId ? (
        <CandidateHistory
          candidateId={historyId}
          onClose={() => setHistoryId(null)}
        />
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
                {closedPanelIds.has(panel.id) ? (
                  <p
                    className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${TONES.closed.chip}`}
                  >
                    Closed
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">
                    {countsByPanel.get(panel.id) ?? 0} booked
                  </p>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setClosed(panel.id, !closedPanelIds.has(panel.id))}
                  className={`mt-1 rounded-lg border px-2 py-0.5 text-[11px] font-semibold transition disabled:opacity-50 ${
                    closedPanelIds.has(panel.id)
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {closedPanelIds.has(panel.id) ? "Reopen" : "Close day"}
                </button>
              </div>
            ))}

            {ALL_SLOT_INDEXES.map((slotIndex) => (
              <div
                key={`time-${slotIndex}`}
                style={{ gridColumn: 1, gridRow: slotIndex + 2 }}
                className={`sticky left-0 z-10 border-r border-b border-slate-100 px-2 text-right ${zoom.detail ? "py-2" : "py-0.5"} ${slotIsPast(slotIndex) ? "bg-slate-50 text-slate-400" : "bg-white text-slate-600"}`}
              >
                <p
                  className={`font-semibold tabular-nums ${zoom.detail ? "text-xs" : zoom.text}`}
                >
                  {slotStartLabel(slotIndex)}
                </p>
                {zoom.detail ? (
                  <p className="text-[10px] tabular-nums opacity-70">
                    {slotEndLabel(slotIndex)}
                  </p>
                ) : null}
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
                      className={`border-b border-slate-100 ${zoom.padding} ${past ? "bg-slate-50" : ""}`}
                    >
                      <div
                        draggable={!busy && !past}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", booking.id);
                          event.dataTransfer.effectAllowed = "move";
                          setMovingId(booking.id);
                        }}
                        onDragEnd={() => setDropTarget(null)}
                        onClick={() => {
                          if (past) return;
                          setMovingId(isMoving ? null : booking.id);
                        }}
                        role={past ? undefined : "button"}
                        tabIndex={past ? undefined : 0}
                        onKeyDown={(event) => {
                          if (past) return;
                          if (event.target !== event.currentTarget) return;
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setMovingId(isMoving ? null : booking.id);
                          }
                        }}
                        title={`${booking.candidateName} / ${booking.companyName} / ${booking.sessionType} / ${sessionRangeLabel(booking.slotIndex, booking.slotCount)}`}
                        className={`group relative isolate flex h-full flex-col overflow-hidden rounded-lg border px-2.5 py-2 transition ${past ? `cursor-default ${TONES.past.card}` : isMoving ? `cursor-grab border-sky-500 bg-sky-50 ring-2 ring-sky-300 active:cursor-grabbing` : `cursor-grab active:cursor-grabbing ${TONES.booked.card} hover:border-rose-400`}`}
                      >
                        {booking.needsMock && !past ? (
                          <NeedMock compact label={false} />
                        ) : null}

                        <div className="relative z-10 flex items-start gap-1.5">
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              title={`View ${booking.candidateName}'s history`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setHistoryId(booking.candidateId);
                              }}
                              className={`inline-block max-w-full cursor-pointer truncate rounded text-left align-top font-bold tracking-wide text-slate-900 uppercase underline decoration-transparent underline-offset-2 transition hover:decoration-current ${zoom.nameText}`}
                            >
                              {booking.candidateName}
                            </button>

                            {/* Name and company at every zoom - between them
                                they say who is sitting and for whom, which is
                                the whole point of the chip. Only the session
                                type is dropped when the rows are tightest. */}
                            <p
                              className={`truncate font-semibold text-slate-800 ${zoom.companyText}`}
                            >
                              {booking.companyName}
                            </p>

                            {zoom.detail ? (
                              <p className="mt-1 inline-block rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                {booking.sessionType}
                              </p>
                            ) : null}
                          </div>
                          {past ? null : (
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
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

                if (closedPanelIds.has(panel.id)) {
                  return (
                    <div
                      key={key}
                      style={placement}
                      className="border-b border-slate-100 bg-slate-100 p-1.5"
                    >
                      <div
                        className={`flex h-full ${zoom.row} items-center justify-center rounded-lg border border-dashed ${zoom.text} font-medium ${TONES.closed.card} ${TONES.closed.text}`}
                      >
                        Closed
                      </div>
                    </div>
                  );
                }

                if (past) {
                  return (
                    <div
                      key={key}
                      style={placement}
                      className={`border-b border-slate-100 bg-slate-50 ${zoom.padding}`}
                    >
                      <div className={`h-full ${zoom.row} rounded-lg border border-dashed border-slate-200`} />
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
                    className={`border-b border-slate-100 ${zoom.padding} ${past ? "bg-slate-50" : ""}`}
                  >
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleEmptyCellClick(panel.id, slotIndex)}
                      className={`h-full ${zoom.row} w-full rounded-lg border border-dashed ${zoom.text} transition ${isDropTarget ? "border-sky-500 bg-sky-100 text-sky-800" : movingId ? "border-sky-300 bg-sky-50/40 text-sky-700 hover:border-sky-500 hover:bg-sky-100" : "border-slate-200 text-transparent hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700"}`}
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

      {waiting.length > 0 ? (
        <section className="mt-5 overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm">
          <header className="border-b border-sky-100 bg-sky-50 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-sky-900">
              Waiting list &middot; {waiting.length}
            </h2>
            <p className="text-xs text-sky-800">
              First come, first served. Place someone once a panel frees up.
            </p>
          </header>
          <ul className="divide-y divide-slate-100">
            {waiting.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
              >
                <span
                  className={`w-10 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-semibold ${TONES.waiting.chip}`}
                >
                  #{entry.position}
                </span>
                <span className="w-32 shrink-0 tabular-nums text-slate-600">
                  {sessionRangeLabel(entry.slotIndex, entry.slotCount)}
                </span>
                <span className="min-w-0 flex-1 text-slate-900">
                  <button
                    type="button"
                    title={`View ${entry.candidateName}'s history`}
                    onClick={() => setHistoryId(entry.candidateId)}
                    className="cursor-pointer rounded font-medium underline decoration-transparent underline-offset-2 transition hover:decoration-current"
                  >
                    {entry.candidateName}
                  </button>{" "}
                  &middot; {entry.companyName} &middot;{" "}
                  {entry.sessionType}
                  {entry.reason === "panel_closed" ? (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                      pushed out by a closure
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => placeFromQueue(entry)}
                  className={`shrink-0 ${BUTTON.book}`}
                >
                  Place
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
          panelsFreeFor={(count: number) =>
            panelsFreeFor(target.slotIndex, count)
          }
          onClose={() => setTarget(null)}
          onBooked={refresh}
        />
      ) : null}
    </div>
  );
}
