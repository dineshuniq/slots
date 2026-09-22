"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import PasswordDialog from "@/components/password-dialog";

type Props = {
  role: "candidate" | "controller";
  displayName: string;
};

const CONTROLLER_LINKS = [
  { href: "/schedule", label: "Schedule" },
  { href: "/book", label: "Book" },
  { href: "/candidates", label: "Candidates" },
  { href: "/audit", label: "Audit Logs" },
];

export default function AppHeader({ role, displayName }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  const links = role === "controller" ? CONTROLLER_LINKS : [];

  return (
    <>
      <header className="no-print sticky top-0 z-30 border-b border-slate-800 bg-slate-900 text-white shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm bg-indigo-400"
            />
            Panel Slots
          </span>

          {links.length > 0 ? (
            <nav className="flex items-center gap-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    pathname === link.href
                      ? "bg-indigo-500 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-slate-300 sm:inline">
              {displayName}
              <span className="ml-2 rounded-full bg-slate-700 px-2 py-0.5 text-xs font-medium text-slate-200 capitalize">
                {role}
              </span>
            </span>

            {role === "controller" ? (
              <button
                type="button"
                onClick={() => setShowPassword(true)}
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800 hover:text-white"
              >
                Password
              </button>
            ) : null}

            <button
              type="button"
              onClick={signOut}
              disabled={busy}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800 hover:text-white disabled:opacity-60"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {showPassword ? (
        <PasswordDialog onClose={() => setShowPassword(false)} />
      ) : null}
    </>
  );
}
