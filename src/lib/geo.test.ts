import { distanceToGeometry, haversineDistance, isInSupportedMunicipality } from './geo';

describe('isInSupportedMunicipality', () => {
    // The function only needs each δήμος's `geometry`; build minimal shapes rather than full cities.
    const withGeometry = (geometry: GeoJSON.Geometry | null) => ({ geometry });

    // A 1°-square δήμος around [10, 10], and a second one with a hole punched out of its middle
    // (a real δήμος boundary can enclose another municipality it doesn't cover).
    const square = withGeometry({
        type: 'Polygon',
        coordinates: [
            [
                [10, 10],
                [11, 10],
                [11, 11],
                [10, 11],
                [10, 10],
            ],
        ],
    });
    const holed = withGeometry({
        type: 'Polygon',
        coordinates: [
            [
                [20, 20],
                [23, 20],
                [23, 23],
                [20, 23],
                [20, 20],
            ],
            [
                [21, 21],
                [22, 21],
                [22, 22],
                [21, 22],
                [21, 21],
            ],
        ],
    });

    it('accepts a point inside a covered δήμος', () => {
        expect(isInSupportedMunicipality([10.5, 10.5], [square])).toBe(true);
    });

    it('rejects a point outside every covered δήμος', () => {
        expect(isInSupportedMunicipality([12, 12], [square])).toBe(false);
    });

    it('rejects a point in a δήμος-shaped hole', () => {
        expect(isInSupportedMunicipality([21.5, 21.5], [holed])).toBe(false);
    });

    it('accepts a point in the ring around a hole', () => {
        expect(isInSupportedMunicipality([20.5, 20.5], [holed])).toBe(true);
    });

    it('finds the match when several δήμοι are in play', () => {
        expect(isInSupportedMunicipality([10.5, 10.5], [holed, square])).toBe(true);
    });

    it('rejects everything when no δήμος has a boundary', () => {
        expect(isInSupportedMunicipality([10.5, 10.5], [withGeometry(null)])).toBe(false);
    });

    it('rejects everything when there are no δήμοι at all', () => {
        expect(isInSupportedMunicipality([10.5, 10.5], [])).toBe(false);
    });

    it('handles a MultiPolygon δήμος (islands)', () => {
        const islands = withGeometry({
            type: 'MultiPolygon',
            coordinates: [
                [
                    [
                        [0, 0],
                        [1, 0],
                        [1, 1],
                        [0, 1],
                        [0, 0],
                    ],
                ],
                [
                    [
                        [5, 5],
                        [6, 5],
                        [6, 6],
                        [5, 6],
                        [5, 5],
                    ],
                ],
            ],
        });
        expect(isInSupportedMunicipality([5.5, 5.5], [islands])).toBe(true);
        expect(isInSupportedMunicipality([3, 3], [islands])).toBe(false);
    });
});

describe('distanceToGeometry', () => {
    // A ~100 m square at the origin: 0.0009° of latitude is 100 m, and at lat 0 so is longitude.
    const side = 0.0009;
    const square: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [[[0, 0], [side, 0], [side, side], [0, side], [0, 0]]],
    };
    const inside: [number, number] = [side / 2, side / 2];

    it('is 0 inside a polygon', () => {
        expect(distanceToGeometry(inside, square)).toBe(0);
    });

    it('measures to the nearest edge outside a polygon', () => {
        // 50 m east of the square's east edge, level with its middle.
        const point: [number, number] = [side + 0.00045, side / 2];
        expect(distanceToGeometry(point, square)).toBeCloseTo(50, -1);
    });

    it('measures to the nearest vertex past a corner', () => {
        // 30 m east and 40 m north of the north-east corner: a 3-4-5 triangle.
        const point: [number, number] = [side + 0.00027, side + 0.00036];
        expect(distanceToGeometry(point, square)).toBeCloseTo(50, -1);
    });

    it('measures to the hole ring for a point inside a hole', () => {
        const holed: GeoJSON.Polygon = {
            type: 'Polygon',
            coordinates: [
                square.coordinates[0],
                [[0.0003, 0.0003], [0.0006, 0.0003], [0.0006, 0.0006], [0.0003, 0.0006], [0.0003, 0.0003]],
            ],
        };
        // The centre of the hole is ~16.7 m from each hole edge.
        expect(distanceToGeometry(inside, holed)).toBeCloseTo(16.7, 0);
    });

    it('takes the nearest member of a MultiPolygon', () => {
        const far: GeoJSON.Polygon = {
            type: 'Polygon',
            coordinates: [[[1, 1], [1.001, 1], [1.001, 1.001], [1, 1.001], [1, 1]]],
        };
        const multi: GeoJSON.MultiPolygon = { type: 'MultiPolygon', coordinates: [far.coordinates, square.coordinates] };
        expect(distanceToGeometry(inside, multi)).toBe(0);
    });

    it('matches haversine for a Point', () => {
        const point: GeoJSON.Point = { type: 'Point', coordinates: [side, side] };
        expect(distanceToGeometry([0, 0], point)).toBeCloseTo(haversineDistance([0, 0], [side, side]), 6);
    });

    it('measures to a LineString segment', () => {
        const line: GeoJSON.LineString = { type: 'LineString', coordinates: [[0, 0], [side, 0]] };
        // 20 m north of the middle of the segment.
        expect(distanceToGeometry([side / 2, 0.00018], line)).toBeCloseTo(20, -1);
    });

    it('is infinite for an unsupported type', () => {
        const unknown = { type: 'Unknown', coordinates: [] } as unknown as GeoJSON.Geometry;
        expect(distanceToGeometry([0, 0], unknown)).toBe(Infinity);
    });
});
