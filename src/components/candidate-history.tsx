"use client";

import { useEffect } from "react";

import type { CandidateHistory as History } from "@/lib/queries";
import {
  durationLabel,
  longDateLabel,
  sessionRangeLabel,
  SCHEDULE_LOCALE,
  SCHEDULE_TIMEZONE,
} from "@/lib/time";
import { TONES } from "@/lib/tone";
import { usePolledResource } from "@/lib/use-poll";

type Props = {
  candidateId: string;
  onClose: () => void;
};

function formatIssued(iso: string): string {
  return new Intl.DateTimeFormat(SCHEDULE_LOCALE, {
    timeZone: SCHEDULE_TIMEZONE,
    dateStyle: "medium",
  }).format(new Date(iso));
}

/**
 * Everything on file for one candidate, opened from their name.
 *
 * Polled like every other view, so a booking another controller cancels while
 * this is open drops out of the list rather than lingering as "Booked".
 */
export default function CandidateHistory({ candidateId, onClose }: Props) {
  const { data, error } = usePolledResource<History>(
    `/api/candidates/${candidateId}/history`,
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const mockSet = new Set(data?.mockDates ?? []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="candidate-history-title"
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-xl sm:max-h-[85vh] sm:rounded-2xl sm:pb-0"
      >
        <header className="flex items-start gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2
              id="candidate-history-title"
              className="text-lg font-semibold text-slate-900"
            >
              {data?.candidate.name ?? "Candidate"}
            </h2>

            {data ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                <span className="font-mono font-semibold tracking-widest text-slate-900">
                  {data.candidate.token}
                </span>
                <span>{data.candidate.phone ?? "No phone"}</span>
                <span>{data.candidate.company ?? "No company"}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                    data.candidate.source === "Uniq"
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {data.candidate.source}
                </span>
                {data.candidate.active ? null : (
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                    Disabled
                  </span>
                )}
              </div>
            ) : null}

            {data ? (
              <p className="mt-1 text-xs text-slate-500">
                Token issued {formatIssued(data.candidate.createdAt)}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-base leading-none font-medium text-slate-600 transition hover:bg-slate-100 sm:px-2.5 sm:py-1 sm:text-sm"
          >
            &times;
          </button>
        </header>

        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              {error}
            </p>
          ) : !data ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Loading history...
            </p>
          ) : data.sessions.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No sessions booked yet.
            </p>
          ) : (
            <>
              {/* Phone: one card per session. Seven columns do not fit. */}
              <ul className="space-y-2 sm:hidden">
                {data.sessions.map((session) => {
                  const cancelled = session.status === "cancelled";
                  return (
                    <li
                      key={session.id}
                      className={`rounded-xl border border-slate-200 p-3 text-sm ${
                        cancelled ? "bg-slate-50 text-slate-400" : "bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold">
                          {longDateLabel(session.slotDate)}
                        </p>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${
                            cancelled ? TONES.past.chip : TONES.own.chip
                          }`}
                        >
                          {cancelled ? "Cancelled" : "Booked"}
                        </span>
                      </div>

                      <p className="mt-1 tabular-nums">
                        {sessionRangeLabel(
                          session.slotIndex,
                          session.slotCount,
                        )}
                        {session.slotCount > 1
                          ? ` (${durationLabel(session.slotCount)})`
                          : ""}{" "}
                        &middot;{" "}
                        <span className="font-medium">{session.panelId}</span>
                      </p>

                      <p className={cancelled ? "" : "text-slate-600"}>
                        {session.companyName} &middot; {session.sessionType}
                        {mockSet.has(session.slotDate) ? (
                          <span className="ml-1.5 rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-semibold text-emerald-700">
                            mock done
                          </span>
                        ) : null}
                      </p>

                      {session.recruiterPhone || session.recruiterEmail ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {session.recruiterPhone ? (
                            <a
                              href={`tel:${session.recruiterPhone}`}
                              className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 tabular-nums"
                            >
                              {session.recruiterPhone}
                            </a>
                          ) : null}
                          {session.recruiterEmail ? (
                            <a
                              href={`mailto:${session.recruiterEmail}`}
                              className="max-w-full truncate rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700"
                            >
                              {session.recruiterEmail}
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              <table className="hidden w-full text-left text-sm sm:table">
                <thead className="border-b border-slate-200 text-xs tracking-wider text-slate-500 uppercase">
                  <tr>
                    <th className="pb-2 font-semibold">Date</th>
                    <th className="pb-2 font-semibold">Time</th>
                    <th className="pb-2 font-semibold">Panel</th>
                    <th className="pb-2 font-semibold">Company</th>
                    <th className="pb-2 font-semibold">Recruiter</th>
                    <th className="pb-2 font-semibold">Type</th>
                    <th className="pb-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sessions.map((session) => {
                    const cancelled = session.status === "cancelled";
                    return (
                      <tr
                        key={session.id}
                        className={`border-b border-slate-100 last:border-0 ${
                          cancelled ? "text-slate-400" : ""
                        }`}
                      >
                        <td className="py-2.5 whitespace-nowrap">
                          {longDateLabel(session.slotDate)}
                          {mockSet.has(session.slotDate) ? (
                            <span className="ml-1.5 rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-semibold text-emerald-700">
                              mock done
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2.5 whitespace-nowrap tabular-nums">
                          {sessionRangeLabel(
                            session.slotIndex,
                            session.slotCount,
                          )}
                          {session.slotCount > 1 ? (
                            <span className="ml-1 text-xs text-slate-500">
                              ({durationLabel(session.slotCount)})
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2.5 font-medium">
                          {session.panelId}
                        </td>
                        <td className="py-2.5">{session.companyName}</td>
                        <td className="py-2.5">
                          {session.recruiterPhone || session.recruiterEmail ? (
                            <span className="flex flex-col leading-tight">
                              {session.recruiterPhone ? (
                                <a
                                  href={`tel:${session.recruiterPhone}`}
                                  className="tabular-nums underline decoration-slate-300 underline-offset-2 hover:decoration-current"
                                >
                                  {session.recruiterPhone}
                                </a>
                              ) : null}
                              {session.recruiterEmail ? (
                                <a
                                  href={`mailto:${session.recruiterEmail}`}
                                  className="truncate underline decoration-slate-300 underline-offset-2 hover:decoration-current"
                                >
                                  {session.recruiterEmail}
                                </a>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-slate-400">&mdash;</span>
                          )}
                        </td>
                        <td className="py-2.5">{session.sessionType}</td>
                        <td className="py-2.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                              cancelled ? TONES.past.chip : TONES.own.chip
                            }`}
                          >
                            {cancelled ? "Cancelled" : "Booked"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>

        {data ? (
          <footer className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500 sm:px-6">
            {data.candidate.bookingCount} active session
            {data.candidate.bookingCount === 1 ? "" : "s"} &middot;{" "}
            {data.sessions.length} in total &middot; {data.mockDates.length}{" "}
            mock
            {data.mockDates.length === 1 ? "" : "s"} completed
          </footer>
        ) : null}
      </div>
    </div>
  );
}
