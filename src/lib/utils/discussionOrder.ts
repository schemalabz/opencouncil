/** One position in the order a meeting actually took its items. */
export interface OrderPosition {
    /** How the position reads on its own: «3ο», «ΕΗΔ1». */
    label: string;
    /**
     * Which counter the position belongs to. Only positions of the same
     * sequence can be neighbours: ΕΗΔ1 and 2ο count in different series, so
     * they never form a run even when their numbers follow each other.
     */
    sequence: string;
    /** The position's number inside its sequence. */
    index: number;
}

/** An en dash: this is a range between two numbers, not a compound word. */
const RANGE_DASH = '–';

/**
 * The order a meeting took its items, with each consecutive run written as a
 * range.
 *
 * A council that works straight through its agenda produces one position per
 * item — «3ο, 4ο, 5ο, 6ο, 7ο, 8ο, 1ο, 2ο, 9ο, 10ο, …» — which nobody reads.
 * Collapsed, the same order says «3ο–8ο, 1ο, 2ο, 9ο–21ο» and the departure
 * from the agenda is the thing that stands out.
 *
 * The sequence is never re-sorted: this is the record of what happened, so a
 * run is only a run when the positions already sit next to each other, in
 * ascending order, in the same counter. A descending stretch stays listed item
 * by item — «8ο–6ο» would read as a range taken forwards.
 */
export function collapseOrderRuns(positions: readonly OrderPosition[]): string[] {
    const parts: string[] = [];
    let run: OrderPosition[] = [];

    const flush = () => {
        if (run.length === 0) return;
        const first = run[0];
        const last = run[run.length - 1];
        parts.push(run.length === 1 ? first.label : `${first.label}${RANGE_DASH}${last.label}`);
        run = [];
    };

    for (const position of positions) {
        const previous = run[run.length - 1];
        if (previous && previous.sequence === position.sequence && position.index === previous.index + 1) {
            run.push(position);
            continue;
        }
        flush();
        run = [position];
    }
    flush();

    return parts;
}
