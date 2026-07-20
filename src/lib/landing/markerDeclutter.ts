/**
 * Screen-space decluttering for the zoomed-out municipality donuts. Neighbouring δήμοι (Athens,
 * Ζωγράφου, Χαλάνδρι…) sit almost on top of each other far out, so their donuts would overlap into
 * an unreadable pile. Every δήμος keeps its own donut regardless — none are merged into a combined
 * total and none are hidden — so the overlap is resolved by nudging them apart on screen instead,
 * and the nudges shrink back to nothing as zooming in pulls the real positions apart.
 *
 * Pure screen-pixel geometry — independent of Mapbox, unit-testable. The caller projects centroids →
 * pixels, resolves the overlaps, then renders every donut with its pixel offset.
 */
export type Point = { x: number; y: number };

/** Granularity of the outward search — fine enough to stop just past a blocker. */
const STEP_DIVISOR = 6;

/**
 * How far off its bearing a marker may be placed to find a closer gap.
 *
 * Straight out along the bearing and nothing else is the most stable option, but it makes a dense
 * pile fan into long spokes: measured on a 22-δήμος pile it sprawled to a 271px radius, against
 * ~195px once sideways placement is allowed. A small allowance recovers most of that (208px) while
 * still bounding how much a donut can shift between two zooms to twice this angle — so it stays
 * recognisably on its own side of the δήμος and never swaps to the opposite one.
 */
const MAX_BEARING_DEVIATION = Math.PI / 6;

/**
 * The direction each marker prefers to be pushed: the sum of inverse-distance repulsions from every
 * other marker, so it moves away from wherever its neighbours are densest and a pile fans outward.
 *
 * This is what keeps the layout still as the map zooms. Each term is `(p - q) / |p - q|²`, so scaling
 * every point by a zoom factor `f` scales the whole sum by `1/f` and leaves its *direction* exactly
 * unchanged. Only the magnitude of the eventual nudge varies with zoom, never the side.
 *
 * The 1/d weighting is also why this is a field rather than a nearest-neighbours average: picking the
 * k closest means ranking distances, and two neighbours at nearly equal distance can swap places on
 * floating-point noise, swinging the direction to the far side of the marker. A continuous field has
 * no ordering to flip.
 */
function preferredAngles(points: Point[]): number[] {
    return points.map((p, i) => {
        let vx = 0;
        let vy = 0;
        for (let j = 0; j < points.length; j++) {
            if (j === i) continue;
            const dx = p.x - points[j].x;
            const dy = p.y - points[j].y;
            const d2 = dx * dx + dy * dy;
            // Exactly coincident — no direction to take from this pair, the fan-out below handles it.
            if (d2 === 0) continue;
            vx += dx / d2;
            vy += dy / d2;
        }
        // Nothing to push away from (alone, or perfectly balanced between neighbours): fan by index
        // so a stack of such markers spreads instead of all heading the same way.
        if (vx === 0 && vy === 0) return (2 * Math.PI * i) / points.length;
        return Math.atan2(vy, vx);
    });
}

/**
 * Candidate displacements for one marker, nearest-first: its true position, then outward in steps,
 * each ring sweeping only the arc within MAX_BEARING_DEVIATION of `bearing`, closest angle first.
 *
 * Keeping the search anchored to a fixed bearing is what keeps the map still. `bearing` doesn't
 * change with zoom (see `preferredAngles`), so what a zoom mostly changes is how *far* along it a
 * donut sits — they slide in and out of their δήμος rather than orbiting it.
 *
 * `maxRadius` always admits a free spot: the already-placed markers block only a bounded stretch of
 * each ray, so anything past the farthest of them is clear.
 */
function* candidateOffsets(minDistance: number, bearing: number, maxRadius: number): Generator<Point> {
    // Emitted literally rather than as radius 0, so "didn't move" is a clean {0, 0} and never the
    // -0 that a negative cos/sin would otherwise produce.
    yield { x: 0, y: 0 };
    const step = minDistance / STEP_DIVISOR;
    for (let radius = step; radius <= maxRadius; radius += step) {
        // Angular resolution follows the circumference, so the arc is sampled about as finely as the
        // radial steps are — no denser on big rings than it needs to be.
        const steps = Math.max(8, Math.round((2 * Math.PI * radius) / (minDistance / 2)));
        for (let k = 0; k <= steps / 2; k++) {
            const deviation = (2 * Math.PI * k) / steps;
            if (deviation > MAX_BEARING_DEVIATION) break;
            // On-bearing first, then alternating to either side of it.
            for (const angle of k === 0 ? [bearing] : [bearing + deviation, bearing - deviation]) {
                yield { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
            }
        }
    }
}

/**
 * Place every marker so no two end up closer than `minDistance` centre-to-centre, and return the
 * pixel offset to draw each one at (`{x: 0, y: 0}` for anything that didn't have to move).
 *
 * Markers are treated as circles, not boxes — which is what the donuts actually are, and it lets
 * them sit noticeably closer (especially diagonally) than a bounding-box test would allow.
 *
 * Greedy placement in `priorities` order, busiest δήμος first: each marker takes its true position
 * when that's still clear, otherwise the nearest free point around its own fixed bearing. Working in
 * priority order means the donuts a visitor is most likely looking for are the ones that keep their
 * real position, and quieter neighbours give way. Anything that wasn't overlapping is left exactly
 * where it was.
 *
 * The arrangement is a pure function of the *relative* geometry, so panning leaves it untouched; and
 * since each marker stays within MAX_BEARING_DEVIATION of a zoom-invariant bearing, zooming changes
 * how far things sit from their δήμος far more than which way.
 */
export function spreadOverlappingMarkers(
    points: Point[],
    priorities: number[],
    minDistance: number,
): Point[] {
    const bearings = preferredAngles(points);
    // Busiest first; ties break on index so the result never depends on input ordering quirks.
    const order = points.map((_, i) => i).sort((a, b) => priorities[b] - priorities[a] || a - b);
    const minDistance2 = minDistance * minDistance;
    // Every marker fits within this far along its ray, since at worst it clears all the others.
    const maxRadius = (points.length + 1) * minDistance;

    const offsets: Point[] = points.map(() => ({ x: 0, y: 0 }));
    const placed: Point[] = [];

    for (const i of order) {
        const origin = points[i];
        let chosen: Point = { x: 0, y: 0 };
        for (const candidate of candidateOffsets(minDistance, bearings[i], maxRadius)) {
            const x = origin.x + candidate.x;
            const y = origin.y + candidate.y;
            if (placed.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 >= minDistance2)) {
                chosen = candidate;
                break;
            }
        }
        offsets[i] = chosen;
        placed.push({ x: origin.x + chosen.x, y: origin.y + chosen.y });
    }

    return offsets;
}
