import { calculateGeometryBounds, createCircleBuffer, encodeGeohash, decodeGeohashToCenter, isValidGeohash, haversineDistance } from '../geo';

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

describe('encodeGeohash', () => {
  it('encodes a known coordinate to the expected geohash (Wikipedia reference)', () => {
    // Reference value from the geohash spec: 42.6, -5.6 -> "ezs42"
    expect(encodeGeohash([-5.6, 42.6], 5)).toBe('ezs42');
  });

  it('respects the requested precision', () => {
    expect(encodeGeohash([-5.6, 42.6], 5)).toHaveLength(5);
    expect(encodeGeohash([-5.6, 42.6], 8)).toHaveLength(8);
    expect(encodeGeohash([-5.6, 42.6], 8).startsWith('ezs42')).toBe(true);
  });

  it('encodes Athens-area coordinates into the expected geohash-6 tile', () => {
    // Center of osektutu tile "swbb5u" (Kypseli) should round-trip to itself.
    expect(encodeGeohash([23.7298, 37.9955], 6)).toBe('swbb5u');
  });
});

describe('decodeGeohashToCenter', () => {
  it('round-trips a coordinate back into its cell (~1km for precision 6)', () => {
    const [lng, lat] = [23.7298, 37.9955];
    const [dLng, dLat] = decodeGeohashToCenter(encodeGeohash([lng, lat], 6));
    expect(Math.abs(dLng - lng)).toBeLessThan(0.02);
    expect(Math.abs(dLat - lat)).toBeLessThan(0.01);
  });

  it('throws on characters outside the base-32 alphabet', () => {
    expect(() => decodeGeohashToCenter('abcil')).toThrow(/Invalid geohash/);
  });
});

describe('isValidGeohash', () => {
  it('accepts a valid geohash-6 (case-insensitive)', () => {
    expect(isValidGeohash('swbb5u')).toBe(true);
    expect(isValidGeohash('SWBB5U')).toBe(true);
  });

  it('rejects wrong length and non-base32 characters', () => {
    expect(isValidGeohash('swbb5')).toBe(false); // too short
    expect(isValidGeohash('swbb5a')).toBe(false); // 'a' excluded from base32
    expect(isValidGeohash('swbb5i')).toBe(false); // 'i' excluded from base32
    expect(isValidGeohash('swbb5!')).toBe(false);
    expect(isValidGeohash('')).toBe(false);
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
