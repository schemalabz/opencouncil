/**
 * Screen-space packing for the zoomed-out municipality donuts. Neighbouring δήμοι (Athens,
 * Ζωγράφου, Χαλάνδρι…) sit almost on top of each other far out, so their donuts would overlap into
 * an unreadable pile. Every δήμος keeps its own donut regardless — none are merged into a combined
 * total and none are hidden. Instead, each pile of mutually-overlapping donuts becomes a bubble
 * cluster: its busiest δήμος (the "anchor") stays full-size exactly on its real location, and the
 * rest shrink a step and pack in a single ring of bubbles touching the anchor — each as close to
 * its real direction (its true azimuth) as its ring-mates allow, sliding around the ring when that
 * side is taken, and spilling to a second ring only when the first is full. Zooming in pulls the
 * real positions apart, the piles split, and every donut slides home and grows back to full size.
 *
 * Pure screen-pixel geometry — independent of Mapbox, unit-testable. The caller projects centroids →
 * pixels, packs, then renders every donut at its pixel offset and scale.
 */
export type Point = { x: number; y: number };

/**
 * What one full-size marker actually inks, as an ellipse: `rx` half-width (the ring), `ry`
 * half-height (ring plus the count hanging below), centred `cy` px below the marker's anchor
 * point. An ellipse rather than a circle because the marker is taller than it is wide — a circle
 * wide enough to cover the count would hold neighbouring rings apart sideways, which is exactly
 * the visible gap this replaces: with the ellipse, rings touch laterally while counts stay clear.
 *
 * All packing runs in the ellipse's own normalised space (x/rx, y/ry), where every marker is a
 * plain circle of radius `scale` — so "touching" has the circle maths, and mapping back through
 * (rx, ry) restores the ellipse. Two scaled copies of one ellipse have an exact contact test — the
 * Minkowski sum of s₁·E and s₂·E is (s₁+s₂)·E — so tangency here means the drawn rings kiss.
 */
export type MarkerExtent = { rx: number; ry: number; cy: number };

/** One donut's resolved placement: the pixel nudge off its true position, and its size class. */
export type MarkerPlacement = {
    offset: Point;
    /** 1 for a cluster's anchor (and anything alone) — `satelliteScale` for the rest of a pile */
    scale: number;
};

/**
 * One marker's discrete choices from the previous layout, fed back into the next one. The layout
 * is recomputed every animation frame of a zoom, and its two discrete decisions — "is my true spot
 * free?" and "which way around the ring do I slide?" — would otherwise dither at their thresholds,
 * making satellites visibly flicker between two spots mid-gesture. With the memory, each decision
 * carries hysteresis: it flips once per gesture, and the CSS transition glides the single change.
 */
export type PackMemory = {
    /** the marker sat at its true position (anchors and undisturbed markers included) */
    home: boolean;
    /** which side of its azimuth a ring satellite slid to — 0 when exactly on it (or home) */
    side: -1 | 0 | 1;
};

/** A full layout: placements to render, and the memory to feed into the next recomputation. */
export type PackResult = {
    placements: MarkerPlacement[];
    memory: PackMemory[];
};

/** Binary-refinement rounds sliding a placed satellite back around its ring toward its true
 *  azimuth. Each round halves the remaining slack of one sweep step, so 6 land within a hairline. */
const AZIMUTH_REFINE_ROUNDS = 6;

/** How many rings a pile may grow. Two are enough for any real δήμος pile (a first ring holds ~7
 *  satellites, a second ~13); beyond that the sweep just keeps adding rings until everyone fits. */
const RING_CAPACITY_FALLBACK = 8;

/**
 * How much clearer than "barely free" a ring satellite's true spot must be before it snaps back
 * home, as a fraction of its own radius. Without this margin, continuous zooming dithers the spot
 * across the exact-contact boundary and the satellite flickers home↔ring every few frames.
 */
const HOME_RETURN_MARGIN = 0.25;

/** Union-find over the markers, joining every pair whose full-size ellipses would overlap. */
function overlapComponents(points: Point[], extent: MarkerExtent): number[] {
    const parent = points.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            const ndx = (points[i].x - points[j].x) / extent.rx;
            const ndy = (points[i].y - points[j].y) / extent.ry;
            if (ndx * ndx + ndy * ndy < 4) parent[find(i)] = find(j);
        }
    }
    return points.map((_, i) => find(i));
}

/**
 * Pack every municipality donut for the current projection and return each one's pixel offset and
 * scale ({x: 0, y: 0} and 1 for anything that didn't have to move or shrink).
 *
 * Piles are the connected components of "would overlap at full size" — a pure function of the
 * *projected* geometry, never of the resulting layout, so there is no feedback loop and a given
 * zoom level always produces the same grouping. Within each pile the busiest δήμος is the anchor:
 * it keeps full size and its exact real position (anchors of different piles can't collide — the
 * component cut guarantees they clear each other).
 *
 * The rest shrink to `satelliteScale` and are placed busiest-first. A satellite that is already
 * clear at its true position stays there. Otherwise it goes onto the pile's first ring — the locus
 * of positions tangent to the anchor — starting at its own true azimuth and sliding around the
 * ring, alternating sides, until it finds a free arc, then easing back toward its azimuth until it
 * just touches whoever blocked it. Only when a whole ring is occupied does it fall out to the next
 * one, a satellite-diameter further. One ring of touching bubbles, each on (or as near as possible
 * to) its real side of the anchor — and overflow rings only when the first is genuinely full.
 *
 * The arrangement is a pure function of the *relative* geometry, so panning leaves it untouched;
 * and azimuths are zoom-invariant, so zooming changes how far things sit from their δήμος far more
 * than which way.
 *
 * `memory` is the previous layout's discrete choices (same marker order), applied as hysteresis so
 * a per-frame recomputation can't dither — see PackMemory. Omit it for a from-scratch layout.
 */
export function packMunicipalityMarkers(
    points: Point[],
    priorities: number[],
    extent: MarkerExtent,
    satelliteScale: number,
    memory?: PackMemory[],
): PackResult {
    const { rx, ry, cy } = extent;
    const components = overlapComponents(points, extent);

    // The busiest member of each component anchors it; ties break on index so the result never
    // depends on input ordering quirks.
    const anchorOf = new Map<number, number>();
    components.forEach((c, i) => {
        const cur = anchorOf.get(c);
        if (cur === undefined || priorities[i] > priorities[cur]) anchorOf.set(c, i);
    });
    const anchors = new Set(anchorOf.values());
    const scales = points.map((_, i) => (anchors.has(i) ? 1 : satelliteScale));

    // Positions are kept in pixel space and only *deltas* are normalised through (rx, ry) — the
    // packing then depends purely on relative geometry, so translating every input (panning)
    // reproduces the offsets bit-for-bit. Contact checks run on ink centres: the marker's anchor
    // point plus its scaled ink drop.
    const inkY = (i: number) => points[i].y + cy * scales[i];

    // Anchors first (all of them fit at their true positions — the component cut guarantees it),
    // then satellites busiest-first. Ties break on index.
    const order = points
        .map((_, i) => i)
        .sort((a, b) => Number(anchors.has(b)) - Number(anchors.has(a)) || priorities[b] - priorities[a] || a - b);

    const offsets: Point[] = points.map(() => ({ x: 0, y: 0 }));
    // Placed markers as (index, ink offset off own true position, scale). Contact checks combine
    // the raw point delta with the offset delta, so the whole test is a function of relative
    // geometry only — tangency comparisons land identically wherever the map is panned, which
    // matters because satellites rest *exactly* on the boundary the refinement converges to.
    const placed: { idx: number; dx: number; dy: number; s: number }[] = [];
    const clear = (i: number, ox: number, oy: number, s: number) =>
        placed.every((p) => {
            const ndx = (points[p.idx].x - points[i].x + (p.dx - ox)) / rx;
            const ndy = (inkY(p.idx) - inkY(i) + (p.dy - oy)) / ry;
            return ndx * ndx + ndy * ndy >= (p.s + s) ** 2;
        });

    const outMemory: PackMemory[] = points.map(() => ({ home: true, side: 0 }));

    for (const i of order) {
        const s = scales[i];

        // Anchors, loners, and any satellite whose true spot is free: stay exactly home. A marker
        // that was on the ring last frame needs its spot free *with margin* to come back — right
        // at the contact boundary it stays put, so continuous zooming can't dither it home↔ring.
        // The margin is a satellite rule and must never reach an anchor: the component cut only
        // clears anchors of each other at exactly `s`, so an anchor in the margin band — whichever
        // marker's pile just split as you zoom in — would fail the check, fall into the ring
        // branch, and get flung onto a ring around its own centre at full scale (and latch there,
        // since it keeps reporting home: false).
        const wasOnRing = !anchors.has(i) && memory?.[i]?.home === false;
        if (clear(i, 0, 0, s) && (!wasOnRing || clear(i, 0, 0, s * (1 + HOME_RETURN_MARGIN)))) {
            placed.push({ idx: i, dx: 0, dy: 0, s });
            continue;
        }

        const a = anchorOf.get(components[i])!;
        // True azimuth from the anchor (in normalised space, off the raw positions) — the
        // direction this satellite "belongs". Exactly on top of the anchor there is no azimuth to
        // take; fan those by index so a stack spreads.
        const dx = (points[i].x - points[a].x) / rx;
        const dy = (points[i].y - points[a].y) / ry;
        const azimuth = dx === 0 && dy === 0 ? (2 * Math.PI * i) / points.length : Math.atan2(dy, dx);

        // The satellite's home, relative to the anchor's ink centre (px) — offsets come out of
        // these relative quantities alone, keeping the result translation-exact.
        const relX = points[i].x - points[a].x;
        const relY = inkY(i) - inkY(a);

        // Ring k sits tangent to the ring before it: centre distance 1 + s, then + 2s per ring.
        let final: Point | null = null;
        for (let ring = 0; ring < points.length + RING_CAPACITY_FALLBACK && !final; ring++) {
            const lambda = 1 + s + 2 * s * ring;
            // Ring positions relative to the anchor's ink centre, as pixel offsets off home.
            const at = (phi: number): Point => ({
                x: lambda * rx * Math.cos(phi) - relX,
                y: lambda * ry * Math.sin(phi) - relY,
            });
            const freeAt = (phi: number) => {
                const q = at(phi);
                return clear(i, q.x, q.y, s);
            };
            // Sweep the ring from the true azimuth outward in steps a fraction of one satellite's
            // angular width — fine enough not to jump over a usable arc. Fresh markers alternate
            // sides; a marker that already slid one way last frame sweeps that whole side first,
            // so a near-symmetric squeeze can't flip it across the azimuth every few frames.
            //
            // DELIBERATE TRADE: the sweep spans the full ±π. A crowded ring can therefore place a
            // satellite on the *opposite* side of its own δήμος — one ring of touching bubbles was
            // judged worth more than bounded azimuth error (an earlier design capped deviation at
            // ±π/6 and spilled outward instead). The unbounded sweep is also exactly why the
            // side-hysteresis above exists: with no deviation cap, only memory keeps a symmetric
            // squeeze from re-deciding the side every frame. Cap the sweep and both go together.
            const step = Math.asin(Math.min(1, s / lambda)) / 4;
            const prevSide = memory?.[i]?.side ?? 0;
            const maxK = Math.ceil((Math.PI + step) / step);
            const candidates = function* (): Generator<[number, number]> {
                yield [0, 0];
                if (prevSide === 0) {
                    for (let k = 1; k <= maxK; k++) for (const dir of [1, -1]) yield [k, dir];
                } else {
                    for (let k = 1; k <= maxK; k++) yield [k, prevSide];
                    for (let k = 1; k <= maxK; k++) yield [k, -prevSide];
                }
            };
            for (const [k, dir] of candidates()) {
                const phi = azimuth + dir * k * step;
                if (!freeAt(phi)) continue;
                // Ease back toward the azimuth: binary-search the last blocked step against this
                // free one, so the satellite rests against whoever blocked it.
                let hi = phi; // free
                if (k > 0) {
                    let lo = azimuth + dir * (k - 1) * step; // blocked (or the azimuth itself)
                    for (let round = 0; round < AZIMUTH_REFINE_ROUNDS; round++) {
                        const mid = (lo + hi) / 2;
                        if (freeAt(mid)) hi = mid;
                        else lo = mid;
                    }
                }
                final = at(hi);
                const deviation = hi - azimuth;
                outMemory[i] = { home: false, side: Math.abs(deviation) < 1e-6 ? 0 : deviation > 0 ? 1 : -1 };
                break;
            }
        }
        // Unreachable in practice (rings grow without bound) — but never drop a δήμος.
        if (!final) final = { x: 0, y: 0 };

        offsets[i] = final;
        placed.push({ idx: i, dx: final.x, dy: final.y, s });
    }

    return {
        placements: offsets.map((offset, i) => ({ offset, scale: scales[i] })),
        memory: outMemory,
    };
}
