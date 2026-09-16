import { pickViewportMunicipality } from './viewportMunicipality';
import type { MapViewport } from './landingData';

// An axis-aligned box polygon: [west, south, east, north].
const box = (w: number, s: number, e: number, n: number): GeoJSON.Polygon => ({
    type: 'Polygon',
    coordinates: [
        [
            [w, s],
            [e, s],
            [e, n],
            [w, n],
            [w, s],
        ],
    ],
});

const city = (id: string, geometry: GeoJSON.Geometry | null) => ({ id, geometry });

// A viewport centred on (clng, clat), `width` degrees wide and `height` degrees tall. The ring
// samples sit at ±20% of each span from the centre.
const viewport = (clng: number, clat: number, width: number, height: number): MapViewport => ({
    w: clng - width / 2,
    e: clng + width / 2,
    s: clat - height / 2,
    n: clat + height / 2,
    clng,
    clat,
});

describe('pickViewportMunicipality', () => {
    const a = city('a', box(0, 0, 10, 10));

    it('returns the δήμος under the centre when it is the only one in view', () => {
        expect(pickViewportMunicipality(viewport(5, 5, 4, 4), [a])?.id).toBe('a');
    });

    it('returns null when no boundary covers the middle of the view', () => {
        expect(pickViewportMunicipality(viewport(50, 50, 4, 4), [a])).toBeNull();
    });

    it('skips δήμοι without a boundary', () => {
        expect(pickViewportMunicipality(viewport(5, 5, 4, 4), [city('none', null), a])?.id).toBe('a');
    });

    it('keeps the δήμος under the centre when a neighbour covers only one ring column', () => {
        // Centre x=9.5 sits in a; the ring spreads ±1, so its right column (x=10.5) lands in b.
        // a: centre (3) + five ring points = 8; b: 3.
        const b = city('b', box(10, 0, 20, 10));
        expect(pickViewportMunicipality(viewport(9.5, 5, 5, 5), [a, b])?.id).toBe('a');
        expect(pickViewportMunicipality(viewport(9.5, 5, 5, 5), [b, a])?.id).toBe('a');
    });

    it('lets a δήμος that covers most of the ring win over a thin one under the centre', () => {
        // b is a 1-wide strip holding the centre and the middle ring column: 3 + 2 = 5.
        const b = city('b', box(10, 0, 11, 10));
        // a covers the left column only (3) — the centre rule holds.
        expect(pickViewportMunicipality(viewport(10.5, 5, 10, 5), [a, b])?.id).toBe('b');
        // wrap covers both outer columns (6) — it dominates the middle of the view.
        const wrap = city('wrap', {
            type: 'MultiPolygon',
            coordinates: [box(0, 0, 10, 10).coordinates, box(11, 0, 21, 10).coordinates],
        });
        expect(pickViewportMunicipality(viewport(10.5, 5, 10, 5), [b, wrap])?.id).toBe('wrap');
        // A view narrow enough for the whole ring to sit inside the strip belongs to the strip.
        expect(pickViewportMunicipality(viewport(10.5, 5, 2, 2), [wrap, b])?.id).toBe('b');
    });

    it('breaks a tie in favour of the δήμος under the centre', () => {
        // tiny covers the centre alone (3); column covers exactly the right ring column (3).
        const tiny = city('tiny', box(-0.1, -0.1, 0.1, 0.1));
        const column = city('column', box(0.9, -2, 1.1, 2));
        expect(pickViewportMunicipality(viewport(0, 0, 5, 5), [column, tiny])?.id).toBe('tiny');
        expect(pickViewportMunicipality(viewport(0, 0, 5, 5), [tiny, column])?.id).toBe('tiny');
    });
});
