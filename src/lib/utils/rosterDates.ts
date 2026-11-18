import { format, isValid, parseISO } from 'date-fns';

/**
 * The days that the roster tools of a body ask for (#829): the end of a
 * membership or of a term, and the start of an imported list. A day is a
 * calendar day in the zone of the browser, as the role editor picks it.
 */

const DAY_FORMAT = 'yyyy-MM-dd';

/** A date as the value of a date input. */
export function dayInputValue(date: Date): string {
    return format(date, DAY_FORMAT);
}

/**
 * The date that a roster request sends for a date input. A day that the
 * admin left at its default sends nothing, so the server keeps its exact
 * moment: now for an end, and the end of the last term for an import. The
 * midnight of that day comes before that moment: a member who ended at 14:00
 * and comes back in the import would get a role that starts before the old
 * one ends. An empty input sends nothing too. Another day sends its local
 * midnight.
 */
export function rosterDateRequest(value: string, defaultValue: string): string | undefined {
    if (!value || value === defaultValue) return undefined;
    const day = parseISO(value);
    return isValid(day) ? day.toISOString() : undefined;
}
