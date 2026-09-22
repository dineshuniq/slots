"use client";

import { useMemo, useState } from "react";

import DateCarousel from "@/components/date-carousel";
import type { MockEntry } from "@/lib/mock";
import {
  longDateLabel,
  sessionRangeLabel,
  slotStartLabel,
  type CarouselDay,
} from "@/lib/time";
import { usePolledResource } from "@/lib/use-poll";

type Props = {
  days: CarouselDay[];
  today: string;
};

type Payload = {
  date: string;
  entries: MockEntry[];
  completed: number;
  fetchedAt: string;
};

/**
 * A tick is remembered per date as well as per candidate: the same person can
 * be on Tuesday's register and on Thursday's, and the two are ticked off
 * separately.
 */
const markKey = (date: string, candidateId: string) => `${date}:${candidateId}`;

/** An unconfirmed tick, and the feed payload it was applied to. */
type Mark = { value: boolean; snapshot: Payload };

/**
 * Controller Mock register: everyone due in on a date, in timeline order, with
 * one button each.
 *
 * A candidate sits one mock per day and is then cleared for every interview
 * they hold that date, so this is a list of people rather than of sessions -
 * three bookings on one day are one line with one button. Book across several
 * days and the name appears again under each of those dates, because each
 * day's mock has to be run and ticked off on its own.
 */
export default function MockBoard({ days, today }: Props) {
  const [dateKey, setDateKey] = useState(today);
  const [notice, setNotice] = useState<string | null>(null);
  const [hideCompleted, setHideCompleted] = useState(false);

  // Ticks applied here but not yet confirmed by the feed. Without these the
  // row would not strike through until the next poll landed, which makes a
  // button meant to behave like a checkbox feel broken instead.
  //
  // Each tick remembers the payload it was applied to and counts only while
  // that payload is still the current one. Any newer payload wins, so a tick
  // can never outlive the answer it was standing in for - which is what keeps
  // another controller's undo from being hidden by a stale local tick.
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());

  const { data, error, loading, refresh } = usePolledResource<Payload>(
    `/api/mock?date=${dateKey}`,
    10_000,
  );

  const entries = useMemo(
    () =>
      (data?.entries ?? []).map((entry) => {
        const mark = marks[markKey(dateKey, entry.candidateId)];
        return {
          entry,
          completed:
            mark && mark.snapshot === data ? mark.value : entry.completed,
        };
      }),
    [data, marks, dateKey],
  );

  const doneCount = entries.filter((row) => row.completed).length;
  const shown = hideCompleted
    ? entries.filter((row) => !row.completed)
    : entries;

  async function setCompleted(entry: MockEntry, completed: boolean) {
    const snapshot = data;
    if (!snapshot) return;

    const key = markKey(dateKey, entry.candidateId);

    // Put the row back the way it was. The list must never claim a mock was
    // recorded when the write did not land.
    const rollback = () =>
      setMarks((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });

    setNotice(null);
    setMarks((prev) => {
      // Ticks from older payloads are already being ignored; drop them here
      // rather than letting them pile up for the life of the page.
      const next: Record<string, Mark> = {};
      for (const [id, mark] of Object.entries(prev)) {
        if (mark.snapshot === snapshot) next[id] = mark;
      }
      next[key] = { value: completed, snapshot };
      return next;
    });
    setPending((prev) => new Set(prev).add(key));

    try {
      const response = await fetch("/api/mock", {
        method: completed ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateKey, candidateId: entry.candidateId }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        rollback();
        setNotice(result.error ?? "Could not update that mock.");
        return;
      }

      void refresh();
    } catch {
      rollback();
      setNotice("Could not reach the server. Please try again.");
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Mock
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Everyone booked on this date, earliest first. One mock clears a
            candidate for the whole day, so each name is ticked off once per
            date.
          </p>
        </div>

        <span className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">
          {loading && !data
            ? "Loading..."
            : `${doneCount} of ${entries.length} done`}
        </span>
      </header>

      <section className="no-print mt-5">
        <DateCarousel days={days} selected={dateKey} onSelect={setDateKey} />
      </section>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-slate-900">
          {longDateLabel(dateKey)}
        </h2>

        <label className="no-print ml-auto flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={hideCompleted}
            onChange={(event) => setHideCompleted(event.target.checked)}
            className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-slate-900"
          />
          Hide completed
        </label>

        <button
          type="button"
          onClick={refresh}
          className="no-print rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Refresh
        </button>
      </div>

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
          role="status"
          className="mt-4 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
        >
          {notice}
        </p>
      ) : null}

      <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {shown.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-500">
            {loading && !data
              ? "Loading..."
              : entries.length === 0
                ? "Nobody is booked on this date."
                : "Every mock on this date is done."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map(({ entry, completed }) => {
              const key = markKey(dateKey, entry.candidateId);
              const busy = pending.has(key);

              return (
                <li
                  key={entry.candidateId}
                  className={`flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3 transition ${
                    completed ? "bg-slate-50" : "hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`mt-0.5 w-20 shrink-0 rounded-lg px-2 py-1 text-center text-xs font-semibold tabular-nums ${
                      completed
                        ? "bg-slate-100 text-slate-400"
                        : "bg-slate-900 text-white"
                    }`}
                  >
                    {slotStartLabel(entry.firstSlotIndex)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p
                      className={`flex flex-wrap items-baseline gap-x-2 text-sm font-semibold ${
                        completed
                          ? "text-slate-400 line-through decoration-slate-400"
                          : "text-slate-900"
                      }`}
                    >
                      {entry.candidateName}
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[11px] tracking-wider no-underline ${
                          completed
                            ? "bg-slate-100 text-slate-400"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {entry.token}
                      </span>
                    </p>

                    <ul
                      className={`mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs ${
                        completed
                          ? "text-slate-400 line-through decoration-slate-300"
                          : "text-slate-600"
                      }`}
                    >
                      {entry.sessions.map((session) => (
                        <li key={session.bookingId}>
                          <span className="font-medium">{session.panelId}</span>
                          {" · "}
                          {sessionRangeLabel(
                            session.slotIndex,
                            session.slotCount,
                          )}
                          {" · "}
                          {session.companyName}
                          {" · "}
                          {session.sessionType}
                        </li>
                      ))}
                    </ul>

                    {completed && entry.completedBy ? (
                      <p className="mt-1 text-[11px] text-slate-400">
                        Marked done by {entry.completedBy}
                      </p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCompleted(entry, !completed)}
                    disabled={busy}
                    aria-pressed={completed}
                    className={`no-print shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      completed
                        ? "border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                        : "bg-emerald-600 text-white hover:bg-emerald-700"
                    }`}
                  >
                    {completed ? "Undo" : "Completed"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {hideCompleted && doneCount > 0 ? (
        <p className="no-print mt-3 text-xs text-slate-500">
          {doneCount} completed {doneCount === 1 ? "mock is" : "mocks are"}{" "}
          hidden.
        </p>
      ) : null}
    </div>
  );
}
