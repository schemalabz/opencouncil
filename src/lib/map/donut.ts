import {
    CLUSTER_OTHER_KEY,
    CLUSTER_TOPIC_PROPERTY_CAP,
    DONUT_MAX_SEGMENTS,
    DONUT_MIN_ICON_SIZE,
    DONUT_OTHER_COLOR,
} from './constants';

/**
 * Pure donut-cluster math and SVG generation. The DOM marker pool
 * (src/components/map/civic/donutMarkerPool.ts) consumes these; keeping them
 * here makes the geometry unit-testable without mapbox.
 */

export interface DonutSegment {
    topicId: string;
    color: string;
    count: number;
}

/** Cluster-property key under which a topic's per-cluster count accumulates. */
export function clusterTopicKey(topicId: string): string {
    return `t_${topicId}`;
}

/**
 * Builds the mapbox clusterProperties map: one count accumulator per topic
 * (stable, sorted keys). Topics beyond CLUSTER_TOPIC_PROPERTY_CAP accumulate
 * into a single overflow property so the expression count stays bounded.
 */
export function buildClusterProperties(topicIds: string[]): Record<string, unknown[]> {
    const sorted = Array.from(new Set(topicIds)).sort();
    const direct = sorted.slice(0, CLUSTER_TOPIC_PROPERTY_CAP);
    const overflow = sorted.slice(CLUSTER_TOPIC_PROPERTY_CAP);

    const properties: Record<string, unknown[]> = {};
    for (const topicId of direct) {
        properties[clusterTopicKey(topicId)] = ['+', ['case', ['==', ['get', 'topicId'], topicId], 1, 0]];
    }
    if (overflow.length > 0) {
        properties[CLUSTER_OTHER_KEY] = ['+', ['case', ['in', ['get', 'topicId'], ['literal', overflow]], 1, 0]];
    }
    return properties;
}

/**
 * Extracts the topic distribution of a cluster from its accumulated
 * properties, ordered by count. At most DONUT_MAX_SEGMENTS segments are
 * returned; smaller topics, overflow-property counts, and untopiced subjects
 * (the remainder vs. point_count) merge into a final neutral segment.
 */
export function computeDonutSegments(
    clusterProperties: Record<string, unknown>,
    topics: { id: string; colorHex: string }[],
    pointCount: number,
): DonutSegment[] {
    const named: DonutSegment[] = [];
    for (const topic of topics) {
        const raw = clusterProperties[clusterTopicKey(topic.id)];
        const count = typeof raw === 'number' ? raw : 0;
        if (count > 0) {
            named.push({ topicId: topic.id, color: topic.colorHex, count });
        }
    }
    named.sort((a, b) => b.count - a.count);

    const overflowRaw = clusterProperties[CLUSTER_OTHER_KEY];
    const overflowCount = typeof overflowRaw === 'number' ? overflowRaw : 0;
    const namedTotal = named.reduce((sum, segment) => sum + segment.count, 0);
    let otherCount = overflowCount + Math.max(0, pointCount - namedTotal - overflowCount);

    let visible = named;
    if (named.length > DONUT_MAX_SEGMENTS || (otherCount > 0 && named.length > DONUT_MAX_SEGMENTS - 1)) {
        visible = named.slice(0, DONUT_MAX_SEGMENTS - 1);
        otherCount += named.slice(DONUT_MAX_SEGMENTS - 1).reduce((sum, segment) => sum + segment.count, 0);
    }
    if (otherCount > 0) {
        visible = [...visible, { topicId: 'other', color: DONUT_OTHER_COLOR, count: otherCount }];
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

/**
 * Radial width (px) of the coloured ring band — wide enough that a topic icon
 * fits inside a segment (the point of showing them there), while still leaving
 * a centre hole big enough for the count.
 */
function donutRingThickness(pointCount: number): number {
    if (pointCount > 100) return 22;
    if (pointCount > 9) return 20;
    return 18;
}

/** Largest icon (px) a segment's ring band can hold, with padding. */
function donutSegmentIconSize(pointCount: number): number {
    return donutRingThickness(pointCount) - 7;
}

export interface DonutIconPlacement {
    topicId: string;
    /** Icon centre, in the donut's 0..diameter coordinate space. */
    x: number;
    y: number;
    size: number;
}

/**
 * Positions a topic icon on every named segment whose arc is long enough to
 * hold a legible one — at the segment's mid-angle and the band's mid-radius.
 * Slivers too thin to fit an icon (and the neutral "other" bucket) get none.
 * This lets a glance at a cluster reveal which subject areas it contains, not
 * just their colours. The marker pool fetches the (white) glyphs and drops
 * them at these points.
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
            x: r + rMid * Math.cos(angle),
            y: r + rMid * Math.sin(angle),
            size,
        });
    }
    return placements;
}

function donutFontSize(pointCount: number): number {
    // Kept small enough to sit inside the (now tighter) centre hole, even at
    // four digits for the largest clusters.
    if (pointCount > 500) return 12;
    if (pointCount > 100) return 13;
    if (pointCount > 9) return 12;
    return 13;
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
 * Renders a donut cluster as an SVG string: a topic-segmented ring with the
 * total count on a white centre disc. The marker pool overlays per-segment
 * topic icons (donutSegmentIcons) on the ring band around it. `showCount: false`
 * leaves the centre empty. Sized by donutDiameter(totalCount).
 */
export function donutSvg(
    segments: DonutSegment[],
    totalCount: number,
    options: { showCount?: boolean } = {},
): string {
    const { showCount = true } = options;
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
    const countText = showCount
        ? `<text x="${r}" y="${r}" dominant-baseline="central" text-anchor="middle" ` +
          `font-family="'Relative Book Pro', Inter, sans-serif" font-weight="600" ` +
          `font-size="${fontSize}" fill="#0c0a09">${totalCount}</text>`
        : '';
    return (
        `<svg width="${diameter}" height="${diameter}" viewBox="0 0 ${diameter} ${diameter}" ` +
        `xmlns="http://www.w3.org/2000/svg" style="display:block">` +
        paths.join('') +
        `<circle cx="${r}" cy="${r}" r="${r0}" fill="#ffffff"/>` +
        countText +
        `</svg>`
    );
}
