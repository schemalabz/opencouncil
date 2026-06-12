import { SPIDERFY_ANCHOR_PRECISION, SPIDERFY_CIRCLE_MAX } from './constants';

/**
 * Pure math for spiderfying co-located subjects: when several subjects share
 * the same coordinates, their pins fan out around the true location so each
 * one stays clickable. The DOM rendering lives in
 * src/components/map/civic/spiderfier.ts.
 */

export interface SpiderfyPosition {
    x: number;
    y: number;
}

/**
 * Groups subjects by "the same spot": ~0.1m precision, so repeated geocodes
 * of one address match while genuinely distinct points don't.
 */
export function anchorKeyOf(anchor: [number, number]): string {
    return `${anchor[0].toFixed(SPIDERFY_ANCHOR_PRECISION)},${anchor[1].toFixed(SPIDERFY_ANCHOR_PRECISION)}`;
}

/**
 * Pixel offsets (relative to the shared anchor) for a fanned-out group:
 * a ring for small groups, an Archimedean spiral beyond SPIDERFY_CIRCLE_MAX.
 */
export function spiderfyPositions(count: number): SpiderfyPosition[] {
    if (count <= 0) return [];

    if (count <= SPIDERFY_CIRCLE_MAX) {
        const radius = 34 + count * 3;
        return Array.from({ length: count }, (_, index) => {
            const angle = (2 * Math.PI * index) / count - Math.PI / 2;
            return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
        });
    }

    const positions: SpiderfyPosition[] = [];
    const separation = 38;
    let angle = 0;
    for (let index = 0; index < count; index++) {
        const radius = 42 + 5.5 * angle;
        positions.push({
            x: Math.cos(angle - Math.PI / 2) * radius,
            y: Math.sin(angle - Math.PI / 2) * radius,
        });
        angle += separation / radius;
    }
    return positions;
}

/** Half-extent (px) of the fan — sizes the legs SVG canvas. */
export function spiderfyExtent(positions: SpiderfyPosition[]): number {
    let max = 0;
    for (const position of positions) {
        max = Math.max(max, Math.abs(position.x), Math.abs(position.y));
    }
    return Math.ceil(max);
}
