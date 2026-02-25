import { calculateGeometryBounds, createCircleBuffer, haversineDistance } from '../geo';

describe('calculateGeometryBounds', () => {
  it('returns default Athens center for null geometry', () => {
    const result = calculateGeometryBounds(null);
    expect(result.bounds).toBeNull();
    expect(result.center).toEqual([23.7275, 37.9838]);
  });

  it('returns default for unsupported geometry type', () => {
    const result = calculateGeometryBounds({ type: 'LineString', coordinates: [[0, 0], [1, 1]] });
    expect(result.bounds).toBeNull();
  });

  it('calculates bounds for a Point', () => {
    const result = calculateGeometryBounds({ type: 'Point', coordinates: [23.7, 37.9] });
    expect(result.center).toEqual([23.7, 37.9]);
    expect(result.bounds).toEqual({ minLng: 23.7, maxLng: 23.7, minLat: 37.9, maxLat: 37.9 });
  });

  it('calculates bounds for a Polygon', () => {
    const polygon = {
      type: 'Polygon',
      coordinates: [[[10, 20], [30, 20], [30, 40], [10, 40], [10, 20]]]
    };
    const result = calculateGeometryBounds(polygon);
    expect(result.bounds).toEqual({ minLng: 10, maxLng: 30, minLat: 20, maxLat: 40 });
    expect(result.center).toEqual([20, 30]);
  });

  it('calculates bounds for a MultiPolygon', () => {
    const multi = {
      type: 'MultiPolygon',
      coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]]
      ]
    };
    const result = calculateGeometryBounds(multi);
    expect(result.bounds).toEqual({ minLng: 0, maxLng: 6, minLat: 0, maxLat: 6 });
    expect(result.center).toEqual([3, 3]);
  });

  it('calculates bounds for a GeometryCollection', () => {
    const collection = {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Point', coordinates: [0, 0] },
        { type: 'Point', coordinates: [10, 10] }
      ]
    };
    const result = calculateGeometryBounds(collection);
    expect(result.bounds).toEqual({ minLng: 0, maxLng: 10, minLat: 0, maxLat: 10 });
    expect(result.center).toEqual([5, 5]);
  });
});

describe('createCircleBuffer', () => {
  it('returns a closed GeoJSON Polygon', () => {
    const result = createCircleBuffer([23.7, 37.9], 500);
    expect(result.type).toBe('Polygon');
    expect(result.coordinates).toHaveLength(1);
    const ring = result.coordinates[0];
    // 64 points + closing point
    expect(ring).toHaveLength(65);
    // First and last point must be identical (closed ring)
    expect(ring[ring.length - 1]).toEqual(ring[0]);
  });

  it('produces points approximately at the requested radius', () => {
    const center: [number, number] = [23.7, 37.9];
    const radiusMeters = 1000;
    const result = createCircleBuffer(center, radiusMeters);
    const ring = result.coordinates[0];

    // Check that all points are approximately 1000m from center using haversine
    for (const point of ring.slice(0, -1)) {
      const dist = haversineDistance(center, point as [number, number]);
      // Allow 1% tolerance for the spherical approximation
      expect(dist).toBeGreaterThan(radiusMeters * 0.99);
      expect(dist).toBeLessThan(radiusMeters * 1.01);
    }
  });
});

describe('haversineDistance', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistance([23.7, 37.9], [23.7, 37.9])).toBe(0);
  });

  it('calculates known distance between Athens and Thessaloniki (~300km)', () => {
    // Athens: [23.7275, 37.9838], Thessaloniki: [22.9444, 40.6401]
    const dist = haversineDistance([23.7275, 37.9838], [22.9444, 40.6401]);
    // Approximately 300km, allow 10% tolerance
    expect(dist).toBeGreaterThan(290_000);
    expect(dist).toBeLessThan(310_000);
  });

  it('is symmetric', () => {
    const a: [number, number] = [0, 0];
    const b: [number, number] = [1, 1];
    expect(haversineDistance(a, b)).toBeCloseTo(haversineDistance(b, a));
  });
});
