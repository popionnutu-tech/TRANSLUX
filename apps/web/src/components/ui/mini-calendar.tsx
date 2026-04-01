"use client";

import * as React from "react";
import {
  format,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isToday,
  isBefore,
  startOfDay,
} from "date-fns";
import { ro, ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const DAYS_RO = ["Dum", "Lun", "Mar", "Mie", "Joi", "Vin", "Sâm"];
const DAYS_RU = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

interface MiniCalendarProps {
  value?: Date;
  onChange?: (date: Date) => void;
  locale?: "ro" | "ru";
}

export function MiniCalendar({ value, onChange, locale = "ro" }: MiniCalendarProps) {
  const selected = value || new Date();
  const [currentWeek, setCurrentWeek] = React.useState<Date>(selected);
  const dayLabels = locale === "ru" ? DAYS_RU : DAYS_RO;
  const dateFnsLocale = locale === "ru" ? ru : ro;

  const today = startOfDay(new Date());

  const weekDays = eachDayOfInterval({
    start: startOfWeek(currentWeek, { weekStartsOn: 0 }),
    end: endOfWeek(currentWeek, { weekStartsOn: 0 }),
  });

  const canGoPrev = !isBefore(startOfWeek(subWeeks(currentWeek, 1), { weekStartsOn: 0 }), startOfWeek(today, { weekStartsOn: 0 }));

  return (
    <div className="w-full overflow-hidden rounded-lg border bg-white shadow-sm" style={{ fontFamily: 'var(--font-opensans), Open Sans, sans-serif' }}>
      <div className="flex items-center justify-between px-3 py-2">
        <button
          type="button"
          onClick={() => canGoPrev && setCurrentWeek(subWeeks(currentWeek, 1))}
          disabled={!canGoPrev}
          className={cn("p-1 rounded transition-colors", canGoPrev ? "hover:bg-gray-100" : "opacity-30 cursor-not-allowed")}
        >
          <ChevronLeft className="h-4 w-4 text-gray-500" />
        </button>
        <span className="text-sm font-medium text-gray-700 capitalize">
          {format(currentWeek, "LLLL yyyy", { locale: dateFnsLocale })}
        </span>
        <button
          type="button"
          onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
          className="p-1 rounded hover:bg-gray-100 transition-colors"
        >
          <ChevronRight className="h-4 w-4 text-gray-500" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center px-2 pb-1">
        {dayLabels.map((d) => (
          <div key={d} className="text-[10px] font-medium text-gray-400 uppercase">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 px-2 pb-2">
        {weekDays.map((day) => {
          const isSel = format(day, "yyyy-MM-dd") === format(selected, "yyyy-MM-dd");
          const isT = isToday(day);
          const isPast = isBefore(day, today);

          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={isPast}
              onClick={() => !isPast && onChange?.(day)}
              className={cn(
                "h-8 w-full rounded-md text-sm font-medium transition-colors",
                isPast
                  ? "text-gray-300 cursor-not-allowed"
                  : isSel
                    ? "bg-[#9B1B30] text-white"
                    : isT
                      ? "bg-red-50 text-[#9B1B30] font-semibold"
                      : "text-gray-700 hover:bg-gray-100"
              )}
            >
              <time dateTime={format(day, "yyyy-MM-dd")}>
                {format(day, "d")}
              </time>
            </button>
          );
        })}
      </div>
    </div>
  );
}
