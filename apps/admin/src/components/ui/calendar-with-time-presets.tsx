"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent } from "@/components/ui/card"

const timeSlots = Array.from({ length: 37 }, (_, i) => {
  const totalMinutes = i * 15
  const hour = Math.floor(totalMinutes / 60) + 6
  const minute = totalMinutes % 60
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`
})

interface CalendarWithTimePresetsProps {
  date: Date | undefined
  onDateChange: (date: Date | undefined) => void
  selectedTime: string | null
  onTimeChange: (time: string) => void
  onConfirm?: () => void
  locale?: "ro" | "ru"
  availableTimes?: string[]
}

export function CalendarWithTimePresets({
  date,
  onDateChange,
  selectedTime,
  onTimeChange,
  onConfirm,
  locale = "ro",
  availableTimes,
}: CalendarWithTimePresetsProps) {
  const displayTimes = availableTimes && availableTimes.length > 0
    ? [...availableTimes].sort((a, b) => {
        const [ah, am] = a.split(':').map(Number);
        const [bh, bm] = b.split(':').map(Number);
        return ah * 60 + am - (bh * 60 + bm);
      })
    : timeSlots;
  const handleTimeChange = (time: string) => {
    onTimeChange(time)
    if (date) onConfirm?.()
  }

  const handleDateChange = (d: Date | undefined) => {
    onDateChange(d)
    if (d && selectedTime) onConfirm?.()
  }
  return (
    <Card className="gap-0 p-0">
      <CardContent className="relative flex p-0">
        <div className="shrink-0 p-2 sm:p-3">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleDateChange}
            defaultMonth={date || new Date()}
            disabled={{ before: new Date() }}
            showOutsideDays={false}
            className="bg-transparent p-0 [--cell-size:--spacing(7)] sm:[--cell-size:--spacing(8)]"
            classNames={{
              month_caption: "relative mx-7 sm:mx-8 mb-0.5 flex h-7 sm:h-8 items-center justify-center z-20",
              caption_label: "text-[11px] sm:text-xs font-medium",
              weekday: "size-7 sm:size-8 p-0 text-[9px] sm:text-[10px] font-medium text-muted-foreground/80",
              day: "group size-7 sm:size-8 px-0 text-[11px] sm:text-xs",
              day_button: "relative flex size-7 sm:size-8 items-center justify-center whitespace-nowrap rounded-md p-0 text-foreground outline-offset-2 focus:outline-none hover:bg-accent group-data-[selected]:bg-primary hover:text-foreground group-data-[selected]:text-primary-foreground group-data-[disabled]:text-foreground/30 group-data-[outside]:text-foreground/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
              button_previous: "size-7 sm:size-8 text-muted-foreground/80 hover:text-foreground p-0 inline-flex items-center justify-center rounded-lg hover:bg-accent",
              button_next: "size-7 sm:size-8 text-muted-foreground/80 hover:text-foreground p-0 inline-flex items-center justify-center rounded-lg hover:bg-accent",
            }}
            formatters={{
              formatWeekdayName: (d: Date) =>
                d.toLocaleString(locale === "ru" ? "ru-RU" : "ro-RO", { weekday: "short" }),
            }}
          />
        </div>
        <div className="absolute inset-y-0 right-0 flex w-[calc(100%-theme(spacing.52))] sm:w-[calc(100%-theme(spacing.60))] flex-col gap-1 sm:gap-1.5 overflow-y-auto border-l p-1.5 sm:p-2">
          {displayTimes.map((time) => (
            <Button
              key={time}
              type="button"
              variant={selectedTime === time ? "default" : "outline"}
              onClick={() => handleTimeChange(time)}
              className="w-full shrink-0 shadow-none h-6 text-[11px] sm:h-7 sm:text-xs"
            >
              {time}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
