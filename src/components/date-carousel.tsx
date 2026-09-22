"use client";

import type { CarouselDay } from "@/lib/time";

type Props = {
  days: CarouselDay[];
  selected: string;
  onSelect: (dateKey: string) => void;
};

/** Eight-day strip: yesterday through six days ahead. */
export default function DateCarousel({ days, selected, onSelect }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Select a date"
      className="thin-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
    >
      {days.map((day) => {
        const isSelected = day.key === selected;
        return (
          <button
            key={day.key}
            role="tab"
            type="button"
            aria-selected={isSelected}
            onClick={() => onSelect(day.key)}
            className={`flex min-w-[76px] flex-1 shrink-0 flex-col items-center rounded-xl border px-3 py-2.5 transition ${
              isSelected
                ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                : day.isPast
                  ? "border-slate-200 bg-white text-slate-400 hover:border-slate-300"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
            }`}
          >
            <span className="text-[11px] font-medium tracking-wide uppercase">
              {day.weekday}
            </span>
            <span className="text-xl font-semibold tabular-nums">
              {day.dayOfMonth}
            </span>
            <span
              className={`text-[11px] ${isSelected ? "text-slate-300" : "text-slate-500"}`}
            >
              {day.isToday ? "Today" : day.month}
            </span>
          </button>
        );
      })}
    </div>
  );
}
