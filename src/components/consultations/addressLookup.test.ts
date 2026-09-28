import { computeAddressLookup, formatDistance } from './addressLookup';
import type { GeoSetData, Geometry } from './types';

// A grid of ~100 m: 0.0009° is 100 m of latitude, and at the equator also of longitude.
const M = 0.0009 / 100;

function square(id: string, x: number, y: number, size: number): Geometry {
    return {
        type: 'polygon',
        id,
        name: id,
        geojson: {
            type: 'Polygon',
            coordinates: [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]],
        },
    };
}

function point(id: string, x: number, y: number): Geometry {
    return { type: 'point', id, name: id, geojson: { type: 'Point', coordinates: [x, y] } };
}

const zones: GeoSetData = {
    id: 'zones',
    name: 'Ζώνες',
    geometries: [square('zone-a', 0, 0, 200 * M), square('zone-b', 200 * M, 0, 200 * M)],
};
const residents: GeoSetData = {
    id: 'residents',
    name: 'Κάτοικοι',
    geometries: [
        square('res-near', 10 * M, 10 * M, 10 * M), // ~0 m from the address
        square('res-mid', 90 * M, 10 * M, 10 * M), // ~75 m away
        square('res-far', 300 * M, 300 * M, 10 * M), // far outside the radius
    ],
};
const paid: GeoSetData = {
    id: 'paid',
    name: 'Με πληρωμή',
    geometries: [square('paid-near', 30 * M, 10 * M, 10 * M)], // ~10 m away
};
const spots: GeoSetData = {
    id: 'spots',
    name: 'ΑΜΕΑ',
    geometries: [point('spot-near', 15 * M, 60 * M), point('spot-far', 15 * M, 900 * M)],
};
const address: [number, number] = [15 * M, 15 * M];

describe('computeAddressLookup', () => {
    it('finds the zone containing the address', () => {
        const result = computeAddressLookup(address, [zones, residents], { zoneGeoSetId: 'zones' });
        expect(result.zoneConfigured).toBe(true);
        expect(result.zone?.geometry.id).toBe('zone-a');
    });

    it('reports no zone for an address outside every zone', () => {
        const result = computeAddressLookup([500 * M, 500 * M], [zones], { zoneGeoSetId: 'zones' });
        expect(result.zoneConfigured).toBe(true);
        expect(result.zone).toBeNull();
    });

    it('reports the zone as unconfigured without a zone geoset', () => {
        const result = computeAddressLookup(address, [zones, residents]);
        expect(result.zoneConfigured).toBe(false);
        expect(result.zone).toBeNull();
    });

    it('lists area geosets by default, excluding the zone geoset and point-only geosets', () => {
        const result = computeAddressLookup(address, [zones, residents, paid, spots], { zoneGeoSetId: 'zones' });
        expect(result.areaGroups.map((g) => g.geoSet.id)).toEqual(['residents', 'paid']);
    });

    it('honours nearbyGeoSetIds and the radius', () => {
        const result = computeAddressLookup(address, [zones, residents, paid], {
            zoneGeoSetId: 'zones',
            nearbyGeoSetIds: ['paid'],
            nearbyRadiusMeters: 5,
        });
        expect(result.areaGroups).toEqual([]);
        expect(result.config.nearbyRadiusMeters).toBe(5);
    });

    it('orders groups by their nearest item and items by distance', () => {
        const result = computeAddressLookup(address, [residents, paid], { nearbyGeoSetIds: ['paid', 'residents'] });
        expect(result.areaGroups.map((g) => g.geoSet.id)).toEqual(['residents', 'paid']);
        expect(result.areaGroups[0].items.map((i) => i.geometry.id)).toEqual(['res-near', 'res-mid']);
        expect(result.areaGroups[0].items[1].distance).toBeCloseTo(75, -1);
    });

    it('lists points within the point radius from any geoset', () => {
        const result = computeAddressLookup(address, [spots, residents]);
        expect(result.points.map((p) => p.geometry.id)).toEqual(['spot-near']);
        expect(result.points[0].distance).toBeCloseTo(45, -1);
    });

    it('prefers an admin-saved geometry over the regulation file', () => {
        const moved: GeoJSON.Polygon = {
            type: 'Polygon',
            coordinates: [[[500 * M, 500 * M], [510 * M, 500 * M], [510 * M, 510 * M], [500 * M, 510 * M], [500 * M, 500 * M]]],
        };
        const result = computeAddressLookup(address, [residents], { nearbyGeoSetIds: ['residents'] }, { 'res-near': moved });
        expect(result.areaGroups[0].items.map((i) => i.geometry.id)).toEqual(['res-mid']);
    });

    it('ignores derived geometries', () => {
        const derived: GeoSetData = {
            id: 'buffers',
            name: 'Buffers',
            geometries: [{ type: 'derived', id: 'buf', name: 'buf', derivedFrom: { operation: 'buffer', sourceGeoSetId: 'spots', radius: 50 } }],
        };
        const result = computeAddressLookup(address, [derived, spots]);
        expect(result.areaGroups).toEqual([]);
        expect(result.points.map((p) => p.geometry.id)).toEqual(['spot-near']);
    });
});

describe('formatDistance', () => {
    it('rounds metres and switches to kilometres at 1000', () => {
        expect(formatDistance(0)).toBe('0μ');
        expect(formatDistance(999.4)).toBe('999μ');
        expect(formatDistance(1000)).toBe('1.0χλμ');
        expect(formatDistance(1550)).toBe('1.6χλμ');
    });
});
