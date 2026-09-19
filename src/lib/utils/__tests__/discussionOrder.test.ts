import { collapseOrderRuns, type OrderPosition } from '@/lib/utils/discussionOrder';

/** An agenda item at position `n`, as the label writes it. */
const item = (n: number): OrderPosition => ({ label: `${n}ο`, sequence: 'agenda', index: n });
/** An item taken out of the agenda, which counts in its own series. */
const outOfAgenda = (n: number): OrderPosition => ({ label: `ΕΗΔ${n}`, sequence: 'outOfAgenda', index: n });

describe('collapseOrderRuns', () => {
    it('writes a run of consecutive items as one range and leaves the rest alone', () => {
        const order = [3, 4, 5, 6, 7, 8, 1, 2, 9, 10, 11, 4].map(item);
        expect(collapseOrderRuns(order)).toEqual(['3ο–8ο', '1ο–2ο', '9ο–11ο', '4ο']);
    });

    it('keeps the order the meeting took, never sorting it', () => {
        expect(collapseOrderRuns([9, 10, 1, 2].map(item))).toEqual(['9ο–10ο', '1ο–2ο']);
    });

    it('writes two consecutive items as a range as well', () => {
        expect(collapseOrderRuns([1, 2, 5].map(item))).toEqual(['1ο–2ο', '5ο']);
    });

    it('leaves a single item on its own', () => {
        expect(collapseOrderRuns([item(4)])).toEqual(['4ο']);
    });

    it('never joins two counters into one run', () => {
        // ΕΗΔ1 and 2ο follow each other on the line but count in different
        // series — a range across them would claim items that do not exist.
        expect(collapseOrderRuns([outOfAgenda(1), item(2), item(3)])).toEqual(['ΕΗΔ1', '2ο–3ο']);
    });

    it('collapses a run inside one counter', () => {
        expect(collapseOrderRuns([outOfAgenda(1), outOfAgenda(2), item(1)])).toEqual(['ΕΗΔ1–ΕΗΔ2', '1ο']);
    });

    it('lists a descending stretch item by item', () => {
        // «8ο–6ο» reads as a range taken forwards, which is the opposite of
        // what happened.
        expect(collapseOrderRuns([8, 7, 6].map(item))).toEqual(['8ο', '7ο', '6ο']);
    });

    it('does not collapse items the meeting skipped over', () => {
        expect(collapseOrderRuns([1, 3, 5].map(item))).toEqual(['1ο', '3ο', '5ο']);
    });

    it('returns nothing for an empty order', () => {
        expect(collapseOrderRuns([])).toEqual([]);
    });

    it('never merges a repeated position into a run', () => {
        expect(collapseOrderRuns([1, 1, 2].map(item))).toEqual(['1ο', '1ο–2ο']);
    });
});
