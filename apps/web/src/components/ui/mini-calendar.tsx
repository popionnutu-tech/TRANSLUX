"use client";

import * as React from "react";
import { format, addDays, differenceInCalendarDays, eachDayOfInterval, isToday, startOfDay } from "date-fns";
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

/*
 * Șapte zile la rând, începând cu azi (Ion, 10.10.2026: «zilele trecute niciodată să nu se arate»).
 * Înainte rândul era săptămâna duminică–sâmbătă, iar zilele trecute stăteau gri în el; acum fereastra
 * pornește de azi și sare câte 7 zile, deci o zi trecută nu mai apare deloc. Numele zilei stă deasupra
 * fiecărei date, pentru că primul loc nu mai e mereu duminica.
 */
export function MiniCalendar({ value, onChange, locale = "ro" }: MiniCalendarProps) {
  const today = startOfDay(new Date());
  const selected = value || today;
  // fereastra care conține ziua aleasă (ziua aleasă e azi sau mai târziu)
  const [offset, setOffset] = React.useState(() => Math.max(0, Math.floor(differenceInCalendarDays(selected, today) / 7)));
  const dayLabels = locale === "ru" ? DAYS_RU : DAYS_RO;
  const dateFnsLocale = locale === "ru" ? ru : ro;

  const start = addDays(today, offset * 7);
  const days = eachDayOfInterval({ start, end: addDays(start, 6) });
  const canGoPrev = offset > 0;

  return (
    <div className="w-full overflow-hidden rounded-lg border bg-white shadow-sm" style={{ fontFamily: 'var(--font-main), Roboto, sans-serif' }}>
      <div className="flex items-center justify-between px-3 py-2">
        <button
          type="button"
          onClick={() => canGoPrev && setOffset(offset - 1)}
          disabled={!canGoPrev}
          className={cn("p-1 rounded transition-colors", canGoPrev ? "hover:bg-gray-100" : "opacity-30 cursor-not-allowed")}
        >
          <ChevronLeft className="h-4 w-4 text-gray-500" />
        </button>
        <span className="text-sm font-medium text-gray-700 capitalize">
          {format(start, "LLLL yyyy", { locale: dateFnsLocale })}
        </span>
        <button
          type="button"
          onClick={() => setOffset(offset + 1)}
          className="p-1 rounded hover:bg-gray-100 transition-colors"
        >
          <ChevronRight className="h-4 w-4 text-gray-500" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center px-2 pb-1">
        {days.map((day) => (
          <div key={day.toISOString()} className="text-[10px] font-medium text-gray-400 uppercase">
            {dayLabels[day.getDay()]}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 px-2 pb-2">
        {days.map((day) => {
          const isSel = format(day, "yyyy-MM-dd") === format(selected, "yyyy-MM-dd");
          const isT = isToday(day);

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onChange?.(day)}
              className={cn(
                "h-8 w-full rounded-md text-sm font-medium transition-colors",
                isSel
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
