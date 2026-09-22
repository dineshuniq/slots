"use client";

import { useEffect, useMemo, useState } from "react";

import { longDateLabel, slotRangeLabel } from "@/lib/time";
import {
  SESSION_TYPES,
  type CandidateSummary,
  type Panel,
  type SessionType,
} from "@/lib/types";

export type BookingTarget = {
  dateKey: string;
  slotIndex: number;
  /** Panels still free at this slot, best choice first. */
  panelIds: string[];
};

type Props = {
  target: BookingTarget;
  role: "candidate" | "controller";
  panels: Panel[];
  candidates: CandidateSummary[];
  onClose: () => void;
  onBooked: () => void;
};

/**
 * Collects the two mandatory fields: Company Name and Session Type.
 *
 * Candidates are never shown a panel - availability is consolidated across
 * panels and the server allocates whichever one is free. Controllers do pick,
 * because they are arranging the panels themselves.
 *
 * Callers mount this with a key derived from the target slot, so opening a
 * different slot remounts it with fresh state instead of resetting fields in
 * an effect.
 */
export default function BookingDialog({
  target,
  role,
  panels,
  candidates,
  onClose,
  onBooked,
}: Props) {
  const [companyName, setCompanyName] = useState("");
  const [sessionType, setSessionType] = useState<SessionType>("Interview");
  const [candidateId, setCandidateId] = useState("");
  const [panelId, setPanelId] = useState(target.panelIds[0] ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const choices = useMemo(
    () =>
      target.panelIds.map((id) => ({
        id,
        label: panels.find((panel) => panel.id === id)?.label ?? id,
      })),
    [panels, target.panelIds],
  );

  const panelLabel = useMemo(
    () => choices.find((choice) => choice.id === panelId)?.label ?? panelId,
    [choices, panelId],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: target.dateKey,
          slotIndex: target.slotIndex,
          companyName: companyName.trim(),
          sessionType,
          ...(role === "controller" ? { candidateId, panelId } : {}),
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(result.error ?? "Could not book that slot.");
        return;
      }

      onBooked();
      onClose();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

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
        aria-labelledby="booking-dialog-title"
        className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
      >
        <h2
          id="booking-dialog-title"
          className="text-lg font-semibold text-slate-900"
        >
          Book this slot
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {slotRangeLabel(target.slotIndex)} on {longDateLabel(target.dateKey)}
        </p>

        <form onSubmit={submit} className="mt-5 space-y-4">
          {role === "controller" ? (
            <div>
              <label
                htmlFor="candidate"
                className="block text-sm font-medium text-slate-700"
              >
                Candidate
              </label>
              <select
                id="candidate"
                required
                value={candidateId}
                onChange={(event) => setCandidateId(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              >
                <option value="" disabled>
                  Select a candidate...
                </option>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {role === "controller" ? (
            <div>
              <label
                htmlFor="panel"
                className="block text-sm font-medium text-slate-700"
              >
                Panel <span className="text-rose-600">*</span>
              </label>
              {choices.length > 1 ? (
                <select
                  id="panel"
                  value={panelId}
                  onChange={(event) => setPanelId(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                >
                  {choices.map((choice) => (
                    <option key={choice.id} value={choice.id}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="mt-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-900">
                  {panelLabel}
                  <span className="ml-2 font-normal text-slate-500">
                    (the only panel free at this time)
                  </span>
                </p>
              )}
            </div>
          ) : null}

          <div>
            <label
              htmlFor="companyName"
              className="block text-sm font-medium text-slate-700"
            >
              Company Name <span className="text-rose-600">*</span>
            </label>
            <input
              id="companyName"
              required
              maxLength={120}
              autoFocus={role === "candidate"}
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="e.g. Northwind Systems"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            />
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-slate-700">
              Session Type <span className="text-rose-600">*</span>
            </legend>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {SESSION_TYPES.map((type) => (
                <label
                  key={type}
                  className={
                    sessionType === type
                      ? "cursor-pointer rounded-lg border border-slate-900 bg-slate-900 px-3 py-2.5 text-center text-sm font-medium text-white transition"
                      : "cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-center text-sm font-medium text-slate-700 transition hover:border-slate-400"
                  }
                >
                  <input
                    type="radio"
                    name="sessionType"
                    value={type}
                    checked={sessionType === type}
                    onChange={() => setSessionType(type)}
                    className="sr-only"
                  />
                  {type}
                </label>
              ))}
            </div>
          </fieldset>

          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              {error}
            </p>
          ) : null}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Booking..." : "Confirm booking"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
