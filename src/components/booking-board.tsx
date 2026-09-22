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
import type { CandidateSummary, DayView, Panel, Slot } from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { usePolledResource } from "@/lib/use-poll";

type Props = {
  role: "candidate" | "controller";
  panels: Panel[];
  initialPanelId: string;
  candidates: CandidateSummary[];
  days: CarouselDay[];
  today: string;
};

/**
 * The candidate timetable: assigned panel on top, eight-day carousel, then the
 * 07:00-20:00 day in half-hour blocks. Controllers get the same screen with a
 * panel picker, which is the "all candidate features" half of their portal.
 */
export default function BookingBoard({
  role,
  panels,
  initialPanelId,
  candidates,
  days,
  today,
}: Props) {
  const [dateKey, setDateKey] = useState(today);
  const [panelId, setPanelId] = useState(initialPanelId);
  const [target, setTarget] = useState<BookingTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Past-slot shading depends on the wall clock, which the server does not
  // share with the browser. Null until hydration, so both render the same.
  const now = useNow();

  const { data, error, loading, refresh } = usePolledResource<DayView>(
    `/api/day?date=${dateKey}&panel=${panelId}`,
  );

  const panelLabel = useMemo(
    () => panels.find((panel) => panel.id === panelId)?.label ?? panelId,
    [panels, panelId],
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

  const slots: Slot[] = data?.slots ?? [];
  const bookedCount = slots.filter((slot) => slot.status === "booked").length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-medium tracking-wider text-slate-500 uppercase">
          {role === "candidate" ? "Your assigned panel" : "Viewing panel"}
        </p>

        {role === "candidate" ? (
          <h1 className="mt-1 text-4xl font-bold tracking-tight text-slate-900">
            {panelLabel}
          </h1>
        ) : (
          <select
            aria-label="Panel"
            value={panelId}
            onChange={(event) => setPanelId(event.target.value)}
            className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-2xl font-bold tracking-tight text-slate-900 outline-none focus:border-slate-900"
          >
            {panels.map((panel) => (
              <option key={panel.id} value={panel.id}>
                {panel.label}
              </option>
            ))}
          </select>
        )}
      </section>

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
              : `${slots.length - bookedCount} of ${slots.length} half-hour slots available`}
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
          const booking = slot.booking;
          const timeLabel = `${slotStartLabel(slot.index)} - ${slotEndLabel(slot.index)}`;

          if (booking) {
            const mine = booking.isOwn;
            const tone = past
              ? "border-slate-200 bg-slate-50"
              : mine
                ? "border-rose-500 bg-rose-50"
                : "border-rose-200 bg-rose-50";

            return (
              <div
                key={slot.index}
                className={`mb-3 flex break-inside-avoid items-center gap-3 rounded-xl border px-4 py-3 ${tone}`}
              >
                <span
                  aria-hidden
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${past ? "bg-slate-300" : "bg-rose-500"}`}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-semibold tabular-nums ${past ? "text-slate-400" : "text-slate-900"}`}
                  >
                    {timeLabel}
                  </p>
                  <p
                    className={`truncate text-xs ${past ? "text-slate-400" : "text-rose-700"}`}
                  >
                    {mine || role === "controller"
                      ? `${booking.candidateName} / ${booking.companyName} / ${booking.sessionType}`
                      : "Blocked"}
                  </p>
                </div>
                {mine && !past ? (
                  <button
                    type="button"
                    onClick={() => release(booking.id)}
                    className="shrink-0 rounded-lg border border-rose-300 px-2.5 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100"
                  >
                    Release
                  </button>
                ) : null}
              </div>
            );
          }

          if (past) {
            return (
              <div
                key={slot.index}
                className="mb-3 flex break-inside-avoid items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-400"
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-300"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold tabular-nums">
                    {timeLabel}
                  </p>
                  <p className="text-xs">Past</p>
                </div>
              </div>
            );
          }

          return (
            <button
              key={slot.index}
              type="button"
              onClick={() =>
                setTarget({ dateKey, slotIndex: slot.index, panelId })
              }
              className="mb-3 flex w-full break-inside-avoid items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-left transition hover:border-emerald-500 hover:bg-emerald-100"
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold tabular-nums text-slate-900">
                  {timeLabel}
                </p>
                <p className="text-xs text-emerald-700">Available</p>
              </div>
              <span className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white">
                Book
              </span>
            </button>
          );
        })}
      </section>

      {target ? (
        <BookingDialog
          key={`${target.panelId}:${target.dateKey}:${target.slotIndex}`}
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
