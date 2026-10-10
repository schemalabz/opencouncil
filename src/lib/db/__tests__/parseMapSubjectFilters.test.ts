// parseMapSubjectFilters is pure param parsing; mock the prisma singleton so importing subject.ts
// doesn't pull in the real client (→ env.mjs, which the jest transform doesn't handle).
jest.mock('../prisma', () => ({ __esModule: true, default: {} }));

import { buildMapSubjectWhere, parseMapSubjectFilters } from '../subject';

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
