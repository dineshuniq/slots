"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import PasswordDialog from "@/components/password-dialog";

type Props = {
  role: "candidate" | "controller";
  displayName: string;
};

type NavLink = {
  href: string;
  label: string;
  /** What fits under an icon in a fifth of a phone's width. */
  short: string;
  icon: React.ReactNode;
};

const ICON = "h-6 w-6";

const CONTROLLER_LINKS: NavLink[] = [
  {
    href: "/schedule",
    label: "Schedule",
    short: "Schedule",
    icon: (
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={ICON}>
        <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
        <path d="M3 9.5h18M8 2.5v4M16 2.5v4M7.5 13.5h3M13.5 13.5h3M7.5 17h3" />
      </svg>
    ),
  },
  {
    href: "/mock",
    label: "Mock",
    short: "Mock",
    icon: (
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={ICON}>
        <rect x="5" y="4" width="14" height="17" rx="2.5" />
        <path d="M9 4V2.8h6V4M9 13l2 2 4-4.5" />
      </svg>
    ),
  },
  {
    href: "/book",
    label: "Book",
    short: "Book",
    icon: (
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={ICON}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
  {
    href: "/candidates",
    label: "Candidates",
    short: "Candidates",
    icon: (
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={ICON}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
      </svg>
    ),
  },
  {
    href: "/audit",
    label: "Audit Logs",
    short: "Audit",
    icon: (
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={ICON}>
        <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
        <path d="M14 3.5V8h4M9 12.5h6M9 16.5h6" />
      </svg>
    ),
  },
];

/**
 * App chrome.
 *
 * On a phone a controller's five sections live in a tab bar at the bottom of
 * the screen, where a thumb reaches them, and the account actions fold into
 * one button at the top. The same header on a laptop keeps everything inline.
 * Wrapped into one row, the old version grew to three sticky rows on a phone
 * and covered a third of the screen before any content.
 */
export default function AppHeader({ role, displayName }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  const links = role === "controller" ? CONTROLLER_LINKS : [];
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";

  const outline =
    "rounded-lg border border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800 hover:text-white disabled:opacity-60";

  return (
    <>
      <header className="no-print sticky top-0 z-40 border-b border-slate-800 bg-slate-900 text-white shadow-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <span className="flex shrink-0 items-center gap-2 text-sm font-semibold tracking-tight">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm bg-indigo-400"
            />
            Panel Slots
          </span>

          {links.length > 0 ? (
            <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    isActive(link.href)
                      ? "bg-indigo-500 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          ) : null}

          {/* Laptop: everything inline. */}
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <span className="text-sm text-slate-300">
              {displayName}
              <span className="ml-2 rounded-full bg-slate-700 px-2 py-0.5 text-xs font-medium text-slate-200 capitalize">
                {role}
              </span>
            </span>

            {role === "controller" ? (
              <button
                type="button"
                onClick={() => setShowPassword(true)}
                className={outline}
              >
                Password
              </button>
            ) : null}

            <button
              type="button"
              onClick={signOut}
              disabled={busy}
              className={outline}
            >
              Sign out
            </button>
          </div>

          {/* Phone: one button, which opens the account actions. */}
          <div className="relative ml-auto md:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`Account: ${displayName}`}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 text-sm font-bold text-white ring-2 ring-slate-700 transition active:scale-95"
            >
              {initial}
            </button>

            {menuOpen ? (
              <>
                {/* Catches the tap outside the menu that closes it. */}
                <button
                  type="button"
                  aria-label="Close menu"
                  tabIndex={-1}
                  onClick={() => setMenuOpen(false)}
                  className="fixed inset-0 z-40 cursor-default"
                />
                <div
                  role="menu"
                  className="absolute top-12 right-0 z-50 w-60 overflow-hidden rounded-2xl bg-white text-slate-900 shadow-xl ring-1 ring-slate-900/10"
                >
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="truncate text-sm font-semibold">{displayName}</p>
                    <p className="text-xs text-slate-500 capitalize">{role}</p>
                  </div>

                  {role === "controller" ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setShowPassword(true);
                      }}
                      className="flex w-full items-center px-4 py-3.5 text-left text-sm font-medium transition active:bg-slate-100"
                    >
                      Change password
                    </button>
                  ) : null}

                  <button
                    type="button"
                    role="menuitem"
                    onClick={signOut}
                    disabled={busy}
                    className="flex w-full items-center border-t border-slate-100 px-4 py-3.5 text-left text-sm font-medium text-rose-600 transition active:bg-rose-50 disabled:opacity-60"
                  >
                    {busy ? "Signing out..." : "Sign out"}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {links.length > 0 ? (
        <nav
          aria-label="Sections"
          className="app-tabbar no-print fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(15_23_42/0.06)] backdrop-blur md:hidden"
        >
          <div className="grid h-16 grid-cols-5">
            {links.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition active:scale-95 ${
                    active ? "text-indigo-700" : "text-slate-500"
                  }`}
                >
                  <span
                    className={`flex h-8 w-14 items-center justify-center rounded-full transition ${
                      active ? "bg-indigo-100" : ""
                    }`}
                  >
                    {link.icon}
                  </span>
                  {link.short}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}

      {showPassword ? (
        <PasswordDialog onClose={() => setShowPassword(false)} />
      ) : null}
    </>
  );
}
