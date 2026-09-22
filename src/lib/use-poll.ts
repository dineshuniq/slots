"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_INTERVAL_MS = 4000;

type Entry<T> = {
  url: string;
  data: T | null;
  error: string | null;
};

/**
 * Fetches a JSON endpoint and re-fetches it on a timer, on tab focus, and on
 * demand after a mutation. Polling is how two controllers and a candidate stay
 * in sync without holding a socket open on a serverless function.
 *
 * The timer pauses while the tab is hidden and fires immediately when it comes
 * back, so a laptop waking from sleep shows current state rather than stale.
 *
 * Results are stored with the URL they came from, which makes "loading" a
 * derived value - no effect has to reset it when the date or panel changes,
 * and a response for a superseded URL can never overwrite a newer one.
 */
export function usePolledResource<T>(
  url: string,
  intervalMs: number = DEFAULT_INTERVAL_MS,
) {
  const router = useRouter();
  const [entry, setEntry] = useState<Entry<T>>({
    url: "",
    data: null,
    error: null,
  });

  // Reassigned by the effect below so callers get a stable refresh function
  // that always targets the current URL.
  const reload = useRef<() => void>(() => {});

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (response.status === 401) {
          router.replace("/");
          return;
        }

        const body = await response.json().catch(() => ({}));
        if (controller.signal.aborted) return;

        setEntry({
          url,
          data: response.ok ? (body as T) : null,
          error: response.ok
            ? null
            : ((body as { error?: string }).error ??
              "Could not load the schedule."),
        });
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
        setEntry({
          url,
          data: null,
          error: "Lost connection to the server. Retrying...",
        });
      }
    }

    reload.current = () => void load();
    void load();

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, intervalMs);

    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [url, intervalMs, router]);

  const refresh = useCallback(() => reload.current(), []);

  const matches = entry.url === url;

  return {
    data: matches ? entry.data : null,
    error: matches ? entry.error : null,
    loading: !matches,
    refresh,
  };
}
