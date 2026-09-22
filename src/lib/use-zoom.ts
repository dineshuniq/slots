"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Zoom for the Schedule grid.
 *
 * Twenty-six rows times three panels does not fit on a laptop screen at a
 * comfortable size, so the controller chooses: fit more of the day on screen,
 * or read each session without squinting.
 *
 * Discrete levels rather than a continuous scale, so text never lands on a
 * half pixel. The choice is a per-viewer convenience, so it lives in
 * localStorage - read through an external store with a fixed server snapshot,
 * which keeps the first client render identical to the server's.
 */

export type ZoomLevel = {
  name: string;
  /** Minimum height of one half-hour cell. */
  row: string;
  /** Width of a panel column. */
  column: string;
  /** Width of the sticky time column. */
  timeColumn: string;
  text: string;
  /** The candidate's name: the thing a controller reads first. */
  nameText: string;
  /** The company under it, a step down but still legible. */
  companyText: string;
  padding: string;
  /** Whether a chip has room for company and session type. */
  detail: boolean;
};

export const ZOOM_LEVELS: ZoomLevel[] = [
  {
    name: "Compact",
    row: "min-h-[1.75rem]",
    column: "7.5rem",
    timeColumn: "4.25rem",
    text: "text-[10px]",
    nameText: "text-[11px]",
    companyText: "text-[10px]",
    padding: "p-1",
    detail: false,
  },
  {
    name: "Default",
    row: "min-h-[3.25rem]",
    column: "11rem",
    timeColumn: "5.5rem",
    text: "text-[11px]",
    nameText: "text-sm",
    companyText: "text-[11px]",
    padding: "p-1.5",
    detail: true,
  },
  {
    name: "Large",
    row: "min-h-[4.75rem]",
    column: "14rem",
    timeColumn: "6.5rem",
    text: "text-xs",
    nameText: "text-base",
    companyText: "text-xs",
    padding: "p-2",
    detail: true,
  },
];

const STORAGE_KEY = "panel-slots:schedule-zoom";
const DEFAULT_LEVEL = 1;

let current = DEFAULT_LEVEL;
let restored = false;
const listeners = new Set<() => void>();

function readStored(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_LEVEL;
    const value = Number(raw);
    return Number.isInteger(value) && value >= 0 && value < ZOOM_LEVELS.length
      ? value
      : DEFAULT_LEVEL;
  } catch {
    // Private windows and blocked site data both throw here.
    return DEFAULT_LEVEL;
  }
}

function subscribe(listener: () => void): () => void {
  if (!restored) {
    current = readStored();
    restored = true;
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => current;
const getServerSnapshot = () => DEFAULT_LEVEL;

export function useZoom() {
  const level = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setLevel = useCallback((next: number) => {
    const clamped = Math.min(Math.max(next, 0), ZOOM_LEVELS.length - 1);
    if (clamped === current) return;

    current = clamped;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
      // Not being able to remember the choice is not worth failing over.
    }
    for (const listener of listeners) listener();
  }, []);

  // Stepping from the module value, not the captured render value: two quick
  // clicks would otherwise both compute the same next level and the second
  // would do nothing.
  const zoomIn = useCallback(() => setLevel(current + 1), [setLevel]);
  const zoomOut = useCallback(() => setLevel(current - 1), [setLevel]);

  return {
    level,
    setLevel,
    zoomIn,
    zoomOut,
    zoom: ZOOM_LEVELS[level],
    canZoomIn: level < ZOOM_LEVELS.length - 1,
    canZoomOut: level > 0,
  };
}
