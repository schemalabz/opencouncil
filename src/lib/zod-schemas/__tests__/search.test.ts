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
});
