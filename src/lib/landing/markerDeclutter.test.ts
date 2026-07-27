import { spreadOverlappingMarkers, type Point } from './markerDeclutter';

// Closest two donuts may sit, centre to centre — matches the value the map layer uses.
const SPACING = 68;

/** Apply the offsets and assert no two donuts end up closer than `SPACING` — the module's whole job. */
function expectNoOverlaps(points: Point[], offsets: Point[], spacing = SPACING) {
    const placed = points.map((p, i) => ({ x: p.x + offsets[i].x, y: p.y + offsets[i].y }));
    for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
            const d = Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y);
            expect({ i, j, clears: d >= spacing - 1e-6 }).toMatchObject({ clears: true });
        }
    }
}

/** Scale points about the origin — exactly what a zoom step does to projected coordinates. */
const zoomBy = (points: Point[], factor: number): Point[] =>
    points.map((p) => ({ x: p.x * factor, y: p.y * factor }));

/** Smallest angle between two bearings, handling the wrap at ±π. */
const angularDistance = (a: number, b: number) =>
    Math.abs((((a - b + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);

const ZERO = { x: 0, y: 0 };

describe('spreadOverlappingMarkers', () => {
    it('leaves well-separated markers exactly where they are', () => {
        const pts: Point[] = [
            { x: 0, y: 0 },
            { x: 200, y: 0 },
            { x: 400, y: 0 },
        ];
        expect(spreadOverlappingMarkers(pts, [1, 2, 3], SPACING)).toEqual([ZERO, ZERO, ZERO]);
    });

    it('keeps every marker — one offset per input, none dropped', () => {
        const pts: Point[] = Array.from({ length: 12 }, () => ({ x: 100, y: 100 }));
        const offsets = spreadOverlappingMarkers(
            pts,
            pts.map(() => 1),
            SPACING,
        );
        expect(offsets).toHaveLength(12);
        expectNoOverlaps(pts, offsets);
    });

    it('packs diagonally closer than a bounding box would allow', () => {
        // Diagonal neighbours 50px apart on each axis are 70.7px apart — clear for circles, but they
        // would collide under a 68x68 bounding-box test.
        const pts: Point[] = [
            { x: 0, y: 0 },
            { x: 50, y: 50 },
        ];
        expect(spreadOverlappingMarkers(pts, [1, 1], SPACING)).toEqual([ZERO, ZERO]);
    });

    it('holds the busiest δήμος in place and moves the quieter neighbour aside', () => {
        const pts: Point[] = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
        ];
        const offsets = spreadOverlappingMarkers(pts, [90, 10], SPACING);
        expect(offsets[0]).toEqual(ZERO);
        expect(offsets[1]).not.toEqual(ZERO);
        expectNoOverlaps(pts, offsets);
    });

    it('lets priority, not input order, decide who keeps their spot', () => {
        const pts: Point[] = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
        ];
        const offsets = spreadOverlappingMarkers(pts, [10, 90], SPACING);
        expect(offsets[1]).toEqual(ZERO);
        expect(offsets[0]).not.toEqual(ZERO);
    });

    it('separates markers stacked on the exact same point', () => {
        const pts: Point[] = [
            { x: 50, y: 50 },
            { x: 50, y: 50 },
            { x: 50, y: 50 },
        ];
        expectNoOverlaps(pts, spreadOverlappingMarkers(pts, [1, 1, 1], SPACING));
    });

    it('resolves a dense grid of overlapping markers', () => {
        // 5x5 δήμοι packed 15px apart — an Attica-at-country-zoom stand-in
        const pts: Point[] = [];
        for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) pts.push({ x: c * 15, y: r * 15 });
        const offsets = spreadOverlappingMarkers(
            pts,
            pts.map((_, i) => i),
            SPACING,
        );
        expect(offsets).toHaveLength(25);
        expectNoOverlaps(pts, offsets);
    });

    it('pushes a marker away from its neighbours, not into them', () => {
        // A tight pair with one outlier to the right: the outlier should be nudged further right.
        const pts: Point[] = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
        ];
        const offsets = spreadOverlappingMarkers(pts, [9, 1], SPACING);
        expect(offsets[1].x).toBeGreaterThan(0);
    });

    it('is translation-invariant, so panning does not reshuffle the labels', () => {
        const pts: Point[] = [
            { x: 0, y: 0 },
            { x: 10, y: 5 },
            { x: 20, y: 30 },
        ];
        const panned = pts.map((p) => ({ x: p.x + 913, y: p.y - 457 }));
        expect(spreadOverlappingMarkers(panned, [3, 2, 1], SPACING)).toEqual(
            spreadOverlappingMarkers(pts, [3, 2, 1], SPACING),
        );
    });

    it('keeps each donut on roughly one bearing as the map zooms, so nothing hops sides', () => {
        // An Attica-ish pile plus a far-off δήμος, seen across a wide range of zoom levels.
        const base: Point[] = [
            { x: 0, y: 0 },
            { x: 12, y: 4 },
            { x: 5, y: 14 },
            { x: 18, y: 17 },
            { x: 20, y: 3 },
            { x: 6, y: 20 },
            { x: 300, y: 240 },
        ];
        const priorities = [70, 60, 50, 40, 30, 20, 10];

        const bearingsAt = (factor: number) =>
            spreadOverlappingMarkers(zoomBy(base, factor), priorities, SPACING).map((o) =>
                o.x === 0 && o.y === 0 ? null : Math.atan2(o.y, o.x),
            );

        const zooms = [1, 1.4, 2, 2.8, 4, 5.6, 8].map(bearingsAt);
        // A marker may be nudged up to MAX_BEARING_DEVIATION either side of its fixed bearing to find
        // a gap, so two zooms can differ by at most twice that — never enough to cross to the far side.
        const LIMIT = 2 * (Math.PI / 6) + 1e-6;
        for (let i = 0; i < base.length; i++) {
            const seen = zooms.map((b) => b[i]).filter((a): a is number => a !== null);
            for (const angle of seen) expect(angularDistance(angle, seen[0])).toBeLessThanOrEqual(LIMIT);
        }
    });

    it('unwinds the offsets to nothing once zoom pulls the markers apart', () => {
        const base: Point[] = [
            { x: 0, y: 0 },
            { x: 12, y: 4 },
            { x: 5, y: 14 },
        ];
        const spread = (factor: number) =>
            spreadOverlappingMarkers(zoomBy(base, factor), [3, 2, 1], SPACING).reduce(
                (sum, o) => sum + Math.hypot(o.x, o.y),
                0,
            );
        // Zoomed right in, the real positions clear each other and nobody has to move.
        expect(spread(1)).toBeGreaterThan(0);
        expect(spread(20)).toBe(0);
    });

    it('is deterministic across repeated runs', () => {
        const pts: Point[] = [
            { x: 0, y: 0 },
            { x: 8, y: 8 },
            { x: 16, y: 2 },
        ];
        expect(spreadOverlappingMarkers(pts, [1, 1, 1], SPACING)).toEqual(
            spreadOverlappingMarkers(pts, [1, 1, 1], SPACING),
        );
    });

    it('handles an empty input', () => {
        expect(spreadOverlappingMarkers([], [], SPACING)).toEqual([]);
    });
});
