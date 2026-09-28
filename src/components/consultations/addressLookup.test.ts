import { computeAddressLookup, formatDistance } from './addressLookup';
import type { GeoSetData, Geometry } from './types';

// A grid in metres: 0.0009° is 100 m of latitude, and at the equator also of longitude.
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
        square('res-here', 10 * M, 10 * M, 10 * M), // contains the address
        square('res-across', 10 * M, 30 * M, 10 * M), // ~15 m away, across the street
        square('res-block', 90 * M, 10 * M, 10 * M), // ~75 m away, the next block
    ],
};
const paid: GeoSetData = {
    id: 'paid',
    name: 'Με πληρωμή',
    geometries: [square('paid-near', 30 * M, 10 * M, 10 * M)], // ~10 m away
};
const amea: GeoSetData = {
    id: 'amea',
    name: 'ΑΜΕΑ',
    geometries: [point('amea-near', 15 * M, 60 * M), point('amea-nearer', 15 * M, 40 * M), point('amea-far', 15 * M, 900 * M)],
};
const ev: GeoSetData = { id: 'ev', name: 'Φόρτιση', geometries: [point('ev-far', 15 * M, 900 * M)] };
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

    it('lists the street sides within the street radius, nearest first, from every area geoset but the zones', () => {
        const result = computeAddressLookup(address, [zones, residents, paid, amea], { zoneGeoSetId: 'zones' });
        expect(result.street.map((i) => i.geometry.id)).toEqual(['res-here', 'paid-near', 'res-across']);
        expect(result.street[0].distance).toBe(0);
    });

    it('honours streetGeoSetIds, the radius and the cap', () => {
        const only = computeAddressLookup(address, [residents, paid], { streetGeoSetIds: ['paid'] });
        expect(only.street.map((i) => i.geometry.id)).toEqual(['paid-near']);
        const capped = computeAddressLookup(address, [residents, paid], { streetMaxItems: 1 });
        expect(capped.street.map((i) => i.geometry.id)).toEqual(['res-here']);
        const wide = computeAddressLookup(address, [residents], { streetRadiusMeters: 100 });
        expect(wide.street.map((i) => i.geometry.id)).toEqual(['res-here', 'res-across', 'res-block']);
    });

    it('gives the nearest geometry of each point geoset within the nearby radius', () => {
        const result = computeAddressLookup(address, [residents, amea, ev]);
        expect(result.nearby.map((i) => i.geometry.id)).toEqual(['amea-nearer']);
        expect(result.nearby[0].distance).toBeCloseTo(25, -1);
    });

    it('can list an area geoset as nearby without repeating what is on the street', () => {
        const result = computeAddressLookup(address, [residents, amea], { nearbyGeoSetIds: ['residents', 'amea'] });
        expect(result.nearby.map((i) => i.geometry.id)).toEqual(['amea-nearer', 'res-block']);
    });

    it('prefers an admin-saved geometry over the regulation file', () => {
        const moved: GeoJSON.Polygon = {
            type: 'Polygon',
            coordinates: [[[500 * M, 500 * M], [510 * M, 500 * M], [510 * M, 510 * M], [500 * M, 510 * M], [500 * M, 500 * M]]],
        };
        const result = computeAddressLookup(address, [residents], undefined, { 'res-here': moved });
        expect(result.street.map((i) => i.geometry.id)).toEqual(['res-across']);
    });

    it('computes a derived zone the way the map draws it', () => {
        // 50 m around each ΑΜΕΑ point; the address is 25 m from amea-nearer, so inside.
        const buffers: GeoSetData = {
            id: 'buffers',
            name: 'Buffers',
            geometries: [{ type: 'derived', id: 'buf', name: 'buf', derivedFrom: { operation: 'buffer', sourceGeoSetId: 'amea', radius: 50 } }],
        };
        const result = computeAddressLookup(address, [buffers, amea], { zoneGeoSetId: 'buffers' });
        expect(result.zone?.geometry.id).toBe('buf');
        expect(result.zone?.geojson.type).toBe('MultiPolygon');
    });

    it('returns the shape it measured with every item', () => {
        const result = computeAddressLookup(address, [residents, amea]);
        expect(result.street[0].geojson).toBe((residents.geometries[0] as { geojson: GeoJSON.Geometry }).geojson);
        expect(result.nearby[0].geojson.type).toBe('Point');
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
