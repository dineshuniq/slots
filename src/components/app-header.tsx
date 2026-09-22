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
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <span className="text-sm font-semibold tracking-tight text-slate-900">
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
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-slate-600 sm:inline">
              {displayName}
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 capitalize">
                {role}
              </span>
            </span>

            {role === "controller" ? (
              <button
                type="button"
                onClick={() => setShowPassword(true)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Password
              </button>
            ) : null}

            <button
              type="button"
              onClick={signOut}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
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
