"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { TOKEN_LENGTH } from "@/lib/tokens";

type Mode = "candidate" | "controller";

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("candidate");
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const endpoint =
        mode === "candidate" ? "/api/auth/candidate" : "/api/auth/controller";
      const payload =
        mode === "candidate"
          ? { token: token.trim().toUpperCase() }
          : { username: username.trim().toLowerCase(), password };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(result.error ?? "Sign in failed.");
        return;
      }

      router.replace(result.redirectTo ?? "/book");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div
        role="tablist"
        aria-label="Sign in as"
        className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
      >
        {(["candidate", "controller"] as Mode[]).map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={mode === value}
            onClick={() => switchMode(value)}
            className={`rounded-lg px-3 py-2 text-sm font-medium capitalize transition ${
              mode === value
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        {mode === "candidate" ? (
          <div>
            <label
              htmlFor="token"
              className="block text-sm font-medium text-slate-700"
            >
              Access token
            </label>
            <input
              id="token"
              name="token"
              value={token}
              onChange={(event) =>
                setToken(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, TOKEN_LENGTH),
                )
              }
              autoComplete="one-time-code"
              autoFocus
              spellCheck={false}
              inputMode="text"
              maxLength={TOKEN_LENGTH}
              placeholder="ABCD"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-3 text-center font-mono text-2xl tracking-[0.5em] uppercase outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            />
            <p className="mt-2 text-xs text-slate-500">
              The {TOKEN_LENGTH}-character token from your interview invitation.
            </p>
          </div>
        ) : (
          <>
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-slate-700"
              >
                Username
              </label>
              <input
                id="username"
                name="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoFocus
                spellCheck={false}
                placeholder="e.g. dinesh"
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              />
            </div>
          </>
        )}

        {error ? (
          <p
            role="alert"
            className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
