/**
 * Donut-cluster geometry + SVG, ported from the CivicMap redesign (src/lib/map/donut.ts).
 * A donut is a topic-segmented ring with the cluster's total count on a white centre disc,
 * each segment carrying its topic icon. Segments derive from the grouped LandingSubject members.
 */
import type { LandingSubject } from './landingData';

const DONUT_MAX_SEGMENTS = 5;
const DONUT_OTHER_COLOR = '#d6d3d1'; // stone-300 — neutral "λοιπά" bucket
const DONUT_MIN_ICON_SIZE = 10;

export interface DonutSegment {
    topicId: string;
    color: string;
    icon: string | null;
    count: number;
}

/**
 * Topic distribution of a cluster's members, ordered by count: at most DONUT_MAX_SEGMENTS
 * segments; smaller topics and untopiced subjects merge into a final neutral "other" segment.
 */
export function computeDonutSegments(members: LandingSubject[]): DonutSegment[] {
    const byTopic = new Map<string, DonutSegment>();
    let otherCount = 0;
    for (const m of members) {
        if (!m.topicId) {
            otherCount++;
            continue;
        }
        const seg = byTopic.get(m.topicId);
        if (seg) seg.count++;
        else byTopic.set(m.topicId, { topicId: m.topicId, color: m.topic.color, icon: m.topic.icon, count: 1 });
    }
    const named = Array.from(byTopic.values()).sort((a, b) => b.count - a.count);

    let visible = named;
    if (named.length > DONUT_MAX_SEGMENTS || (otherCount > 0 && named.length > DONUT_MAX_SEGMENTS - 1)) {
        visible = named.slice(0, DONUT_MAX_SEGMENTS - 1);
        otherCount += named.slice(DONUT_MAX_SEGMENTS - 1).reduce((sum, segment) => sum + segment.count, 0);
    }
    if (otherCount > 0) {
        visible = [...visible, { topicId: 'other', color: DONUT_OTHER_COLOR, icon: null, count: otherCount }];
    }
    return visible;
}

/** Outer diameter (px) of a donut marker, stepped by cluster size. */
export function donutDiameter(pointCount: number): number {
    if (pointCount > 500) return 80;
    if (pointCount > 100) return 74;
    if (pointCount > 25) return 68;
    if (pointCount > 9) return 62;
    return 58;
}

/** Radial width (px) of the coloured ring band — wide enough to hold a topic icon. */
function donutRingThickness(pointCount: number): number {
    if (pointCount > 100) return 22;
    if (pointCount > 9) return 20;
    return 18;
}

/** Largest icon (px) a segment's ring band can hold, with padding. */
function donutSegmentIconSize(pointCount: number): number {
    return donutRingThickness(pointCount) - 7;
}

function donutFontSize(pointCount: number): number {
    if (pointCount > 500) return 12;
    if (pointCount > 100) return 13;
    if (pointCount > 9) return 12;
    return 13;
}

export interface DonutIconPlacement {
    topicId: string;
    icon: string | null;
    /** Icon centre, in the donut's 0..diameter coordinate space. */
    x: number;
    y: number;
    size: number;
}

/**
 * Positions a topic icon on every named segment whose arc is long enough to hold a legible one,
 * at the segment's mid-angle and the band's mid-radius. Thin slivers and "other" get none.
 */
export function donutSegmentIcons(segments: DonutSegment[], totalCount: number): DonutIconPlacement[] {
    const r = donutDiameter(totalCount) / 2;
    const rMid = r - donutRingThickness(totalCount) / 2;
    const maxSize = donutSegmentIconSize(totalCount);
    const total = segments.reduce((sum, segment) => sum + segment.count, 0) || 1;

    const placements: DonutIconPlacement[] = [];
    let offset = 0;
    for (const segment of segments) {
        const fraction = segment.count / total;
        const midFraction = (offset + segment.count / 2) / total;
        offset += segment.count;
        if (segment.topicId === 'other') continue;
        // Arc available to this segment along the band's mid-radius.
        const arc = 2 * Math.PI * rMid * fraction;
        const size = Math.min(maxSize, Math.floor(arc * 0.62));
        if (size < DONUT_MIN_ICON_SIZE) continue;
        const angle = 2 * Math.PI * (midFraction - 0.25);
        placements.push({
            topicId: segment.topicId,
            icon: segment.icon,
            x: r + rMid * Math.cos(angle),
            y: r + rMid * Math.sin(angle),
            size,
        });
    }
    return placements;
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

/**
 * Renders a donut cluster as an SVG string: a topic-segmented ring with the total count on a
 * white centre disc. The caller overlays per-segment topic icons (donutSegmentIcons) on the ring.
 */
export function donutSvg(segments: DonutSegment[], totalCount: number): string {
    const diameter = donutDiameter(totalCount);
    const r = diameter / 2;
    const r0 = r - donutRingThickness(totalCount);
    const total = segments.reduce((sum, segment) => sum + segment.count, 0) || 1;

    const paths: string[] = [];
    let offset = 0;
    for (const segment of segments) {
        const start = offset / total;
        offset += segment.count;
        paths.push(donutSegmentPath(start, offset / total, r, r0, segment.color, segments.length > 1));
    }

    const fontSize = donutFontSize(totalCount);
    const countText =
        `<text x="${r}" y="${r}" dominant-baseline="central" text-anchor="middle" ` +
        `font-family="'Relative Book Pro', Inter, sans-serif" font-weight="600" ` +
        `font-size="${fontSize}" fill="#0c0a09">${totalCount}</text>`;
    return (
        `<svg width="${diameter}" height="${diameter}" viewBox="0 0 ${diameter} ${diameter}" ` +
        `xmlns="http://www.w3.org/2000/svg" style="display:block">` +
        paths.join('') +
        `<circle cx="${r}" cy="${r}" r="${r0}" fill="#ffffff"/>` +
        countText +
        `</svg>`
    );
}
