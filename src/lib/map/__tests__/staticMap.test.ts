jest.mock('@/env.mjs', () => ({ env: { NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: 'pk.test' } }));

import { staticMapOverlayUrl } from '../staticMap';

const square = {
    geometry: { type: 'Polygon', coordinates: [[[25.3, 36.3], [25.5, 36.3], [25.5, 36.5], [25.3, 36.5], [25.3, 36.3]]] },
    style: { fillColor: '#627BBC', fillOpacity: 0.15, strokeColor: '#4263EB', strokeWidth: 2 },
};
const pin = { geometry: { type: 'Point', coordinates: [25.43, 36.41] }, style: { fillColor: '#ff6600' } };

const overlayOf = (url: string) => JSON.parse(decodeURIComponent(url.split('geojson(')[1].split(')/')[0]));

describe('staticMapOverlayUrl', () => {
    it('draws polygons with fill and stroke and points as small markers', () => {
        const url = staticMapOverlayUrl({ features: [square, pin], position: 'auto', width: 600, height: 280, padding: 16 })!;

        const overlay = overlayOf(url);
        expect(overlay.features[0].properties).toEqual({ fill: '#627BBC', 'fill-opacity': 0.15, stroke: '#4263EB', 'stroke-width': 2 });
        expect(overlay.features[1].properties).toEqual({ 'marker-color': '#ff6600', 'marker-size': 'small' });
        expect(url).toContain(')/auto/600x280@2x?access_token=pk.test&padding=16');
    });

    it('frames a centre and zoom without padding, which Mapbox allows only for auto and a box', () => {
        const url = staticMapOverlayUrl({ features: [square], position: { center: [25.43, 36.41], zoom: 14 }, width: 600, height: 280, padding: 16 })!;

        expect(url).toContain(')/25.43,36.41,14,0/600x280@2x?access_token=pk.test');
        expect(url).not.toContain('padding');
    });

    it('frames a bounding box with padding', () => {
        const url = staticMapOverlayUrl({ features: [square], position: { bbox: [25.4, 36.4, 25.45, 36.42] }, width: 600, height: 280, padding: 48 })!;

        expect(url).toContain(')/[25.4,36.4,25.45,36.42]/600x280@2x?access_token=pk.test&padding=48');
    });

    it('thins a long boundary until the URL fits', () => {
        const ring = Array.from({ length: 4000 }, (_, i) => {
            const a = (i / 4000) * 2 * Math.PI;
            return [25.4 + 0.1 * Math.cos(a) + i * 1e-9, 36.4 + 0.1 * Math.sin(a)];
        });
        ring.push(ring[0]);
        const url = staticMapOverlayUrl({ features: [{ geometry: { type: 'Polygon', coordinates: [ring] } }], position: 'auto', width: 600, height: 280 })!;

        expect(url.length).toBeLessThanOrEqual(8192);
        expect(overlayOf(url).features[0].geometry.coordinates[0].length).toBeLessThan(ring.length);
    });

    it('answers null when there is nothing it can draw', () => {
        expect(staticMapOverlayUrl({ features: [], position: 'auto', width: 600, height: 280 })).toBeNull();
        expect(staticMapOverlayUrl({ features: [{ geometry: { type: 'LineString', coordinates: [] } }], position: 'auto', width: 600, height: 280 })).toBeNull();
    });
});
