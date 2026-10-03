import { searchRequestSchema } from '../search';

describe('searchRequestSchema', () => {
    // Zod strips keys that the schema does not declare. Before these fields
    // were declared, a body filter was dropped without an error, and the
    // request searched every administrative body.
    it('keeps the administrative body filters', () => {
        const parsed = searchRequestSchema.parse({
            query: 'πάρκα',
            adminBodyIds: ['body1'],
            adminBodyTypes: ['committee'],
        });

        expect(parsed.adminBodyIds).toEqual(['body1']);
        expect(parsed.adminBodyTypes).toEqual(['committee']);
    });

    it('rejects an unknown administrative body type', () => {
        expect(searchRequestSchema.safeParse({ query: 'πάρκα', adminBodyTypes: ['board'] }).success).toBe(false);
    });

    // Elasticsearch rejects a geo_distance point outside these ranges, which
    // made a bad coordinate a 500 and a search failure alert instead of a 400.
    it.each([
        { lat: 91, lon: 23.7 },
        { lat: -91, lon: 23.7 },
        { lat: 38, lon: 181 },
        { lat: 38, lon: -181 },
    ])('rejects an out-of-range location point %o', (point) => {
        expect(searchRequestSchema.safeParse({ query: 'πάρκα', location: { point } }).success).toBe(false);
    });
});
