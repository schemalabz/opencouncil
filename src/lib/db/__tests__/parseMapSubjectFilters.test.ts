// parseMapSubjectFilters is pure param parsing; mock the prisma singleton so importing subject.ts
// doesn't pull in the real client (→ env.mjs, which the jest transform doesn't handle).
jest.mock('../prisma', () => ({ __esModule: true, default: {} }));

import { parseMapSubjectFilters } from '../subject';

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
