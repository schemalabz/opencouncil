/**
 * @jest-environment node
 */
import type { ReactElement } from 'react';
import { boundaryPath } from '@/lib/og/boundary';

/** The one path the renderer draws, and the box it was fitted to. */
function drawn(node: ReturnType<typeof boundaryPath>) {
    const svg = node as ReactElement<{ width: number; height: number; children: ReactElement<{ d: string }> }>;
    const d: string = svg.props.children.props.d;
    const points = Array.from(d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)).map(m => [Number(m[1]), Number(m[2])] as const);
    const xs = points.map(p => p[0]);
    const ys = points.map(p => p[1]);
    return {
        box: { width: svg.props.width, height: svg.props.height },
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minY: Math.min(...ys), maxY: Math.max(...ys),
        d,
    };
}

function rectangle(minLng: number, minLat: number, maxLng: number, maxLat: number): GeoJSON.Geometry {
    return {
        type: 'Polygon',
        coordinates: [[[minLng, minLat], [minLng, maxLat], [maxLng, maxLat], [maxLng, minLat], [minLng, minLat]]],
    };
}

describe('boundaryPath', () => {
    it('has nothing to draw without a boundary', () => {
        expect(boundaryPath(null, 200, 200)).toBeNull();
        expect(boundaryPath(undefined, 200, 200)).toBeNull();
        expect(boundaryPath({ type: 'Point', coordinates: [23.7, 37.9] }, 200, 200)).toBeNull();
    });

    it('fits the outline inside its box', () => {
        const { minX, maxX, minY, maxY, box } = drawn(boundaryPath(rectangle(23.7, 37.9, 23.8, 38.0), 240, 200, 6));
        expect(minX).toBeGreaterThanOrEqual(0);
        expect(minY).toBeGreaterThanOrEqual(0);
        expect(maxX).toBeLessThanOrEqual(box.width);
        expect(maxY).toBeLessThanOrEqual(box.height);
    });

    it('centres the outline in its box', () => {
        const { minX, maxX, minY, maxY, box } = drawn(boundaryPath(rectangle(23.7, 37.9, 23.8, 38.0), 240, 200, 6));
        expect(minX + maxX).toBeCloseTo(box.width, 0);
        expect(minY + maxY).toBeCloseTo(box.height, 0);
    });

    it('puts north at the top', () => {
        // The ring starts at the south-west corner, so its first y must be the lower edge.
        const { d, maxY } = drawn(boundaryPath(rectangle(23.7, 37.9, 23.8, 38.0), 240, 200));
        const firstY = Number(d.match(/^M[\d.]+,([\d.]+)/)![1]);
        expect(firstY).toBeCloseTo(maxY, 1);
    });

    it('keeps Mercator proportions rather than flattening the outline', () => {
        // A square in degrees is taller than it is wide on a Mercator map, by 1/cos(lat).
        // Getting the two axes' units wrong is what flattens an outline to a line.
        const lat = 38;
        const { minX, maxX, minY, maxY } = drawn(boundaryPath(rectangle(23.7, lat, 23.8, lat + 0.1), 400, 400));
        expect((maxY - minY) / (maxX - minX)).toBeCloseTo(1 / Math.cos((lat + 0.05) * Math.PI / 180), 1);
    });

    it('draws every ring of a MultiPolygon, so an island municipality keeps its islands', () => {
        const two: GeoJSON.Geometry = {
            type: 'MultiPolygon',
            coordinates: [
                [[[23.7, 37.9], [23.7, 38.0], [23.8, 38.0], [23.8, 37.9], [23.7, 37.9]]],
                [[[24.0, 37.9], [24.0, 38.0], [24.1, 38.0], [24.1, 37.9], [24.0, 37.9]]],
            ],
        };
        expect(drawn(boundaryPath(two, 240, 200)).d.match(/M/g)).toHaveLength(2);
    });
});
