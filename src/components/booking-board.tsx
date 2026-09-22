"use client";

import { useCallback, useMemo, useState } from "react";

import BookingDialog, { type BookingTarget } from "@/components/booking-dialog";
import DateCarousel from "@/components/date-carousel";
import SlotLegend from "@/components/slot-legend";
import {
  isSlotInPast,
  longDateLabel,
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

  // What can actually still be booked, so the count does not claim a morning
  // that has already gone is available.
  const openCount = slots.filter(
    (slot) => slot.status === "available" && !slotIsPast(slot.index),
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

      <section className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {longDateLabel(dateKey)}
          </h2>
          <p className="text-sm text-slate-600">
            {loading && !data
              ? "Loading timetable..."
              : `${openCount} of ${slots.length} half-hour slots still open`}
          </p>
        </div>
        <SlotLegend showOwn={role === "candidate"} />
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
          const freeCount = slot.freePanelIds.length;
          const canBook = !past && freeCount > 0;

          // Controllers see every session at this time; candidates only ever
          // see their own - the rest are just panels that are no longer free.
          const detailed: Booking[] =
            role === "controller"
              ? slot.bookings
              : slot.bookings.filter((booking) => booking.isOwn);

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
          // time is open at all.
          const summary = past
            ? "Past"
            : !canBook
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
                        panelIds: slot.freePanelIds,
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
          key={`${target.dateKey}:${target.slotIndex}:${target.panelIds[0]}`}
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
