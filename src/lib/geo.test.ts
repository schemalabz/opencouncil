import { isInSupportedMunicipality } from './geo';

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
