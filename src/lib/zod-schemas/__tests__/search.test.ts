import { searchRequestSchema } from '../search';

describe('searchRequestSchema', () => {
    // Zod strips keys that the schema does not declare. Before these fields
    // were declared, a body filter was dropped without an error, and the
    // request searched every administrative body.
    it('keeps the administrative body filters', () => {
        const parsed = searchRequestSchema.parse({
            query: 'πάρκα',
            administrativeBodyIds: ['body1'],
            administrativeBodyTypes: ['committee'],
        });

        expect(parsed.administrativeBodyIds).toEqual(['body1']);
        expect(parsed.administrativeBodyTypes).toEqual(['committee']);
    });

    it('rejects an unknown administrative body type', () => {
        expect(searchRequestSchema.safeParse({ query: 'πάρκα', administrativeBodyTypes: ['board'] }).success).toBe(false);
    });

    // Elasticsearch rejects a geo_distance point outside these ranges, which
    // made a bad coordinate a 500 and a search failure alert instead of a 400.
    it.each([
        { lat: 91, lng: 23.7 },
        { lat: -91, lng: 23.7 },
        { lat: 38, lng: 181 },
        { lat: 38, lng: -181 },
    ])('rejects an out-of-range location point %o', (point) => {
        expect(searchRequestSchema.safeParse({ query: 'πάρκα', location: { point } }).success).toBe(false);
    });

    // Elasticsearch rejects a geo_distance of 0m, so a zero radius also made a
    // 500 and a search failure alert.
    it.each([0, -1, 100_001])('rejects a location radius of %d metres', (radiusMeters) => {
        const location = { point: { lat: 38, lng: 23.7 }, radiusMeters };
        expect(searchRequestSchema.safeParse({ query: 'πάρκα', location }).success).toBe(false);
    });

    // The API once took `lon` and `radius` in kilometres. A request in the old
    // shape must fail, not search a default radius around a missing point.
    it.each([
        { point: { lat: 38, lon: 23.7 } },
        { point: { lat: 38, lng: 23.7 }, radius: 2 },
    ])('rejects a location in the old shape %o', (location) => {
        expect(searchRequestSchema.safeParse({ query: 'πάρκα', location }).success).toBe(false);
    });

    // The body filters were renamed. A request under the old names must fail,
    // not search every body.
    it.each(['adminBodyIds', 'adminBodyTypes', 'locationFilter'])('rejects the unknown key %s', (key) => {
        expect(searchRequestSchema.safeParse({ query: 'πάρκα', [key]: ['committee'] }).success).toBe(false);
    });

    it('rejects an unknown key inside the date range', () => {
        const dateRange = { start: '2026-01-01T00:00:00Z', end: '2026-02-01T00:00:00Z', timeZone: 'Europe/Athens' };
        expect(searchRequestSchema.safeParse({ query: 'πάρκα', dateRange }).success).toBe(false);
    });
});
