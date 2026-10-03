import { isAfter, isBefore, isSameDay } from "date-fns";
import type { DateRange } from "react-day-picker";

/**
 * The range that a click on `day` gives, with the rules of react-day-picker 8.
 * Version 9 and later make the first click a one-day range, so a live filter
 * applies that single day before the second click. Here the first click only
 * sets the start, and a click on the start of a complete range clears it.
 */
export function addDayToRange(day: Date, range: DateRange | undefined): DateRange | undefined {
    const from = range?.from;
    const to = range?.to;
    if (from && to) {
        if (isSameDay(to, day) && isSameDay(from, day)) return undefined;
        if (isSameDay(to, day)) return { from: to, to: undefined };
        if (isSameDay(from, day)) return undefined;
        if (isAfter(from, day)) return { from: day, to };
        return { from, to: day };
    }
    if (to) {
        if (isAfter(day, to)) return { from: to, to: day };
        return { from: day, to };
    }
    if (from) {
        if (isBefore(day, from)) return { from: day, to: from };
        return { from, to: day };
    }
    return { from: day, to: undefined };
}
