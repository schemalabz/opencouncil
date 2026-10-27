// parseMapSubjectFilters is pure param parsing; mock the prisma singleton so importing subject.ts
// doesn't pull in the real client (→ env.mjs, which the jest transform doesn't handle).
jest.mock('../prisma', () => ({ __esModule: true, default: {} }));

import { buildMapSubjectWhere, parseMapSubjectFilters, quickRangeStart } from '../subject';

const parse = (qs: string) => parseMapSubjectFilters(new URLSearchParams(qs));

describe('parseMapSubjectFilters', () => {
    it('drops invalid bodyType values instead of passing them to Prisma (would 500)', () => {
        // The bug this guards: `?bodyType=foo` reaching the Prisma enum filter throws → 500.
        expect(parse('bodyType=foo').bodyTypes).toEqual([]);
        expect(parse('bodyType=council,foo,committee').bodyTypes).toEqual(['council', 'committee']);
        expect(parse('bodyType=council,committee,community').bodyTypes).toEqual([
            'council',
            'committee',
            'community',
        ]);
    });

    it('coerces numeric params only when finite (junk → undefined/null)', () => {
        expect(parse('daysBack=14').daysBack).toBe(14);
        expect(parse('daysBack=abc').daysBack).toBeNull();
        expect(parse('monthsBack=3').monthsBack).toBe(3);
        expect(parse('monthsBack=xyz').monthsBack).toBeUndefined();
    });

    it('parses the remaining filters', () => {
        const f = parse('allTime=true&topicIds=a,b&cityIds=c1,c2&dateFrom=2026-01-01&dateTo=2026-02-01');
        expect(f.allTime).toBe(true);
        expect(f.topicIds).toEqual(['a', 'b']);
        expect(f.cityIds).toEqual(['c1', 'c2']);
        expect(f.dateFrom).toBe('2026-01-01');
        expect(f.dateTo).toBe('2026-02-01');
    });

    // The guard for dates: a malformed bound reached Prisma as an Invalid Date
    // and Elasticsearch as a range it rejects, so an edited URL was a 500 and a
    // search failure alert. It is dropped instead, like an unknown bodyType.
    it.each(['abc', '2026-13-01', '2026-02-31', '2026-01-01T00:00:00Z', '01/02/2026', ''])(
        'drops the malformed date bound %p',
        (bad) => {
            const f = parse(`dateFrom=${encodeURIComponent(bad)}&dateTo=${encodeURIComponent(bad)}`);
            expect(f.dateFrom).toBeNull();
            expect(f.dateTo).toBeNull();
        }
    );

    it('keeps a valid bound beside a malformed one', () => {
        const f = parse('dateFrom=abc&dateTo=2026-02-28');
        expect(f.dateFrom).toBeNull();
        expect(f.dateTo).toBe('2026-02-28');
    });

    it('defaults sensibly for an empty query', () => {
        const f = parse('');
        expect(f.bodyTypes).toEqual([]);
        expect(f.topicIds).toEqual([]);
        expect(f.cityIds).toEqual([]);
        expect(f.allTime).toBe(false);
        expect(f.daysBack).toBeNull();
        expect(f.monthsBack).toBeUndefined();
    });

    it('reads allTime as a query flag and drops a value outside its lists', () => {
        expect(parse('allTime=1').allTime).toBe(true);
        expect(parse('allTime=yes').allTime).toBe(true);
        expect(parse('allTime=').allTime).toBe(false);
        expect(parse('allTime=false').allTime).toBe(false);
        expect(parse('allTime=maybe').allTime).toBe(false);
    });
});

describe('quickRangeStart', () => {
    const now = new Date('2026-10-05T14:03:12.000Z');

    it('counts days back from now', () => {
        expect(quickRangeStart({ daysBack: 14 }, now)).toEqual(new Date('2026-09-21T14:03:12.000Z'));
    });

    it('counts months back from now', () => {
        expect(quickRangeStart({ monthsBack: 3 }, now)).toEqual(new Date('2026-07-05T14:03:12.000Z'));
    });

    it('prefers days over months when both are set', () => {
        expect(quickRangeStart({ daysBack: 14, monthsBack: 3 }, now)).toEqual(new Date('2026-09-21T14:03:12.000Z'));
    });

    it('is open for allTime, and when neither count is set', () => {
        expect(quickRangeStart({ allTime: true, daysBack: 14 }, now)).toBeUndefined();
        expect(quickRangeStart({ daysBack: null }, now)).toBeUndefined();
        expect(quickRangeStart({ daysBack: 0, monthsBack: 0 }, now)).toBeUndefined();
    });

    it('does not change the instant it was given', () => {
        quickRangeStart({ daysBack: 14 }, now);
        expect(now.toISOString()).toBe('2026-10-05T14:03:12.000Z');
    });
});

describe('buildMapSubjectWhere window', () => {
    const gte = (where: ReturnType<typeof buildMapSubjectWhere>) => {
        const meeting = where.councilMeeting as { dateTime: { gte?: Date } };
        return meeting.dateTime.gte;
    };

    it('lists the last days the quick range names', () => {
        const start = gte(buildMapSubjectWhere(null, { daysBack: 14 }));
        expect(start).toBeInstanceOf(Date);
        expect(Date.now() - (start as Date).getTime()).toBeGreaterThan(13 * 86_400_000);
    });

    // A count that names no window (junk in the URL) gets the default window,
    // not the whole history: only allTime opens the lower bound.
    it('falls back to the default window for a non-positive count', () => {
        expect(gte(buildMapSubjectWhere(null, { monthsBack: 0 }))).toBeInstanceOf(Date);
        expect(gte(buildMapSubjectWhere(null, { monthsBack: -3 }))).toBeInstanceOf(Date);
        expect(gte(buildMapSubjectWhere(null, {}))).toBeInstanceOf(Date);
    });

    it('opens the lower bound for allTime only', () => {
        expect(gte(buildMapSubjectWhere(null, { allTime: true }))).toBeUndefined();
    });
});

describe('buildMapSubjectWhere body types', () => {
    // The map list must read a meeting with no body as the council's, as
    // list_meetings and the map search do.
    it('admits a meeting with no body when the council is asked for', () => {
        const where = buildMapSubjectWhere(null, { bodyTypes: ['council'] });
        expect(where.councilMeeting).toMatchObject({
            OR: [{ administrativeBody: { type: { in: ['council'] } } }, { administrativeBodyId: null }],
        });
    });
});
