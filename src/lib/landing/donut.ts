/**
 * Donut geometry + SVG for the landing map. One donut per cooperating δήμος at zoomed-out levels: a
 * hairline arc of its topic mix wrapping the municipality logo, with the δήμος's total subject count
 * below. Segments derive from the δήμος's LandingSubject members.
 */
import type { LandingSubject } from './landingData';

const DONUT_OTHER_COLOR = '#d6d3d1'; // stone-300 — neutral fallback when a δήμος has no topics at all

export interface DonutSegment {
    topicId: string;
    color: string;
    icon: string | null;
    count: number;
}

function donutSegmentPath(
    start: number,
    end: number,
    r: number,
    r0: number,
    color: string,
    separators: boolean,
): string {
    if (end - start >= 1) end = start + 0.99999;
    const a0 = 2 * Math.PI * (start - 0.25);
    const a1 = 2 * Math.PI * (end - 0.25);
    const x0 = Math.cos(a0);
    const y0 = Math.sin(a0);
    const x1 = Math.cos(a1);
    const y1 = Math.sin(a1);
    const largeArc = end - start > 0.5 ? 1 : 0;
    const d = [
        `M ${r + r0 * x0} ${r + r0 * y0}`,
        `L ${r + r * x0} ${r + r * y0}`,
        `A ${r} ${r} 0 ${largeArc} 1 ${r + r * x1} ${r + r * y1}`,
        `L ${r + r0 * x1} ${r + r0 * y1}`,
        `A ${r0} ${r0} 0 ${largeArc} 0 ${r + r0 * x0} ${r + r0 * y0}`,
    ].join(' ');
    const stroke = separators ? ' stroke="#ffffff" stroke-width="1"' : '';
    return `<path d="${d}" fill="${color}"${stroke}/>`;
}

/* ======================= MUNICIPALITY OVERVIEW DONUT ======================= */

/**
 * Outer diameter (px) of a δήμος overview donut. Fixed, unlike the subject donuts that step up with
 * cluster size: these are one-per-δήμος at zoomed-out levels, where a marker that grew with its
 * count would read as geographic weight and would keep changing size as filters change the totals.
 */
export const MUNICIPALITY_DONUT_DIAMETER = 68;

/**
 * Outer diameter (px) of the coloured arc. Sized so its inner edge lands exactly on the logo's white
 * ring — the arc sits on the logo rather than floating out at the rim. Separate from the marker box,
 * which is larger because it also has to reserve room below the logo for the count.
 */
const MUNICIPALITY_DONUT_RING_DIAMETER = 46;

/**
 * Radial width (px) of the coloured band — a hairline, so the marker reads as the municipality's logo
 * ringed by its topic mix rather than as a chart.
 */
const MUNICIPALITY_DONUT_THICKNESS = 3;

/**
 * Fraction of the ring left open at the bottom. Sized so the arc sweeps well past the horizontal and
 * its two ends come down level with the top of the count — wrapping the logo as far as it can without
 * running into the number. The gap is the number's space, not the ring's.
 *
 * It has to be this tight *because* the arc hugs the logo: on a small radius the ends have to travel
 * much further round to reach the same height a wider arc would reach sooner.
 */
const MUNICIPALITY_DONUT_GAP = 0.2;

/** Above this many segments the white hairlines between them are dropped — see `separators` below. */
const MUNICIPALITY_DONUT_MAX_SEPARATED = 8;

/**
 * Side (px) of the logo at the centre. Its 1px white ring (drawn by the marker, not here) brings it
 * out to exactly the arc's inner edge, so the colour sits on the logo with no map showing between.
 * Set independently of the arc rather than derived from its hole, so the count keeps its room below.
 */
export const MUNICIPALITY_DONUT_LOGO_SIZE = 38;

/**
 * Topic distribution for a δήμος overview donut: every topic present, ordered by count, each keeping
 * its own colour across the full width of the ring.
 *
 * Deliberately different from `computeDonutSegments`, which caps at DONUT_MAX_SEGMENTS and folds the
 * tail into a neutral bucket. That suits a cluster of nearby subjects, which is usually narrow in
 * topic — but a whole δήμος spans most of the topic list (15–17 of them here), so the cap left
 * roughly half of Athens' and Chania's rings as one grey arc meaning "13 other topics". Showing
 * every topic costs some thin slivers and buys a ring that is entirely real information.
 *
 * Subjects with no topic are left out of the ring rather than greyed in — the marker's printed total
 * still counts them, but there's no colour that honestly represents them.
 */
export function computeMunicipalityDonutSegments(members: LandingSubject[]): DonutSegment[] {
    const byTopic = new Map<string, DonutSegment>();
    for (const m of members) {
        if (!m.topicId) continue;
        const seg = byTopic.get(m.topicId);
        if (seg) seg.count++;
        else byTopic.set(m.topicId, { topicId: m.topicId, color: m.topic.color, icon: m.topic.icon, count: 1 });
    }
    return Array.from(byTopic.values()).sort((a, b) => b.count - a.count || a.topicId.localeCompare(b.topicId));
}

/**
 * Distance (px) from the top of the marker to the centre of the count — just below the logo, in the
 * half the ring leaves open, so the number sits clear of the topic arcs rather than inside them.
 *
 * The count is drawn by the caller as HTML rather than as SVG text: it lands outside the ring, where
 * it needs a halo to stay readable straight over the map tiles.
 */
export const MUNICIPALITY_DONUT_COUNT_Y = MUNICIPALITY_DONUT_DIAMETER / 2 + MUNICIPALITY_DONUT_LOGO_SIZE / 2 + 8;

/**
 * Diameter (px) of the circle that contains everything the marker actually draws — the arc across the
 * top, the logo, and the count hanging below it.
 *
 * Smaller than MUNICIPALITY_DONUT_DIAMETER, which is the element box: its lower half is mostly empty
 * reserve so the count has somewhere to go. The declutter spacing keys off this instead, so donuts
 * aren't held further apart than their ink needs.
 */
export const MUNICIPALITY_DONUT_FOOTPRINT =
    MUNICIPALITY_DONUT_COUNT_Y + 8 - (MUNICIPALITY_DONUT_DIAMETER - MUNICIPALITY_DONUT_RING_DIAMETER) / 2;

/**
 * A δήμος's overview donut as an SVG string: its topic mix as coloured arcs sweeping around the top,
 * ending level with the count that sits in the gap below. The caller overlays the municipality logo
 * and the count as HTML — one is a remote image, the other has to sit above the tiles with a halo.
 */
export function municipalityDonutSvg(segments: DonutSegment[]): string {
    const diameter = MUNICIPALITY_DONUT_DIAMETER;
    const r = MUNICIPALITY_DONUT_RING_DIAMETER / 2;
    const r0 = r - MUNICIPALITY_DONUT_THICKNESS;
    // donutSegmentPath draws around (r, r), so the arc is built at its own size and shifted to sit
    // centred in the larger box.
    const inset = diameter / 2 - r;
    // Topic arcs share the ring minus the bottom gap, centred on the top (fraction 0 = 12 o'clock).
    const span = 1 - MUNICIPALITY_DONUT_GAP;
    // A δήμος with no topic breakdown still gets a ring, so the marker never renders as a bare number.
    const drawn = segments.length > 0 ? segments : [{ topicId: 'other', color: DONUT_OTHER_COLOR, icon: null, count: 1 }];
    const total = drawn.reduce((sum, segment) => sum + segment.count, 0) || 1;

    // White hairlines help tell adjacent segments apart, but each one eats half a pixel off either
    // side of its neighbours — which erases the thin slivers a δήμος's long topic tail produces. Past
    // a handful of segments the colours have to butt up against each other instead.
    const separators = drawn.length > 1 && drawn.length <= MUNICIPALITY_DONUT_MAX_SEPARATED;

    const paths: string[] = [];
    let offset = 0;
    for (const segment of drawn) {
        const start = -span / 2 + (offset / total) * span;
        offset += segment.count;
        paths.push(donutSegmentPath(start, -span / 2 + (offset / total) * span, r, r0, segment.color, separators));
    }

    // The opening tag is deliberately one unbroken template literal. Split across `+` it is silently
    // corrupted by the production minifier — Turbopack dropped the whole `xmlns`/`style` chunk, so
    // the shipped markup read `viewBox="0 0 68 68<g transform="…`, the <g> was swallowed into the
    // viewBox attribute and every arc rendered 11px off-centre from its logo. Dev builds don't
    // minify, so it only ever showed up on deployed previews. Keep it in one piece.
    return (
        `<svg width="${diameter}" height="${diameter}" viewBox="0 0 ${diameter} ${diameter}" xmlns="http://www.w3.org/2000/svg" style="display:block"><g transform="translate(${inset},${inset})">` +
        paths.join('') +
        `</g></svg>`
    );
}
