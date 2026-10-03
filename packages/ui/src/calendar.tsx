"use client"

import * as React from "react"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react"
import { DayButton, DayPicker, type ChevronProps, type DayButtonProps } from "react-day-picker"

import { cn } from "./lib/utils"
import { buttonVariants } from "./button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

// DayPicker puts the modifier classes and aria-selected on the cell, not on the
// button. The button gets data-selected and these classes, so that it keeps the
// styles that it had in react-day-picker 8.
const dayButtonModifierClassNames: Record<string, string> = {
  selected:
    "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
  today: "bg-accent text-accent-foreground",
  outside:
    "day-outside text-muted-foreground opacity-50 data-[selected=true]:bg-accent/50 data-[selected=true]:text-muted-foreground data-[selected=true]:opacity-30",
  disabled: "text-muted-foreground opacity-50",
  range_middle:
    "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
  range_end: "day-range-end",
}

function CalendarDayButton({ className, modifiers, ...props }: DayButtonProps) {
  return (
    <DayButton
      modifiers={modifiers}
      data-selected={modifiers.selected || undefined}
      className={[
        className,
        ...Object.keys(dayButtonModifierClassNames)
          .filter((modifier) => modifiers[modifier])
          .map((modifier) => dayButtonModifierClassNames[modifier]),
      ].join(" ")}
      {...props}
    />
  )
}

function CalendarChevron({ orientation }: ChevronProps) {
  const Icon =
    orientation === "left"
      ? ChevronLeft
      : orientation === "up"
        ? ChevronUp
        : orientation === "down"
          ? ChevronDown
          : ChevronRight
  return <Icon className="h-4 w-4" />
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  // react-day-picker 8 put the label and the nav buttons in one centered row
  // above the grid. navLayout="around" and the flex row below keep that layout.
  // In version 8, "relative" from buttonVariants won over "absolute", so left-1
  // and right-1 only moved each button by 4px. The values below keep that offset.
  const navButton = cn(
    buttonVariants({ variant: "outline" }),
    "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 aria-disabled:pointer-events-none"
  )
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      navLayout="around"
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "flex w-min flex-wrap items-center justify-center gap-y-4 pt-1",
        month_caption: "order-first flex",
        caption_label: "text-sm font-medium",
        button_previous: cn(navButton, "left-1"),
        button_next: cn(navButton, "right-1 [button~&]:ml-1"),
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday:
          "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",
        day: "h-9 w-9 text-center text-sm p-0 relative [&:has([data-selected].day-range-end)]:rounded-r-md [&:has([data-selected].day-outside)]:bg-accent/50 [&:has([data-selected])]:bg-accent first:[&:has([data-selected])]:rounded-l-md last:[&:has([data-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal data-[selected=true]:opacity-100"
        ),
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: CalendarChevron,
        DayButton: CalendarDayButton,
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
