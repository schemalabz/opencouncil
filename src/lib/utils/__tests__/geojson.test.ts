import { parseBoundaryInput } from '../geojson';

const square = [[[20, 40], [21, 40], [21, 41], [20, 41], [20, 40]]];
const triangleOpen = [[[0, 0], [1, 0], [1, 1]]]; // valid but unclosed — should auto-close

describe('parseBoundaryInput', () => {
    it('accepts a bare Polygon geometry', () => {
        const result = parseBoundaryInput(JSON.stringify({ type: 'Polygon', coordinates: square }));
        expect(result).toEqual({ ok: true, geometry: { type: 'Polygon', coordinates: square } });
    });

    it('accepts a bare MultiPolygon geometry', () => {
        const result = parseBoundaryInput(JSON.stringify({ type: 'MultiPolygon', coordinates: [square, square] }));
        if (!result.ok) throw new Error('expected ok');
        expect(result.geometry.type).toBe('MultiPolygon');
        expect(result.geometry.coordinates).toHaveLength(2);
    });

    it('unwraps a Feature', () => {
        const feature = { type: 'Feature', properties: { name: 'Ниш' }, geometry: { type: 'Polygon', coordinates: square } };
        const result = parseBoundaryInput(JSON.stringify(feature));
        expect(result).toEqual({ ok: true, geometry: { type: 'Polygon', coordinates: square } });
    });

    it('merges a FeatureCollection of polygons into a MultiPolygon, ignoring points', () => {
        const collection = {
            type: 'FeatureCollection',
            features: [
                { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [21.9, 43.3] } },
                { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: square } },
                { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: square } },
            ],
        };
        const result = parseBoundaryInput(JSON.stringify(collection));
        if (!result.ok) throw new Error('expected ok');
        expect(result.geometry).toEqual({ type: 'MultiPolygon', coordinates: [square, square] });
    });

    it('flattens a GeometryCollection', () => {
        const gc = { type: 'GeometryCollection', geometries: [{ type: 'Polygon', coordinates: square }] };
        const result = parseBoundaryInput(JSON.stringify(gc));
        expect(result).toEqual({ ok: true, geometry: { type: 'Polygon', coordinates: square } });
    });

    it('auto-closes an unclosed ring', () => {
        const result = parseBoundaryInput(JSON.stringify({ type: 'Polygon', coordinates: triangleOpen }));
        if (!result.ok) throw new Error('expected ok');
        expect(result.geometry.coordinates[0]).toEqual([[0, 0], [1, 0], [1, 1], [0, 0]]);
    });

    it('drops altitude from 3D positions', () => {
        const threeD = [[[20, 40, 132.5], [21, 40, 130.1], [21, 41, 129], [20, 40, 132.5]]];
        const result = parseBoundaryInput(JSON.stringify({ type: 'Polygon', coordinates: threeD }));
        if (!result.ok) throw new Error('expected ok');
        expect(result.geometry.coordinates[0].every((p) => p.length === 2)).toBe(true);
    });

    it('rejects non-JSON input', () => {
        expect(parseBoundaryInput('<gml:Polygon>…')).toEqual({ ok: false, error: 'invalidJson' });
        expect(parseBoundaryInput('42')).toEqual({ ok: false, error: 'invalidJson' });
    });

    it('rejects JSON without polygonal geometry', () => {
        expect(parseBoundaryInput(JSON.stringify({ type: 'Point', coordinates: [21.9, 43.3] }))).toEqual({ ok: false, error: 'noPolygon' });
        expect(parseBoundaryInput(JSON.stringify({ type: 'FeatureCollection', features: [] }))).toEqual({ ok: false, error: 'noPolygon' });
        expect(parseBoundaryInput(JSON.stringify({ hello: 'world' }))).toEqual({ ok: false, error: 'noPolygon' });
    });

    it('rejects out-of-range and malformed coordinates', () => {
        const badRange = [[[200, 40], [21, 40], [21, 41], [200, 40]]];
        expect(parseBoundaryInput(JSON.stringify({ type: 'Polygon', coordinates: badRange }))).toEqual({ ok: false, error: 'invalidCoordinates' });
        const badShape = [[[20], [21, 40], [21, 41]]];
        expect(parseBoundaryInput(JSON.stringify({ type: 'Polygon', coordinates: badShape }))).toEqual({ ok: false, error: 'invalidCoordinates' });
        const tooFew = [[[20, 40], [21, 40], [20, 40]]]; // closes to 3 positions — degenerate
        expect(parseBoundaryInput(JSON.stringify({ type: 'Polygon', coordinates: tooFew }))).toEqual({ ok: false, error: 'invalidCoordinates' });
        expect(parseBoundaryInput(JSON.stringify({ type: 'Polygon', coordinates: [] }))).toEqual({ ok: false, error: 'invalidCoordinates' });
    });
});
