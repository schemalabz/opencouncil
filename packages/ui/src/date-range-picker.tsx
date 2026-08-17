"use client";

import * as React from "react";
import { format } from "date-fns";
import { el } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "./lib/utils";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

interface DateRangePickerProps {
    value?: DateRange;
    onChange: (range: DateRange | undefined) => void;
    placeholder?: string;
    className?: string;
    numberOfMonths?: number;
    disabled?: (date: Date) => boolean;
    /** Classes for the calendar panel. The panel is portalled to the body, so a caller inside a
     *  stacked overlay has to lift it over that overlay with a z-index of its own. */
    contentClassName?: string;
}

export function DateRangePicker({
    value,
    onChange,
    placeholder = "Επιλέξτε περίοδο",
    className,
    numberOfMonths = 2,
    disabled,
    contentClassName,
}: DateRangePickerProps) {
    return (
        <Popover modal>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className={cn(
                        "w-full justify-start text-left font-normal",
                        !value?.from && "text-muted-foreground",
                        className
                    )}
                >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {value?.from ? (
                        value.to ? (
                            <>
                                {format(value.from, "d MMM yyyy", { locale: el })}
                                {" – "}
                                {format(value.to, "d MMM yyyy", { locale: el })}
                            </>
                        ) : (
                            format(value.from, "d MMM yyyy", { locale: el })
                        )
                    ) : (
                        <span>{placeholder}</span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className={cn("w-auto p-0", contentClassName)} align="start">
                <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={value?.from}
                    selected={value}
                    onSelect={onChange}
                    numberOfMonths={numberOfMonths}
                    disabled={disabled}
                />
            </PopoverContent>
        </Popover>
    );
}
