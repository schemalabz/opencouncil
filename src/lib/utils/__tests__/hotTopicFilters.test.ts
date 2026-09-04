import { HOT_PERIODS, HOT_SCOPES, monthsAgo, readPeriod, readScope } from '../hotTopicFilters';

describe('readScope / readPeriod', () => {
    it('keeps a value the picker writes', () => {
        expect(readScope('committee')).toBe('committee');
        expect(readScope('all')).toBe('all');
        expect(readPeriod('12m')).toBe('12m');
        expect(readPeriod('all')).toBe('all');
    });

    it('falls back to the default when the value is absent or unknown', () => {
        expect(readScope(undefined)).toBe('council');
        expect(readScope('')).toBe('council');
        expect(readScope('mayor')).toBe('council');
        expect(readPeriod(undefined)).toBe('3m');
        expect(readPeriod('2w')).toBe('3m');
    });

    // These are the keys `in` answers true for. A period of 'constructor' used
    // to reach HOT_PERIODS.constructor.months — undefined, so the page ranked
    // over all time and the picker asked next-intl for a missing label.
    it.each(['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty'])(
        'falls back for the inherited key %s',
        key => {
            expect(readScope(key)).toBe('council');
            expect(readPeriod(key)).toBe('3m');
            expect(HOT_SCOPES[readScope(key)]).toBeDefined();
            expect(HOT_PERIODS[readPeriod(key)].months).toBe(3);
        },
    );
});

describe('monthsAgo', () => {
    it('lands in the intended month from a day that month does not have', () => {
        const from = monthsAgo(3, new Date(2026, 4, 31, 9, 30));
        expect(from.getFullYear()).toBe(2026);
        expect(from.getMonth()).toBe(1);
        expect(from.getDate()).toBe(28);
        expect(from.getHours()).toBe(9);
        expect(from.getMinutes()).toBe(30);
    });

    it('clamps to a leap February', () => {
        const from = monthsAgo(1, new Date(2024, 2, 31, 8, 0));
        expect(from.getMonth()).toBe(1);
        expect(from.getDate()).toBe(29);
    });

    it('keeps the day of the month when the target month has it', () => {
        const from = monthsAgo(6, new Date(2026, 8, 4, 12, 0));
        expect(from.getFullYear()).toBe(2026);
        expect(from.getMonth()).toBe(2);
        expect(from.getDate()).toBe(4);
    });

    it('crosses the year boundary', () => {
        const from = monthsAgo(12, new Date(2026, 0, 31, 0, 0));
        expect(from.getFullYear()).toBe(2025);
        expect(from.getMonth()).toBe(0);
        expect(from.getDate()).toBe(31);
    });

    // The old arithmetic put this window's start on 3 March, which read a
    // meeting held two days earlier as outside a three-month period.
    it('keeps a meeting held inside the period inside the window', () => {
        const now = new Date(2026, 4, 31, 12, 0);
        const meeting = new Date(2026, 2, 1, 18, 0);
        expect(meeting >= monthsAgo(3, now)).toBe(true);
    });
});
