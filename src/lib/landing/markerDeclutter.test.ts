import {
    packMunicipalityMarkers,
    type MarkerExtent,
    type MarkerPlacement,
    type PackMemory,
    type Point,
} from './markerDeclutter';
import {
    MUNICIPALITY_DONUT_INK_HEIGHT,
    MUNICIPALITY_DONUT_INK_WIDTH,
    MUNICIPALITY_SATELLITE_SCALE,
} from './donut';

// Full-size ink ellipse and satellite scale, DERIVED from the shipped donut geometry — exactly
// what the map layer feeds the packer (see MUNICIPALITY_MARKER_EXTENT in useMapMarkers). Deriving
// rather than hardcoding means resizing the donut cannot silently desync this suite from what
// ships.
const EXTENT: MarkerExtent = {
    rx: MUNICIPALITY_DONUT_INK_WIDTH / 2,
    ry: MUNICIPALITY_DONUT_INK_HEIGHT / 2,
    cy: 0,
};
const SCALE = MUNICIPALITY_SATELLITE_SCALE;

const pack = (points: Point[], priorities: number[], memory?: PackMemory[]) =>
    packMunicipalityMarkers(points, priorities, EXTENT, SCALE, memory).placements;

/** Final ink-ellipse centre and scale of every placed donut. */
const placedInk = (points: Point[], placements: MarkerPlacement[]) =>
    points.map((p, i) => ({
        x: p.x + placements[i].offset.x,
        y: p.y + placements[i].offset.y + EXTENT.cy * placements[i].scale,
        s: placements[i].scale,
    }));

/** Distance between two placed markers in normalised (unit-ellipse) space, minus their contact
 *  distance — negative means their ink overlaps, ~0 means the rings touch. */
const normalizedGap = (a: { x: number; y: number; s: number }, b: { x: number; y: number; s: number }) =>
    Math.hypot((a.x - b.x) / EXTENT.rx, (a.y - b.y) / EXTENT.ry) - (a.s + b.s);

/** Assert no two donuts' ink ellipses overlap. */
function expectNoOverlaps(points: Point[], placements: MarkerPlacement[]) {
    const placed = placedInk(points, placements);
    for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
            expect({ i, j, clears: normalizedGap(placed[i], placed[j]) >= -0.02 }).toMatchObject({ clears: true });
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
const FULL = { offset: ZERO, scale: 1 };

describe('packMunicipalityMarkers', () => {
    it('leaves well-separated markers full-size exactly where they are', () => {
        const pts: Point[] = [
            { x: 0, y: 0 },
            { x: 200, y: 0 },
            { x: 400, y: 0 },
        ];
        expect(pack(pts, [1, 2, 3])).toEqual([FULL, FULL, FULL]);
    });

    it('keeps every marker — one placement per input, none dropped', () => {
        const pts: Point[] = Array.from({ length: 12 }, () => ({ x: 100, y: 100 }));
        const placements = pack(
            pts,
            pts.map(() => 1),
        );
        expect(placements).toHaveLength(12);
        expectNoOverlaps(pts, placements);
    });

    it('lets rings sit side by side where the old circular footprint held them apart', () => {
        // 49px apart laterally: clear under the ink ellipse (49/24 > 2), yet a circle wide enough
        // to cover the count (r=29) would have demanded 58px and pushed one of them away.
        const pts: Point[] = [
            { x: 0, y: 0 },
            { x: 49, y: 0 },
        ];
        expect(pack(pts, [1, 1])).toEqual([FULL, FULL]);
    });

    it('still protects the count hanging below: the same 49px vertically is an overlap', () => {
        const pts: Point[] = [
            { x: 0, y: 0 },
            { x: 0, y: 49 },
        ];
        const placements = pack(pts, [90, 10]);
        expect(placements[1].scale).toBe(SCALE);
        expectNoOverlaps(pts, placements);
    });

    it('anchors the busiest δήμος full-size in place and shrinks the quieter neighbour aside', () => {
        const pts: Point[] = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
        ];
        const placements = pack(pts, [90, 10]);
        expect(placements[0]).toEqual(FULL);
        expect(placements[1].offset).not.toEqual(ZERO);
        expect(placements[1].scale).toBe(SCALE);
        expectNoOverlaps(pts, placements);
    });

    it('lets priority, not input order, decide who anchors the pile', () => {
        const pts: Point[] = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
        ];
        const placements = pack(pts, [10, 90]);
        expect(placements[1]).toEqual(FULL);
        expect(placements[0].offset).not.toEqual(ZERO);
        expect(placements[0].scale).toBe(SCALE);
    });

    it('floats each satellite out on its true azimuth from the anchor', () => {
        // Three satellites on well-separated azimuths (E, NW, SW): with no ring-mates in the way,
        // each lands tangent to the anchor exactly on its own real side.
        const pts: Point[] = [
            { x: 0, y: 0 },
            { x: 16, y: 0 },
            { x: -8, y: 14 },
            { x: -8, y: -14 },
        ];
        const placements = pack(pts, [90, 3, 2, 1]);
        expect(placements[0]).toEqual(FULL);
        const placed = placedInk(pts, placements);
        for (let i = 1; i < pts.length; i++) {
            // Azimuths live in normalised space — compare there.
            const trueAzimuth = Math.atan2((pts[i].y - pts[0].y) / EXTENT.ry, (pts[i].x - pts[0].x) / EXTENT.rx);
            const placedAzimuth = Math.atan2((placed[i].y - placed[0].y) / EXTENT.ry, (placed[i].x - placed[0].x) / EXTENT.rx);
            expect({ i, onSide: angularDistance(placedAzimuth, trueAzimuth) <= 0.05 }).toMatchObject({ onSide: true });
        }
        expectNoOverlaps(pts, placements);
    });

    it('packs displaced satellites as one ring hugging the anchor', () => {
        // Five satellites piled onto the anchor: every one of them should sit tangent to the
        // anchor — normalised distance exactly 1 + SCALE — one layer of touching bubbles.
        const pts: Point[] = Array.from({ length: 6 }, () => ({ x: 30, y: 40 }));
        const placements = pack(
            pts,
            pts.map((_, i) => 9 - i),
        );
        const placed = placedInk(pts, placements);
        for (let i = 1; i < pts.length; i++) {
            const d = Math.hypot((placed[i].x - placed[0].x) / EXTENT.rx, (placed[i].y - placed[0].y) / EXTENT.ry);
            expect({ i, onRing: Math.abs(d - (1 + SCALE)) <= 0.02 }).toMatchObject({ onRing: true });
        }
        expectNoOverlaps(pts, placements);
    });

    it('spills to a second ring only when the first is full', () => {
        // 14 satellites piled onto one anchor: a first ring holds ~7 of them, the rest must sit on
        // the second — and nothing further out.
        const pts: Point[] = Array.from({ length: 15 }, () => ({ x: 0, y: 0 }));
        const placements = pack(
            pts,
            pts.map((_, i) => 20 - i),
        );
        const placed = placedInk(pts, placements);
        const ring1 = 1 + SCALE;
        const ring2 = 1 + 3 * SCALE;
        let onFirst = 0;
        let onSecond = 0;
        for (let i = 1; i < pts.length; i++) {
            const d = Math.hypot((placed[i].x - placed[0].x) / EXTENT.rx, (placed[i].y - placed[0].y) / EXTENT.ry);
            if (Math.abs(d - ring1) <= 0.02) onFirst++;
            else if (Math.abs(d - ring2) <= 0.02) onSecond++;
        }
        expect(onFirst + onSecond).toBe(14); // nobody floats between or beyond the rings
        expect(onFirst).toBeGreaterThanOrEqual(6); // the first ring actually fills up…
        expect(onSecond).toBeGreaterThanOrEqual(1); // …before anyone is pushed out
        expectNoOverlaps(pts, placements);
    });

    it('packs satellites touching the cluster, not hovering off it', () => {
        // A pile dense enough that every satellite has to move: each one should end up tangent to
        // at least one other donut (within a hairline), so the pile reads as touching bubbles.
        const pts: Point[] = Array.from({ length: 8 }, (_, i) => ({ x: (i % 3) * 8, y: Math.floor(i / 3) * 8 }));
        const placements = pack(
            pts,
            pts.map((_, i) => 8 - i),
        );
        expectNoOverlaps(pts, placements);
        const placed = placedInk(pts, placements);
        placed.forEach((c, i) => {
            if (placements[i].offset.x === 0 && placements[i].offset.y === 0) return; // anchor / undisturbed
            const nearest = Math.min(...placed.map((o, j) => (j === i ? Infinity : normalizedGap(c, o))));
            expect({ i, touching: nearest <= 0.08 }).toMatchObject({ touching: true });
        });
    });

    it('separates markers stacked on the exact same point', () => {
        const pts: Point[] = [
            { x: 50, y: 50 },
            { x: 50, y: 50 },
            { x: 50, y: 50 },
        ];
        expectNoOverlaps(pts, pack(pts, [1, 1, 1]));
    });

    it('resolves a dense grid of overlapping markers', () => {
        // 5x5 δήμοι packed 15px apart — an Attica-at-country-zoom stand-in
        const pts: Point[] = [];
        for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) pts.push({ x: c * 15, y: r * 15 });
        const placements = pack(
            pts,
            pts.map((_, i) => i),
        );
        expect(placements).toHaveLength(25);
        expectNoOverlaps(pts, placements);
    });

    it('gives each pile exactly one full-size anchor', () => {
        // Two distinct piles far apart, plus a loner: 2 + 1 + 1 anchors.
        const pts: Point[] = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 5, y: 10 },
            { x: 500, y: 500 },
            { x: 508, y: 500 },
            { x: 1000, y: 0 },
        ];
        const placements = pack(pts, [5, 9, 1, 2, 7, 3]);
        // Busiest of each pile anchors it; the loner is its own anchor.
        expect(placements[1].scale).toBe(1);
        expect(placements[1].offset).toEqual(ZERO);
        expect(placements[4].scale).toBe(1);
        expect(placements[4].offset).toEqual(ZERO);
        expect(placements[5]).toEqual(FULL);
        [0, 2, 3].forEach((i) => expect(placements[i].scale).toBe(SCALE));
        expectNoOverlaps(pts, placements);
    });

    it('is translation-invariant, so panning does not reshuffle the labels', () => {
        const pts: Point[] = [
            { x: 0, y: 0 },
            { x: 10, y: 5 },
            { x: 20, y: 30 },
        ];
        const panned = pts.map((p) => ({ x: p.x + 913, y: p.y - 457 }));
        expect(pack(panned, [3, 2, 1])).toEqual(pack(pts, [3, 2, 1]));
    });

    it('keeps a satellite on one bearing as the map zooms, so nothing hops sides', () => {
        // A stable two-δήμος pile seen across the zoom range where it stays one pile: the
        // satellite's azimuth is zoom-invariant and nothing crowds it, so its placement direction
        // from the anchor is identical at every zoom.
        const base: Point[] = [
            { x: 0, y: 0 },
            { x: 10, y: 4 },
        ];
        const angles = [1, 1.5, 2, 3].map((f) => {
            const pts = zoomBy(base, f);
            const placed = placedInk(pts, pack(pts, [9, 1]));
            return Math.atan2(placed[1].y - placed[0].y, placed[1].x - placed[0].x);
        });
        for (const angle of angles) expect(angularDistance(angle, angles[0])).toBeLessThanOrEqual(0.02);
    });

    it('unwinds to full size and zero offset once zoom pulls the markers apart', () => {
        const base: Point[] = [
            { x: 0, y: 0 },
            { x: 12, y: 4 },
            { x: 5, y: 14 },
        ];
        // Zoomed out, the pile is real: someone shrinks and moves.
        const far = pack(base, [3, 2, 1]);
        expect(far.some((p) => p.scale < 1)).toBe(true);
        // Zoomed right in, the real positions clear each other: everyone is home and full-size.
        expect(pack(zoomBy(base, 20), [3, 2, 1])).toEqual([FULL, FULL, FULL]);
    });

    it('applies hysteresis: a ring satellite only snaps home once home is clear with margin', () => {
        // Two δήμοι just past exact contact (normalised distance ≈ 1.8, contact at 1.75, the
        // return-home margin at ≈ 1.94): a fresh layout leaves the quieter one at home, but if the
        // previous frame had it on the ring, it stays on the ring — no home↔ring dithering.
        const pts: Point[] = [
            { x: 0, y: 0 },
            { x: 1.8 * EXTENT.rx, y: 0 },
        ];
        const fresh = packMunicipalityMarkers(pts, [9, 1], EXTENT, SCALE);
        expect(fresh.placements[1].offset).toEqual(ZERO);
        expect(fresh.memory[1].home).toBe(true);

        const sticky = packMunicipalityMarkers(pts, [9, 1], EXTENT, SCALE, [
            { home: true, side: 0 },
            { home: false, side: 1 },
        ]);
        expect(sticky.placements[1].offset).not.toEqual(ZERO);
        expect(sticky.memory[1].home).toBe(false);
        expectNoOverlaps(pts, sticky.placements);
    });

    it('never applies that margin to an anchor, so a pile that splits does not fling one', () => {
        // Two δήμοι at normalised distance 2.1: far enough apart to be separate piles (the cut is
        // at 2), so both anchor at full size — but inside the 2.25 the return-home margin would
        // ask for. Applying it here drops the second δήμος into the ring branch, where its own
        // anchor is itself, flinging it ~55px off its real position at full scale — and latching,
        // because it keeps reporting home:false.
        const pts: Point[] = [
            { x: 0, y: 0 },
            { x: 2.1 * EXTENT.rx, y: 0 },
        ];
        const split = packMunicipalityMarkers(pts, [9, 5], EXTENT, SCALE, [
            { home: true, side: 0 },
            { home: false, side: 1 },
        ]);
        expect(split.placements[1]).toEqual({ offset: ZERO, scale: 1 });
        expect(split.memory[1].home).toBe(true);
    });

    it('applies hysteresis: a slid satellite keeps sliding around the same side', () => {
        // A satellite squeezed at its azimuth by a busier ring-mate: fresh layouts pick a side by
        // sweep order, but a marker that went clockwise last frame is swept clockwise first — it
        // can't flip across the azimuth on a near-symmetric squeeze.
        const pts: Point[] = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 11, y: 0 },
        ];
        const fresh = packMunicipalityMarkers(pts, [9, 5, 1], EXTENT, SCALE);
        const side = fresh.memory[2].side;
        expect(side).not.toBe(0); // it had to slide off its blocked azimuth
        // Re-run with the opposite remembered side: it must respect the memory, not the sweep order.
        const flipped = packMunicipalityMarkers(pts, [9, 5, 1], EXTENT, SCALE, [
            { home: true, side: 0 },
            { home: false, side: 0 },
            { home: false, side: side === 1 ? -1 : 1 },
        ]);
        expect(flipped.memory[2].side).toBe(side === 1 ? -1 : 1);
    });

    it('holds its discrete decisions through a real zoom gesture — no dithering', () => {
        // An Attica-ish pile swept through a full zoom-in and back out, each frame feeding its
        // memory into the next — the only setting in which the hysteresis can actually fail.
        // Discrete decisions may flip when the geometry genuinely changes (a pile splitting on
        // the way in, re-forming on the way out) but must never oscillate frame-to-frame.
        const base: Point[] = [
            { x: 0, y: 0 },
            { x: 12, y: 4 },
            { x: 5, y: 14 },
            { x: 18, y: 17 },
            { x: 20, y: 3 },
            { x: 6, y: 20 },
            { x: 26, y: 22 },
            { x: 9, y: 30 },
        ];
        const priorities = [80, 70, 60, 50, 40, 30, 20, 10];
        let memory: PackMemory[] | undefined;
        const homeSeries: boolean[][] = base.map(() => []);
        const sideSeries: number[][] = base.map(() => []);
        const factors: number[] = [];
        for (let f = 1; f <= 3.0001; f += 2 / 60) factors.push(f); // zoom in…
        for (let f = 3; f >= 0.9999; f -= 2 / 60) factors.push(f); // …and back out
        for (const f of factors) {
            const res = packMunicipalityMarkers(zoomBy(base, f), priorities, EXTENT, SCALE, memory);
            memory = res.memory;
            res.memory.forEach((m, i) => {
                homeSeries[i].push(m.home);
                sideSeries[i].push(m.side);
            });
        }
        homeSeries.forEach((states, i) => {
            let transitions = 0;
            for (let k = 1; k < states.length; k++) if (states[k] !== states[k - 1]) transitions++;
            // At most: leave the ring once on the way in, rejoin it once on the way out.
            expect({ i, transitions, dithers: transitions > 2 }).toMatchObject({ dithers: false });
        });
        sideSeries.forEach((sides, i) => {
            // While a marker stays on the ring, its slide side must never flip. (Side may reset
            // through a home stretch — that's a new placement, not a flip.)
            let flips = 0;
            for (let k = 1; k < sides.length; k++) {
                if (sides[k] !== 0 && sides[k - 1] !== 0 && sides[k] !== sides[k - 1]) flips++;
            }
            expect({ i, flips }).toMatchObject({ flips: 0 });
        });
    });

    it('is deterministic across repeated runs', () => {
        const pts: Point[] = [
            { x: 0, y: 0 },
            { x: 8, y: 8 },
            { x: 16, y: 2 },
        ];
        expect(pack(pts, [1, 1, 1])).toEqual(pack(pts, [1, 1, 1]));
    });

    it('handles an empty input', () => {
        expect(pack([], [])).toEqual([]);
    });
});
