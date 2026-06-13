import {
  calculateGeometryBounds,
  createCircleBuffer,
  geometryIntersectsBounds,
  haversineDistance,
  isPointInGeometry,
  normalizeGeometryCoordinates,
  normalizeLngLat,
} from '../geo';

describe('calculateGeometryBounds', () => {
  it('returns default Athens center for null geometry', () => {
    const result = calculateGeometryBounds(null);
    expect(result.bounds).toBeNull();
    expect(result.center).toEqual([23.7275, 37.9838]);
  });

  it('returns default for unsupported geometry type', () => {
    const result = calculateGeometryBounds({ type: 'Bogus', coordinates: [[0, 0], [1, 1]] });
    expect(result.bounds).toBeNull();
  });

  it('calculates bounds for a LineString', () => {
    const result = calculateGeometryBounds({ type: 'LineString', coordinates: [[0, 0], [2, 4]] });
    expect(result.bounds).toEqual({ minLng: 0, maxLng: 2, minLat: 0, maxLat: 4 });
    expect(result.center).toEqual([1, 2]);
  });

  it('calculates bounds for a MultiLineString', () => {
    const result = calculateGeometryBounds({
      type: 'MultiLineString',
      coordinates: [[[0, 0], [1, 1]], [[5, 5], [6, 7]]],
    });
    expect(result.bounds).toEqual({ minLng: 0, maxLng: 6, minLat: 0, maxLat: 7 });
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

describe('normalizeLngLat', () => {
  it('swaps coordinates stored as [lat, lng] within Greece', () => {
    // Souda, Crete stored swapped: lat 35.49, lng 24.07
    expect(normalizeLngLat([35.4876457, 24.0750792])).toEqual([24.0750792, 35.4876457]);
  });

  it('keeps correct [lng, lat] coordinates unchanged', () => {
    expect(normalizeLngLat([23.7275, 37.9838])).toEqual([23.7275, 37.9838]);
  });

  it('keeps coordinates outside both ranges unchanged', () => {
    expect(normalizeLngLat([-74.006, 40.7128])).toEqual([-74.006, 40.7128]);
    expect(normalizeLngLat([0, 0])).toEqual([0, 0]);
  });

  it('respects exact range edges', () => {
    // first=29.9 is not a Greek latitude → no swap
    expect(normalizeLngLat([29.9, 24])).toEqual([29.9, 24]);
    // first=34.1 is a Greek latitude, second=24 a Greek longitude → swap
    expect(normalizeLngLat([34.1, 24])).toEqual([24, 34.1]);
  });
});

describe('normalizeGeometryCoordinates', () => {
  it('normalizes a swapped Point', () => {
    const result = normalizeGeometryCoordinates({ type: 'Point', coordinates: [37.98, 23.73] });
    expect(result).toEqual({ type: 'Point', coordinates: [23.73, 37.98] });
  });

  it('normalizes every position of a LineString', () => {
    const result = normalizeGeometryCoordinates({
      type: 'LineString',
      coordinates: [[37.98, 23.73], [23.74, 37.99]],
    });
    expect(result.coordinates).toEqual([[23.73, 37.98], [23.74, 37.99]]);
  });

  it('normalizes nested Polygon rings', () => {
    const result = normalizeGeometryCoordinates({
      type: 'Polygon',
      coordinates: [[[37.98, 23.73], [37.99, 23.74], [37.98, 23.73]]],
    });
    expect(result.coordinates).toEqual([[[23.73, 37.98], [23.74, 37.99], [23.73, 37.98]]]);
  });

  it('recurses into GeometryCollections', () => {
    const result = normalizeGeometryCoordinates({
      type: 'GeometryCollection',
      geometries: [{ type: 'Point', coordinates: [37.98, 23.73] }],
    });
    expect(result).toEqual({
      type: 'GeometryCollection',
      geometries: [{ type: 'Point', coordinates: [23.73, 37.98] }],
    });
  });

  it('does not mutate the input geometry', () => {
    const input: GeoJSON.Point = { type: 'Point', coordinates: [37.98, 23.73] };
    normalizeGeometryCoordinates(input);
    expect(input.coordinates).toEqual([37.98, 23.73]);
  });
});

describe('isPointInGeometry', () => {
  const square: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
  };

  it('detects a point inside a polygon', () => {
    expect(isPointInGeometry([5, 5], square)).toBe(true);
  });

  it('rejects a point outside a polygon', () => {
    expect(isPointInGeometry([15, 5], square)).toBe(false);
    expect(isPointInGeometry([-1, 5], square)).toBe(false);
  });

  it('respects holes', () => {
    const withHole: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
        [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
      ],
    };
    expect(isPointInGeometry([5, 5], withHole)).toBe(false);
    expect(isPointInGeometry([1, 1], withHole)).toBe(true);
  });

  it('handles MultiPolygon membership', () => {
    const multi: GeoJSON.MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]],
      ],
    };
    expect(isPointInGeometry([5.5, 5.5], multi)).toBe(true);
    expect(isPointInGeometry([3, 3], multi)).toBe(false);
  });

  it('returns false for null or non-area geometry', () => {
    expect(isPointInGeometry([5, 5], null)).toBe(false);
    expect(isPointInGeometry([5, 5], { type: 'Point', coordinates: [5, 5] })).toBe(false);
  });
});

describe('geometryIntersectsBounds', () => {
  // 0..10 square
  const square: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
  };

  it('is true when the viewport centre sits inside the geometry', () => {
    // small viewport deep inside the square, no vertices in view
    expect(geometryIntersectsBounds(square, { west: 4, south: 4, east: 6, north: 6 })).toBe(true);
  });

  it('is true when an outline vertex falls inside the viewport', () => {
    // viewport straddling the corner at (10,10)
    expect(geometryIntersectsBounds(square, { west: 9, south: 9, east: 12, north: 12 })).toBe(true);
  });

  it('is false when the geometry is entirely outside the viewport', () => {
    expect(geometryIntersectsBounds(square, { west: 20, south: 20, east: 25, north: 25 })).toBe(false);
  });

  it('does not leak a far-away geometry sharing only a bbox row', () => {
    // an L-shaped neighbour whose bbox overlaps but polygon does not
    const neighbour: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [[[20, 0], [30, 0], [30, 1], [20, 1], [20, 0]]],
    };
    // viewport over the square's centre — same latitude band as neighbour, far in lng
    expect(geometryIntersectsBounds(neighbour, { west: 4, south: 0, east: 6, north: 2 })).toBe(false);
  });

  it('returns false for null geometry', () => {
    expect(geometryIntersectsBounds(null, { west: 0, south: 0, east: 1, north: 1 })).toBe(false);
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
