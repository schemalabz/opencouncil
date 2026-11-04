/** @jest-environment node */
// Next's request cache lifecycle is absent in Jest. Database effects and
// normalized reads stay real; handler tests separately verify invalidation.
jest.mock('@/lib/cache/afterResponse', () => ({ revalidateAfterResponse: jest.fn() }));
import prisma from '@/lib/db/prisma';
import { applyCityUpdateDirect, getCityBoundarySummary } from '@/lib/db/citiesAdmin';
import { mcpGetCity } from '@/lib/mcp/data';
import { mcpUpdateCity } from '@/lib/mcp/adminData';
import { cityProfileSchema, updateCityResultSchema } from '@/lib/mcp/citySchemas';
import { parseBoundaryInput } from '@/lib/utils/geojson';
import { Realm } from '@prisma/client';
import { mcpRealmStore, requestContext } from '@/lib/mcp/realm-context';
import { resetDatabase } from '../helpers/test-db';
import { createCity, createUser } from '../helpers/factories';

const polygon: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[23, 38], [24, 38], [24, 39], [23, 38]]] };
const reversed: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[23, 38], [24, 39], [24, 38], [23, 38]]] };
let identity: { userId: string };
const asRequest = <T>(fn: () => Promise<T>) => mcpRealmStore.run(requestContext(Realm.greece, 'opencouncil.gr', identity, {
    adminAccess: { superadmin: true, cityIds: new Set(), bodyIds: new Set() },
}), fn);

beforeEach(async () => {
    await resetDatabase(prisma);
    identity = { userId: (await createUser('admin@test.example', { isSuperAdmin: true })).id };
    await createCity({ id: 'contract-city', status: 'pending' });
});

it('reads metadata using the same schema returned by updates', async () => {
    const before = await asRequest(() => mcpGetCity('contract-city', identity));
    expect(cityProfileSchema.parse(before)).toMatchObject({ status: 'pending', language: 'el', timezone: 'Europe/Athens', boundary: null });
    const result = updateCityResultSchema.parse(await asRequest(() => mcpUpdateCity(identity, { cityId: 'contract-city', status: 'demo' })));
    expect(result).toMatchObject({ changed: true, changes: { status: { before: 'pending', after: 'demo' } }, city: { status: 'demo' } });
    expect(result.city).toEqual(await asRequest(() => mcpGetCity('contract-city', identity)));
});

it('does not write or report a change for repeated demo publication', async () => {
    await asRequest(() => mcpUpdateCity(identity, { cityId: 'contract-city', status: 'demo' }));
    const before = await prisma.city.findUniqueOrThrow({ where: { id: 'contract-city' } });
    const result = await asRequest(() => mcpUpdateCity(identity, { cityId: 'contract-city', status: 'demo' }));
    expect(result).toMatchObject({ changed: false, changes: {} });
    expect((await prisma.city.findUniqueOrThrow({ where: { id: 'contract-city' } })).updatedAt).toEqual(before.updatedAt);
});

it('compares equivalent outlines in PostGIS, without changing updatedAt on retries', async () => {
    const first = await asRequest(() => mcpUpdateCity(identity, { cityId: 'contract-city', geojson: JSON.stringify(polygon) }));
    expect(first).toMatchObject({ changed: true, changes: { boundary: { before: null, after: { geometryType: 'Polygon', polygonCount: 1 } } } });
    const before = await prisma.city.findUniqueOrThrow({ where: { id: 'contract-city' } });
    const second = await asRequest(() => mcpUpdateCity(identity, { cityId: 'contract-city', geojson: JSON.stringify({ type: 'Feature', properties: {}, geometry: reversed }) }));
    expect(second).toMatchObject({ changed: false, changes: {}, city: { status: 'pending', boundary: { geometryType: 'Polygon', polygonCount: 1 } } });
    expect((await prisma.city.findUniqueOrThrow({ where: { id: 'contract-city' } })).updatedAt).toEqual(before.updatedAt);
    expect(await getCityBoundarySummary('contract-city')).toEqual({ geometryType: 'Polygon', polygonCount: 1 });
});

it('reports a boundary replacement even when the summaries have the same polygon count', async () => {
    await applyCityUpdateDirect('contract-city', { geometry: polygon });
    const replacement: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[20, 38], [21, 38], [21, 39], [20, 38]]] };
    const changed = await applyCityUpdateDirect('contract-city', { geometry: replacement });
    expect(changed.changed).toBe(true);
    expect(changed.before.boundary).toEqual(changed.after.boundary);
});

it('reports every polygon in the stored multipolygon without returning coordinates', async () => {
    const geometry: GeoJSON.MultiPolygon = { type: 'MultiPolygon', coordinates: [polygon.coordinates, [[[25, 38], [26, 38], [26, 39], [25, 38]]]] };
    const result = await asRequest(() => mcpUpdateCity(identity, { cityId: 'contract-city', geojson: JSON.stringify(geometry) }));
    expect(result.city.boundary).toEqual({ geometryType: 'MultiPolygon', polygonCount: 2 });
    expect(result.changes.boundary?.after).toEqual(result.city.boundary);
    expect(cityProfileSchema.parse(result.city)).toEqual(result.city);
});

it('serializes concurrent attempts so only one reports a new publication', async () => {
    const outcomes = await Promise.all([applyCityUpdateDirect('contract-city', { status: 'demo' }), applyCityUpdateDirect('contract-city', { status: 'demo' })]);
    expect(outcomes.map(outcome => outcome.changed).sort()).toEqual([false, true]);
});

it('serializes concurrent equivalent boundaries', async () => {
    const outcomes = await Promise.all([applyCityUpdateDirect('contract-city', { geometry: polygon }), applyCityUpdateDirect('contract-city', { geometry: reversed })]);
    expect(outcomes.map(outcome => outcome.changed).sort()).toEqual([false, true]);
});

it('preserves supported cities and reports missing cities', async () => {
    await prisma.city.update({ where: { id: 'contract-city' }, data: { status: 'supported' } });
    await expect(asRequest(() => mcpUpdateCity(identity, { cityId: 'contract-city', status: 'demo' }))).rejects.toThrow('Only a pending or demo city');
    expect((await prisma.city.findUniqueOrThrow({ where: { id: 'contract-city' } })).status).toBe('supported');
    await expect(applyCityUpdateDirect('missing', { status: 'demo' })).rejects.toThrow('City not found');
});

it('normalizes an open ring before comparison and refuses invalid input without saving it', async () => {
    const parsed = parseBoundaryInput(JSON.stringify({ ...polygon, coordinates: [polygon.coordinates[0].slice(0, -1)] }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('fixture must normalize');
    await applyCityUpdateDirect('contract-city', { geometry: parsed.geometry });
    expect((await applyCityUpdateDirect('contract-city', { geometry: polygon })).changed).toBe(false);
    await expect(asRequest(() => mcpUpdateCity(identity, { cityId: 'contract-city', geojson: '{' }))).rejects.toThrow('Invalid boundary GeoJSON');
    expect(await getCityBoundarySummary('contract-city')).toEqual({ geometryType: 'Polygon', polygonCount: 1 });
});
