import {
    MARKER_Z,
    PIN_WINDOW_PADDING,
    SUBJECT_DOT_EXIT_RATIO,
    SUBJECT_DOT_THRESHOLD,
    mapBounds,
    nextDotMode,
    padViewport,
    parseInitialUrlState,
    pointInWindow,
    selectPinGroups,
    setDateWindowParams,
} from './landingCore';
import type { LandingSubject } from './landingData';

describe('MARKER_Z', () => {
    it('gives every layer its own z-index', () => {
        const values = Object.values(MARKER_Z);
        expect(new Set(values).size).toBe(values.length);
    });

    // The order the landing showed before the pin layer was windowed, when DOM order decided it.
    it('stacks the layers in the order the landing has always shown', () => {
        const order = [MARKER_Z.pin, MARKER_Z.explainBadge, MARKER_Z.hotPin, MARKER_Z.cityHall, MARKER_Z.selectedPin, MARKER_Z.coLocatedPin];
        expect([...order].sort((a, b) => a - b)).toEqual(order);
    });

    // .subject-popup and .municipality-popup in globals.css sit at 5 and must not fall below a marker.
    it('stays at or below the map popups', () => {
        expect(Math.max(...Object.values(MARKER_Z))).toBeLessThanOrEqual(5);
    });
});

describe('nextDotMode', () => {
    const enter = SUBJECT_DOT_THRESHOLD;
    const exit = SUBJECT_DOT_THRESHOLD * SUBJECT_DOT_EXIT_RATIO;

    it('enters dot mode only at the entry threshold', () => {
        expect(nextDotMode(enter - 1, false)).toBe(false);
        expect(nextDotMode(enter, false)).toBe(true);
    });

    it('leaves dot mode only below the exit threshold', () => {
        expect(nextDotMode(enter - 1, true)).toBe(true); // still above exit — stays dots
        expect(nextDotMode(Math.ceil(exit), true)).toBe(true);
        expect(nextDotMode(Math.ceil(exit) - 1, true)).toBe(false);
    });

    it('is hysteretic: the band between the thresholds preserves whichever mode is active', () => {
        for (let n = Math.ceil(exit); n < enter; n++) {
            expect(nextDotMode(n, true)).toBe(true);
            expect(nextDotMode(n, false)).toBe(false);
        }
    });
});

describe('parseInitialUrlState — a committed search', () => {
    it('restores the search from a shared link', () => {
        expect(parseInitialUrlState('?search=%CE%BA%CE%B1%CF%84%CE%BF%CE%B9%CE%BA%CE%AF%CE%B4%CE%B9%CE%B1').search)
            .toBe('κατοικίδια');
    });

    // `q` is whatever is being typed; `search` is what was committed. A link
    // that carries one must not restore the other, or a half-typed word would
    // come back as a result set — or a committed search as loose text.
    it('keeps the committed search apart from the text in the box', () => {
        const typing = parseInitialUrlState('?q=κατοι');
        expect(typing.query).toBe('κατοι');
        expect(typing.search).toBe('');

        const committed = parseInitialUrlState('?search=κατοικίδια');
        expect(committed.query).toBe('');
        expect(committed.search).toBe('κατοικίδια');
    });

    it('reads no search from a link that carries none', () => {
        expect(parseInitialUrlState('?cat=t1').search).toBe('');
    });
});

describe('setDateWindowParams', () => {
    const build = (range: Parameters<typeof setDateWindowParams>[1], filters: Parameters<typeof setDateWindowParams>[2]) => {
        const params = new URLSearchParams();
        setDateWindowParams(params, range, filters);
        return params.toString();
    };

    it('sends the quick-range pill when no explicit date is set', () => {
        expect(build('14d', { dateFrom: null, dateTo: null })).toBe('daysBack=14');
        expect(build('3m', { dateFrom: null, dateTo: null })).toBe('monthsBack=3');
        expect(build('all', { dateFrom: null, dateTo: null })).toBe('allTime=true');
    });

    // Either explicit date alone replaces the pill, as the subjects endpoint reads them.
    it('sends the explicit dates instead of the pill when either is set', () => {
        expect(build('14d', { dateFrom: '2026-01-01', dateTo: null })).toBe('dateFrom=2026-01-01');
        expect(build('14d', { dateFrom: null, dateTo: '2026-02-01' })).toBe('dateTo=2026-02-01');
    });
});

describe('mapBounds', () => {
    it('reads the map bounds as plain west/south/east/north', () => {
        const map = { getBounds: () => ({ getWest: () => 1, getSouth: () => 2, getEast: () => 3, getNorth: () => 4 }) };
        expect(mapBounds(map as unknown as Parameters<typeof mapBounds>[0])).toEqual({ w: 1, s: 2, e: 3, n: 4 });
    });

    it('is null before the map has bounds', () => {
        expect(mapBounds({ getBounds: () => null } as unknown as Parameters<typeof mapBounds>[0])).toBeNull();
    });
});

describe('padViewport', () => {
    it('grows the viewport by the fraction of its own size on every side', () => {
        expect(padViewport({ w: 10, s: 20, e: 14, n: 22 }, 0.5)).toEqual({ w: 8, s: 19, e: 16, n: 23 });
    });

    it('returns the viewport itself at zero padding', () => {
        expect(padViewport({ w: 10, s: 20, e: 14, n: 22 }, 0)).toEqual({ w: 10, s: 20, e: 14, n: 22 });
    });

    it('makes the pin window four times the viewport at the layer padding', () => {
        const { w, s, e, n } = padViewport({ w: 0, s: 0, e: 2, n: 1 }, PIN_WINDOW_PADDING);
        expect((e - w) * (n - s)).toBeCloseTo(8);
    });
});

describe('selectPinGroups', () => {
    // Minimal LandingSubject — only the fields the selection reads.
    const at = (id: string, lng: number, lat: number): LandingSubject => ({ id, lng, lat } as unknown as LandingSubject);
    const inside = [at('in', 1, 1)];
    const coLocatedInside = [at('a', 1.5, 1.5), at('b', 1.5, 1.5)];
    const outside = [at('out', 5, 5)];
    const coLocatedOutside = [at('c', 6, 6), at('d', 6, 6)];
    const groups = [inside, coLocatedInside, outside, coLocatedOutside];
    const pinWindow = { w: 0, s: 0, e: 2, n: 2 };

    it('keeps the groups whose point is inside the pin window', () => {
        expect(selectPinGroups(groups, pinWindow, [])).toEqual([inside, coLocatedInside]);
    });

    it('keeps a group outside the window when it holds a subject to highlight', () => {
        expect(selectPinGroups(groups, pinWindow, ['out'])).toEqual([inside, coLocatedInside, outside]);
        // any member of a co-located group, not only the first
        expect(selectPinGroups(groups, pinWindow, [null, 'd'])).toEqual([inside, coLocatedInside, coLocatedOutside]);
    });

    it('ignores a null id and an id that names no subject', () => {
        expect(selectPinGroups(groups, pinWindow, [null, 'nobody'])).toEqual([inside, coLocatedInside]);
    });

    it('treats the window edge as inside', () => {
        expect(selectPinGroups([[at('edge', 2, 0)]], pinWindow, [])).toHaveLength(1);
    });

    // The map renders world copies: a view dragged once around the globe reports Greece at 383°.
    it('keeps a group the view shows on a wrapped world copy', () => {
        const greece = [at('gr', 23.7, 38)];
        expect(selectPinGroups([greece], { w: 382, s: 37, e: 385, n: 39 }, [])).toEqual([greece]);
        expect(selectPinGroups([greece], { w: -338, s: 37, e: -335, n: 39 }, [])).toEqual([greece]);
    });
});

describe('pointInWindow', () => {
    it('reads a window that crosses the antimeridian', () => {
        const window = { w: 179, s: -10, e: 181, n: 10 };
        expect(pointInWindow(-179.5, 0, window)).toBe(true);
        expect(pointInWindow(179.5, 0, window)).toBe(true);
        expect(pointInWindow(170, 0, window)).toBe(false);
        expect(pointInWindow(-179.5, 20, window)).toBe(false);
    });

    it('holds everything once the window spans the globe', () => {
        expect(pointInWindow(-170, 0, { w: -200, s: -10, e: 200, n: 10 })).toBe(true);
    });
});
