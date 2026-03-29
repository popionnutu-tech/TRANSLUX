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
}

export function CalendarWithTimePresets({
  date,
  onDateChange,
  selectedTime,
  onTimeChange,
  onConfirm,
  locale = "ro",
}: CalendarWithTimePresetsProps) {
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
      <CardContent className="flex flex-col sm:flex-row p-0">
        <div className="shrink-0 p-3 flex justify-center sm:justify-start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleDateChange}
            defaultMonth={date || new Date()}
            showOutsideDays={false}
            className="bg-transparent p-0 [--cell-size:--spacing(8)]"
            classNames={{
              month_caption: "relative mx-8 mb-0.5 flex h-8 items-center justify-center z-20",
              caption_label: "text-xs font-medium",
              weekday: "size-8 p-0 text-[10px] font-medium text-muted-foreground/80",
              day: "group size-8 px-0 text-xs",
              day_button: "relative flex size-8 items-center justify-center whitespace-nowrap rounded-md p-0 text-foreground outline-offset-2 focus:outline-none hover:bg-accent group-data-[selected]:bg-primary hover:text-foreground group-data-[selected]:text-primary-foreground group-data-[disabled]:text-foreground/30 group-data-[outside]:text-foreground/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
              button_previous: "size-8 text-muted-foreground/80 hover:text-foreground p-0 inline-flex items-center justify-center rounded-lg hover:bg-accent",
              button_next: "size-8 text-muted-foreground/80 hover:text-foreground p-0 inline-flex items-center justify-center rounded-lg hover:bg-accent",
            }}
            formatters={{
              formatWeekdayName: (d: Date) =>
                d.toLocaleString(locale === "ru" ? "ru-RU" : "ro-RO", { weekday: "short" }),
            }}
          />
        </div>
        <div className="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto border-t p-2 sm:flex sm:flex-col sm:max-h-none sm:border-t-0 sm:border-l">
          {timeSlots.map((time) => (
            <Button
              key={time}
              type="button"
              variant={selectedTime === time ? "default" : "outline"}
              onClick={() => handleTimeChange(time)}
              className="w-full shrink-0 shadow-none h-7 text-xs"
            >
              {time}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
