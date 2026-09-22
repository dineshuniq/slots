"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * A coarse shared clock for "is this slot in the past" shading.
 *
 * It is an external store rather than state in an effect for two reasons: one
 * timer serves every subscriber, and the server snapshot is null, so the
 * server and the first client render agree and hydration stays clean. The real
 * time arrives on the render straight after hydration.
 */

const TICK_MS = 30_000;

let current: number | null = null;
const listeners = new Set<() => void>();
let timer: number | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  if (timer === null) {
    current = Date.now();
    timer = window.setInterval(() => {
      current = Date.now();
      for (const subscriber of listeners) subscriber();
    }, TICK_MS);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = (): number | null => current;
const getServerSnapshot = (): number | null => null;

/** Null until the component has hydrated, then the current time. */
export function useNow(): Date | null {
  const millis = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return useMemo(() => (millis === null ? null : new Date(millis)), [millis]);
}
