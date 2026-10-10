import { dayBounds, dayRangeToInstants, hasDayBound, resolveDateRange } from '@/lib/dates/dayBounds';

// The bounds must not depend on the zone of the machine: CI runs in UTC, a
// developer in Athens. Node reads process.env.TZ again when it changes.
const machineZones = ['UTC', 'Europe/Athens', 'Pacific/Kiritimati', 'America/Los_Angeles'];
const originalZone = process.env.TZ;

describe.each(machineZones)('on a machine in %s', (machineZone) => {
    beforeAll(() => { process.env.TZ = machineZone; });
    afterAll(() => { process.env.TZ = originalZone; });

    describe('dayBounds', () => {
        it.each([
            ['2025-02-26', 'Europe/Athens', '2025-02-25T22:00:00.000Z', '2025-02-26T21:59:59.999Z'],
            ['2026-07-15', 'Europe/Athens', '2026-07-14T21:00:00.000Z', '2026-07-15T20:59:59.999Z'],
            // DST starts in Athens on 29 March 2026: the day has 23 hours.
            ['2026-03-29', 'Europe/Athens', '2026-03-28T22:00:00.000Z', '2026-03-29T20:59:59.999Z'],
            // DST ends in Athens on 25 October 2026: the day has 25 hours.
            ['2026-10-25', 'Europe/Athens', '2026-10-24T21:00:00.000Z', '2026-10-25T21:59:59.999Z'],
            ['2025-12-31', 'UTC', '2025-12-31T00:00:00.000Z', '2025-12-31T23:59:59.999Z'],
            ['2026-02-28', 'Europe/Paris', '2026-02-27T23:00:00.000Z', '2026-02-28T22:59:59.999Z'],
        ])('%s in %s runs from %s to %s', (day, timeZone, start, end) => {
            const bounds = dayBounds(day, timeZone);
            expect(bounds.start.toISOString()).toBe(start);
            expect(bounds.end.toISOString()).toBe(end);
        });
    });

    describe('resolveDateRange', () => {
        // Measured on staging: the Chania meeting "26/02/25" is stored at
        // 2025-02-25T22:00:00Z, 00:00 in Athens.
        const meeting = new Date('2025-02-25T22:00:00.000Z');
        const listsMeeting = (day: string) => {
            const { from, to } = resolveDateRange({ from: { kind: 'day', day }, to: { kind: 'day', day } }, 'Europe/Athens');
            return from! <= meeting && meeting <= to!;
        };

        it('lists a meeting at Athens midnight on its own day only', () => {
            expect(listsMeeting('2025-02-26')).toBe(true);
            expect(listsMeeting('2025-02-25')).toBe(false);
        });

        it('keeps an instant as written', () => {
            const at = new Date('2025-02-25T09:00:00.000Z');
            expect(resolveDateRange({ from: { kind: 'instant', at }, to: { kind: 'instant', at } }, 'Europe/Athens'))
                .toEqual({ from: at, to: at });
        });

        it('leaves an absent bound absent', () => {
            expect(resolveDateRange({}, 'Europe/Athens')).toEqual({ from: undefined, to: undefined });
        });
    });

    describe('dayRangeToInstants', () => {
        it('reads a day as the start and a day as the end in the zone', () => {
            expect(dayRangeToInstants({ start: '2025-02-26', end: '2025-02-27' }, 'Europe/Athens'))
                .toEqual({ start: '2025-02-25T22:00:00.000Z', end: '2025-02-27T21:59:59.999Z' });
        });

        it('keeps a date-time as written, with or without a zone', () => {
            const range = { start: '2025-02-26T10:00:00Z', end: '2025-02-27T10:00:00' };
            expect(dayRangeToInstants(range, 'Europe/Athens')).toEqual(range);
        });

        it('reads a mixed range bound by bound', () => {
            expect(dayRangeToInstants({ start: '1970-01-01', end: '2026-10-05T14:03:12.000Z' }, 'UTC'))
                .toEqual({ start: '1970-01-01T00:00:00.000Z', end: '2026-10-05T14:03:12.000Z' });
        });
    });
});

describe('hasDayBound', () => {
    it('is true only when a bound is a calendar day', () => {
        expect(hasDayBound({})).toBe(false);
        expect(hasDayBound({ from: { kind: 'instant', at: new Date(0) } })).toBe(false);
        expect(hasDayBound({ to: { kind: 'day', day: '2026-01-01' } })).toBe(true);
    });
});
