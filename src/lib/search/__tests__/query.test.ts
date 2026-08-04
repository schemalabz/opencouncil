import type { estypes } from '@elastic/elasticsearch';
import type { SearchRequest } from '../types';

// Avoid pulling the full env validation (createEnv) at import time; buildFilters
// itself does not read env, only the module-level import does.
jest.mock('@/env.mjs', () => ({ env: { ELASTICSEARCH_INDEX: 'test-index' } }));

import { buildFilters, buildSearchQuery } from '../query';
import type { ExtractedFilters } from '../types';

const NO_EXTRACTED_FILTERS: ExtractedFilters = {
    cityIds: null,
    dateRange: null,
    isLatest: null,
    locationName: null,
};

type BoolQuery = estypes.QueryDslBoolQuery;

function findPersonFilter(
    filters: estypes.QueryDslQueryContainer[]
): estypes.QueryDslQueryContainer | undefined {
    // The person filter is the bool/should clause referencing introduced_by_person_id.
    // Use a structural lookup (not a JSON substring match) so the tests can't pass
    // vacuously if key ordering or the serialised shape changes.
    return filters.find(
        (f) =>
            Array.isArray(f.bool?.should) &&
            (f.bool!.should as estypes.QueryDslQueryContainer[]).some(
                (c) => c.terms?.['introduced_by_person_id'] !== undefined
            )
    );
}

describe('buildFilters person filter', () => {
    it('OR-combines introduced-by and spoke-in clauses (issue #373)', () => {
        const request: SearchRequest = { query: 'roads', personIds: ['p1'] };

        const filters = buildFilters(request);
        const personFilter = findPersonFilter(filters);

        expect(personFilter).toBeDefined();

        const bool = personFilter!.bool as BoolQuery;
        const should = (bool.should ?? []) as estypes.QueryDslQueryContainer[];

        // Single bool.should with both clauses, OR-combined.
        expect(bool.minimum_should_match).toBe(1);
        expect(should).toHaveLength(2);

        // Clause 1: introduced by the person.
        const introducedBy = should.find((c) => c.terms?.['introduced_by_person_id']);
        expect(introducedBy?.terms?.['introduced_by_person_id']).toEqual(['p1']);

        // Clause 2: spoke in the subject (nested speaker segments).
        const spokeIn = should.find((c) => c.nested);
        expect(spokeIn?.nested?.path).toBe('speaker_segments');
        expect(
            (spokeIn?.nested?.query as estypes.QueryDslQueryContainer).terms?.[
                'speaker_segments.speaker_person_id'
            ]
        ).toEqual(['p1']);
    });

    it('does not split the person filter into two separate AND-combined top-level clauses', () => {
        const request: SearchRequest = { query: 'roads', personIds: ['p1'] };

        const filters = buildFilters(request);

        // Regression guard: the two person clauses must NOT appear as separate
        // top-level filter entries (that would AND them — the original bug).
        const topLevelIntroduced = filters.filter(
            (f) => f.terms?.['introduced_by_person_id']
        );
        const topLevelNested = filters.filter(
            (f) =>
                f.nested?.path === 'speaker_segments' &&
                JSON.stringify(f).includes('speaker_person_id')
        );
        expect(topLevelIntroduced).toHaveLength(0);
        expect(topLevelNested).toHaveLength(0);
    });

    it('keeps person and party filters as independent top-level (AND) clauses', () => {
        const request: SearchRequest = {
            query: 'roads',
            personIds: ['p1'],
            partyIds: ['party1'],
        };

        const filters = buildFilters(request);

        expect(findPersonFilter(filters)).toBeDefined();
        const partyFilter = filters.find((f) => f.terms?.['introduced_by_party_id']);
        expect(partyFilter?.terms?.['introduced_by_party_id']).toEqual(['party1']);
    });

    it('omits the person filter entirely when no personIds are given', () => {
        const request: SearchRequest = { query: 'roads' };

        const filters = buildFilters(request);

        expect(findPersonFilter(filters)).toBeUndefined();
    });

    it('omits the person filter when personIds is an empty array', () => {
        const request: SearchRequest = { query: 'roads', personIds: [] };

        const filters = buildFilters(request);

        expect(findPersonFilter(filters)).toBeUndefined();
    });
});

describe('buildSearchQuery filter-only mode', () => {
    it('builds a ranked rrf query when query text is present', () => {
        const q = buildSearchQuery({ query: 'πάρκα' }, NO_EXTRACTED_FILTERS);

        expect(q.retriever).toBeDefined();
        expect(q.sort).toBeUndefined();
    });

    it.each([undefined, '', '   '])(
        'builds a filter-only, date-sorted query when query is %p',
        (query) => {
            const q = buildSearchQuery(
                {
                    query,
                    personIds: ['p1'],
                    dateRange: { start: '2026-07-01', end: '2026-07-31' },
                },
                NO_EXTRACTED_FILTERS
            );

            // No ranking retrievers (they require query text)...
            expect(q.retriever).toBeUndefined();
            // ...instead a pure filtered query sorted newest-first.
            expect(q.sort).toEqual([{ meeting_date: { order: 'desc' } }]);

            const filter = (q.query!.bool!.filter ?? []) as estypes.QueryDslQueryContainer[];
            expect(filter.some((f) => f.term?.['meeting_released'] !== undefined)).toBe(true);
            expect(findPersonFilter(filter)).toBeDefined();
            expect(filter.some((f) => f.range?.['meeting_date'] !== undefined)).toBe(true);
        }
    );

    it('respects pagination config in the filter-only branch', () => {
        const q = buildSearchQuery({ config: { size: 5, from: 10 } }, NO_EXTRACTED_FILTERS);

        expect(q.size).toBe(5);
        expect(q.from).toBe(10);
    });
});
