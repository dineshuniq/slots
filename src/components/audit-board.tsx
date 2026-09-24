"use client";

import { useMemo, useState } from "react";

import type { AuditEntry } from "@/lib/audit";
import { SCHEDULE_LOCALE, SCHEDULE_TIMEZONE } from "@/lib/time";
import { usePolledResource } from "@/lib/use-poll";

type ActionOption = { action: string; label: string };

type Payload = {
  entries: AuditEntry[];
  actions: ActionOption[];
  limit: number;
  truncated: boolean;
};

const ROLE_LABELS: Record<string, string> = {
  controller: "Controller",
  candidate: "Candidate",
  system: "System",
};

const ROLE_TONES: Record<string, string> = {
  controller: "bg-slate-900 text-white",
  candidate: "bg-sky-100 text-sky-800",
  system: "bg-slate-200 text-slate-700",
};

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat(SCHEDULE_LOCALE, {
    timeZone: SCHEDULE_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export default function AuditBoard() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [action, setAction] = useState("");
  const [actorRole, setActorRole] = useState("");
  const [search, setSearch] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (action) params.set("action", action);
    if (actorRole) params.set("actorRole", actorRole);
    if (search.trim()) params.set("q", search.trim());
    return params.toString();
  }, [from, to, action, actorRole, search]);

  const { data, error, loading, refresh } = usePolledResource<Payload>(
    `/api/audit${query ? `?${query}` : ""}`,
    15_000,
  );

  const entries = data?.entries ?? [];
  const actions = data?.actions ?? [];
  const filtersOn = Boolean(from || to || action || actorRole || search.trim());

  function clearFilters() {
    setFrom("");
    setTo("");
    setAction("");
    setActorRole("");
    setSearch("");
  }

  const field =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10";

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Audit Logs
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Every change to tokens and sessions, newest first.
          </p>
        </div>

        <div className="no-print flex w-full gap-2 sm:w-auto">
          <a
            href={`/api/audit/export?format=csv${query ? `&${query}` : ""}`}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-100 sm:flex-none sm:py-2"
          >
            Download CSV
          </a>
          <a
            href={`/api/audit/export?format=xlsx${query ? `&${query}` : ""}`}
            className="flex-1 rounded-lg bg-emerald-600 px-3 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-emerald-700 sm:flex-none sm:py-2"
          >
            Download Excel
          </a>
        </div>
      </header>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            From
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
              className={field}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            To
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
              className={field}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Action
            <select
              value={action}
              onChange={(event) => setAction(event.target.value)}
              className={field}
            >
              <option value="">All actions</option>
              {actions.map((option) => (
                <option key={option.action} value={option.action}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Done by
            <select
              value={actorRole}
              onChange={(event) => setActorRole(event.target.value)}
              className={field}
            >
              <option value="">Anyone</option>
              <option value="controller">Controllers</option>
              <option value="candidate">Candidates</option>
              <option value="system">System</option>
            </select>
          </label>

          <label className="col-span-2 flex flex-col gap-1.5 text-sm font-medium text-slate-700 lg:col-span-1">
            Search
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, token, panel..."
              className={field}
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <span>
            {loading && !data
              ? "Loading..."
              : `${entries.length} entr${entries.length === 1 ? "y" : "ies"}${
                  data?.truncated ? ` (newest ${data.limit} shown)` : ""
                }`}
          </span>
          {filtersOn ? (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100 sm:px-2.5 sm:py-1"
            >
              Clear filters
            </button>
          ) : null}
          <button
            type="button"
            onClick={refresh}
            className="ml-auto rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100 sm:px-2.5 sm:py-1"
          >
            Refresh
          </button>
        </div>

        {data?.truncated ? (
          <p className="mt-2 text-xs text-slate-500">
            Only the newest {data.limit} are listed. Narrow the dates, or
            download the file for the full set.
          </p>
        ) : null}
      </section>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          {error}
        </p>
      ) : null}

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {entries.length === 0 && !loading ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            {filtersOn
              ? "Nothing matches those filters."
              : "Nothing has been logged yet."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-sm hover:bg-slate-50"
              >
                <span className="shrink-0 text-xs tabular-nums text-slate-500 sm:w-40 sm:text-sm">
                  {formatWhen(entry.occurredAt)}
                </span>

                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
                    ROLE_TONES[entry.actorRole] ?? ROLE_TONES.system
                  }`}
                >
                  {ROLE_LABELS[entry.actorRole] ?? entry.actorRole}
                </span>

                <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {entry.actionLabel}
                </span>

                <span className="w-full text-slate-900 sm:w-auto sm:min-w-0 sm:flex-1">
                  {entry.summary}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
