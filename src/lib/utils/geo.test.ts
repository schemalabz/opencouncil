import { calculateGeometryBounds, MinimalGeometry } from './geo';

describe('calculateGeometryBounds', () => {
    it('should calculate bounds for a Point', () => {
        const geometry: MinimalGeometry = {
            type: 'Point',
            coordinates: [23.7275, 37.9838]
        };
        const result = calculateGeometryBounds(geometry);
        expect(result.bounds).toEqual({
            minLng: 23.7275,
            maxLng: 23.7275,
            minLat: 37.9838,
            maxLat: 37.9838
        });
        expect(result.center).toEqual([23.7275, 37.9838]);
    });

    it('should calculate bounds for a Polygon', () => {
        const geometry: MinimalGeometry = {
            type: 'Polygon',
            coordinates: [
                [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
            ]
        };
        const result = calculateGeometryBounds(geometry);
        expect(result.bounds).toEqual({
            minLng: 0,
            maxLng: 10,
            minLat: 0,
            maxLat: 10
        });
        expect(result.center).toEqual([5, 5]);
    });

    it('should calculate bounds for a MultiPolygon', () => {
        const geometry: MinimalGeometry = {
            type: 'MultiPolygon',
            coordinates: [
                [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
                [[[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]]
            ]
        };
        const result = calculateGeometryBounds(geometry);
        expect(result.bounds).toEqual({
            minLng: 0,
            maxLng: 6,
            minLat: 0,
            maxLat: 6
        });
        expect(result.center).toEqual([3, 3]);
    });

    it('should return default for unsupported geometry type', () => {
        const geometry: any = {
            type: 'LineString',
            coordinates: [[0, 0], [1, 1]]
        };
        const result = calculateGeometryBounds(geometry);
        expect(result.bounds).toBeNull();
        expect(result.center).toEqual([23.7275, 37.9838]);
    });

    it('should return default for null geometry', () => {
        const result = calculateGeometryBounds(null);
        expect(result.bounds).toBeNull();
        expect(result.center).toEqual([23.7275, 37.9838]);
    });

    it('should return default when Polygon has no processable coordinates', () => {
        const geometry: MinimalGeometry = {
            type: 'Polygon',
            coordinates: [[]]
        };
        const result = calculateGeometryBounds(geometry);
        expect(result.bounds).toBeNull();
        expect(result.center).toEqual([23.7275, 37.9838]);
    });

    it('should return default when MultiPolygon has empty rings', () => {
        const geometry: MinimalGeometry = {
            type: 'MultiPolygon',
            coordinates: [
                [[]]
            ]
        };
        const result = calculateGeometryBounds(geometry);
        expect(result.bounds).toBeNull();
        expect(result.center).toEqual([23.7275, 37.9838]);
    });
});
