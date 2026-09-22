"use client";

import { useMemo, useState } from "react";

import type { Panel } from "@/lib/types";
import { usePolledResource } from "@/lib/use-poll";

type CandidateRecord = {
  id: string;
  token: string;
  name: string;
  phone: string | null;
  panelId: string;
  active: boolean;
  bookingCount: number;
};

type Props = {
  panels: Panel[];
};

type Filter = "all" | "active" | "disabled";

export default function CandidatesBoard({ panels }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const [issued, setIssued] = useState<CandidateRecord | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [panelId, setPanelId] = useState(panels[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  // Polled so a token issued by one controller shows up for the others.
  const { data, error, loading, refresh } = usePolledResource<{
    records: CandidateRecord[];
  }>("/api/candidates", 10_000);

  const records = useMemo(() => data?.records ?? [], [data]);

  async function createCandidate(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    setBusy(true);

    try {
      const response = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          panelId,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setNotice(result.error ?? "Could not create that candidate.");
        return;
      }

      setIssued({ ...result, active: true, bookingCount: 0 });
      setName("");
      setPhone("");
      refresh();
    } catch {
      setNotice("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(record: CandidateRecord) {
    setNotice(null);
    setPendingId(record.id);

    try {
      const response = await fetch(`/api/candidates/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !record.active }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setNotice(result.error ?? "Could not update that token.");
        return;
      }

      refresh();
    } catch {
      setNotice("Could not reach the server.");
    } finally {
      setPendingId(null);
    }
  }

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((record) => {
      if (filter === "active" && !record.active) return false;
      if (filter === "disabled" && record.active) return false;
      if (!term) return true;
      return (
        record.name.toLowerCase().includes(term) ||
        record.token.toLowerCase().includes(term) ||
        (record.phone ?? "").includes(term)
      );
    });
  }, [records, filter, search]);

  const activeCount = records.filter((record) => record.active).length;

  const field =
    "mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Candidates
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {activeCount} active of {records.length} token
          {records.length === 1 ? "" : "s"}
        </p>
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

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          Generate a token
        </h2>

        <form
          onSubmit={createCandidate}
          className="mt-4 grid gap-4 sm:grid-cols-4"
        >
          <div className="sm:col-span-2">
            <label
              htmlFor="candidate-name"
              className="block text-sm font-medium text-slate-700"
            >
              Candidate name <span className="text-rose-600">*</span>
            </label>
            <input
              id="candidate-name"
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Aarav Sharma"
              className={field}
            />
          </div>

          <div>
            <label
              htmlFor="candidate-phone"
              className="block text-sm font-medium text-slate-700"
            >
              Phone number
            </label>
            <input
              id="candidate-phone"
              type="tel"
              maxLength={32}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="e.g. +91 98765 43210"
              className={field}
            />
          </div>

          <div>
            <label
              htmlFor="candidate-panel"
              className="block text-sm font-medium text-slate-700"
            >
              Panel <span className="text-rose-600">*</span>
            </label>
            <select
              id="candidate-panel"
              value={panelId}
              onChange={(event) => setPanelId(event.target.value)}
              className={`${field} bg-white`}
            >
              {panels.map((panel) => (
                <option key={panel.id} value={panel.id}>
                  {panel.label}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-4">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Generating..." : "Generate token"}
            </button>
          </div>
        </form>

        {issued ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
            <div>
              <p className="text-xs font-medium tracking-wider text-emerald-700 uppercase">
                Token for {issued.name}
              </p>
              <p className="font-mono text-3xl font-bold tracking-[0.3em] text-emerald-900">
                {issued.token}
              </p>
            </div>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(issued.token)}
                className="rounded-lg border border-emerald-400 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={() => setIssued(null)}
                className="rounded-lg border border-emerald-400 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-6">
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            aria-label="Filter tokens"
            className="flex gap-1 rounded-xl bg-slate-100 p-1"
          >
            {(["all", "active", "disabled"] as Filter[]).map((value) => (
              <button
                key={value}
                role="tab"
                type="button"
                aria-selected={filter === value}
                onClick={() => setFilter(value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition ${
                  filter === value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {value}
              </button>
            ))}
          </div>

          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, token, or phone"
            aria-label="Search candidates"
            className="ml-auto w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs tracking-wider text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold">Token</th>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Phone</th>
                  <th className="px-4 py-3 font-semibold">Panel</th>
                  <th className="px-4 py-3 font-semibold">Bookings</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      Loading roster...
                    </td>
                  </tr>
                ) : visible.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      {records.length === 0
                        ? "No candidates yet. Generate a token above."
                        : "No candidates match that filter."}
                    </td>
                  </tr>
                ) : (
                  visible.map((record) => (
                    <tr
                      key={record.id}
                      className={`border-b border-slate-100 last:border-0 ${
                        record.active ? "" : "bg-slate-50 text-slate-400"
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-base font-semibold tracking-widest">
                        {record.token}
                      </td>
                      <td className="px-4 py-3">{record.name}</td>
                      <td className="px-4 py-3">{record.phone ?? "—"}</td>
                      <td className="px-4 py-3">{record.panelId}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {record.bookingCount}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            record.active
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          <span
                            aria-hidden
                            className={`h-1.5 w-1.5 rounded-full ${
                              record.active ? "bg-emerald-500" : "bg-slate-400"
                            }`}
                          />
                          {record.active ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => toggle(record)}
                          disabled={pendingId === record.id}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                            record.active
                              ? "border-slate-300 text-slate-700 hover:bg-slate-100"
                              : "border-emerald-400 text-emerald-700 hover:bg-emerald-50"
                          }`}
                        >
                          {pendingId === record.id
                            ? "Saving..."
                            : record.active
                              ? "Disable"
                              : "Enable"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Disabling a token blocks sign-in immediately. Existing bookings stay on
          the schedule -- cancel them from the Schedule view if you want the
          slots back.
        </p>
      </section>
    </div>
  );
}
