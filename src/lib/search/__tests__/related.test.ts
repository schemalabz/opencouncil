import type { estypes } from '@elastic/elasticsearch';
import type { QueryContainer } from '../types';

jest.mock('@/env.mjs', () => ({ env: { ELASTICSEARCH_INDEX: 'test-index' } }));

import { buildRelatedSubjectsQuery, RELATED_MIN_SIMILARITY, RELATED_SUBJECTS_SIZE } from '../related';
import { subjectVisibilityFilters } from '../query';

const SEED = { id: 'subject-1', name: 'Κυκλοφοριακές ρυθμίσεις', cityId: 'athens', councilMeetingId: 'meeting-1', administrativeBodyType: 'council' as const, tier: 'primary' as const };
const REALM_CITIES = ['athens', 'chania', 'argos'];
// The secondary bodies of the realm, by id: the index holds no tier.
const SECONDARY_IDS = ['youth-athens', 'youth-chania'];
const OF_SECONDARY = { terms: { administrative_body_id: SECONDARY_IDS } };
const NO_SECONDARY = { bool: { must_not: [OF_SECONDARY] } };

function boolOf(query: estypes.SearchRequest): estypes.QueryDslBoolQuery {
    return query.query?.bool as estypes.QueryDslBoolQuery;
}

function cityTerms(query: estypes.SearchRequest): string[] {
    const filters = boolOf(query).filter as QueryContainer[];
    const terms = filters.find(f => f.terms)?.terms as Record<string, string[]>;
    return terms.city_id;
}

describe('buildRelatedSubjectsQuery', () => {
    // The floor is the product decision the feature turns on, measured on
    // the production index; the cases below read it back, so this one pins it.
    it('keeps the measured similarity floor and the page size', () => {
        expect(RELATED_MIN_SIMILARITY).toBe(0.75);
        expect(RELATED_SUBJECTS_SIZE).toBe(5);
    });

    // The runtime resolves the index behind the alias and its model's floor
    // together; the query must name that index, so the floor never meets
    // another index's scores.
    it('searches the resolved index with its floor when given a profile', () => {
        const query = buildRelatedSubjectsQuery(SEED, 'city', REALM_CITIES, SECONDARY_IDS, {
            index: 'subjects-2026-08', semanticMinScore: 0.934, semanticMappedScale: 320, relatedMinSimilarity: 0.93,
        });
        expect(query.index).toBe('subjects-2026-08');
        expect(query.min_score).toBe(0.93);
    });

    it('asks the semantic fields with the subject name and nothing else', () => {
        const query = buildRelatedSubjectsQuery(SEED, 'city', REALM_CITIES, SECONDARY_IDS);
        const must = boolOf(query).must as QueryContainer[];
        const disMax = must[0].dis_max as estypes.QueryDslDisMaxQuery;

        expect(must).toHaveLength(1);
        expect(disMax.tie_breaker).toBe(0);
        expect(disMax.queries.map(q => q?.semantic)).toEqual([
            { field: 'name.semantic', query: SEED.name },
            { field: 'description.semantic', query: SEED.name },
        ]);
        expect(query.min_score).toBe(RELATED_MIN_SIMILARITY);
        expect(query.size).toBe(RELATED_SUBJECTS_SIZE);
        expect(query.index).toBe('test-index');
    });

    // The meeting id is a date, so the sibling exclusion must name the city
    // too: another municipality's meeting of the same day is a fair neighbour.
    it('excludes the subject and every subject of its own meeting, not same-day meetings elsewhere', () => {
        const query = buildRelatedSubjectsQuery(SEED, 'other', REALM_CITIES, SECONDARY_IDS);
        expect(boolOf(query).must_not).toEqual([
            { term: { id: 'subject-1' } },
            { bool: { filter: [{ term: { city_id: 'athens' } }, { term: { councilMeeting_id: 'meeting-1' } }] } },
        ]);
    });

    it('only returns released subjects', () => {
        const query = buildRelatedSubjectsQuery(SEED, 'city', REALM_CITIES, SECONDARY_IDS);
        expect(boolOf(query).filter).toContainEqual({ term: { meeting_released: true } });
    });

    // Related subjects show beside every subject page. A visibility rule the
    // search applies and this query does not would show here what the search
    // hides.
    it('applies every visibility filter the search applies', () => {
        const filter = boolOf(buildRelatedSubjectsQuery(SEED, 'other', REALM_CITIES, SECONDARY_IDS)).filter;
        for (const visibility of subjectVisibilityFilters()) {
            expect(filter).toContainEqual(visibility);
        }
    });

    it('the city scope stays inside the subject municipality', () => {
        expect(cityTerms(buildRelatedSubjectsQuery(SEED, 'city', REALM_CITIES, SECONDARY_IDS))).toEqual(['athens']);
    });

    it('the other scope covers the rest of the realm and drops the home municipality', () => {
        expect(cityTerms(buildRelatedSubjectsQuery(SEED, 'other', REALM_CITIES, SECONDARY_IDS))).toEqual(['chania', 'argos']);
    });

    it('keeps an empty city filter rather than dropping it, so no scope can reach another realm', () => {
        expect(cityTerms(buildRelatedSubjectsQuery(SEED, 'other', ['athens'], SECONDARY_IDS))).toEqual([]);
        expect(cityTerms(buildRelatedSubjectsQuery(SEED, 'city', ['chania'], SECONDARY_IDS))).toEqual([]);
    });

    // The tier rule of #829: a municipal subject never leads to a secondary
    // body's, and a meeting with no body is the council's.
    it('keeps a municipal subject away from the secondary tier in both scopes', () => {
        for (const scope of ['city', 'other'] as const) {
            expect(boolOf(buildRelatedSubjectsQuery(SEED, scope, REALM_CITIES, SECONDARY_IDS)).filter).toContainEqual(NO_SECONDARY);
            expect(boolOf(buildRelatedSubjectsQuery({ ...SEED, administrativeBodyType: null }, scope, REALM_CITIES, SECONDARY_IDS)).filter).toContainEqual(NO_SECONDARY);
        }
    });

    it('reads the stored tier of the seed, not its type', () => {
        const primaryYouth = { ...SEED, administrativeBodyType: 'youthCouncil' as const };
        expect(boolOf(buildRelatedSubjectsQuery(primaryYouth, 'city', REALM_CITIES, SECONDARY_IDS)).filter).toContainEqual(NO_SECONDARY);
        const secondaryCouncil = { ...SEED, tier: 'secondary' as const };
        expect(boolOf(buildRelatedSubjectsQuery(secondaryCouncil, 'city', REALM_CITIES, SECONDARY_IDS)).filter).not.toContainEqual(NO_SECONDARY);
    });

    it('relates a secondary body\'s subject to its whole municipality, and to the secondary bodies of its type elsewhere', () => {
        const seed = { ...SEED, administrativeBodyType: 'youthCouncil' as const, tier: 'secondary' as const };
        const cityFilters = boolOf(buildRelatedSubjectsQuery(seed, 'city', REALM_CITIES, SECONDARY_IDS)).filter as QueryContainer[];
        expect(cityFilters.some(f => f.bool || (f.term && 'administrative_body_type' in f.term) || (f.terms && 'administrative_body_id' in f.terms))).toBe(false);

        const otherFilters = boolOf(buildRelatedSubjectsQuery(seed, 'other', REALM_CITIES, SECONDARY_IDS)).filter as QueryContainer[];
        expect(otherFilters).toContainEqual(OF_SECONDARY);
        expect(otherFilters).toContainEqual({ term: { administrative_body_type: 'youthCouncil' } });
        expect(otherFilters).not.toContainEqual(NO_SECONDARY);
    });

    it('adds no tier clause for a primary seed when the realm has no secondary body', () => {
        const filters = boolOf(buildRelatedSubjectsQuery(SEED, 'other', REALM_CITIES, [])).filter as QueryContainer[];
        expect(filters.some(f => f.bool || (f.terms && 'administrative_body_id' in f.terms))).toBe(false);
    });
});
